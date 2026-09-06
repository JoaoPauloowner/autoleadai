const express = require('express');
const router = express.Router();

const vehicleController = require('../controllers/vehicleController');
const leadController = require('../controllers/leadController');
const bookingController = require('../controllers/bookingController');
const chatController = require('../controllers/chatController');
const config = require('../config/ai-provider');
const db = require('../config/database');

// Rotas de Veículos (Estoque)
router.get('/vehicles', vehicleController.listVehicles);
router.get('/vehicles/:id', vehicleController.getVehicle);
router.post('/vehicles', vehicleController.createVehicle);
router.put('/vehicles/:id', vehicleController.updateVehicle);
router.delete('/vehicles/:id', vehicleController.deleteVehicle);

// Rotas de Leads (CRM)
router.get('/leads', leadController.listLeads);
router.get('/leads/:id', leadController.getLeadDetails);
router.patch('/leads/:id/status', leadController.updateLeadStatus);
router.get('/dashboard/metrics', leadController.getDashboardMetrics);

// Rotas de Test-Drives (Agendamentos)
router.get('/test-drives', bookingController.listTestDrives);
router.patch('/test-drives/:id/status', bookingController.updateTestDriveStatus);

// Rotas do Chat / Simulador
router.post('/chat/send', chatController.sendMessage);
router.get('/chat/messages/:leadId', chatController.getMessages);
router.post('/chat/reset', chatController.resetSimulator);

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

router.post('/settings', (req, res) => {
  try {
    const { provider, openaiKey, geminiKey, dealershipName, dealershipAddress, dealershipPhone } = req.body;
    
    if (provider) config.provider = provider;
    if (openaiKey) config.openai.apiKey = openaiKey;
    if (geminiKey) config.gemini.apiKey = geminiKey;
    if (dealershipName) config.dealership.name = dealershipName;
    if (dealershipAddress) config.dealership.address = dealershipAddress;
    if (dealershipPhone) config.dealership.phone = dealershipPhone;

    res.json({ success: true, message: 'Configurações atualizadas na sessão ativa' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
