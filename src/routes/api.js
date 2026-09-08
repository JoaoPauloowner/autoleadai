const express = require('express');
const router = express.Router();

const vehicleController = require('../controllers/vehicleController');
const leadController = require('../controllers/leadController');
const bookingController = require('../controllers/bookingController');
const chatController = require('../controllers/chatController');
const taskController = require('../controllers/taskController');
const importController = require('../controllers/importController');
const knowledgeController = require('../controllers/knowledgeController');
const authController = require('../controllers/authController');
const userController = require('../controllers/userController');
const auditService = require('../services/auditService');
const { requireOwner, requireManagerOrOwner } = require('../middleware/auth');
const config = require('../config/ai-provider');
const settingsStore = require('../config/settings-store');
const db = require('../config/database');

// Rotas de Autenticação, Sessão & Setup Inicial
router.get('/auth/setup-status', authController.getSetupStatus);
router.post('/auth/setup', authController.initialSetup);
router.post('/auth/login', authController.login);
router.get('/auth/me', authController.me);
router.post('/auth/logout', authController.logout);
router.post('/auth/change-password', userController.changeOwnPassword);

// Rotas de Gestão de Usuários & Equipe (Manager ou Owner)
router.get('/users', requireManagerOrOwner, userController.listUsers);
router.post('/users', requireManagerOrOwner, userController.createUser);
router.patch('/users/:id', requireManagerOrOwner, userController.updateUser);
router.post('/users/:id/reset-password', requireManagerOrOwner, userController.resetPassword);

// Rotas de Veículos (Estoque)
router.get('/vehicles', vehicleController.listVehicles);
router.get('/vehicles/:id', vehicleController.getVehicle);
router.post('/vehicles', vehicleController.createVehicle);
router.put('/vehicles/:id', vehicleController.updateVehicle);
router.delete('/vehicles/:id', vehicleController.deleteVehicle);

// Rotas de Leads (CRM)
router.get('/leads', leadController.listLeads);
router.post('/leads', leadController.createLead);
router.get('/leads/:id', leadController.getLeadDetails);
router.put('/leads/:id', leadController.updateLead);
router.patch('/leads/:id/status', leadController.updateLeadStatus);
router.delete('/leads/:id', leadController.deleteLead);
router.get('/dashboard/metrics', leadController.getDashboardMetrics);
router.get('/dashboard/leakage', leadController.getLeakageAnalytics);
router.post('/integrations/portal-lead', leadController.handlePortalLeadWebhook);

// Rotas de Tarefas e Próximas Ações
router.get('/tasks', taskController.listTasks);
router.post('/tasks', taskController.createTask);
router.patch('/tasks/:id/complete', taskController.completeTask);
router.delete('/tasks/:id', taskController.deleteTask);

// Rotas de Importação CSV
router.post('/imports/leads', importController.importLeadsCsv);

// Rotas de Test-Drives (Agendamentos)
router.get('/test-drives', bookingController.listTestDrives);
router.post('/test-drives', bookingController.createTestDrive);
router.patch('/test-drives/:id/status', bookingController.updateTestDriveStatus);

// Rotas do Atendimento ao Vivo (Live Inbox WhatsApp) e Chat
router.get('/chat/conversations', chatController.getLiveConversations);
router.post('/chat/send-human', chatController.sendHumanMessage);
router.patch('/leads/:id/ai-status', chatController.toggleLeadAiStatus);
router.post('/chat/send', chatController.sendMessage);
router.post('/chat/send-audio', chatController.sendAudioMessage);
router.post('/chat/send-photo', chatController.sendVehiclePhoto);
router.get('/chat/messages/:leadId', chatController.getMessages);
router.post('/chat/reset', chatController.resetSimulator);

// Rotas da Base de Conhecimento e RAG da Concessionária (Restritas ao Dono/Owner)
router.get('/knowledge', requireOwner, knowledgeController.listKnowledge);
router.post('/knowledge', requireOwner, knowledgeController.createKnowledge);
router.post('/knowledge/bulk', requireOwner, knowledgeController.bulkImportKnowledge);
router.put('/knowledge/:id', requireOwner, knowledgeController.updateKnowledge);
router.delete('/knowledge/:id', requireOwner, knowledgeController.deleteKnowledge);

