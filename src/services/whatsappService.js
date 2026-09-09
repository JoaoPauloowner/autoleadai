const path = require('node:path');
const fs = require('node:fs');
const pino = require('pino');
const QRCode = require('qrcode');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');

const agent = require('../ai/agent');
const db = require('../config/database');
const config = require('../config/ai-provider');
const leadRoutingService = require('../services/leadRoutingService');
const auditService = require('../services/auditService');

let sock = null;
let connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
let currentQrCode = null;
let connectedPhone = null;
let isStarting = false;

const sessionDir = path.resolve(__dirname, '../../data/whatsapp_session');

// Garante que a pasta de sessão exista
if (!fs.existsSync(sessionDir)) {
  fs.mkdirSync(sessionDir, { recursive: true });
}

async function startWhatsApp() {
  if (isStarting || connectionStatus === 'connected') return;
  isStarting = true;
  connectionStatus = 'connecting';
  currentQrCode = null;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: ['AutoLead AI', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          currentQrCode = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
          connectionStatus = 'connecting';
          console.log('📱 [WhatsApp QR] Novo QR Code gerado para leitura.');
        } catch (qrErr) {
          console.error('Erro ao gerar imagem do QR Code:', qrErr);
        }
      }

      if (connection === 'open') {
        connectionStatus = 'connected';
        currentQrCode = null;
        isStarting = false;
        connectedPhone = sock.user?.id ? sock.user.id.split(':')[0] : 'Conectado';
        console.log(`✅ [WhatsApp] Conectado com sucesso ao número: ${connectedPhone}`);

        // Auditoria: Conexão bem-sucedida do WhatsApp da loja
        try {
          auditService.logAudit({
            organization_id: 'default',
            actor: 'system',
            action: 'whatsapp_connected',
            entity_type: 'whatsapp_session',
            entity_id: connectedPhone,
            details: `WhatsApp da concessionária conectado com sucesso ao número ${connectedPhone}`
          });
        } catch (e) {}
      }

      if (connection === 'close') {
        isStarting = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`⚠️ [WhatsApp] Conexão encerrada (Status ${statusCode}). Reconectar: ${shouldReconnect}`);

        if (shouldReconnect) {
          connectionStatus = 'connecting';
          setTimeout(() => startWhatsApp(), 5000);
        } else {
          connectionStatus = 'disconnected';
          const prevPhone = connectedPhone;
          connectedPhone = null;
          currentQrCode = null;
          // Limpa sessão local se foi desconectado pelo celular
          try {
            fs.rmSync(sessionDir, { recursive: true, force: true });
            fs.mkdirSync(sessionDir, { recursive: true });
          } catch (e) {}

          // Auditoria: Desconexão remota
          try {
            auditService.logAudit({
              organization_id: 'default',
              actor: 'system',
              action: 'whatsapp_disconnected',
              entity_type: 'whatsapp_session',
              entity_id: prevPhone || 'baileys_session',
              details: 'WhatsApp desconectado pelo aplicativo do celular ou sessão encerrada'
            });
          } catch (e) {}
        }
      }
    });

    // Escuta mensagens recebidas em tempo real
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        try {
          // Ignora mensagens enviadas pelo próprio bot ou grupos
          if (msg.key.fromMe) continue;
          if (!msg.key.remoteJid || msg.key.remoteJid.endsWith('@g.us')) continue;

          const senderJid = msg.key.remoteJid;
          const senderPhone = senderJid.replace(/@.*$/, '');
          const pushName = msg.pushName || 'Cliente WhatsApp';

          // Extrai o conteúdo do texto
          const messageText = msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption || '';

          if (!messageText.trim()) continue;

          // Deduplicação persistente
          const messageId = msg.key.id;
          if (messageId) {
            try {
              db.prepare('DELETE FROM processed_messages WHERE received_at < ?').run(Date.now() - 24 * 60 * 60 * 1000);
              db.prepare('INSERT INTO processed_messages (message_id, received_at) VALUES (?, ?)').run(String(messageId), Date.now());
            } catch (dupErr) {
              if (dupErr.message && dupErr.message.includes('UNIQUE')) {
                console.log(`⚠️ [WhatsApp] Mensagem duplicada ignorada (ID: ${messageId})`);
                continue;
              }
            }
          }

          console.log(`📩 [WhatsApp Recebido] De: ${pushName} (${senderPhone}): "${messageText}"`);

          // Busca ou cria lead
          let lead = db.prepare('SELECT * FROM leads WHERE phone = ?').get(senderPhone);
          if (!lead) {
            const assigned_to = leadRoutingService.getNextSalespersonId();
            const stmt = db.prepare(`
              INSERT INTO leads (name, phone, remote_jid, channel, status, ai_enabled, assigned_to)
              VALUES (?, ?, ?, 'whatsapp', 'novo', 1, ?)
            `);
            const r = stmt.run(pushName, senderPhone, senderJid, assigned_to);
            lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(r.lastInsertRowid);
            console.log(`🎯 [Round-Robin] Novo lead ${pushName} (${senderPhone}) atribuído ao vendedor ID ${assigned_to}`);
          } else if (!lead.remote_jid || lead.remote_jid !== senderJid) {
            try {
              db.prepare('UPDATE leads SET remote_jid = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(senderJid, lead.id);
            } catch (e) {}
          }

          // Se o vendedor humano assumiu (ai_enabled === 0), salva a mensagem recebida e NÃO responde via IA
          if (lead.ai_enabled === 0) {
            db.prepare(`
              INSERT INTO chat_messages (lead_id, sender, content)
              VALUES (?, 'user', ?)
            `).run(lead.id, messageText);

            db.prepare(`
              UPDATE leads 
              SET last_inbound_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
              WHERE id = ?
            `).run(lead.id);

            console.log(`👤 [Atendimento Humano] Mensagem de ${pushName} (${senderPhone}) aguardando resposta manual.`);
            continue;
          }

          // Resposta da IA (ou rascunho se modo de revisão estiver ativo)
          await sock.sendPresenceUpdate('composing', senderJid);
          const aiResult = await agent.processMessage({
            leadId: lead.id,
            userMessage: messageText,
            channel: 'whatsapp',
            copilotStatus: config.aiReviewMode ? 'pending_review' : 'approved'
          });

          // Finaliza o status de digitando
          await sock.sendPresenceUpdate('paused', senderJid);

          if (config.aiReviewMode) {
            // No modo de revisão, NÃO envia ao WhatsApp automaticamente
            auditService.logAudit({
              organization_id: 'default',
              actor: 'ai_copilot',
              action: 'ai_draft_pending_review',
              entity_type: 'chat_message',
              entity_id: String(aiResult.messageId),
              details: `Rascunho gerado pela IA para lead #${lead.id} (${lead.name}) aguardando revisão humana.`
            });
            console.log(`⏳ [Modo Revisão Ativo] Rascunho da IA #${aiResult.messageId} salvo para aprovação humana (Lead #${lead.id})`);
          } else {
            // Modo padrão: envio automático imediato
            await sock.sendMessage(senderJid, { text: aiResult.reply });
            console.log(`🤖 [WhatsApp Respondido pela IA] Para: ${senderPhone}`);
          }
        } catch (msgErr) {
          console.error('Erro ao processar mensagem do WhatsApp:', msgErr);
        }
      }
    });

  } catch (err) {
    isStarting = false;
    connectionStatus = 'disconnected';
    console.error('Erro ao inicializar WhatsApp Baileys:', err);
  }
}

