const settingsStore = require('./settings-store');

const config = {
  provider: process.env.AI_PROVIDER || 'gemini',
  aiReviewMode: process.env.AI_REVIEW_MODE === 'true' || false,
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  },
  dealership: {
    name: process.env.DEALERSHIP_NAME || 'AutoPrime Veículos',
    city: process.env.DEALERSHIP_CITY || 'São Paulo - SP',
    address: process.env.DEALERSHIP_ADDRESS || 'Av. dos Bandeirantes, 1500',
    phone: process.env.DEALERSHIP_PHONE || '(11) 99999-8888',
    defaultSeller: 'Consultor de Plantão',
    interestRate: parseFloat(process.env.AVERAGE_MONTHLY_INTEREST_RATE || '0.0149')
  }
};

// Aplica configurações persistidas do banco sobre os padrões do .env
const persisted = settingsStore.loadAll();
if (persisted.ai_provider) config.provider = persisted.ai_provider;
if (persisted.openai_api_key) config.openai.apiKey = persisted.openai_api_key;
if (persisted.gemini_api_key) config.gemini.apiKey = persisted.gemini_api_key;
if (persisted.deepseek_api_key) config.deepseek.apiKey = persisted.deepseek_api_key;
if (persisted.deepseek_model) config.deepseek.model = persisted.deepseek_model;
if (persisted.ai_review_mode !== undefined) {
  config.aiReviewMode = (persisted.ai_review_mode === 'true' || persisted.ai_review_mode === true || persisted.ai_review_mode === 1 || persisted.ai_review_mode === '1');
}
if (persisted.dealership_name) config.dealership.name = persisted.dealership_name;
if (persisted.dealership_city) config.dealership.city = persisted.dealership_city;
if (persisted.dealership_address) config.dealership.address = persisted.dealership_address;
if (persisted.dealership_phone) config.dealership.phone = persisted.dealership_phone;

module.exports = config;
