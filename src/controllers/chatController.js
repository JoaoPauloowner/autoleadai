const agent = require('../ai/agent');
const db = require('../config/database');
const { calculateLeadScore } = require('../ai/scorer');
const multimodal = require('../ai/multimodal');
const whatsappService = require('../services/whatsappService');
const auditService = require('../services/auditService');

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
    let sql = `
      SELECT 
        l.id, l.name, l.phone, l.channel, l.status, l.score, 
        COALESCE(l.ai_enabled, 1) as ai_enabled, 
        l.assigned_to, u.name as assigned_seller_name,
        l.ai_summary, l.last_inbound_at, l.last_outbound_at, l.updated_at,
        v.model as car_model, v.make as car_make,
        (SELECT content FROM chat_messages WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT sender FROM chat_messages WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1) as last_sender,
        (SELECT created_at FROM chat_messages WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
        (SELECT COUNT(*) FROM chat_messages WHERE lead_id = l.id) as message_count
      FROM leads l
      LEFT JOIN vehicles v ON l.interested_vehicle_id = v.id
      LEFT JOIN users u ON l.assigned_to = u.id
      WHERE ((SELECT COUNT(*) FROM chat_messages WHERE lead_id = l.id) > 0 OR l.channel = 'whatsapp')
    `;
    const params = [];

    // Vendedor só visualiza conversas de leads atribuídos a ele
    if (req.user && req.user.role === 'salesperson') {
      sql += ' AND l.assigned_to = ?';
      params.push(req.user.id);
    }

    sql += ` ORDER BY COALESCE(last_message_at, l.last_inbound_at, l.created_at) DESC LIMIT 100`;

    const leads = db.prepare(sql).all(...params);

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
    const leadId = req.body.leadId || req.body.lead_id;
    const message = req.body.message;
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

    // Regra de autorização mínima: vendedor só responde lead atribuído a ele
    if (req.user && req.user.role === 'salesperson' && lead.assigned_to !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Acesso negado. Este atendimento está sob responsabilidade de outro vendedor.'
      });
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
        await whatsappService.sendTextMessage(lead.phone, message.trim(), lead.remote_jid);
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

    const lead = db.prepare('SELECT assigned_to FROM leads WHERE id = ?').get(id);
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    }

    if (req.user && req.user.role === 'salesperson' && lead.assigned_to !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Acesso negado. Apenas o vendedor responsável ou o gestor podem alterar o status deste lead.'
      });
    }

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

/**
 * Lista mensagens geradas pela IA que estão aguardando aprovação humana (Copiloto)
 * Escopo: Vendedor só vê dos seus leads; Gerente e Owner veem todos.
 */
