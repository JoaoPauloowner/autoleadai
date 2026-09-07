# 🚗 AutoLead AI — Plataforma de Vendas e CRM para Lojas de Veículos
*(Unificação AutoPilot Ops + Lead que Vira Visita)*

Plataforma comercial completa, autônoma e independente (com **cérebro próprio em Node.js**, sem dependência do n8n) para Lojas de Veículos, Concessionárias e Multimarcas de Seminovos.

---

## ⚡ Destaques da Solução

- **🎯 Lead Score Comercial (0 a 100):** Cálculo dinâmico em tempo real avaliando a conversa contra os **4 Pilares Comerciais** (Interesse Específico, Prazo de Compra, Capacidade/Entrada/Troca e Compromisso com a Visita). Identifica imediatamente leads 🔥 **Quentes (75+)**, ⚡ **Qualificados (50-74)** ou 🟡 **Interessados**.
- **🚨 Painel de Vazamento de Receita & SLA:** Identifica em tempo real gargalos financeiros: leads sem resposta há mais de 15 minutos, leads sem próxima ação definida e follow-ups atrasados, estimando o valor da margem em risco.
- **🎙️ RAG Multimodal Nativo (Áudio & Visão):**
  - Transcrição instantânea de mensagens de voz enviadas pelo cliente no WhatsApp.
  - Inspeção visual de fotos de veículos enviadas pelo cliente para pré-avaliação do carro na troca.
- **📋 Gestão de Tarefas & Follow-up Operacional:** Garante que todo lead ativo tenha uma próxima ação obrigatória com prazo e tipo de contato (WhatsApp, ligação, test-drive).
- **📂 Importador em Lote via Planilha CSV:** Suba listas de leads da Webmotors, iCarros ou Facebook Ads com auto-scoring e agendamento automático do primeiro contato.
- **🚫 Zero Dependência do n8n:** Toda a inteligência, prompts, fluxos e regras de negócio rodam 100% nativos no Node.js.
- **💾 Banco de Dados SQLite Embutido:** Armazena veículos, leads, agendamentos, tarefas e histórico de chat sem precisar de servidores externos.
- **📱 Simulador de WhatsApp com Telemetria:** Teste mensagens de texto, áudios e envio de fotos diretamente pelo navegador, com console lateral exibindo as chamadas de *Tools* e raciocínio da IA.
- **📡 Webhook Universal para WhatsApp:** Endpoint pronto para plugar na **Evolution API** ou **Z-API** para atendimento real.
- **🔄 Multi-Provedor de IA:** Suporte nativo a **Google Gemini** (Gemini 2.0 Flash com áudio e visão) e **OpenAI** (GPT-4o / GPT-4o-mini).

---

## 🚀 Como Executar em Qualquer Computador

### 1. Clonar o repositório:
```bash
git clone https://github.com/JoaoPauloowner/autoleadai.git
cd autoleadai
```

### 2. Instalar as dependências e iniciar:
```bash
npm install
npm start
```
*(No Windows, basta dar **dois cliques no arquivo `iniciar.bat`**!)*

### 3. Acessar no Navegador:
- **Painel Cockpit Geral & Vazamentos:** [http://localhost:3000](http://localhost:3000)
- **CRM com Lead Score:** [http://localhost:3000/#crm](http://localhost:3000/#crm)
- **Tarefas de Follow-up:** [http://localhost:3000/#tasks](http://localhost:3000/#tasks)
- **Endpoint do Webhook:** `http://localhost:3000/api/webhook/whatsapp`

---

## 🔒 Arquitetura de Segurança do Piloto e Roadmap Fase 2

### 1. Modelo de Acesso no Piloto (Fase 1 — Atual)
- **Autenticação por Chave de API Única:** O acesso administrativo e as rotas `/api/*` são protegidos por chave de API (`ADMIN_API_KEY`) via header `x-admin-key`. Rotas de webhook são protegidas por `WEBHOOK_SECRET` com validação em tempo constante.
- **Fail-Closed:** Ambas as variáveis são obrigatórias em produção; na ausência delas, o sistema bloqueia o tráfego com `503 Service Unavailable`, impedindo exposições acidentais na rede da loja.
- **Preparação de Schema Multi-Tenant:** Todas as tabelas principais (`leads`, `vehicles`, `tasks`, `test_drives`, `chat_messages`) já possuem a coluna estrutural `organization_id TEXT DEFAULT 'default'`. Isso garante compatibilidade total e elimina a necessidade de migrações arriscadas no futuro.
- **Trilha de Auditoria (`audit_log`):** Operações sensíveis são registradas automaticamente na tabela `audit_log` (alterações de configurações da loja, conexão/desconexão do WhatsApp e importações de leads via CSV).
- **Abstração Total de IA:** Todas as interações com provedores LLM (Gemini e OpenAI) são centralizadas na camada `src/ai/`, mantendo os controllers desacoplados de SDKs de IA.

### 2. Transição para a Fase 2 (Pós-Validação do Piloto)
Após o período de testes e validação comercial diretamente na loja parceira, os seguintes avanços arquiteturais serão implementados de forma incremental:
- **Autenticação e RBAC Completo:** Substituição da API key única por login de usuários com JWT, refresh tokens e papéis granulares (Administrador, Gerente de Vendas, Consultor de Vendas).
- **Multi-Tenancy Real:** Ativação de isolamento lógico estrito por `organization_id` no banco de dados para atender redes de concessionárias e múltiplas lojas.
- **Migração para PostgreSQL:** Transição assistida de SQLite para PostgreSQL gerenciado.
- **Billing e Planos:** Módulo de faturamento recorrente e gestão de assinaturas.
- **Meta Cloud API Oficial:** Suporte opcional à API oficial da Meta ao lado do conector nativo.