// Rotas de Conexão WhatsApp por QR Code Nativamente
const whatsappService = require('../services/whatsappService');

router.get('/whatsapp/status', (req, res) => {
  res.json({ success: true, data: whatsappService.getWhatsAppStatus() });
});

router.post('/whatsapp/connect', (req, res) => {
  whatsappService.startWhatsApp();
  auditService.logAudit({
    organization_id: 'default',
    actor: req.user ? `${req.user.name} (${req.user.role})` : 'admin',
    action: 'connect_whatsapp',
    entity_type: 'whatsapp_session',
    entity_id: 'baileys_session',
    details: 'Inicialização do leitor QR Code WhatsApp solicitada'
  });
  res.json({ success: true, message: 'Inicializando leitor de QR Code...' });
});

router.post('/whatsapp/disconnect', async (req, res) => {
  const actor = req.user ? `${req.user.name} (${req.user.role})` : 'admin';
  const result = await whatsappService.disconnectWhatsApp(actor);
  res.json(result);
});

// Rota Universal para ERPs de Carros e Motos (Webhook ou API)
router.post('/integrations/inventory', (req, res) => {
  try {
    const payload = req.body;
    const vehiclesList = Array.isArray(payload) ? payload : (payload.vehicles || [payload]);

    const stmt = db.prepare(`
      INSERT INTO vehicles (
        make, model, version, year_fab, year_model, price, mileage,
        transmission, fuel, color, plate_end, body_type, features, images, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let importedCount = 0;
    for (const v of vehiclesList) {
      if (!v.make || !v.model || !v.price) continue;
      stmt.run(
        v.make,
        v.model,
        v.version || '',
        parseInt(v.year_fab || new Date().getFullYear(), 10),
        parseInt(v.year_model || new Date().getFullYear(), 10),
        parseFloat(v.price),
        parseInt(v.mileage || 0, 10),
        v.transmission || 'Automático',
        v.fuel || 'Flex',
        v.color || 'Prata',
        v.plate_end || '',
        v.body_type || 'Carro/Moto',
        typeof v.features === 'object' ? JSON.stringify(v.features) : (v.features || '[]'),
        typeof v.images === 'object' ? JSON.stringify(v.images) : (v.images || '[]'),
        v.status || 'disponivel'
      );
      importedCount++;
    }

    res.json({ success: true, message: `${importedCount} veículo(s) sincronizado(s) com sucesso a partir do ERP` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rotas de Configurações
router.get('/settings', (req, res) => {
  res.json({
    success: true,
    data: {
      dealership: config.dealership,
      provider: config.provider,
      openaiModel: config.openai.model,
      geminiModel: config.gemini.model,
      hasOpenAiKey: !!config.openai.apiKey,
      hasGeminiKey: !!config.gemini.apiKey
    }
  });
});

router.post('/settings', requireOwner, (req, res) => {
  try {
    const { provider, openaiKey, geminiKey, dealershipName, dealershipAddress, dealershipPhone } = req.body;
    
    if (provider) { config.provider = provider; settingsStore.save('ai_provider', provider); }
    if (openaiKey) { config.openai.apiKey = openaiKey; settingsStore.save('openai_api_key', openaiKey); }
    if (geminiKey) { config.gemini.apiKey = geminiKey; settingsStore.save('gemini_api_key', geminiKey); }
    if (dealershipName) { config.dealership.name = dealershipName; settingsStore.save('dealership_name', dealershipName); }
    if (dealershipAddress) { config.dealership.address = dealershipAddress; settingsStore.save('dealership_address', dealershipAddress); }
    if (dealershipPhone) { config.dealership.phone = dealershipPhone; settingsStore.save('dealership_phone', dealershipPhone); }

    auditService.logAudit({
      organization_id: 'default',
      actor: req.user ? `${req.user.name} (${req.user.role})` : 'admin',
      action: 'update_settings',
      entity_type: 'settings',
      entity_id: 'store_settings',
      details: {
        provider,
        dealershipName,
        dealershipAddress,
        dealershipPhone,
        changedKeys: Object.keys(req.body).filter(k => !k.toLowerCase().includes('key'))
      }
    });

    res.json({ success: true, message: 'Configurações salvas e persistidas no banco com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para consulta de Logs de Auditoria
router.get('/audit-logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const logs = auditService.getAuditLogs(limit);
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