exports.getPendingReviewMessages = (req, res) => {
  try {
    let sql = `
      SELECT 
        m.id,
        m.lead_id,
        m.sender,
        m.content,
        m.tool_calls,
        m.copilot_status,
        m.created_at,
        l.name AS lead_name,
        l.phone AS lead_phone,
        l.status AS lead_status,
        l.assigned_to,
        l.remote_jid,
        u.name AS seller_name,
        v.make AS vehicle_make,
        v.model AS vehicle_model
      FROM chat_messages m
      JOIN leads l ON l.id = m.lead_id
      LEFT JOIN users u ON u.id = l.assigned_to
      LEFT JOIN vehicles v ON v.id = l.interested_vehicle_id
      WHERE m.copilot_status = 'pending_review'
    `;
    const params = [];

    // Escopo por vendedor
    if (req.user && req.user.role === 'salesperson') {
      sql += ' AND l.assigned_to = ?';
      params.push(req.user.id);
    }

    sql += ' ORDER BY m.created_at ASC';
    const pending = db.prepare(sql).all(...params);

    res.json({ success: true, count: pending.length, data: pending });
  } catch (error) {
    console.error('Erro ao buscar mensagens pendentes de revisão:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Aprova rascunho da IA e envia exatamente como gerado
 */
exports.approvePendingMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const msg = db.prepare(`
      SELECT m.*, l.phone AS lead_phone, l.remote_jid, l.assigned_to, l.name AS lead_name
      FROM chat_messages m
      JOIN leads l ON l.id = m.lead_id
      WHERE m.id = ?
    `).get(messageId);

    if (!msg) {
      return res.status(404).json({ success: false, error: 'Mensagem pendente não encontrada' });
    }

    if (msg.copilot_status !== 'pending_review') {
      return res.status(400).json({ success: false, error: `Esta mensagem já foi processada (status: ${msg.copilot_status})` });
    }

    // Escopo de autorização: vendedor só age nos seus próprios leads
    if (req.user && req.user.role === 'salesperson' && msg.assigned_to !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Acesso negado. Esta mensagem pertence a um lead sob responsabilidade de outro vendedor.'
      });
    }

    // Envia via WhatsApp (se conectado)
    let sentViaWhatsApp = false;
    let whatsappError = null;
    if (msg.lead_phone && !msg.lead_phone.startsWith('sim_')) {
      try {
        await whatsappService.sendTextMessage(msg.lead_phone, msg.content, msg.remote_jid);
        sentViaWhatsApp = true;
      } catch (waErr) {
        console.warn('Aviso ao enviar via WhatsApp após aprovação:', waErr.message);
        whatsappError = waErr.message;
      }
    }

    // Atualiza status para 'approved'
    db.prepare(`
      UPDATE chat_messages
      SET copilot_status = 'approved'
      WHERE id = ?
    `).run(messageId);

    db.prepare(`
      UPDATE leads
      SET last_outbound_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(msg.lead_id);

    // Auditoria
    auditService.logAudit({
      organization_id: 'default',
      actor: req.user ? `${req.user.name} (${req.user.role})` : 'admin',
      action: 'copilot_approve',
      entity_type: 'chat_message',
      entity_id: String(messageId),
      details: {
        lead_id: msg.lead_id,
        lead_name: msg.lead_name,
        sentViaWhatsApp,
        whatsappError,
        content: msg.content
      }
    });

    res.json({
      success: true,
      messageId: Number(messageId),
      copilot_status: 'approved',
      sentViaWhatsApp,
      whatsappError,
      message: 'Resposta da IA aprovada e enviada com sucesso!'
    });
  } catch (error) {
    console.error('Erro ao aprovar mensagem:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Edita o texto do rascunho da IA e envia a versão customizada
 */
exports.editAndSendPendingMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { editedText } = req.body;

    if (!editedText || !editedText.trim()) {
      return res.status(400).json({ success: false, error: 'O texto editado não pode ser vazio' });
    }

    const msg = db.prepare(`
      SELECT m.*, l.phone AS lead_phone, l.remote_jid, l.assigned_to, l.name AS lead_name
      FROM chat_messages m
      JOIN leads l ON l.id = m.lead_id
      WHERE m.id = ?
    `).get(messageId);

    if (!msg) {
      return res.status(404).json({ success: false, error: 'Mensagem pendente não encontrada' });
    }

    if (msg.copilot_status !== 'pending_review') {
      return res.status(400).json({ success: false, error: `Esta mensagem já foi processada (status: ${msg.copilot_status})` });
    }

    // Escopo de autorização: vendedor só age nos seus próprios leads
    if (req.user && req.user.role === 'salesperson' && msg.assigned_to !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Acesso negado. Esta mensagem pertence a um lead sob responsabilidade de outro vendedor.'
      });
    }

    const cleanEditedText = editedText.trim();
    const originalText = msg.content;

    // Envia via WhatsApp (se conectado)
    let sentViaWhatsApp = false;
    let whatsappError = null;
    if (msg.lead_phone && !msg.lead_phone.startsWith('sim_')) {
      try {
        await whatsappService.sendTextMessage(msg.lead_phone, cleanEditedText, msg.remote_jid);
        sentViaWhatsApp = true;
      } catch (waErr) {
        console.warn('Aviso ao enviar via WhatsApp após edição:', waErr.message);
        whatsappError = waErr.message;
      }
    }

    // Atualiza conteúdo e status para 'edited'
    db.prepare(`
      UPDATE chat_messages
      SET content = ?, copilot_status = 'edited'
      WHERE id = ?
    `).run(cleanEditedText, messageId);

    db.prepare(`
      UPDATE leads
      SET last_outbound_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(msg.lead_id);

    // Auditoria
    auditService.logAudit({
      organization_id: 'default',
      actor: req.user ? `${req.user.name} (${req.user.role})` : 'admin',
      action: 'copilot_edit_and_send',
      entity_type: 'chat_message',
      entity_id: String(messageId),
      details: {
        lead_id: msg.lead_id,
        lead_name: msg.lead_name,
        original_text: originalText,
        edited_text: cleanEditedText,
        sentViaWhatsApp,
        whatsappError
      }
    });

    res.json({
      success: true,
      messageId: Number(messageId),
      copilot_status: 'edited',
      content: cleanEditedText,
      sentViaWhatsApp,
      whatsappError,
      message: 'Mensagem editada e enviada com sucesso!'
    });
  } catch (error) {
    console.error('Erro ao editar e enviar mensagem:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Recusa rascunho da IA (não envia ao cliente)
 * Opcionalmente desativa IA do lead para assumir atendimento humano
 */
exports.rejectPendingMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { markHumanTakeover } = req.body || {};

    const msg = db.prepare(`
      SELECT m.*, l.assigned_to, l.name AS lead_name
      FROM chat_messages m
      JOIN leads l ON l.id = m.lead_id
      WHERE m.id = ?
    `).get(messageId);

    if (!msg) {
      return res.status(404).json({ success: false, error: 'Mensagem pendente não encontrada' });
    }

    if (msg.copilot_status !== 'pending_review') {
      return res.status(400).json({ success: false, error: `Esta mensagem já foi processada (status: ${msg.copilot_status})` });
    }

    // Escopo de autorização: vendedor só age nos seus próprios leads
    if (req.user && req.user.role === 'salesperson' && msg.assigned_to !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Acesso negado. Esta mensagem pertence a um lead sob responsabilidade de outro vendedor.'
      });
    }

    // Atualiza status para 'rejected' (NÃO envia nada ao WhatsApp)
    db.prepare(`
      UPDATE chat_messages
      SET copilot_status = 'rejected'
      WHERE id = ?
    `).run(messageId);

    // Se markHumanTakeover === true, seta ai_enabled = 0 no lead
    if (markHumanTakeover) {
      db.prepare(`
        UPDATE leads
        SET ai_enabled = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(msg.lead_id);
    }

    // Auditoria
    auditService.logAudit({
      organization_id: 'default',
      actor: req.user ? `${req.user.name} (${req.user.role})` : 'admin',
      action: 'copilot_reject',
      entity_type: 'chat_message',
      entity_id: String(messageId),
      details: {
        lead_id: msg.lead_id,
        lead_name: msg.lead_name,
        markHumanTakeover: !!markHumanTakeover
      }
    });

    res.json({
      success: true,
      messageId: Number(messageId),
      copilot_status: 'rejected',
      ai_enabled: markHumanTakeover ? 0 : 1,
      message: 'Rascunho da IA recusado com sucesso.'
    });
  } catch (error) {
    console.error('Erro ao recusar mensagem:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

