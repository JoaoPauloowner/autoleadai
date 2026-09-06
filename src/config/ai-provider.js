require('dotenv').config();

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

module.exports = config;
