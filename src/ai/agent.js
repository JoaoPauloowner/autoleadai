const config = require('../config/ai-provider');
const { getSystemPrompt } = require('./prompts');
const { toolDefinitions, toolExecutors } = require('./tools');
const db = require('../config/database');

// Inicialização condicional dos clientes oficiais
let openaiClient = null;
let googleGenAIClient = null;
let deepseekClient = null;

try {
  if (config.openai.apiKey) {
    const OpenAI = require('openai');
    openaiClient = new OpenAI({ apiKey: config.openai.apiKey });
  }
} catch (e) {
  console.warn('OpenAI SDK warning:', e.message);
}

try {
  if (config.deepseek && config.deepseek.apiKey) {
    const OpenAI = require('openai');
    deepseekClient = new OpenAI({
      apiKey: config.deepseek.apiKey,
      baseURL: config.deepseek.baseURL || 'https://api.deepseek.com'
    });
  }
} catch (e) {
  console.warn('DeepSeek SDK warning:', e.message);
}

try {
  if (config.gemini.apiKey) {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    googleGenAIClient = new GoogleGenerativeAI(config.gemini.apiKey);
  }
} catch (e) {
  console.warn('Gemini SDK warning:', e.message);
}

/**
 * Orquestrador principal do Agente Conversacional (Cérebro Próprio)
 */
async function processMessage({ leadId, userMessage, channel = 'simulator', copilotStatus = 'approved' }) {
  // 1. Busca ou cria o lead no banco
  let lead = null;
  if (leadId) {
    lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
  }

  if (!lead) {
    const phone = `sim_${Date.now()}`;
    const insertLead = db.prepare(`
      INSERT INTO leads (name, phone, channel, status)
      VALUES (?, ?, ?, 'novo')
    `);
    const res = insertLead.run('Cliente Interessado', phone, channel);
    lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(res.lastInsertRowid);
  }

  // 2. Salva a mensagem do usuário no histórico
  db.prepare(`
    INSERT INTO chat_messages (lead_id, sender, content)
    VALUES (?, 'user', ?)
  `).run(lead.id, userMessage);

  // 3. Recupera o histórico recente de conversas
  const historyRows = db.prepare(`
    SELECT sender, content, tool_calls FROM chat_messages 
    WHERE lead_id = ? 
    ORDER BY created_at ASC 
    LIMIT 20
  `).all(lead.id);

  const { searchRelevantKnowledge, formatKnowledgeForPrompt } = require('./knowledgeRAG');
  const relevantKnowledge = searchRelevantKnowledge(userMessage, 3);
  const ragContext = formatKnowledgeForPrompt(relevantKnowledge);

  let systemPrompt = getSystemPrompt(lead);
  if (ragContext) {
    systemPrompt += ragContext;
    console.log(`📚 [RAG] ${relevantKnowledge.length} item(ns) de conhecimento ativado(s) para a mensagem.`);
  }

  const executedToolsLog = [];
  let replyText = '';

  // 4. Seleciona o motor de IA ativo
  const activeProvider = (config.provider || 'gemini').toLowerCase();

  const { aiCircuitBreaker, withTimeout } = require('../infra/resilience');

  try {
    if (activeProvider === 'openai' && config.openai.apiKey && openaiClient) {
      const result = await aiCircuitBreaker.run(() =>
        withTimeout(() => processWithOpenAI({ lead, historyRows, systemPrompt, executedToolsLog }), 15000)
      );
      replyText = result.replyText;
    } else if (activeProvider === 'deepseek' && config.deepseek && config.deepseek.apiKey && deepseekClient) {
      const result = await aiCircuitBreaker.run(() =>
        withTimeout(() => processWithDeepSeek({ lead, historyRows, systemPrompt, executedToolsLog }), 15000)
      );
      replyText = result.replyText;
    } else if (activeProvider === 'gemini' && config.gemini.apiKey && googleGenAIClient) {
      const result = await aiCircuitBreaker.run(() =>
        withTimeout(() => processWithGemini({ lead, historyRows, systemPrompt, executedToolsLog }), 15000)
      );
      replyText = result.replyText;
    } else {
      // Motor de Fallback Inteligente (Permite testar tudo imediatamente mesmo sem chaves de API!)
      const result = await processWithSmartFallback({ lead, userMessage, historyRows, executedToolsLog });
      replyText = result.replyText;
    }
  } catch (error) {
    console.warn('⚠️ Alerta de IA (acionando contingência inteligente):', error.message);
    // Em caso de falha de cota, timeout ou queda de rede externa, aciona o fallback inteligente
    const result = await processWithSmartFallback({ lead, userMessage, historyRows, executedToolsLog });
    replyText = result.replyText;
  }

  // 5. Salva a resposta da IA no banco
  const insertRes = db.prepare(`
    INSERT INTO chat_messages (lead_id, sender, content, tool_calls, copilot_status)
    VALUES (?, 'assistant', ?, ?, ?)
  `).run(
    lead.id,
    replyText,
    executedToolsLog.length > 0 ? JSON.stringify(executedToolsLog) : null,
    copilotStatus || 'approved'
  );

  // 6. Retorna para o controlador
  return {
    messageId: Number(insertRes.lastInsertRowid),
    leadId: lead.id,
    reply: replyText,
    tools: executedToolsLog,
    provider: activeProvider,
    copilotStatus: copilotStatus || 'approved'
  };
}

