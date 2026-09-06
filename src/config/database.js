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

// Ativa foreign keys e WAL mode se aplicável
try {
  db.exec('PRAGMA foreign_keys = ON;');
} catch (e) {
  console.warn('Aviso PRAGMA:', e.message);
}

// Criação das tabelas
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      email TEXT,
      channel TEXT DEFAULT 'whatsapp', -- 'whatsapp', 'simulator', 'site'
      status TEXT DEFAULT 'novo',      -- 'novo', 'qualificado', 'test_drive', 'proposta', 'fechado', 'perdido'
      budget_max REAL,
      payment_method TEXT,             -- 'a_vista', 'financiamento', 'consorcio'
      has_trade_in INTEGER DEFAULT 0,  -- 0 ou 1
      trade_in_details TEXT,
      interested_vehicle_id INTEGER,
      ai_summary TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (interested_vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS test_drives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      vehicle_id INTEGER NOT NULL,
      scheduled_at DATETIME NOT NULL,
      seller_name TEXT DEFAULT 'Consultor de Vendas',
      status TEXT DEFAULT 'pendente', -- 'pendente', 'confirmado', 'realizado', 'cancelado'
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      sender TEXT NOT NULL,           -- 'user', 'assistant', 'system'
      content TEXT NOT NULL,
      tool_calls TEXT,                -- JSON com ferramentas acionadas pela IA
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Semente inicial de veículos se estiver vazio
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM vehicles');
  const { count } = countStmt.get();

  if (count === 0) {
    console.log('🚗 Populando estoque inicial demonstrativo de veículos...');
    const insertStmt = db.prepare(`
      INSERT INTO vehicles (make, model, version, year_fab, year_model, price, mileage, transmission, fuel, color, plate_end, body_type, features, images, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const seedVehicles = [
      {
        make: 'Jeep',
        model: 'Renegade',
        version: 'Longitude 1.3 Turbo 4x2 Flex',
        year_fab: 2022,
        year_model: 2023,
        price: 98900,
        mileage: 38500,
        transmission: 'Automático',
        fuel: 'Flex',
        color: 'Cinza Granite',
        plate_end: '7',
        body_type: 'SUV',
        features: JSON.stringify(['Bancos de Couro', 'Central Multimídia 8.4"', 'Faróis Full LED', 'Câmera de Ré', 'Ar Digital Dual Zone', 'Sensor de Estacionamento']),
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80'
        ]),
        status: 'disponivel'
      },
      {
        make: 'Toyota',
        model: 'Corolla',
        version: 'XEi 2.0 Dynamic Force Direct Shift',
        year_fab: 2021,
        year_model: 2022,
        price: 119900,
        mileage: 44000,
        transmission: 'Automático CVT',
        fuel: 'Flex',
        color: 'Branco Pérola',
        plate_end: '3',
        body_type: 'Sedan',
        features: JSON.stringify(['Toyota Safety Sense (Piloto Adaptativo)', '7 Airbags', 'Chave Presencial', 'Bancos em Couro Preto', 'Paddle Shift']),
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&w=800&q=80'
        ]),
        status: 'disponivel'
      },
      {
        make: 'Hyundai',
        model: 'Creta',
        version: 'Platinum 1.0 Turbo GDI Flex',
        year_fab: 2023,
        year_model: 2023,
        price: 128900,
        mileage: 21000,
        transmission: 'Automático',
        fuel: 'Flex',
        color: 'Prata Sand',
        plate_end: '9',
        body_type: 'SUV',
        features: JSON.stringify(['Teto Solar Panorâmico', 'Bancos com Ventilação', 'Câmera 360 Graus', 'Painel Digital 7"', 'Carregador por Indução']),
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80'
        ]),
        status: 'disponivel'
      },
      {
        make: 'Honda',
        model: 'Civic',
        version: 'Touring 1.5 Turbo',
        year_fab: 2020,
        year_model: 2021,
        price: 132000,
        mileage: 52000,
        transmission: 'Automático CVT',
        fuel: 'Gasolina',
        color: 'Preto Cristal',
        plate_end: '5',
        body_type: 'Sedan',
        features: JSON.stringify(['Motor 1.5 Turbo 173cv', 'Teto Solar', 'Som Premium 452W', 'LaneWatch (Câmera ponto cego)', 'Bancos elétricos']),
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1606016159991-dfe4f2746ad5?auto=format&fit=crop&w=800&q=80'
        ]),
        status: 'disponivel'
      },
      {
        make: 'Chevrolet',
        model: 'Onix Plus',
        version: 'Premier 1.0 Turbo Flex',
        year_fab: 2022,
        year_model: 2022,
        price: 79900,
        mileage: 39000,
        transmission: 'Automático',
        fuel: 'Flex',
        color: 'Azul Seeker',
        plate_end: '2',
        body_type: 'Sedan',
        features: JSON.stringify(['Wi-Fi Nativo', 'Alerta de Ponto Cego', 'Assistente de Estacionamento Automático (Park Assist)', 'Carregador Celular sem Fio']),
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=800&q=80'
        ]),
        status: 'disponivel'
      },
      {
        make: 'Volkswagen',
        model: 'T-Cross',
        version: 'Comfortline 200 TSI',
        year_fab: 2021,
        year_model: 2022,
        price: 104900,
        mileage: 41000,
        transmission: 'Automático',
        fuel: 'Flex',
        color: 'Branco Puro',
        plate_end: '6',
        body_type: 'SUV',
        features: JSON.stringify(['VW Play 10.1"', 'Painel Digital Active Info Display', 'Frenagem Autônoma de Emergência', 'Sensor Dianteiro e Traseiro']),
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1541348263662-e0c8de4259ba?auto=format&fit=crop&w=800&q=80'
        ]),
        status: 'disponivel'
      }
    ];

    for (const v of seedVehicles) {
      insertStmt.run(
        v.make,
        v.model,
        v.version,
        v.year_fab,
        v.year_model,
        v.price,
        v.mileage,
        v.transmission,
        v.fuel,
        v.color,
        v.plate_end,
        v.body_type,
        v.features,
        v.images,
        v.status
      );
    }
    console.log('✅ 6 veículos demonstrativos inseridos com sucesso.');
  }
}

initDatabase();

module.exports = db;
