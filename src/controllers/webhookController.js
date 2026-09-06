const agent = require('../ai/agent');
const db = require('../config/database');

exports.handleWhatsAppWebhook = async (req, res) => {
  try {
    const payload = req.body;
    console.log('📩 Webhook WhatsApp recebido:', JSON.stringify(payload).substring(0, 200));

    // Normalização para Evolution API ou Z-API
    let senderPhone = null;
    let senderName = 'Cliente WhatsApp';
    let messageText = '';

    // Formato Evolution API v1 / v2
    if (payload.data && payload.data.key) {
      senderPhone = payload.data.key.remoteJid ? payload.data.key.remoteJid.replace(/@.*$/, '') : null;
      senderName = payload.data.pushName || 'Cliente WhatsApp';
      messageText = payload.data.message?.conversation || 
                    payload.data.message?.extendedTextMessage?.text || 
                    payload.data.message?.imageMessage?.caption || '';
    } 
    // Formato genérico (ou n8n payload)
    else if (payload.phone || payload.from) {
      senderPhone = (payload.phone || payload.from).toString().replace(/\D/g, '');
      senderName = payload.name || payload.pushName || 'Cliente WhatsApp';
      messageText = payload.text || payload.message || '';
    }

    // Ignora mensagens enviadas por mim mesmo (fromMe)
    if (payload.data?.key?.fromMe) {
      return res.status(200).json({ status: 'ignored_from_me' });
    }

    if (!senderPhone || !messageText) {
      return res.status(200).json({ status: 'no_message_content' });
    }

    // Deduplicação persistente de mensagens por ID para evitar disparos duplos do WhatsApp
    const messageId = payload.data?.key?.id || payload.message_id || payload.messageId || payload.id;
    if (messageId) {
      try {
        // Limpa registros com mais de 24 horas
        db.prepare('DELETE FROM processed_messages WHERE received_at < ?').run(Date.now() - 24 * 60 * 60 * 1000);
        db.prepare('INSERT INTO processed_messages (message_id, received_at) VALUES (?, ?)').run(String(messageId), Date.now());
      } catch (err) {
        if (err.message && err.message.includes('UNIQUE')) {
          console.log(`⚠️ Mensagem WhatsApp duplicada ignorada (ID: ${messageId})`);
          return res.status(200).json({ status: 'duplicate_ignored', messageId });
        }
      }
    }

    // Busca ou cria lead pelo número de telefone
    let lead = db.prepare('SELECT * FROM leads WHERE phone = ?').get(senderPhone);
    if (!lead) {
      const stmt = db.prepare(`
        INSERT INTO leads (name, phone, channel, status)
        VALUES (?, ?, 'whatsapp', 'novo')
      `);
      const r = stmt.run(senderName, senderPhone);
      lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(r.lastInsertRowid);
    }

    // Processa com o cérebro próprio de IA
    const aiResult = await agent.processMessage({
      leadId: lead.id,
      userMessage: messageText,
      channel: 'whatsapp'
    });

    // Retorna resposta para o webhook
    return res.status(200).json({
      success: true,
      senderPhone,
      reply: aiResult.reply,
      tools: aiResult.tools
    });
  } catch (error) {
    console.error('Erro no webhook do WhatsApp:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
