const db = require('../config/database');

/**
 * Serviço de Log de Auditoria para registrar ações sensíveis do sistema:
 * - Alteração de configurações da loja
 * - Conexão e desconexão do WhatsApp
 * - Importação em lote de leads
 */

function logAudit({ organization_id = 'default', actor = 'admin', action, entity_type, entity_id = null, details = null }) {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_log (organization_id, actor, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      organization_id,
      actor,
      action,
      entity_type,
      entity_id ? String(entity_id) : null,
      typeof details === 'object' && details !== null ? JSON.stringify(details) : (details ? String(details) : null)
    );
  } catch (err) {
    console.error('⚠️ [AuditLog] Erro ao registrar log de auditoria:', err.message);
  }
}

function getAuditLogs(limit = 50, organization_id = 'default') {
  try {
    return db.prepare(`
      SELECT * FROM audit_log
      WHERE organization_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(organization_id, limit);
  } catch (err) {
    console.error('⚠️ [AuditLog] Erro ao buscar logs de auditoria:', err.message);
    return [];
  }
}

module.exports = {
  logAudit,
  getAuditLogs
};
