const db = require('./database');

/**
 * Persiste as configurações da tela "Dados da Concessionária" na tabela store_rules
 * (que já existe no schema do SQLite).
 *
 * Motivo: evita que um reinício do servidor (queda de energia, reboot do PC da loja)
 * apague tudo que o lojista configurou (nome da loja, endereço, telefone, chaves de API).
 */

function loadAll() {
  try {
    const rows = db.prepare('SELECT key, value FROM store_rules').all();
    const result = {};
    for (const row of rows) result[row.key] = row.value;
    return result;
  } catch (err) {
    console.warn('Aviso: não foi possível carregar configurações persistidas:', err.message);
    return {};
  }
}

function save(key, value) {
  if (value === undefined || value === null || value === '') return;
  db.prepare(`
    INSERT INTO store_rules (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
}

module.exports = { loadAll, save };
