require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('node:path');

// Inicializa o banco SQLite
const db = require('./src/config/database');

const apiRoutes = require('./src/routes/api');
const webhookRoutes = require('./src/routes/webhook');
const config = require('./src/config/ai-provider');

const { requireApiKey } = require('./src/middleware/auth');
const { requireWebhookSecret } = require('./src/middleware/webhookAuth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Healthcheck endpoint (não exige autenticação) para monitoramento e plataformas de nuvem (Railway, Render, AWS, etc.)
app.get('/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'error', error: 'Database unavailable' });
  }
});

// Arquivos estáticos da interface web
app.use(express.static(path.join(__dirname, 'public')));

// Rotas da aplicação
app.use('/api/webhook', requireWebhookSecret, webhookRoutes);
app.use('/api', requireApiKey, apiRoutes);

// Rota fallback para SPA
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Rota de API não encontrada' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inicialização do servidor
app.listen(PORT, () => {
  console.log('\n========================================================');
  console.log('🚗💨 AUTOLEAD AI — PLATAFORMA DE VENDAS AUTOMOTIVAS 🚗💨');
  console.log('========================================================');
  console.log(`🌐 Painel Cockpit Web:   http://localhost:${PORT}`);
  console.log(`📱 Simulador WhatsApp:   http://localhost:${PORT}/#simulator`);
  console.log(`📡 Webhook WhatsApp:     http://localhost:${PORT}/api/webhook/whatsapp`);
  console.log(`🧠 Provedor de IA ativo: ${config.provider.toUpperCase()}`);
  console.log(`🏢 Concessionária:       ${config.dealership.name}`);
  console.log('========================================================\n');
});
