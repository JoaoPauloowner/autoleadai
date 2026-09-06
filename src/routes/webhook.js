const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Webhook universal para receber mensagens do WhatsApp
router.post('/whatsapp', webhookController.handleWhatsAppWebhook);

// Verificação de saúde do webhook
router.get('/whatsapp', (req, res) => {
  res.json({
    status: 'online',
    message: 'Webhook do WhatsApp AutoLead AI pronto para receber payloads.',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
