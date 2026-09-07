const auditService = require('../services/auditService');

/**
 * Endpoint de Login do Painel Administrativo
 * POST /api/auth/login
 */
function login(req, res) {
  const { email, password } = req.body;

  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@autolead.com').toLowerCase().trim();
  const adminPassword = (process.env.ADMIN_PASSWORD || 'admin123').trim();
  const adminApiKey = (process.env.ADMIN_API_KEY || '').trim();

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'E-mail e senha são obrigatórios.'
    });
  }

  const inputEmail = String(email).toLowerCase().trim();
  const inputPassword = String(password).trim();

  // Aceita login por e-mail correto OU usuário "admin", e senha igual a ADMIN_PASSWORD ou ADMIN_API_KEY
  const isEmailValid = inputEmail === adminEmail || inputEmail === 'admin';
  const isPasswordValid = inputPassword === adminPassword || (adminApiKey && inputPassword === adminApiKey);

  if (isEmailValid && isPasswordValid) {
    auditService.logAudit({
      organization_id: 'default',
      actor: inputEmail,
      action: 'admin_login_success',
      entity_type: 'auth_session',
      entity_id: 'panel_login',
      details: 'Login administrativo efetuado com sucesso no painel'
    });

    return res.json({
      success: true,
      token: adminApiKey,
      user: {
        email: adminEmail,
        name: 'Administrador da Loja',
        role: 'admin'
      }
    });
  }

  auditService.logAudit({
    organization_id: 'default',
    actor: inputEmail,
    action: 'admin_login_failed',
    entity_type: 'auth_session',
    entity_id: 'panel_login',
    details: 'Tentativa de login com credenciais inválidas'
  });

  return res.status(401).json({
    success: false,
    error: 'E-mail ou senha incorretos.'
  });
}

module.exports = {
  login
};
