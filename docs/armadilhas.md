# Armadilhas

Cada uma destas custou tempo, e quase todas **quebram em silêncio**: nada estoura, nenhum log acusa, e o sistema fica "funcionando" com o comportamento errado. Se algo estranho está acontecendo, comece por aqui.

---

## Configuração e banco

**URI do Mongo sem o nome do banco.** `mongodb+srv://…mongodb.net/?appName=x` faz o driver assumir `test` — e existe um `test.faq_medicamentos` com dois documentos de lixo nesse cluster. A aplicação sobe, conecta, mostra 2 FAQs em vez de ~2500 e **não dá erro**. Já derrubou o n8n e quase derrubou o dashboard, em ocasiões separadas. A URI precisa terminar em `/ministerio_saude?appName=…`.

**Modelo de embedding divergente entre os três lugares.** Ingestão, dashboard e nó do n8n precisam usar o mesmo modelo. Divergir não gera erro: a busca só devolve resultado ruim, porque pergunta e documentos caem em espaços vetoriais diferentes. Ver [base-de-faqs.md](base-de-faqs.md#a-regra-que-quebra-tudo-em-silêncio).

**Porta 5432 ocupada por Postgres nativo.** O container falha com *"socket forbidden"*, mensagem que não sugere conflito de porta. Troque `POSTGRES_HOST_PORT` no `.env` (ex.: `55432`).

**No Git Bash, `docker exec` recebe caminho do Windows.** `docker exec pwa node /app/teste.js` vira `C:/Program Files/Git/app/teste.js` antes de chegar ao container, e o erro é *"Cannot find module"* de um caminho que ninguém digitou. Rode com `MSYS_NO_PATHCONV=1` ou pelo PowerShell.

---

## WhatsApp e sessão

**Conflito de aparelhos apaga as credenciais.** Mais de uma sessão pendurada em "Aparelhos conectados" faz o WhatsApp derrubar uma com `Stream Errored (conflict)`. O gateway classifica como `loggedOut` e **apaga as credenciais**, exigindo QR novo. Sintoma: `CONNECTED` seguido de "Sessão desvinculada" em menos de um segundo. Desconecte todos os aparelhos antes de parear.

**O QR em ASCII não sai no log em produção.** O [baileys.provider.ts](../backend/src/channels/whatsapp/adapters/baileys/baileys.provider.ts) só desenha o ASCII quando `NODE_ENV` não é `production` — que é o padrão do compose. Baixe o PNG (ver [instalacao.md](instalacao.md#3-parear-o-whatsapp)).

**`curl --output` grava o erro como imagem.** Um 401 vira um `qr.png` de ~200 bytes que nenhum visualizador abre, e parece problema do visualizador. Confira o tamanho: alguns KB = QR real.

**`DELETE /api/v1/sessions/default` apaga as credenciais.** Não existe "reiniciar a sessão" por essa rota — o que ela faz é exigir QR novo.

**`phoneE164` e `pushName` vêm `null`.** O WhatsApp migrou para endereçamento LID (`…@lid`) e o número real não vem mais no evento. Não quebra nada — responder para o `@lid` funciona —, mas qualquer código que dependa do telefone precisa saber disso.

---

## n8n

**`N8N_BLOCK_ENV_ACCESS_IN_NODE` bloqueia `$env` nos nós.** Com ele ligado (padrão do n8n), o fluxo executa, o agente responde, **gasta cota** — e a resposta morre no nó HTTP com URL e token vazios, sem erro visível no gateway. O compose já define `false`.

**Credencial salva pela tela pode não colar.** Aconteceu com o Header Auth: a tela dava como salva e o webhook continuava devolvendo 403. O caminho confiável é o CLI:

```powershell
docker compose exec -T n8n n8n import:credentials --input=/tmp/cred.json
```

**Importar workflow pelo CLI o desativa.** O `import:workflow` respeita o campo `active` do JSON, que vem `false`. Depois de importar é preciso `n8n publish:workflow --id=…` **e reiniciar o container** para a rota voltar a responder. Pela tela isso não acontece — e reiniciar o n8n derruba o WhatsApp por alguns segundos.

**Trocar um token de webhook exige mexer em dois lugares.** O `.env` alimenta quem envia; o n8n valida contra uma credencial Header Auth, que é independente. Mudar só um faz toda entrega voltar 403. Vale para `N8N_WEBHOOK_TOKEN` (gateway) e `N8N_PWA_WEBHOOK_TOKEN` (protótipo):

```powershell
# 1. gerar e gravar o novo valor no .env
$novo = -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
# 2. atualizar a credencial no n8n (tela ou CLI)
# 3. docker compose up -d whatsapp-gateway   (recriar, NÃO reiniciar: a variável
#    é injetada na criação do container)
# 4. docker compose restart n8n
```

Confirme batendo no webhook: o token antigo deve devolver 403 e o novo, 200. Só assim se sabe que os dois lados foram atualizados.

**Sobrecarga do Gemini derruba todos os canais de uma vez.** O Google responde 503 ("high demand") por minutos seguidos num modelo, e as 3 tentativas do agente caem todas dentro do pico. O chat mostra "Não consegui responder agora" para todo mundo. Os dois fluxos têm um modelo de reserva (`Gemini reserva`, ligado ao AI Agent com *Enable Fallback Model*). A reserva é o `2.5-flash-lite`, de cota gratuita pequena: não trocar a ordem, senão a cota diária acaba antes do meio-dia.

---

## Dashboard

**pnpm 11 recusa rodar scripts com builds pendentes.** Migrations, seed e build falham com `ERR_PNPM_IGNORED_BUILDS`, mensagem que não menciona nenhum dos três comandos. A aprovação vive no `pnpm-workspace.yaml` (`allowBuilds`).

**O build do front tem Cloudflare Workers como alvo padrão.** O `@lovable.dev/vite-tanstack-config` fixa isso. Buildado sem ajuste, o `.output/server/index.mjs` sai como Worker: rodado com `node`, encerra na hora, código 0, sem log — o container fica reiniciando em silêncio. O Dockerfile do front já define `NITRO_PRESET=node-server`. Ao publicar noutra plataforma, reavalie se o preset automático dela resolve.

**As duas formas de subir disputam as portas 3333 e 5173.** Container e `pnpm start:dev` não convivem.

**Tipo TypeScript derivado de lista num `@Prop` derruba o boot do Nest.** `type X = (typeof LISTA)[number]` num campo do schema compila, mas o Mongoose não consegue inferir o tipo em tempo de execução e o módulo recusa subir com *"Cannot determine a type for the … field"*. O `tsc` passa; só o teste do service ou o boot acusam. Declare `@Prop({ type: String })`.

**`$ne: null` numa expressão de agregação conta campo ausente como preenchido.** Em `$cond`, campo que não existe não é igual a `null`, e a contagem de "exibidas" contaria todo aviso antigo. Use `$gt: [campo, null]`.

**Limpar a sessão em qualquer erro tira da conta quem está trabalhando.** O `getSession` do front só pode apagar o cookie quando a API responde 401 ou 403. Tratando rede fora, 5xx ou API acordando como "sessão inválida", cada deploy do back e cada soneca do plano grátis mandava a equipe para o login, e o login batia na mesma API parada.

**Aba aberta antes de um deploy pede arquivos que não existem mais.** Os arquivos de cada tela mudam de nome a cada build. O [versao-nova.ts](../Dashboard-PetSaude/front/src/lib/versao-nova.ts) recarrega a página quando isso acontece. Para testar localmente, reconstruir só o front (`docker compose up -d --build --no-deps dashboard-front`), em navegador sem cache: sem `--no-deps` a API reinicia junto, e com cache o arquivo antigo vem dele e a falha não aparece.

---

## Protótipo PWA

**`output: 'standalone'` derruba o build na Vercel.** Ele é obrigatório para a imagem Docker não passar de 1 GB, e proibido na Vercel: o build de lá termina com um passo próprio que procura arquivos de rastreio que o modo standalone não produz. O erro é

```
ENOENT: no such file or directory, open '.next/next-server.js.nft.json'
```

— que não menciona `output` nem `standalone`, e leva a procurar no lugar errado. O [next.config.ts](../pwa/next.config.ts) resolve com `process.env.VERCEL ? undefined : 'standalone'`. É a mesma família da armadilha do `NITRO_PRESET` acima: o alvo do build precisa diferir entre o Docker e a plataforma.

**`HOSTNAME=0.0.0.0` no Dockerfile não é decorativo.** O servidor gerado pelo `output: standalone` escuta só em `localhost` *dentro* do container; sem a variável, a porta publicada responde *connection refused* e o container parece saudável.

**Um `data:` URI de SVG não enxerga as variáveis CSS da página.** O padrão de fundo do chat é renderizado em contexto isolado — por isso a cor do traço está fixa dentro do SVG e o tema escuro troca a imagem inteira. Usar `var(--x)` ali dentro faz o fundo sumir, sem erro no console.

**`PWA_PUBLIC_URL` precisa ser alcançável pelo container do n8n.** É o endereço para onde o fluxo devolve a resposta pronta. Deduzi-lo do cabeçalho `Host` não funciona: `localhost` dentro do n8n é o próprio n8n, e a resposta morre com `ECONNREFUSED`. No Docker, `http://pwa:8080`.

**O limite de 40 mensagens por IP a cada 10 minutos é proposital.** Com acesso aberto, uma aba segurando F5 queimaria a cota do dia. Se um teste presencial legítimo esbarrar nele (muitos celulares atrás do mesmo NAT), o valor está em `pwa/src/lib/limite.ts`.

**Instalar como aplicativo exige HTTPS.** Por IP da rede local o chat funciona, mas o navegador recusa registrar o service worker e o "Adicionar à tela de início" não aparece. Não é defeito do protótipo.

**Service worker que espera a rede sem prazo trava justamente quem já usou o site.** Com rede pendurada (sinal fraco, Wi-Fi com portal, função da Vercel acordando), a navegação fica em branco até o navegador desistir, com uma cópia boa da página parada no cache. Para quem nunca abriu, não há service worker e o erro aparece rápido, então o problema parece ser "só no meu celular". O [sw.js](../pwa/public/sw.js) dá 4 segundos à rede e depois abre a cópia. Mexer nele pede o roteiro que coloca a rede em quatro estados (normal, pendurada, fora do ar, com 500).

**O service worker do `/` enxerga o `/staging` inteiro.** Enquanto o do staging não foi registrado, é o do `/` que atende as páginas de lá, com conta e histórico. Por isso ele não guarda nada do `/staging`, e o nome do cache muda (`prototipo-pwa-v2`, e assim por diante) sempre que for preciso apagar o que uma versão anterior guardou.

---

## Contas e avisos push

**Trocar as chaves VAPID desliga todos os aparelhos.** Apagar o documento `vapid` de `pwa_prototipo.configuracoes`, derrubar o banco do protótipo ou preencher `VAPID_*` com outro par faz os serviços de push responderem 401/403, e o despachante apaga as inscrições uma a uma, sem alarme nenhum. Cada pessoa precisa ativar os avisos de novo.

**`navigator.serviceWorker.ready` pode devolver o service worker errado.** O do chat `/` tem escopo no site inteiro, e o `ready` devolve o que controla a página *naquele momento*. Numa página do staging aberta antes de o service worker dela assumir, ele devolve o do `/`, e a inscrição de push vai para lá. O Google aceita todo envio (201), o celular recebe, e como o service worker do `/` não tem código de aviso, o Chrome mostra no lugar dele o genérico "Este site foi atualizado em segundo plano". Inscrever sempre no registro que o próprio `register('/staging/sw.js')` devolve. Pelo mesmo motivo, `getRegistration('/staging/')` cai no do `/` quando o do staging não existe: conferir o `scope` antes de confiar.

**No iPhone, push só existe no app da Tela de Início.** Numa aba do Safari o navegador nem oferece a permissão, e parece que o botão não faz nada. A tela de avisos detecta e explica, mas quem testa sem ler a frase conclui que "não funciona no iPhone".

**Na Vercel, os avisos ficam "Na fila" para sempre** se o container do Docker não estiver no ar: o relógio que envia só roda lá. Não há erro — o aviso só não sai, e vence.

**Documento de aviso com um campo de nome errado fica parado na fila.** Quem grava na fila por fora do dashboard precisa do formato exato de [notificacoes-push.md](notificacoes-push.md#a-fila); o despachante não reclama de documento que não reconhece, só não o encontra.

**O endereço de volta do Google não pode vir de `PWA_PUBLIC_URL`.** No Docker ela é `http://pwa:8080`, que só o n8n alcança. O login usa os cabeçalhos `x-forwarded-*`; se um proxy novo não os repassar, o Google responde `redirect_uri_mismatch` com um endereço interno.

**O cookie da conta vale para o site inteiro, inclusive o `/`.** Por isso a conversa só é ligada à conta com `comConta: true` explícito, e nunca por existir o cookie. Deduzir a conta do cookie faria alguém logado no staging que abrisse o `/` ter a conversa anônima gravada na conta.
