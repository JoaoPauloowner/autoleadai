/**
 * Middleware de autenticação por API Key para o painel administrativo.
 *
 * Protege rotas internas de gerenciamento de leads, estoque, configurações
 * e conexão do WhatsApp contra acessos não autorizados na rede.
 * Rotas de webhooks externos (/webhook, /integrations) têm validação própria.
 */

function requireApiKey(req, res, next) {
  // Rotas públicas ou webhooks de terceiros liberados da checagem de API Key de admin
  if (
    req.path.startsWith('/webhook') ||
    req.path.startsWith('/integrations') ||
    req.path.startsWith('/auth')
  ) {
    return next();
  }

  const configuredKey = process.env.ADMIN_API_KEY;

  // Fail-closed: se ADMIN_API_KEY não estiver configurada no .env, bloqueia com 503
  if (!configuredKey || !configuredKey.trim()) {
    console.error('🔒 ADMIN_API_KEY não configurada no .env — bloqueando acesso à API por segurança.');
    return res.status(503).json({
      success: false,
      error: 'Servidor não configurado corretamente: defina ADMIN_API_KEY no arquivo .env antes de usar o painel.'
    });
  }

  const providedKey = req.header('x-api-key');

  if (!providedKey || providedKey !== configuredKey.trim()) {
    return res.status(401).json({
      success: false,
      error: 'Não autorizado. Chave de acesso (x-api-key) ausente ou inválida.'
    });
  }

  next();
}

module.exports = { requireApiKey };
