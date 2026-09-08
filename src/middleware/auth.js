const db = require('../config/database');

/**
 * Middleware de Autenticação por Sessão & RBAC
 * Valida tokens de sessão na tabela `sessions` e injeta `req.user`.
 * Mantém fallback para ADMIN_API_KEY para rotas de automação (n8n / webhooks).
 */
function requireAuth(req, res, next) {
  // Rotas públicas ou webhooks isentos de autenticação de sessão
  if (
    req.path.startsWith('/webhook') ||
    req.path.startsWith('/integrations') ||
    req.path === '/auth/login' ||
    req.path === '/auth/setup-status' ||
    req.path === '/auth/setup'
  ) {
    return next();
  }

  // 1. Extrai o token do cabeçalho
  let token = null;
  const authHeader = req.header('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.header('x-session-token')) {
    token = req.header('x-session-token').trim();
  } else if (req.header('x-api-key')) {
    token = req.header('x-api-key').trim();
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Não autorizado. Token de sessão ausente. Faça login para continuar.'
    });
  }

  // 2. Fallback: Suporte a chave estática do .env para automações e chamadas de sistema
  const configuredAdminKey = process.env.ADMIN_API_KEY;
  if (configuredAdminKey && token === configuredAdminKey.trim()) {
    req.user = {
      id: 1,
      name: 'Administrador do Sistema',
      email: 'admin@autolead.com',
      role: 'owner',
      organization_id: 'default'
    };
    req.token = token;
    return next();
  }

  try {
    // 3. Busca a sessão ativa vinculada ao usuário
    const sessionRecord = db.prepare(`
      SELECT 
        s.token, s.expires_at, 
        u.id, u.name, u.email, u.role, u.organization_id, u.is_active
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ?
    `).get(token);

    if (!sessionRecord || !sessionRecord.is_active) {
      return res.status(401).json({
        success: false,
        error: 'Sessão inválida ou usuário inativo. Faça login novamente.'
      });
    }

    // 4. Checa validade da sessão
    if (new Date(sessionRecord.expires_at) < new Date()) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      return res.status(401).json({
        success: false,
        error: 'Sessão expirada. Faça login novamente.'
      });
    }

    // 5. Injeta o usuário autenticado na requisição
    req.user = {
      id: sessionRecord.id,
      name: sessionRecord.name,
      email: sessionRecord.email,
      role: sessionRecord.role,
      organization_id: sessionRecord.organization_id || 'default'
    };
    req.token = token;

    next();
  } catch (err) {
    console.error('Erro na validação de autenticação:', err);
    return res.status(500).json({ success: false, error: 'Erro ao validar autenticação.' });
  }
}

/**
 * Middleware para restringir rotas exclusivamente ao proprietário (Owner)
 */
function requireOwner(req, res, next) {
  if (!req.user || req.user.role !== 'owner') {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado. Esta funcionalidade é restrita ao proprietário da concessionária.'
    });
  }
  next();
}

/**
 * Middleware para restringir rotas a gerentes e proprietários (Manager ou Owner)
 */
function requireManagerOrOwner(req, res, next) {
  if (!req.user || (req.user.role !== 'owner' && req.user.role !== 'manager')) {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado. Esta funcionalidade é restrita a gerentes e diretores.'
    });
  }
  next();
}

module.exports = {
  requireApiKey: requireAuth, // Mantém compatibilidade de exportação
  requireAuth,
  requireOwner,
  requireManagerOrOwner
};
