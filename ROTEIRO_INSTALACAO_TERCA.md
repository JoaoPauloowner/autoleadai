# 🚀 Roteiro Prático de Apresentação e Instalação na Terça-Feira

Este é o passo a passo direto para você chegar na loja, impressionar o dono e deixar o sistema funcionando em menos de 5 minutos.

---

## ⏱️ Passo 1: Abrir o Sistema na Loja (30 segundos)

### Se você for rodar no computador da concessionária:
1. Copie a pasta do projeto para o computador da loja (ou baixe via Git com `git clone https://github.com/JoaoPauloowner/autoleadai.git`).
2. Dê **dois cliques** no arquivo:
   ```text
   iniciar.bat
   ```
3. O sistema verifica as dependências e abre automaticamente a tela do painel no navegador (`http://localhost:3000`).

---

## 📱 Passo 2: Conectar o WhatsApp da Loja (10 segundos)

1. No topo da tela, clique no botão verde **"Conectar WhatsApp"**.
2. Clique em **"Gerar QR Code de Conexão"**.
3. Peça para o dono da loja (ou o vendedor com o celular de atendimento):
   * Abrir o WhatsApp no celular.
   * Ir em **Configurações > Aparelhos Conectados > Conectar um Aparelho**.
   * Apontar a câmera para o QR Code na tela do computador.
4. O painel mudará para:
   * **🟢 WhatsApp Conectado com Sucesso!**
   * A partir desse instante, qualquer cliente que mandar mensagem para aquele número já será atendido pelo consultor de vendas virtual com respostas inteligentes.

---

## 🏢 Passo 3: Personalizar os Dados da Loja (1 minuto)

1. Clique na aba **"Dados da Concessionária"** no menu lateral.
2. Preencha:
   * **Nome da Loja:** Ex: *AutoPrime Seminovos* ou *Motos & Cia*.
   * **WhatsApp Comercial:** Número da loja.
   * **Endereço do Showroom:** Onde os clientes farão os test drives.
   * **Horário de Atendimento e Garantia oferecida.**
3. Clique em **"Salvar Configurações"**.

---

## 🚗 Passo 4: Alimentar o Estoque de Veículos ou Motos

Você tem 3 opções super fáceis:
1. **Pela Tela:** Clique no botão azul **"+ Cadastrar Veículo"** no topo e preencha modelo, ano e preço.
2. **Por Planilha:** Clique em **"Importar Leads / Estoque"** e cole a lista de carros/motos.
3. **Pelo ERP da Loja (Automático):** Se a loja tiver um sistema (Bling, Renave, AutoSoft, DealerNet), o técnico de TI deles só precisa apontar o envio para:
   ```text
   POST http://localhost:3000/api/integrations/inventory
   ```

---

## 🎯 Passo 5: O Teste de Impacto na Frente do Dono (O Fechamento)

1. Peça para o dono da loja (ou um amigo) pegar o **próprio celular pessoal**.
2. Mandar uma mensagem no WhatsApp da loja:
   > *"Olá, vi o anúncio no Instagram! Vocês têm algum SUV automático disponível? Aceitam meu carro na troca?"*
3. **Veja o sistema responder sozinho em 3 segundos:**
   * Apresentando os carros disponíveis no showroom com fotos e preços.
   * Simulando a entrada e as parcelas do financiamento.
   * Convidando para ir na loja tomar um café e fazer o test drive.
4. **Mostre para o dono o painel web se atualizando sozinho:**
   * O cliente cai na hora no **Funil de Vendas (CRM)** como *Qualificado*.
   * A pontuação de compra (*Lead Score: 85 pts - Quente*) sobe na tela.
   * O vendedor da loja ganha uma tarefa com o alerta da visita.

---

## 🛡️ Principais Dúvidas do Dono da Loja (Respostas Prontas)

* **"O robô vai falar besteira ou dar preço errado?"**  
  * *Resposta:* "Não. Ele só responde com os veículos e valores que estão cadastrados no estoque da loja. Se ele não souber algo ou o cliente fizer uma pergunta muito específica, ele transfere imediatamente para o vendedor humano."
* **"Preciso pagar por mensagem enviada?"**  
  * *Resposta:* "Zero. O sistema se conecta ao seu WhatsApp via QR Code Web. Não há cobrança por conversa da Meta."
* **"E se meu vendedor quiser responder no WhatsApp com a mão dele?"**  
  * *Resposta:* "Pode responder normalmente pelo celular. Tudo o que o robô conversa fica visível no celular da loja, e o vendedor pode assumir o atendimento a qualquer momento."
* **"Tenho medo da IA responder direto para os clientes. Posso aprovar antes?"**  
  * *Resposta:* "Sim! Nas Configurações, basta ativar o **Modo Copiloto (Revisar respostas antes de enviar)**. Quando ativado, a IA redige a resposta em segundos mas não envia: ela cria um card na aba 'Aguardando Revisão' para seu consultor aprovar com 1 clique, editar o texto ou recusar."
* **"Quais motores de Inteligência Artificial o sistema aceita?"**  
  * *Resposta:* "Vem configurado de fábrica com **Google Gemini** (modelo `gemini-3.1-flash-lite`, super rápido e econômico), e você também pode alternar para **DeepSeek** (`deepseek-chat`) ou **OpenAI** (`gpt-4o-mini`) com sua própria chave de API diretamente no painel."
