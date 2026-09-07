/**
 * Validação de origem do webhook do WhatsApp (Evolution API / Z-API / n8n).
 *
 * Motivo: impede que terceiros enviem mensagens forjadas para a URL do webhook,
 * protegendo o funil contra poluição de leads falsos e evitando o consumo indevido de tokens de IA.
 *
 * Configuração:
 * - Defina WEBHOOK_SECRET no .env.
 * - Na Evolution/Z-API, envie via query param: /api/webhook/whatsapp?token=SEU_SEGREDO
 *   ou no cabeçalho HTTP: x-webhook-secret: SEU_SEGREDO
 */

function requireWebhookSecret(req, res, next) {
  // Permite GET para checagem de status / ping do webhook
  if (req.method === 'GET') {
    return next();
  }

  const configuredSecret = process.env.WEBHOOK_SECRET;

  // Fail-closed: se WEBHOOK_SECRET não estiver configurado no .env, bloqueia com 503
  if (!configuredSecret || !configuredSecret.trim()) {
    console.error('🔒 WEBHOOK_SECRET não configurado no .env — bloqueando o webhook por segurança.');
    return res.status(503).json({
      success: false,
      error: 'Webhook não configurado corretamente: defina WEBHOOK_SECRET no arquivo .env.'
    });
  }

  const providedSecret = req.query.token || req.header('x-webhook-secret');

  if (!providedSecret || providedSecret !== configuredSecret.trim()) {
    console.warn('⚠️ Tentativa de acesso ao webhook do WhatsApp com segredo ausente ou inválido.');
    return res.status(401).json({ success: false, error: 'Não autorizado. Segredo de webhook inválido.' });
  }

  next();
}

module.exports = { requireWebhookSecret };
