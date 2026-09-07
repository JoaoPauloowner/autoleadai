const db = require('../config/database');

const STOP_WORDS = new Set([
  'de', 'a', 'o', 'que', 'e', 'do', 'da', 'em', 'um', 'para', 'com', 'nao', 'uma',
  'os', 'no', 'se', 'na', 'por', 'mais', 'as', 'dos', 'como', 'mas', 'ao', 'ele',
  'das', 'seu', 'sua', 'ou', 'quando', 'muito', 'nos', 'ja', 'eu', 'tambem', 'so',
  'pelo', 'pela', 'ate', 'isso', 'ela', 'entre', 'depois', 'sem', 'mesmo', 'aos',
  'seus', 'quem', 'nas', 'me', 'esse', 'eles', 'voce', 'essa', 'num', 'nem', 'suas',
  'meu', 'as', 'minha', 'numa', 'pelos', 'elas', 'qual', 'quais', 'quanto', 'quantos'
]);

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .trim();
}

/**
 * Busca itens relevantes na Base de Conhecimento da concessionária (RAG)
 * @param {string} userMessage - Mensagem recebida do cliente
 * @param {number} limit - Número máximo de itens a recuperar (padrão: 3)
 * @returns {Array<{id, category, question, answer, score}>}
 */
function searchRelevantKnowledge(userMessage, limit = 3) {
  try {
    const rawTokens = normalizeText(userMessage).split(/\s+/).filter(t => t.length > 2 && !STOP_WORDS.has(t));
    if (rawTokens.length === 0) return [];

    const allKnowledge = db.prepare(`
      SELECT id, category, question, answer, keywords 
      FROM store_knowledge 
      WHERE is_active = 1
    `).all();

    if (!allKnowledge || allKnowledge.length === 0) return [];

    const scored = [];
    const normalizedMessage = normalizeText(userMessage);

    for (const item of allKnowledge) {
      let score = 0;
      const normQ = normalizeText(item.question);
      const normA = normalizeText(item.answer);
      const normKeywords = normalizeText(item.keywords || '');

      // Correspondência exata ou de frase
      if (normalizedMessage.includes(normQ) || normQ.includes(normalizedMessage)) {
        score += 15;
      }

      // Pontuação por palavras-chave cadastradas
      const itemKeywords = normKeywords.split(/[\s,]+/).filter(k => k.length > 2);
      for (const kw of itemKeywords) {
        if (normalizedMessage.includes(kw)) {
          score += 4;
        }
      }

      // Pontuação por tokens da pergunta e resposta
      for (const token of rawTokens) {
        if (normQ.includes(token)) score += 3;
        if (normKeywords.includes(token)) score += 3;
        if (normA.includes(token)) score += 1;
      }

      if (score >= 3) {
        scored.push({ ...item, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  } catch (err) {
    console.error('Erro na busca RAG de conhecimento:', err.message);
    return [];
  }
}

/**
 * Formata os itens recuperados para injeção no prompt do sistema
 */
function formatKnowledgeForPrompt(knowledgeItems) {
  if (!knowledgeItems || knowledgeItems.length === 0) return '';

  let text = '\n## Base de Conhecimento Oficial da Concessionária (RAG - Regras Oficiais):\n';
  text += 'Utilize estritamente as respostas oficiais abaixo para responder com máxima exatidão às dúvidas do cliente:\n\n';

  for (const item of knowledgeItems) {
    text += `- **Pergunta Frequente:** ${item.question}\n`;
    text += `  **Resposta Oficial da Loja:** ${item.answer}\n\n`;
  }

  return text;
}

module.exports = {
  searchRelevantKnowledge,
  formatKnowledgeForPrompt
};
