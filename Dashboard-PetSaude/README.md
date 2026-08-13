# Dashboard PetSaúde - Central de FAQs

Esta aplicação Full-Stack funciona como o painel de gerenciamento da Central de Dúvidas Frequentes. O sistema lida com o cadastro, a edição e a exclusão de FAQs médicas e faz a geração automática de vetores (Embeddings). Atualmente, utilizo o n8n integrado a esses vetores para alimentar o chatbot. Na prática, o n8n busca a informação correta no banco de dados e usa o Google Gemini para formatar e entregar respostas mais humanizadas no chat.

## Como foi desenvolvido (Background)
Inicialmente, o front-end deste painel foi desenhado usando a IA Lovable criando uma interface que utilizava apenas dados "falsos" predefinidos (mockados).

Depois foi necessário transformar esse layout em um software Full-Stack. Para isso, foi construído um Back-end em NestJS. Esse backend substituiu os dados estáticos, conectando o painel de forma viva a um Banco de Dados na nuvem (MongoDB).

## Hospedagem e Produção (Links)
A aplicação está totalmente separada e hospedada na nuvem nos seguintes serviços:

* **Front-end (Painel de Acesso):** Hospedado na Vercel.
  * Acesso: https://dashboard-pet-saude.vercel.app/
* **Back-end (API / Banco de Dados):** Hospedado no Render.

## Stack de Tecnologia
O projeto é dividido em dois serviços principais:

### Front-end (/front)
* **Framework:** React via Vite + TanStack Start.
* **Estilização:** Tailwind CSS + shadcn/ui.
* **Autenticação:** Baseada em "Cookies" de Sessão Seguros salvos localmente (Garante navegação independente no navegador).

### Back-end (/back)
* **Framework:** NestJS (Node.js).
* **Banco de Dados:** MongoDB (com Mongoose).
* **Inteligência Artificial:** Integração server-side com Google Gemini AI para Processamento de Texto e Embeddings.

## Segurança e Modelos de Acesso
A plataforma foi desenhada para o acesso restrito e seguro por membros da equipe, possuindo um sistema flexível de auditoria:

* **Senha Única (Mestra):** Para entrar, todas as pessoas precisam informar o seu próprio Nome e a senha compartilhada da organização.
* **Sessões Independentes:** Ao desbloquear pela senha, o computador recebe um cookie invisível e criptografado. Um usuário não destranca o sistema para outras pessoas, mesmo se ele enviar a URL da sua tela. O computador de quem está acessando passa por verificação.
* **Logs de Histórico:** Qualquer mudança num FAQ enviará de modo autônomo o nome de quem estava operando o cookie para o back-end, gravando e mostrando quem fez cada ação na Timeline.

