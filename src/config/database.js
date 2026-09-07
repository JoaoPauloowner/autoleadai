const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

// Garante que o diretório 'data' exista
const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'autolead.db');
const db = new DatabaseSync(dbPath);

try {
  db.exec('PRAGMA foreign_keys = ON;');
} catch (e) {
  console.warn('Aviso PRAGMA:', e.message);
}

function addColumnIfNotExists(table, column, def) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def};`);
  } catch (e) {
    // Coluna já existe, ignora
  }
}

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT DEFAULT 'default',
      make TEXT NOT NULL,
      model TEXT NOT NULL,
      version TEXT NOT NULL,
      year_fab INTEGER NOT NULL,
      year_model INTEGER NOT NULL,
      price REAL NOT NULL,
      mileage INTEGER NOT NULL,
      transmission TEXT NOT NULL,
      fuel TEXT NOT NULL,
      color TEXT NOT NULL,
      plate_end TEXT,
      body_type TEXT DEFAULT 'Sedan',
      features TEXT, -- JSON array
      images TEXT,   -- JSON array de URLs
      status TEXT DEFAULT 'disponivel', -- 'disponivel', 'reservado', 'vendido'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT DEFAULT 'default',
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      email TEXT,
      channel TEXT DEFAULT 'whatsapp', -- 'whatsapp', 'simulator', 'site', 'webmotors', 'instagram'
      status TEXT DEFAULT 'novo',      -- 'novo', 'qualificado', 'test_drive', 'proposta', 'fechado', 'perdido'
      budget_max REAL,
      payment_method TEXT,             -- 'a_vista', 'financiamento', 'consorcio'
      has_trade_in INTEGER DEFAULT 0,  -- 0 ou 1
      trade_in_details TEXT,
      interested_vehicle_id INTEGER,
      ai_summary TEXT,
      score INTEGER DEFAULT 25,        -- Lead Score de 0 a 100
      score_breakdown TEXT,            -- JSON com as 4 notas dos pilares
      next_action_title TEXT,          -- Próxima ação recomendada
      next_action_at DATETIME,         -- Prazo da próxima ação
      source_campaign TEXT,            -- Origem da campanha
      last_inbound_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_outbound_at DATETIME,
      is_demo_data INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (interested_vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT DEFAULT 'default',
      lead_id INTEGER NOT NULL,
      type TEXT NOT NULL,              -- 'whatsapp', 'ligacao', 'test_drive', 'proposta'
      title TEXT NOT NULL,
      due_at DATETIME NOT NULL,
      status TEXT DEFAULT 'pendente',  -- 'pendente', 'concluida', 'atrasada'
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS test_drives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT DEFAULT 'default',
      lead_id INTEGER NOT NULL,
      vehicle_id INTEGER NOT NULL,
      scheduled_at DATETIME NOT NULL,
      seller_name TEXT DEFAULT 'Consultor de Vendas',
      status TEXT DEFAULT 'confirmado', -- 'pendente', 'confirmado', 'realizado', 'cancelado'
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT DEFAULT 'default',
      lead_id INTEGER NOT NULL,
      sender TEXT NOT NULL,           -- 'user', 'assistant', 'system'
      content TEXT NOT NULL,
      tool_calls TEXT,                -- JSON com ferramentas acionadas pela IA
      copilot_status TEXT DEFAULT 'approved', -- 'pending_review', 'approved', 'rejected', 'edited'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS store_rules (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS processed_messages (
      message_id TEXT PRIMARY KEY,
      received_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT DEFAULT 'default',
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try {
    // Garante que não haja múltiplos test drives ativos duplicados por lead
    db.exec(`
      UPDATE test_drives
      SET status = 'cancelado',
          notes = COALESCE(notes || ' | ', '') || 'Duplicidade cancelada'
      WHERE status IN ('pendente', 'confirmado')
        AND id NOT IN (
          SELECT MIN(id)
          FROM test_drives
          WHERE status IN ('pendente', 'confirmado')
          GROUP BY lead_id
        );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_test_drive_per_lead
        ON test_drives (lead_id)
        WHERE status IN ('pendente', 'confirmado');
    `);
  } catch (idxErr) {
    console.warn('Aviso ao aplicar índice de test-drive:', idxErr.message);
  }

  // Garante colunas novas caso o banco já existisse
  addColumnIfNotExists('vehicles', 'organization_id', "TEXT DEFAULT 'default'");
  addColumnIfNotExists('leads', 'organization_id', "TEXT DEFAULT 'default'");
  addColumnIfNotExists('tasks', 'organization_id', "TEXT DEFAULT 'default'");
  addColumnIfNotExists('test_drives', 'organization_id', "TEXT DEFAULT 'default'");
  addColumnIfNotExists('chat_messages', 'organization_id', "TEXT DEFAULT 'default'");
  addColumnIfNotExists('leads', 'score', 'INTEGER DEFAULT 25');
  addColumnIfNotExists('leads', 'score_breakdown', 'TEXT');
  addColumnIfNotExists('leads', 'next_action_title', 'TEXT');
  addColumnIfNotExists('leads', 'next_action_at', 'DATETIME');
  addColumnIfNotExists('leads', 'source_campaign', 'TEXT');
  addColumnIfNotExists('leads', 'last_inbound_at', 'DATETIME');
  addColumnIfNotExists('leads', 'last_outbound_at', 'DATETIME');
  addColumnIfNotExists('leads', 'is_demo_data', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('chat_messages', 'copilot_status', "TEXT DEFAULT 'approved'");

  // Modo de produção: Inicializa tabelas limpas sem dados fictícios
  // Para adicionar veículos, use a interface web, planilha CSV ou a rota de ERP
  console.log('✅ Banco de dados SQLite inicializado pronto para operação real da loja.');
}

initDatabase();

module.exports = db;
