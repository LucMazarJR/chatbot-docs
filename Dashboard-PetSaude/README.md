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
* **Autenticação:** JWT guardado em cookie `httpOnly`. O token nunca chega ao JavaScript da página — as chamadas à API saem das server functions, que leem o cookie no servidor.

### Back-end (/back)
* **Framework:** NestJS (Node.js).
* **Bancos de dados:** dois, com donos bem definidos.
  * **MongoDB** (Mongoose) — as FAQs. É contrato compartilhado com a ingestão em Python e com o fluxo do n8n.
  * **PostgreSQL** (TypeORM) — usuários, papéis e sessões. Nenhum conteúdo de FAQ entra aqui.
* **Inteligência Artificial:** Integração server-side com Google Gemini para embeddings.

## Segurança e Modelos de Acesso

Cada pessoa tem a própria conta. Não existe senha compartilhada.

* **Login individual:** e-mail e senha, com o hash guardado em bcrypt. A senha definida por um administrador é sempre provisória — a troca é exigida no primeiro acesso.
* **Três papéis:**
  * `admin` — gerencia usuários e FAQs
  * `editor` — cria, edita e exclui FAQs
  * `leitor` — apenas consulta
* **Sessões revogáveis:** o JWT é sem estado, então cada sessão emitida fica registrada no Postgres. Desativar um usuário ou trocar uma senha derruba as sessões **na hora**, em vez de esperar o token expirar — o que daria até 8 horas de acesso a quem o administrador acabou de revogar.
* **Logs de histórico:** toda alteração grava quem fez, com o id e o nome vindos do token verificado. Antes o nome vinha de um cabeçalho preenchido pelo front, ou seja, qualquer pessoa podia escrever qualquer nome; o histórico registrava ficção.

## Rodando localmente

```bash
# back
cd back
cp .env.example .env      # preencha MONGODB_URI, DATABASE_URL, JWT_SECRET e ADMIN_*
pnpm install
pnpm run migration:run
pnpm run seed:admin       # cria o primeiro administrador; é idempotente
pnpm run start:dev        # porta 3333

# front
cd ../front
cp .env.example .env      # VITE_API_BASE_URL e SESSION_SECRET
bun install
bun run dev --port 5173   # a porta 3000 costuma estar ocupada pelo gateway do WhatsApp
```

O Postgres pode vir do `docker-compose.yml` do repositório do chatbot (serviço `postgres`).

> ⚠️ **O modelo de embedding precisa ser o mesmo em três lugares:** aqui, na ingestão em Python e no nó Embeddings do n8n. Divergir não gera erro em lugar nenhum — a FAQ entra no banco e simplesmente nunca aparece nas buscas do chatbot. Hoje os três usam `gemini-embedding-2` com 3072 dimensões.