/**
 * Processamento via DeepSeek (compatível com formato OpenAI)
 */
async function processWithDeepSeek({ lead, historyRows, systemPrompt, executedToolsLog }) {
  return processWithOpenAI({
    lead,
    historyRows,
    systemPrompt,
    executedToolsLog,
    customClient: deepseekClient,
    customModel: config.deepseek?.model || 'deepseek-chat'
  });
}

/**
 * Processamento via OpenAI com Function Calling nativo
 */
async function processWithOpenAI({ lead, historyRows, systemPrompt, executedToolsLog, customClient = null, customModel = null }) {
  const client = customClient || openaiClient;
  const modelToUse = customModel || config.openai.model || 'gpt-4o-mini';
  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  for (const h of historyRows) {
    messages.push({
      role: h.sender === 'user' ? 'user' : 'assistant',
      content: h.content
    });
  }

  let keepRunning = true;
  let iterations = 0;
  let finalReply = '';

  while (keepRunning && iterations < 5) {
    iterations++;
    const response = await client.chat.completions.create({
      model: modelToUse,
      messages,
      tools: toolDefinitions,
      tool_choice: 'auto',
      temperature: 0.7
    });

    const choice = response.choices[0].message;

    if (choice.tool_calls && choice.tool_calls.length > 0) {
      messages.push(choice);

      for (const tc of choice.tool_calls) {
        const fnName = tc.function.name;
        let fnArgs = {};
        try { fnArgs = JSON.parse(tc.function.arguments); } catch (e) {}

        // Garante injeção do lead_id atual
        if (!fnArgs.lead_id) fnArgs.lead_id = lead.id;

        const executor = toolExecutors[fnName];
        let toolOutput = { status: 'Ferramenta não encontrada' };

        if (executor) {
          toolOutput = executor(fnArgs);
          executedToolsLog.push({ name: fnName, args: fnArgs, result: toolOutput });
        }

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(toolOutput)
        });
      }
    } else {
      finalReply = choice.content || '';
      keepRunning = false;
    }
  }

  return { replyText: finalReply };
}

/**
 * Processamento via Google Gemini com Function Calling
 */
async function processWithGemini({ lead, historyRows, systemPrompt, executedToolsLog }) {
  const modelName = config.gemini.model || 'gemini-3.1-flash-lite';
  
  // Converte as definições para o formato aceito pelo SDK do Gemini
  const functionDeclarations = toolDefinitions.map(t => ({
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters
  }));

  const model = googleGenAIClient.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
    tools: [{ functionDeclarations }]
  });

  const chat = model.startChat({
    history: historyRows.slice(0, -1).map(h => ({
      role: h.sender === 'user' ? 'user' : 'model',
      parts: [{ text: h.content }]
    }))
  });

  const lastUserMsg = historyRows[historyRows.length - 1].content;
  let response = await chat.sendMessage(lastUserMsg);

  let iterations = 0;
  while (iterations < 5) {
    iterations++;
    const functionCalls = response.response.functionCalls();

    if (functionCalls && functionCalls.length > 0) {
      const functionResponses = [];

      for (const fc of functionCalls) {
        const fnName = fc.name;
        const fnArgs = fc.args || {};
        if (!fnArgs.lead_id) fnArgs.lead_id = lead.id;

        const executor = toolExecutors[fnName];
        let toolOutput = { status: 'Ferramenta não encontrada' };

        if (executor) {
          toolOutput = executor(fnArgs);
          executedToolsLog.push({ name: fnName, args: fnArgs, result: toolOutput });
        }

        functionResponses.push({
          functionResponse: {
            name: fnName,
            response: toolOutput
          }
        });
      }

      response = await chat.sendMessage(functionResponses);
    } else {
      break;
    }
  }

  return { replyText: response.response.text() };
}

