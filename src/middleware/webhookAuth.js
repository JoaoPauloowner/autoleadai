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

  // Se não houver segredo configurado no .env, permite em ambiente de desenvolvimento local
  if (!configuredSecret || !configuredSecret.trim()) {
    return next();
  }

  const providedSecret = req.query.token || req.header('x-webhook-secret');

  if (!providedSecret || providedSecret !== configuredSecret.trim()) {
    console.warn('⚠️ Tentativa de acesso ao webhook do WhatsApp com segredo ausente ou inválido.');
    return res.status(401).json({ success: false, error: 'Não autorizado. Segredo de webhook inválido.' });
  }

  next();
}

module.exports = { requireWebhookSecret };
