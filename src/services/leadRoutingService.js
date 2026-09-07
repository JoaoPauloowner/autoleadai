const db = require('../config/database');

/**
 * Serviço de Distribuição de Leads por Fila Circular (Round-Robin)
 * Distribui automaticamente cada lead novo entre os vendedores ativos da loja.
 */
function getNextSalesperson() {
  try {
    // 1. Busca todos os vendedores ativos da concessionária
    const salespersons = db.prepare(`
      SELECT id, name, email 
      FROM users 
      WHERE role = 'salesperson' AND is_active = 1 
      ORDER BY id ASC
    `).all();

    if (!salespersons || salespersons.length === 0) {
      // Se não houver vendedor cadastrado, atribui provisoriamente ao dono (owner)
      const owner = db.prepare("SELECT id, name, email FROM users WHERE role = 'owner' LIMIT 1").get();
      return owner || null;
    }

    if (salespersons.length === 1) {
      return salespersons[0];
    }

    // 2. Descobre quem foi o último vendedor que recebeu um lead
    const lastLead = db.prepare(`
      SELECT assigned_to 
      FROM leads 
      WHERE assigned_to IS NOT NULL 
      ORDER BY id DESC 
      LIMIT 1
    `).get();

    if (!lastLead || !lastLead.assigned_to) {
      return salespersons[0];
    }

    // 3. Seleciona o próximo da fila circular
    const lastIndex = salespersons.findIndex(s => s.id === lastLead.assigned_to);

    if (lastIndex === -1 || lastIndex === salespersons.length - 1) {
      return salespersons[0];
    }

    return salespersons[lastIndex + 1];
  } catch (error) {
    console.error('Erro no roteamento Round-Robin de leads:', error);
    return null;
  }
}

function getNextSalespersonId() {
  const salesperson = getNextSalesperson();
  return salesperson ? salesperson.id : null;
}

module.exports = {
  getNextSalesperson,
  getNextSalespersonId
};