/**
 * Motor de Fallback Inteligente Nativo
 * Executa as ferramentas reais em SQLite mesmo se nenhuma chave de API estiver configurada no momento!
 */
async function processWithSmartFallback({ lead, userMessage, historyRows, executedToolsLog }) {
  const msgLower = userMessage.toLowerCase();
  let replyText = '';

  // 1. Intenção: Agendamento de Test-Drive / Visita (Prioridade Alta)
  if (msgLower.includes('test drive') || msgLower.includes('test-drive') || msgLower.includes('agendar') || msgLower.includes('visita') || msgLower.includes('amanhã') || msgLower.includes('sábado')) {
    let car = null;
    if (msgLower.includes('renegade')) car = db.prepare('SELECT id, make, model, version FROM vehicles WHERE model LIKE ? LIMIT 1').get('%Renegade%');
    else if (msgLower.includes('corolla')) car = db.prepare('SELECT id, make, model, version FROM vehicles WHERE model LIKE ? LIMIT 1').get('%Corolla%');
    else if (msgLower.includes('civic')) car = db.prepare('SELECT id, make, model, version FROM vehicles WHERE model LIKE ? LIMIT 1').get('%Civic%');
    else if (msgLower.includes('creta')) car = db.prepare('SELECT id, make, model, version FROM vehicles WHERE model LIKE ? LIMIT 1').get('%Creta%');
    else if (msgLower.includes('onix')) car = db.prepare('SELECT id, make, model, version FROM vehicles WHERE model LIKE ? LIMIT 1').get('%Onix%');
    else if (msgLower.includes('t-cross')) car = db.prepare('SELECT id, make, model, version FROM vehicles WHERE model LIKE ? LIMIT 1').get('%T-Cross%');

    if (!car) {
      car = db.prepare('SELECT id, make, model, version FROM vehicles WHERE status = "disponivel" LIMIT 1').get();
    }

    const dataHora = msgLower.includes('sábado') ? 'Sábado às 11:00' : 'Amanhã às 15:00';

    const toolResult = toolExecutors.agendar_test_drive({
      lead_id: lead.id,
      veiculo_id: car ? car.id : 1,
      data_hora: dataHora,
      observacoes: 'Agendado pelo simulador AutoLead AI'
    });

    executedToolsLog.push({
      name: 'agendar_test_drive',
      args: { lead_id: lead.id, veiculo_id: car ? car.id : 1, data_hora: dataHora },
      result: toolResult
    });

    const sellerName = toolResult.consultor || 'Consultor de Plantão';
    replyText = `Sensacional! Seu **Test Drive** está confirmado para *${dataHora}* com o *${toolResult.veiculo}*!\n\n📍 Nosso showroom: ${config.dealership.address}, ${config.dealership.city}.\nAo chegar, procure por ${sellerName} na recepção. O veículo estará abastecido e pronto para você pilotar! 🚗💨`;
  }
  // 2. Intenção: Simulação de Financiamento / Parcelas
  else if (msgLower.includes('financiamento') || msgLower.includes('financiar') || msgLower.includes('parcela') || msgLower.includes('entrada')) {
    let entrada = 30000;
    const matchEntrada = msgLower.match(/(\d+)\s*(?:mil|k)/);
    if (matchEntrada) {
      entrada = parseInt(matchEntrada[1], 10) * 1000;
    }

    let car = null;
    if (msgLower.includes('corolla')) car = db.prepare('SELECT id, price, make, model FROM vehicles WHERE model LIKE ? LIMIT 1').get('%Corolla%');
    else if (msgLower.includes('renegade')) car = db.prepare('SELECT id, price, make, model FROM vehicles WHERE model LIKE ? LIMIT 1').get('%Renegade%');
    else car = db.prepare('SELECT id, price, make, model FROM vehicles WHERE status = "disponivel" LIMIT 1').get();

    const valorCarro = car ? car.price : 98900;

    const toolResult = toolExecutors.simular_financiamento({
      valor_veiculo: valorCarro,
      valor_entrada: entrada,
      parcelas: 48
    });

    executedToolsLog.push({
      name: 'simular_financiamento',
      args: { valor_veiculo: valorCarro, valor_entrada: entrada, parcelas: 48 },
      result: toolResult
    });

    replyText = `Perfeito! Fiz uma simulação preliminar para o ${car ? car.make + ' ' + car.model : 'veículo'}:\n\n• Entrada: *${toolResult.entrada}*\n• Saldo financiado: *${toolResult.saldo_financiado}*\n• Prazo sugerido: *${toolResult.prazo_solicitado}*\n• Opção em 36x: *${toolResult.outras_opcoes['36x']}*\n• Opção em 60x: *${toolResult.outras_opcoes['60x']}*\n\nEssa condição é excelente! Que tal vir fazer um **Test Drive** aqui na loja e tomarmos um café para aprovarmos sua ficha?`;
  }
  // 3. Intenção: Carro na Troca
  else if (msgLower.includes('troca') || msgLower.includes('usado') || msgLower.includes('meu carro') || msgLower.includes('fipe')) {
    const toolResult = toolExecutors.salvar_qualificacao_lead({
      lead_id: lead.id,
      tem_troca: true,
      detalhes_troca: userMessage,
      resumo_qualificacao: 'Cliente possui veículo usado para avaliação na troca'
    });

    executedToolsLog.push({
      name: 'salvar_qualificacao_lead',
      args: { lead_id: lead.id, tem_troca: true, detalhes_troca: userMessage },
      result: toolResult
    });

    replyText = `Com certeza! Nós avaliamos seu seminovo com a melhor avaliação do mercado para entrar como parte de pagamento. Qual é o modelo, ano e quilometragem aproximada do seu carro atual?`;
  }
  // 4. Intenção: Buscar Carro no Estoque
  else if (
    msgLower.includes('suv') || msgLower.includes('sedan') || msgLower.includes('carro') ||
    msgLower.includes('renegade') || msgLower.includes('corolla') || msgLower.includes('civic') ||
    msgLower.includes('creta') || msgLower.includes('onix') || msgLower.includes('t-cross') ||
    msgLower.includes('estoque') || msgLower.includes('preço') || msgLower.includes('valor') ||
    msgLower.includes('mil') || msgLower.includes('automático')
  ) {
    let termo = null;
    if (msgLower.includes('renegade') || msgLower.includes('jeep')) termo = 'Renegade';
    else if (msgLower.includes('corolla') || msgLower.includes('toyota')) termo = 'Corolla';
    else if (msgLower.includes('civic') || msgLower.includes('honda')) termo = 'Civic';
    else if (msgLower.includes('creta') || msgLower.includes('hyundai')) termo = 'Creta';
    else if (msgLower.includes('onix') || msgLower.includes('chevrolet')) termo = 'Onix';
    else if (msgLower.includes('t-cross') || msgLower.includes('volkswagen')) termo = 'T-Cross';

    let body_type = null;
    if (msgLower.includes('suv')) body_type = 'SUV';
    else if (msgLower.includes('sedan')) body_type = 'Sedan';

    let preco_max = null;
    const matchPreco = msgLower.match(/(\d+)\s*(mil|k)/);
    if (matchPreco) {
      preco_max = parseInt(matchPreco[1], 10) * 1000;
    }

    const toolResult = toolExecutors.buscar_estoque({ termo, body_type, preco_max });
    executedToolsLog.push({
      name: 'buscar_estoque',
      args: { termo, body_type, preco_max },
      result: toolResult
    });

    if (toolResult.veiculos.length > 0) {
      const lista = toolResult.veiculos.map((v, i) => 
        `🚗 *${v.titulo}* (${v.ano})\n• Preço: *${v.preco}*\n• Km: ${v.km} | Câmbio: ${v.cambio}\n• Status: Disponível no Showroom`
      ).join('\n\n');

      replyText = `Olá! Que excelente escolha. Consultei o estoque da ${config.dealership.name} e encontrei as seguintes opções disponíveis:\n\n${lista}\n\nVocê pretende pagar à vista ou gostaria de uma simulação de financiamento? Também aceitamos seu veículo usado na troca!`;
    } else {
      replyText = `Consultei nosso estoque e não localizei nenhuma opção com esses filtros exatos no momento. Mas temos ótimos SUVs e Sedans como o Jeep Renegade 2022 e o Corolla XEi. Gostaria de conhecer?`;
    }
  }
  // 5. Saudação Padrão
  else {
    replyText = `Olá! Sou o consultor virtual da ${config.dealership.name} 🚗.\n\nComo posso te ajudar hoje? Temos um estoque completo de SUVs, Sedans e Seminovos revisados com garantia. Está procurando algum modelo em especial ou quer dar uma olhada em nossas ofertas?`;
  }

  return { replyText };
}

module.exports = {
  processMessage
};
