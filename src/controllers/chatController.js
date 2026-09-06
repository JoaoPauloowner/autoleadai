const agent = require('../ai/agent');
const db = require('../config/database');
const { calculateLeadScore } = require('../ai/scorer');
const multimodal = require('../ai/multimodal');

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
