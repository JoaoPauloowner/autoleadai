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
- **🔄 Multi-Provedor de IA:** Suporte flexível a **Google Gemini** (padrão nativo atualizado para `gemini-3.1-flash-lite`), **OpenAI** (`gpt-4o-mini`) e **DeepSeek** (`deepseek-chat` compatível nativamente).
- **🛡️ Modo Copiloto / Revisão Humana:** Ative o modo de supervisão onde a IA redige rascunhos de resposta, mas só envia após aprovação, edição ou recusa de um consultor comercial humano.

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

## 🔒 Arquitetura de Segurança & Controle de Acesso (RBAC)

### 1. Modelo de Papéis e Permissões (RBAC)
O AutoLead AI implementa controle de acesso baseado em papéis (RBAC) com autenticação por sessão e senhas protegidas com bcrypt:

| Papel | Descrição | Visibilidade de Dados | Permissões Especiais |
| :--- | :--- | :--- | :--- |
| **`owner` (Proprietário/Diretor)** | Dono ou diretor geral da concessionária. | Vê **todos** os leads, atendimentos, tarefas e test-drives de todos os vendedores. | Acesso completo a Configurações da Loja, Base de Conhecimento (RAG), Conexão WhatsApp por QR Code, Gestão de Equipe (pode criar e gerenciar `salesperson` e `manager`). Protegido contra auto-exclusão/desativação. |
| **`manager` (Gerente Comercial)** | Gerente de vendas da concessionária. | Vê **todos** os leads, atendimentos, tarefas e test-drives de todos os vendedores. | Pode reatribuir leads entre vendedores e gerenciar vendedores na aba de Equipe (criar `salesperson`, resetar senha, ativar/desativar). Não tem acesso a configurações de infraestrutura/RAG nem pode alterar outros gerentes ou o dono. |
| **`salesperson` (Consultor Comercial)** | Vendedor da loja. | Vê **apenas os seus próprios leads** (`assigned_to`), suas tarefas e seus test-drives agendados. | Atende leads no Atendimento ao Vivo, envia mensagens e fotos, altera status de seus leads e pode alterar sua própria senha. Não acessa configurações nem equipe. |

---

### 2. First-Run Setup & Instalação Limpa em Produção
Em novas instalações, o banco de dados inicia **completamente vazio de usuários**:
- Ao abrir o sistema pela primeira vez (`http://localhost:3000`), o AutoLead detecta o banco zerado via `GET /api/auth/setup-status` e exibe a tela de **First-Run Setup**.
- O proprietário da concessionária cria seu nome, e-mail corporativo e senha segura.
- A rota `POST /api/auth/setup` cria o primeiro `owner` e **se auto-bloqueia permanentemente com HTTP 403**, impedindo qualquer nova execução.

### 3. Ambiente de Demonstração / Testes Locais
Se você desejar popular o sistema com dados fictícios para fazer apresentações ou rodar testes automatizados:
```bash
npm run seed:demo
```
Esse comando cria `admin@autolead.com` (`owner`), `lucas@autolead.com` (`salesperson`) e `marcos@autolead.com` (`salesperson`), gerando senhas seguras em `data/initial_credentials.json`.

### 4. Health Check para Plataformas de Nuvem
- **Endpoint:** `GET /health` (sem autenticação)
- **Resposta:** `{ "status": "ok" }` (HTTP 200)
- Projetado para verificação de liveness/readiness em plataformas como **Railway**, **Render**, **Fly.io**, **AWS** e **Kubernetes**.

### 2. Trilha de Auditoria (`audit_log`)
Todas as operações sensíveis são registradas de forma auditável e transparente:
- Criação, alteração e redefinição de senhas de usuários (senhas em texto plano **nunca** são armazenadas em logs).
- Troca de senhas pelo próprio usuário.
- Conexão e desconexão do WhatsApp da loja.
- Alteração das regras de negócio e dados da concessionária.
- Importação em massa de contatos via planilha CSV.

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

