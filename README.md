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
- **Simulador Multimodal:** [http://localhost:3000/#simulator](http://localhost:3000/#simulator)
- **Endpoint do Webhook:** `http://localhost:3000/api/webhook/whatsapp`
