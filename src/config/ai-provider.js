const settingsStore = require('./settings-store');

const config = {
  provider: process.env.AI_PROVIDER || 'gemini',
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  },
  dealership: {
    name: process.env.DEALERSHIP_NAME || 'AutoPrime Veículos',
    city: process.env.DEALERSHIP_CITY || 'São Paulo - SP',
    address: process.env.DEALERSHIP_ADDRESS || 'Av. dos Bandeirantes, 1500',
    phone: process.env.DEALERSHIP_PHONE || '(11) 99999-8888',
    defaultSeller: process.env.DEFAULT_SELLER_NAME || 'Lucas Mendes',
    interestRate: parseFloat(process.env.AVERAGE_MONTHLY_INTEREST_RATE || '0.0149')
  }
};

// Aplica configurações persistidas do banco sobre os padrões do .env
const persisted = settingsStore.loadAll();
if (persisted.ai_provider) config.provider = persisted.ai_provider;
if (persisted.openai_api_key) config.openai.apiKey = persisted.openai_api_key;
if (persisted.gemini_api_key) config.gemini.apiKey = persisted.gemini_api_key;
if (persisted.dealership_name) config.dealership.name = persisted.dealership_name;
if (persisted.dealership_address) config.dealership.address = persisted.dealership_address;
if (persisted.dealership_phone) config.dealership.phone = persisted.dealership_phone;

module.exports = config;
