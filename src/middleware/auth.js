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
    req.path.startsWith('/integrations')
  ) {
    return next();
  }

  const configuredKey = process.env.ADMIN_API_KEY;

  // Se nenhuma chave estiver definida no .env, opera em modo desenvolvimento aberto com aviso
  if (!configuredKey || !configuredKey.trim()) {
    return next();
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
