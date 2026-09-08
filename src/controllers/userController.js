const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const auditService = require('../services/auditService');

/**
 * Controller de Gestão de Usuários (RBAC) e Troca de Senhas
 */

/**
 * GET /api/users
 * Lista todos os usuários cadastrados (nunca expõe hash de senha).
 * Apenas Owner e Manager.
 */
function listUsers(req, res) {
  try {
    const users = db.prepare(`
      SELECT id, organization_id, name, email, role, is_active, created_at
      FROM users
      ORDER BY created_at DESC
    `).all();

    return res.json({
      success: true,
      users,
      data: users
    });
  } catch (err) {
    console.error('Erro ao listar usuários:', err);
    return res.status(500).json({ success: false, error: 'Erro interno ao listar usuários.' });
  }
}

/**
 * POST /api/users
 * Cria um novo usuário.
 * - Owner pode criar 'salesperson' ou 'manager' (nunca 'owner').
 * - Manager só pode criar 'salesperson'.
 * - Se a senha não for informada, gera uma temporária de 16 caracteres.
 */
function createUser(req, res) {
  try {
    const { name, email, role, password } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({
        success: false,
        error: 'Nome, e-mail e perfil são campos obrigatórios.'
      });
    }

    const cleanName = String(name).trim();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanRole = String(role).trim().toLowerCase();

    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      return res.status(400).json({
        success: false,
        error: 'Formato de e-mail inválido.'
      });
    }

    // Regras de autorização na criação
    if (cleanRole === 'owner') {
      return res.status(403).json({
        success: false,
        error: 'Não é permitido criar usuários com perfil de proprietário via painel.'
      });
    }

    if (req.user.role === 'manager' && cleanRole !== 'salesperson') {
      return res.status(403).json({
        success: false,
        error: 'Gerentes só podem criar usuários com perfil de vendedor.'
      });
    }

    if (!['salesperson', 'manager'].includes(cleanRole)) {
      return res.status(400).json({
        success: false,
        error: `Perfil inválido: "${cleanRole}". Papéis permitidos: 'salesperson', 'manager'.`
      });
    }

    // Verifica e-mail duplicado
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(cleanEmail);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Já existe um usuário cadastrado com este e-mail.'
      });
    }

    // Senha inicial: definida pelo criador ou gerada aleatoriamente
    let plainPassword;
    if (password && String(password).trim().length > 0) {
      if (String(password).trim().length < 8) {
        return res.status(400).json({
          success: false,
          error: 'A senha inicial deve conter pelo menos 8 caracteres.'
        });
      }
      plainPassword = String(password).trim();
    } else {
      plainPassword = crypto.randomBytes(8).toString('hex');
    }

    const passwordHash = bcrypt.hashSync(plainPassword, 10);
    const orgId = req.user.organization_id || 'default';

    const insertStmt = db.prepare(`
      INSERT INTO users (organization_id, name, email, password_hash, role, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);

    const result = insertStmt.run(orgId, cleanName, cleanEmail, passwordHash, cleanRole);
    const newUserId = Number(result.lastInsertRowid);

    const newUser = {
      id: newUserId,
      organization_id: orgId,
      name: cleanName,
      email: cleanEmail,
      role: cleanRole,
      is_active: 1,
      created_at: new Date().toISOString()
    };

    // Auditoria (nunca registrar senhas nos logs)
    auditService.logAudit({
      organization_id: orgId,
      actor: `${req.user.name} (${req.user.role})`,
      action: 'create_user',
      entity_type: 'user',
      entity_id: String(newUserId),
      details: { name: cleanName, email: cleanEmail, role: cleanRole }
    });

    return res.status(201).json({
      success: true,
      user: newUser,
      initialPassword: plainPassword
    });
  } catch (err) {
    console.error('Erro ao criar usuário:', err);
    return res.status(500).json({ success: false, error: 'Erro interno ao cadastrar usuário.' });
  }
}

/**
 * PATCH /api/users/:id
 * Atualiza dados cadastrais, perfil ou status de ativação de um usuário.
 * - Gerente só pode editar vendedores (não pode promover ninguém).
 * - Proteção de Owner: não permite desativar ou rebaixar o único proprietário ativo.
 */
function updateUser(req, res) {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (!targetId || isNaN(targetId)) {
      return res.status(400).json({ success: false, error: 'ID de usuário inválido.' });
    }

    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    }

    // Regras de restrição do Gerente
    if (req.user.role === 'manager') {
      if (targetUser.role !== 'salesperson') {
        return res.status(403).json({
          success: false,
          error: 'Gerentes só têm permissão para gerenciar usuários com perfil de vendedor.'
        });
      }
      if (req.body.role && req.body.role !== 'salesperson') {
        return res.status(403).json({
          success: false,
          error: 'Gerentes não têm permissão para alterar papéis ou promover usuários.'
        });
      }
    }

    const newName = req.body.name !== undefined ? String(req.body.name).trim() : targetUser.name;
    const newRole = req.body.role !== undefined ? String(req.body.role).trim().toLowerCase() : targetUser.role;
    let newActive = targetUser.is_active;
    let newEmail = targetUser.email;

    if (req.body.email !== undefined) {
      const cleanEmail = String(req.body.email).trim().toLowerCase();
      if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
        return res.status(400).json({
          success: false,
          error: 'Formato de e-mail inválido.'
        });
      }

      // Verifica se o novo e-mail já pertence a outro usuário cadastrado
      const duplicate = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? AND id != ?').get(cleanEmail, targetId);
      if (duplicate) {
        return res.status(409).json({
          success: false,
          error: 'Já existe outro usuário cadastrado com este e-mail.'
        });
      }
      newEmail = cleanEmail;
    }

    if (req.body.is_active !== undefined) {
      newActive = req.body.is_active ? 1 : 0;
    }

    if (!['owner', 'salesperson', 'manager'].includes(newRole)) {
      return res.status(400).json({ success: false, error: `Perfil inválido: ${newRole}` });
    }

    // Proteção de Owner: se for owner e tentar rebaixar ou desativar
    if (targetUser.role === 'owner' && (newRole !== 'owner' || newActive === 0)) {
      const activeOwners = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'owner' AND is_active = 1").get();
      if (!activeOwners || activeOwners.count <= 1) {
        return res.status(400).json({
          success: false,
          error: 'Operação recusada: não é permitido desativar ou rebaixar o único proprietário ativo do sistema.'
        });
      }
    }

    db.prepare(`
      UPDATE users
      SET name = ?, email = ?, role = ?, is_active = ?
      WHERE id = ?
    `).run(newName, newEmail, newRole, newActive, targetId);

    // Se o usuário foi desativado, revoga todas as suas sessões ativas
    if (newActive === 0) {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetId);
    }

    // Auditoria
    auditService.logAudit({
      organization_id: targetUser.organization_id || 'default',
      actor: `${req.user.name} (${req.user.role})`,
      action: 'update_user',
      entity_type: 'user',
      entity_id: String(targetId),
      details: {
        updated_fields: {
          name: newName !== targetUser.name ? newName : undefined,
          email: newEmail !== targetUser.email ? newEmail : undefined,
          role: newRole !== targetUser.role ? newRole : undefined,
          is_active: newActive !== targetUser.is_active ? newActive : undefined
        }
      }
    });

    return res.json({
      success: true,
      user: {
        id: targetUser.id,
        organization_id: targetUser.organization_id,
        name: newName,
        email: newEmail,
        role: newRole,
        is_active: newActive
      }
    });
  } catch (err) {
    console.error('Erro ao atualizar usuário:', err);
    return res.status(500).json({ success: false, error: 'Erro interno ao atualizar usuário.' });
  }
}

/**
 * POST /api/users/:id/reset-password
 * Redefine a senha de um usuário gerando uma nova senha segura.
 * - Gerente só pode resetar senha de vendedor.
 * - Invalida todas as sessões anteriores do usuário.
 */
function resetPassword(req, res) {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (!targetId || isNaN(targetId)) {
      return res.status(400).json({ success: false, error: 'ID de usuário inválido.' });
    }

    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    }

    // Restrição de gerente
    if (req.user.role === 'manager' && targetUser.role !== 'salesperson') {
      return res.status(403).json({
        success: false,
        error: 'Gerentes só podem redefinir a senha de vendedores.'
      });
    }

    if (targetUser.role === 'owner' && req.user.role !== 'owner') {
      return res.status(403).json({
        success: false,
        error: 'Apenas proprietários podem redefinir a senha de outros proprietários.'
      });
    }

    // Gera nova senha temporária
    const tempPassword = crypto.randomBytes(8).toString('hex');
    const newHash = bcrypt.hashSync(tempPassword, 10);

    // Atualiza a senha no banco
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, targetId);

    // Invalida sessões ativas do usuário resetado
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetId);

    // Auditoria (nunca logar a senha gerada)
    auditService.logAudit({
      organization_id: targetUser.organization_id || 'default',
      actor: `${req.user.name} (${req.user.role})`,
      action: 'reset_password',
      entity_type: 'user',
      entity_id: String(targetId),
      details: { email: targetUser.email, name: targetUser.name }
    });

    return res.json({
      success: true,
      message: 'Senha redefinida com sucesso. O usuário precisará fazer login com esta nova senha.',
      newPassword: tempPassword
    });
  } catch (err) {
    console.error('Erro ao redefinir senha:', err);
    return res.status(500).json({ success: false, error: 'Erro interno ao redefinir senha.' });
  }
}

/**
 * POST /api/auth/change-password
 * Permite que qualquer usuário autenticado altere a sua própria senha.
 * Exige validação da senha atual com bcrypt e no mínimo 8 caracteres para a nova senha.
 * Invalida a sessão atual no banco após a troca.
 */
function changeOwnPassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'A senha atual e a nova senha são obrigatórias.'
      });
    }

    if (typeof newPassword !== 'string' || newPassword.trim().length < 8) {
      return res.status(400).json({
        success: false,
        error: 'A nova senha deve ter no mínimo 8 caracteres.'
      });
    }

    const userId = req.user.id;
    const user = db.prepare('SELECT id, name, email, password_hash, organization_id FROM users WHERE id = ?').get(userId);

    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    }

    const isMatch = bcrypt.compareSync(String(currentPassword).trim(), user.password_hash);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        error: 'A senha atual informada está incorreta.'
      });
    }

    const newHash = bcrypt.hashSync(String(newPassword).trim(), 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, userId);

    // Invalida a sessão atual no banco
    if (req.token) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
    }

    // Auditoria
    auditService.logAudit({
      organization_id: user.organization_id || 'default',
      actor: `${user.name} (${req.user.role})`,
      action: 'change_password',
      entity_type: 'user',
      entity_id: String(userId),
      details: 'Senha do próprio usuário alterada com sucesso.'
    });

    return res.json({
      success: true,
      message: 'Senha alterada com sucesso! Faça login novamente com sua nova senha.'
    });
  } catch (err) {
    console.error('Erro na troca de senha:', err);
    return res.status(500).json({ success: false, error: 'Erro interno ao alterar senha.' });
  }
}

module.exports = {
  listUsers,
  createUser,
  updateUser,
  resetPassword,
  changeOwnPassword
};