async function disconnectWhatsApp(actor = 'system') {
  try {
    const prevPhone = connectedPhone;
    if (sock) {
      await sock.logout();
      sock = null;
    }
    connectionStatus = 'disconnected';
    connectedPhone = null;
    currentQrCode = null;
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      fs.mkdirSync(sessionDir, { recursive: true });
    } catch (e) {}

    // Auditoria: Desconexão solicitada
    try {
      auditService.logAudit({
        organization_id: 'default',
        actor: actor,
        action: 'whatsapp_disconnected',
        entity_type: 'whatsapp_session',
        entity_id: prevPhone || 'baileys_session',
        details: 'Sessão do WhatsApp encerrada e desconectada pelo painel'
      });
    } catch (e) {}

    return { success: true, message: 'WhatsApp desconectado com sucesso' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getWhatsAppStatus() {
  return {
    status: connectionStatus,
    qrCode: currentQrCode,
    phone: connectedPhone
  };
}

/**
 * Envio direto de mensagem para um número de WhatsApp real (usado pelo vendedor no painel)
 */
async function sendTextMessage(toPhone, text, remoteJid = null) {
  if (!sock || connectionStatus !== 'connected') {
    throw new Error('WhatsApp não está conectado no momento. Conecte pelo QR Code antes de enviar.');
  }

  let jid;
  if (remoteJid && String(remoteJid).includes('@')) {
    jid = String(remoteJid).trim();
  } else if (String(toPhone).includes('@')) {
    jid = String(toPhone).trim();
  } else {
    const rawPhone = String(toPhone).trim();
    const cleanDigits = rawPhone.replace(/\D/g, '');

    // Identificadores de dispositivo WhatsApp (LID) possuem 15 ou mais dígitos
    if (cleanDigits.length >= 15) {
      jid = `${cleanDigits}@lid`;
    } else {
      if (!cleanDigits || cleanDigits.length < 8) {
        throw new Error('Número de telefone inválido para envio no WhatsApp');
      }
      const finalPhone = cleanDigits.startsWith('55') ? cleanDigits : `55${cleanDigits}`;
      jid = `${finalPhone}@s.whatsapp.net`;
    }
  }

  try {
    await sock.sendPresenceUpdate('composing', jid);
    const result = await sock.sendMessage(jid, { text: String(text).trim() });
    await sock.sendPresenceUpdate('paused', jid);
    console.log(`📤 [WhatsApp Vendedor] Mensagem enviada para JID: ${jid}`);
    return result;
  } catch (err) {
    console.error(`Erro ao enviar mensagem para JID ${jid}:`, err.message);
    throw err;
  }
}

// Se já houver credenciais salvas, inicializa a conexão automaticamente
if (fs.existsSync(path.join(sessionDir, 'creds.json'))) {
  console.log('🔄 [WhatsApp] Sessão salva encontrada. Conectando automaticamente...');
  setTimeout(() => startWhatsApp(), 1000);
}

module.exports = {
  startWhatsApp,
  disconnectWhatsApp,
  getWhatsAppStatus,
  sendTextMessage
};
