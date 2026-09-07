const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const auditService = require('../services/auditService');

/**
 * Endpoint de Login do Painel Administrativo com Sessões
 * POST /api/auth/login
 */
function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'E-mail e senha são obrigatórios.'
    });
  }

  const inputEmail = String(email).toLowerCase().trim();
  const inputPassword = String(password).trim();

  try {
    // 1. Localiza usuário ativo no banco
    const user = db.prepare(`
      SELECT id, name, email, password_hash, role, organization_id, is_active
      FROM users 
      WHERE LOWER(email) = ? AND is_active = 1
    `).get(inputEmail);

    if (!user) {
      auditService.logAudit({
        organization_id: 'default',
        actor: inputEmail,
        action: 'login_failed',
        entity_type: 'auth_session',
        entity_id: 'unknown_user',
        details: 'Tentativa de login com usuário inexistente ou inativo'
      });

      return res.status(401).json({
        success: false,
        error: 'E-mail ou senha incorretos.'
      });
    }

    // 2. Confere a senha com hash bcrypt
    const isPasswordValid = bcrypt.compareSync(inputPassword, user.password_hash);

    if (!isPasswordValid) {
      auditService.logAudit({
        organization_id: user.organization_id || 'default',
        actor: user.name,
        action: 'login_failed',
        entity_type: 'auth_session',
        entity_id: String(user.id),
        details: 'Senha incorreta para o usuário'
      });

      return res.status(401).json({
        success: false,
        error: 'E-mail ou senha incorretos.'
      });
    }

    // 3. Gera token de sessão seguro (opaco, 64 hex chars)
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(); // 7 dias

    db.prepare(`
      INSERT INTO sessions (user_id, token, expires_at)
      VALUES (?, ?, ?)
    `).run(user.id, sessionToken, expiresAt);

    auditService.logAudit({
      organization_id: user.organization_id || 'default',
      actor: user.name,
      action: 'login_success',
      entity_type: 'auth_session',
      entity_id: String(user.id),
      details: `Login efetuado com sucesso (Perfil: ${user.role})`
    });

    return res.json({
      success: true,
      token: sessionToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organization_id: user.organization_id
      }
    });
  } catch (err) {
    console.error('Erro no login:', err);
    return res.status(500).json({ success: false, error: 'Erro interno ao autenticar usuário.' });
  }
}

/**
 * Retorna o perfil do usuário logado na sessão atual
 * GET /api/auth/me
 */
function me(req, res) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Não autenticado' });
  }
  return res.json({
    success: true,
    user: req.user
  });
}

/**
 * Encerra a sessão e revoga o token
 * POST /api/auth/logout
 */
function logout(req, res) {
  try {
    if (req.token) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
    }
    return res.json({ success: true, message: 'Sessão encerrada com sucesso' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  login,
  me,
  logout
};
