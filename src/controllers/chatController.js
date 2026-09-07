const agent = require('../ai/agent');
const db = require('../config/database');
const { calculateLeadScore } = require('../ai/scorer');
const multimodal = require('../ai/multimodal');
const whatsappService = require('../services/whatsappService');

exports.sendMessage = async (req, res) => {
  try {
    const { leadId, message, channel = 'simulator', copilotAction = 'direct' } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Mensagem não pode ser vazia' });
    }

    // Registra horário de mensagem de entrada do cliente
    if (leadId) {
      db.prepare(`UPDATE leads SET last_inbound_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(leadId);
    }

    const result = await agent.processMessage({
      leadId: leadId ? parseInt(leadId, 10) : null,
      userMessage: message.trim(),
      channel
    });

    // Atualiza horário de saída e recalcula Lead Score
    const updatedLead = db.prepare('SELECT * FROM leads WHERE id = ?').get(result.leadId);
    const messages = db.prepare('SELECT content FROM chat_messages WHERE lead_id = ?').all(result.leadId);

    const scoreData = calculateLeadScore({ lead: updatedLead, messages });

    db.prepare(`
      UPDATE leads 
      SET score = ?, score_breakdown = ?, last_outbound_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(scoreData.total, JSON.stringify(scoreData.breakdown), result.leadId);

    res.json({
      success: true,
      leadId: result.leadId,
      reply: result.reply,
      tools: result.tools,
      provider: result.provider,
      score: scoreData
    });
  } catch (error) {
    console.error('Erro ao processar mensagem do chat:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * RAG Multimodal: Processamento nativo de áudio do WhatsApp
 */
exports.sendAudioMessage = async (req, res) => {
  try {
    const { leadId, audioBase64, mockText } = req.body;

    // Transcreve o áudio nativamente
    const transcription = await multimodal.transcribeAudio({
      audioBuffer: audioBase64 ? Buffer.from(audioBase64, 'base64') : null,
      mockText
    });

    // Processa a mensagem transcrita com o cérebro de IA
    const aiResult = await agent.processMessage({
      leadId: leadId ? parseInt(leadId, 10) : null,
      userMessage: transcription.text,
      channel: 'whatsapp_audio'
    });

    // Atualiza Lead Score
    const updatedLead = db.prepare('SELECT * FROM leads WHERE id = ?').get(aiResult.leadId);
    const messages = db.prepare('SELECT content FROM chat_messages WHERE lead_id = ?').all(aiResult.leadId);
    const scoreData = calculateLeadScore({ lead: updatedLead, messages });

    db.prepare(`UPDATE leads SET score = ?, score_breakdown = ? WHERE id = ?`)
      .run(scoreData.total, JSON.stringify(scoreData.breakdown), aiResult.leadId);

    res.json({
      success: true,
      transcription: transcription.text,
      reply: aiResult.reply,
      tools: aiResult.tools,
      leadId: aiResult.leadId,
      score: scoreData
    });
  } catch (error) {
    console.error('Erro no processamento de áudio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * RAG Multimodal: Inspeção visual de foto de veículo para avaliação de troca
 */
exports.sendVehiclePhoto = async (req, res) => {
  try {
    const { leadId, imageBase64, mockDetails } = req.body;

    const inspection = await multimodal.inspectVehicleImage({
      imageBase64,
      mockDetails
    });

    const promptWithImage = `[FOTO ENVIADA DO VEÍCULO DA TROCA]: ${inspection.analysis}`;

    const aiResult = await agent.processMessage({
      leadId: leadId ? parseInt(leadId, 10) : null,
      userMessage: promptWithImage,
      channel: 'whatsapp_image'
    });

    // Registra que tem troca e os detalhes no Lead
    db.prepare(`
      UPDATE leads 
      SET has_trade_in = 1, trade_in_details = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(inspection.analysis.substring(0, 300), aiResult.leadId);

    res.json({
      success: true,
      analysis: inspection.analysis,
      reply: aiResult.reply,
      tools: aiResult.tools,
      leadId: aiResult.leadId
    });
  } catch (error) {
    console.error('Erro no processamento de foto:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getMessages = (req, res) => {
  try {
    const { leadId } = req.params;
    const messages = db.prepare(`
      SELECT * FROM chat_messages 
      WHERE lead_id = ? 
      ORDER BY created_at ASC
    `).all(leadId);

    res.json({ success: true, count: messages.length, data: messages });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.resetSimulator = (req, res) => {
  try {
    const phone = `sim_${Date.now()}`;
    const insertLead = db.prepare(`
      INSERT INTO leads (name, phone, channel, status, score, is_demo_data)
      VALUES (?, ?, 'simulator', 'novo', 25, 1)
    `);
    const result = insertLead.run('Cliente Novo', phone);
    const newLeadId = result.lastInsertRowid;

    res.json({
      success: true,
      message: 'Sessão do simulador reiniciada',
      leadId: newLeadId
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Retorna lista de conversas reais de WhatsApp com último resumo, unread e status de IA
 */
exports.getLiveConversations = (req, res) => {
  try {
    const leads = db.prepare(`
      SELECT 
        l.id, l.name, l.phone, l.channel, l.status, l.score, 
        COALESCE(l.ai_enabled, 1) as ai_enabled, 
        l.ai_summary, l.last_inbound_at, l.last_outbound_at, l.updated_at,
        v.model as car_model, v.make as car_make,
        (SELECT content FROM chat_messages WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT sender FROM chat_messages WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1) as last_sender,
        (SELECT created_at FROM chat_messages WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
        (SELECT COUNT(*) FROM chat_messages WHERE lead_id = l.id) as message_count
      FROM leads l
      LEFT JOIN vehicles v ON l.interested_vehicle_id = v.id
      WHERE (SELECT COUNT(*) FROM chat_messages WHERE lead_id = l.id) > 0 OR l.channel = 'whatsapp'
      ORDER BY COALESCE(last_message_at, l.last_inbound_at, l.created_at) DESC
      LIMIT 100
    `).all();

    res.json({ success: true, count: leads.length, data: leads });
  } catch (error) {
    console.error('Erro ao buscar conversas ao vivo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Envia mensagem humana digitada pelo vendedor no painel diretamente para o WhatsApp do cliente
 */
exports.sendHumanMessage = async (req, res) => {
  try {
    const { leadId, message } = req.body;
    if (!leadId) {
      return res.status(400).json({ success: false, error: 'ID do lead é obrigatório' });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Mensagem não pode ser vazia' });
    }

    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    }

    // Salva a mensagem no histórico do chat como assistente/vendedor
    db.prepare(`
      INSERT INTO chat_messages (lead_id, sender, content)
      VALUES (?, 'assistant', ?)
    `).run(lead.id, message.trim());

    // Se o vendedor respondeu, mantém o modo de atendimento humano ativo (ai_enabled = 0)
    db.prepare(`
      UPDATE leads 
      SET last_outbound_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, ai_enabled = 0 
      WHERE id = ?
    `).run(lead.id);

    let sentViaWhatsApp = false;
    let whatsappError = null;

    // Se o telefone for real e o WhatsApp estiver conectado, envia de verdade
    if (lead.phone && !lead.phone.startsWith('sim_')) {
      try {
        await whatsappService.sendTextMessage(lead.phone, message.trim());
        sentViaWhatsApp = true;
      } catch (waErr) {
        console.warn('Aviso ao enviar via WhatsApp:', waErr.message);
        whatsappError = waErr.message;
      }
    }

    res.json({
      success: true,
      sentViaWhatsApp,
      whatsappError,
      message: 'Mensagem enviada com sucesso!'
    });
  } catch (error) {
    console.error('Erro no envio de mensagem humana:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Alterna status de IA para um lead (1: IA Ativa, 0: Vendedor Humano)
 */
exports.toggleLeadAiStatus = (req, res) => {
  try {
    const { id } = req.params;
    const { ai_enabled } = req.body;

    const newStatus = ai_enabled ? 1 : 0;
    db.prepare(`
      UPDATE leads 
      SET ai_enabled = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(newStatus, id);

    res.json({
      success: true,
      ai_enabled: newStatus,
      message: newStatus === 1 ? 'IA reativada para este atendimento' : 'Vendedor humano assumiu o atendimento'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

