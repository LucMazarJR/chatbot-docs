# Dashboard PetSaúde - Central de FAQs

Esta aplicação Full-Stack funciona como o painel de gerenciamento da Central de Dúvidas Frequentes. O sistema lida com o cadastro, a edição e a exclusão de FAQs médicas e faz a geração automática de vetores (Embeddings). Atualmente, utilizo o n8n integrado a esses vetores para alimentar o chatbot. Na prática, o n8n busca a informação correta no banco de dados e usa o Google Gemini para formatar e entregar respostas mais humanizadas no chat.

## Como foi desenvolvido (Background)
Inicialmente, o front-end deste painel foi desenhado usando a IA Lovable criando uma interface que utilizava apenas dados "falsos" predefinidos (mockados).

Depois foi necessário transformar esse layout em um software Full-Stack. Para isso, foi construído um Back-end em NestJS. Esse backend substituiu os dados estáticos, conectando o painel de forma viva a um Banco de Dados na nuvem (MongoDB).

## Hospedagem e Produção (Links)
A aplicação está totalmente separada e hospedada na nuvem nos seguintes serviços:

* **Front-end (Painel de Acesso):** Hospedado na Vercel.
  * Acesso: https://dashboard-pet-saude-seven.vercel.app/
* **Back-end (API / Banco de Dados):** Hospedado no Render.
* **Postgres (contas, grupos e sessões):** no Neon. O Render não roda migração ao subir (`DB_RUN_MIGRATIONS` desligado), e a migração nova é aplicada à mão no editor SQL do Neon **antes** do deploy do back. O back novo sem a migração derruba o login do painel inteiro.

Os dois publicam a partir da `main` do repositório `chatbot-docs`, cada um com a sua pasta como diretório raiz: `Dashboard-PetSaude/front` na Vercel e `Dashboard-PetSaude/back` no Render. O endereço sem "-seven" na Vercel é de outro projeto e não recebe os deploys.

No mesmo repositório também está o chat, que tem o próprio projeto na Vercel. Sem filtro, cada push na `main` publicaria os dois projetos, e o plano grátis tem limite de deploys por dia. Por isso cada projeto da Vercel tem, em *Settings → Build and Deployment → Ignored Build Step*, o comando abaixo, que pula o deploy quando a pasta dele não mudou desde o último deploy daquele projeto:

```bash
[ -n "$VERCEL_GIT_PREVIOUS_SHA" ] && git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- .
```

Comparar só com o commit anterior (`git diff HEAD^ HEAD`) não serve: num push com vários commits, se a mudança de uma pasta não estiver no último, o projeto dela é pulado. Na dúvida, o comando acima publica: sem o commit anterior à mão, ele termina com erro, e erro conta como "publicar".

## Stack de Tecnologia
O projeto é dividido em dois serviços principais:

### Front-end (/front)
* **Framework:** React via Vite + TanStack Start.
* **Estilização:** Tailwind CSS + shadcn/ui.
* **Autenticação:** JWT guardado em cookie `httpOnly`. O token nunca chega ao JavaScript da página: as chamadas à API saem das server functions, que leem o cookie no servidor.

### Back-end (/back)
* **Framework:** NestJS (Node.js).
* **Bancos de dados:** dois, com donos bem definidos.
  * **MongoDB** (Mongoose): as FAQs. É contrato compartilhado com a ingestão em Python e com o fluxo do n8n.
  * **PostgreSQL** (TypeORM): usuários, grupos e sessões. Nenhum conteúdo de FAQ entra aqui.
* **Inteligência Artificial:** Integração server-side com Google Gemini para embeddings.

## Segurança e Modelos de Acesso

Cada pessoa tem a própria conta. Não existe senha compartilhada.

* **Login individual:** e-mail e senha, com o hash guardado em bcrypt. A senha definida por um administrador é sempre provisória: a troca é exigida no primeiro acesso.
* **Grupos, com permissão por item do menu.** Cada conta fica num grupo, e o grupo diz, para cada item do menu, se dá *sem acesso*, *ver* ou *editar*. Mudar um grupo vale para todos os membros na requisição seguinte, sem sair da conta: o back relê o grupo a cada chamada. Os grupos de partida são Administrador (tudo), Editor (escreve e importa FAQs) e Leitor (consulta FAQs e categorias), com o acesso dos antigos papéis de mesmo nome.
  * **FAQs para ver** vale para todo grupo: é a tela inicial.
  * **Revisões** tem alcance, e não ler ou gravar: *Só as suas* revisa as FAQs com data de revisão que a pessoa criou, e *Todas* as de todo mundo. Nos dois, quem revisa pode editar o texto dessas FAQs, mesmo sem FAQs para editar; FAQ sem data de revisão continua só com quem edita FAQs. Os grupos que já escreviam FAQ começam revisando as próprias, e o Administrador revisa todas.
  * **O master** cria, muda e apaga os grupos, em `/grupos`, e passa o master adiante. Vale por cima do grupo. O painel nunca fica sem master ativo.
  * **Quem cuida das contas sem ser master** (Usuários para editar) só mexe em conta e só atribui grupo que não passem do próprio acesso, e não muda o próprio grupo. Sem isso, redefinir a senha de quem tem mais acesso seria entrar como ele.
  * As áreas que mostram o que cidadãos escreveram (Conversas, Unidades de saúde, Sem resposta, Relatório do dia e Avisos) só o Administrador recebe de partida. Dar uma delas a outro grupo é decisão do master, e fica no Histórico.
