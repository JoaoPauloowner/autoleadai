const agent = require('../ai/agent');
const db = require('../config/database');

exports.sendMessage = async (req, res) => {
  try {
    const { leadId, message, channel = 'simulator' } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Mensagem não pode ser vazia' });
    }

    const result = await agent.processMessage({
      leadId: leadId ? parseInt(leadId, 10) : null,
      userMessage: message.trim(),
      channel
    });

    res.json({
      success: true,
      leadId: result.leadId,
      reply: result.reply,
      tools: result.tools,
      provider: result.provider
    });
  } catch (error) {
    console.error('Erro ao processar mensagem do chat:', error);
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
      INSERT INTO leads (name, phone, channel, status)
      VALUES (?, ?, 'simulator', 'novo')
    `);
    const result = insertLead.run('Cliente Teste', phone);
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
