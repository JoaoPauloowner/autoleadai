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
          connectedPhone = null;
          currentQrCode = null;
          // Limpa sessão local se foi desconectado pelo celular
          try {
            fs.rmSync(sessionDir, { recursive: true, force: true });
            fs.mkdirSync(sessionDir, { recursive: true });
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
            const stmt = db.prepare(`
              INSERT INTO leads (name, phone, channel, status)
              VALUES (?, ?, 'whatsapp', 'novo')
            `);
            const r = stmt.run(pushName, senderPhone);
            lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(r.lastInsertRowid);
          }

          // Sinaliza digitando... no WhatsApp para ficar super humanizado
          await sock.sendPresenceUpdate('composing', senderJid);

          // Processa com o cérebro de IA
          const aiResult = await agent.processMessage({
            leadId: lead.id,
            userMessage: messageText,
            channel: 'whatsapp'
          });

          // Finaliza o status de digitando e responde
          await sock.sendPresenceUpdate('paused', senderJid);
          await sock.sendMessage(senderJid, { text: aiResult.reply });
          console.log(`🤖 [WhatsApp Respondido] Para: ${senderPhone}`);
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

async function disconnectWhatsApp() {
  try {
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

// Se já houver credenciais salvas, inicializa a conexão automaticamente
if (fs.existsSync(path.join(sessionDir, 'creds.json'))) {
  console.log('🔄 [WhatsApp] Sessão salva encontrada. Conectando automaticamente...');
  setTimeout(() => startWhatsApp(), 1000);
}

module.exports = {
  startWhatsApp,
  disconnectWhatsApp,
  getWhatsAppStatus
};