* **Sessões revogáveis:** o JWT é sem estado, então cada sessão emitida fica registrada no Postgres. Desativar um usuário ou trocar uma senha derruba as sessões **na hora**, em vez de esperar o token expirar, o que daria até 8 horas de acesso a quem o administrador acabou de revogar.
* **Logs de histórico:** toda alteração grava quem fez, com o id e o nome vindos do token verificado. Antes o nome vinha de um cabeçalho preenchido pelo front, ou seja, qualquer pessoa podia escrever qualquer nome; o histórico registrava ficção.

## Revisão por data

Parte da base vale por um tempo: um surto, uma campanha, um horário de férias. A FAQ ganha uma data de revisão e um motivo, no formulário de FAQ (criar, editar, aprovar sugestão) e na importação em lote, para o lote inteiro. Em **Minha conta** (pelo nome no rodapé do menu) cada pessoa pode deixar um padrão: toda FAQ que criar já vem com revisão em 1, 3, 6 ou 12 meses, e ela muda ou desmarca em cada uma.

Na data, a FAQ **continua no chatbot**: ela entra na tela **Revisões** e no contador do menu. Tirar do ar deixaria perguntas sem resposta enquanto ninguém revisa. Em Revisões, *Continua valendo* marca a próxima data (ou tira a revisão) e *Editar* corrige o texto. As duas funcionam antes da data, com o aviso de que o prazo ainda não chegou.

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

## Importação de FAQs em lote

Quem tem Importar no grupo pode subir uma planilha `.xlsx` ou um documento
`.docx` em **/importar**: o arquivo é lido no navegador, passa pelo script de
geração e vira uma prévia: nada é gravado antes de alguém conferir. Linhas que
já existem na base são detectadas pelo `content_hash`, o mesmo MD5 da ingestão
Python, então reenviar o mesmo arquivo depois de uma interrupção retoma de onde
parou em vez de duplicar.

O **script de geração** é um módulo JavaScript guardado no banco e editável em
**/configuracoes** (Configurações para editar). Ele exporta duas coisas: `gerarFaqs`, que
transforma o documento em pares pergunta/resposta, e `modelo`, de onde saem os
arquivos de modelo vazios. As duas pontas no mesmo lugar de propósito: trocar o
script troca o parser e o modelo baixado ao mesmo tempo, e não há como ficarem
fora de sincronia. Cada gravação cria uma versão nova; a anterior fica guardada e
pode ser reativada, e cada FAQ importada registra qual script e versão a geraram.

O script roda no **navegador**, num Web Worker descartável com timeout e sem
acesso a rede. O servidor guarda e devolve o código, nunca o executa.

> ⚠️ **O script vale só para a importação pelo dashboard.** A ingestão que lê o
> Google Drive (`scripts/enviar_dados.py`) continua com os marcadores fixos no
> código. Divergir faz o Drive parar de render FAQs sem erro nenhum.

### Saúde dos vetores

Em **/configuracoes** há a contagem de FAQs sem vetor, com dimensão errada, com
vetor desatualizado e com modelo divergente, e um botão para gerar os que
faltam. Uma FAQ sem vetor está na base e aparece na listagem, mas o chatbot nunca
a encontra: não há erro em lugar nenhum, só a pergunta que nunca é respondida.

"Modelo não registrado" é uma categoria separada de "modelo divergente" porque a
segunda não pode ser deduzida: o campo `embedding_model` só passou a ser gravado
recentemente, e a dimensão não distingue os modelos: o `gemini-embedding-001`
também produz 3072 quando pedido. Para saber em que modelo a base realmente
está, use **Diagnosticar por amostragem**: ele gera vetores novos para ~10 FAQs e
compara com os guardados. Custa 10 chamadas à API.

## Deploy

⚠️ **Este release inclui uma migration nova (`import_scripts`) e ela não roda
sozinha**: `DB_RUN_MIGRATIONS` é `false` por padrão, de propósito. Depois de
subir a API:

```bash
cd back && pnpm run migration:run
```

Ou suba uma vez com `DB_RUN_MIGRATIONS=true` no ambiente.

Sem isso o dashboard continua funcionando normalmente, mas **/importar** e
**/configuracoes** respondem com a mensagem dizendo que a tabela não existe.

> O `bun.lock` do front está desatualizado: as dependências novas
> (`read-excel-file`, `write-excel-file`, `mammoth`, `docx`) entraram pelo npm,
> que é o que o Dockerfile e a Vercel usam. Rode `bun install` numa máquina com
> bun para regerá-lo.

> ⚠️ **O modelo de embedding precisa ser o mesmo em três lugares:** aqui, na ingestão em Python e no nó Embeddings do n8n. Divergir não gera erro em lugar nenhum: a FAQ entra no banco e simplesmente nunca aparece nas buscas do chatbot. Hoje os três usam `gemini-embedding-2` com 3072 dimensões.
