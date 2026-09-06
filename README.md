# 🚗 AutoLead AI — Plataforma de Vendas e CRM para Lojas de Veículos

Plataforma completa, autônoma e independente (com **cérebro próprio em Node.js**, sem dependência do n8n) para Lojas de Veículos, Concessionárias e Multimarcas de Seminovos.

---

## ⚡ Destaques da Solução

- **🧠 Cérebro Próprio com Function Calling:** A IA consulta o estoque real, calcula simulações financeiras de parcelas e agenda Test Drives com data e hora diretamente no banco de dados.
- **🚫 Zero Dependência do n8n:** Toda a inteligência, prompts, fluxos e regras de negócio rodam 100% nativos no Node.js.
- **💾 Banco de Dados SQLite Embutido:** Armazena veículos, leads, agendamentos e histórico de chat sem precisar de servidores externos de banco.
- **📱 Simulador de WhatsApp em Tempo Real:** Converse com a IA no navegador com interface idêntica ao WhatsApp e acompanhe o painel de telemetria das *tools* sendo acionadas.
- **📊 Cockpit Dashboard & CRM:**
  - Métricas gerais (Estoque ativo, valor total do pátio, taxa de conversão).
  - Gestão de estoque com fotos, opcionais e filtros (SUV, Sedan, Hatch).
  - Funil de vendas (Kanban) com estágios automáticos.
  - Tabela de agendamentos de Test Drive com confirmação e cancelamento.
- **📡 Webhook Universal para WhatsApp:** Endpoint pronto para plugar diretamente na **Evolution API** ou **Z-API** quando desejar conectar um WhatsApp real.
- **🔄 Multi-Provedor de IA:** Suporte nativo a **Google Gemini** (Gemini 2.0 Flash) e **OpenAI** (GPT-4o-mini), além de modo nativo autônomo.

---

## 🚀 Como Executar em Qualquer Computador

### 1. Clonar o repositório (no computador de quem for rodar):
```bash
git clone https://github.com/JoaoPauloowner/autoleadai.git
cd autoleadai
```

### 2. Instalar as dependências e iniciar:
```bash
npm install
npm start
```
*(No Windows, você também pode simplesmente dar **dois cliques no arquivo `iniciar.bat`** que ele faz tudo sozinho!)*

### 3. Acessar no Navegador:
- **Painel Cockpit Geral:** [http://localhost:3000](http://localhost:3000)
- **Simulador de WhatsApp:** [http://localhost:3000/#simulator](http://localhost:3000/#simulator)
- **Endpoint do Webhook:** `http://localhost:3000/api/webhook/whatsapp`

---

## 📁 Estrutura de Arquivos

```
autolead-ai/
├── package.json               # Dependências do projeto
├── .env                       # Configurações de ambiente
├── server.js                  # Servidor Express principal
├── data/
│   └── autolead.db            # Banco de dados SQLite persistente
├── src/
│   ├── config/
│   │   ├── database.js        # Inicialização do SQLite e dados de exemplo
│   │   └── ai-provider.js     # Configurações de OpenAI / Gemini
│   ├── ai/
│   │   ├── agent.js           # Cérebro de IA e orquestrador de mensagens
│   │   ├── prompts.js         # Prompt do consultor de vendas automotivas
│   │   └── tools.js           # Function calling nativo (busca, parcelas, agenda)
│   ├── controllers/
│   │   ├── vehicleController.js # CRUD do estoque de veículos
│   │   ├── leadController.js    # CRM de leads e métricas
│   │   ├── bookingController.js # Agendamento de test-drives
│   │   ├── chatController.js    # Simulador e histórico de chat
│   │   └── webhookController.js # Webhook universal do WhatsApp
│   └── routes/
│       ├── api.js             # Rotas REST da API
│       └── webhook.js         # Rota do webhook
└── public/                    # Frontend Cockpit Web
    ├── index.html             # Interface SPA completa
    ├── css/style.css          # Design system dark automotivo moderno
    └── js/app.js              # Lógica de interface, kanban e simulador
```

---

## 🛠️ Configuração de Chaves de IA (Opcional)

No arquivo `.env` ou diretamente na aba **Configurações & IA** do painel web, você pode inserir sua chave:

```env
AI_PROVIDER=gemini # ou 'openai'
GEMINI_API_KEY=sua_chave_do_google_ai_studio
OPENAI_API_KEY=sua_chave_da_openai
```

*Nota: Mesmo sem chave de API configurada, o sistema possui um motor autônomo nativo que responde e executa todas as ações reais de busca e agendamento!*
