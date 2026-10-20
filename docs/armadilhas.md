# Armadilhas

Cada uma destas custou tempo, e quase todas **quebram em silêncio**: nada estoura, nenhum log acusa, e o sistema fica "funcionando" com o comportamento errado. Se algo estranho está acontecendo, comece por aqui.

---

## Configuração e banco

**URI do Mongo sem o nome do banco.** `mongodb+srv://…mongodb.net/?appName=x` faz o driver assumir `test`, e existe um `test.faq_medicamentos` com dois documentos de lixo nesse cluster. A aplicação sobe, conecta, mostra 2 FAQs em vez de ~2500 e **não dá erro**. Já derrubou o n8n e quase derrubou o dashboard, em ocasiões separadas. A URI precisa terminar em `/ministerio_saude?appName=…`.

**Modelo de embedding divergente entre os três lugares.** Ingestão, dashboard e nó do n8n precisam usar o mesmo modelo. Divergir não gera erro: a busca só devolve resultado ruim, porque pergunta e documentos caem em espaços vetoriais diferentes. Ver [base-de-faqs.md](base-de-faqs.md#a-regra-que-quebra-tudo-em-silêncio).

**Porta 5432 ocupada por Postgres nativo.** O container falha com *"socket forbidden"*, mensagem que não sugere conflito de porta. Troque `POSTGRES_HOST_PORT` no `.env` (ex.: `55432`).

**No Git Bash, `docker exec` recebe caminho do Windows.** `docker exec pwa node /app/teste.js` vira `C:/Program Files/Git/app/teste.js` antes de chegar ao container, e o erro é *"Cannot find module"* de um caminho que ninguém digitou. Rode com `MSYS_NO_PATHCONV=1` ou pelo PowerShell.

---

## WhatsApp e sessão

**Conflito de aparelhos apaga as credenciais.** Mais de uma sessão pendurada em "Aparelhos conectados" faz o WhatsApp derrubar uma com `Stream Errored (conflict)`. O gateway classifica como `loggedOut` e **apaga as credenciais**, exigindo QR novo. Sintoma: `CONNECTED` seguido de "Sessão desvinculada" em menos de um segundo. Desconecte todos os aparelhos antes de parear.

**O QR em ASCII não sai no log em produção.** O [baileys.provider.ts](../backend/src/channels/whatsapp/adapters/baileys/baileys.provider.ts) só desenha o ASCII quando `NODE_ENV` não é `production`, que é o padrão do compose. Baixe o PNG (ver [instalacao.md](instalacao.md#3-parear-o-whatsapp)).

**`curl --output` grava o erro como imagem.** Um 401 vira um `qr.png` de ~200 bytes que nenhum visualizador abre, e parece problema do visualizador. Confira o tamanho: alguns KB = QR real.

**`DELETE /api/v1/sessions/default` apaga as credenciais.** Não existe "reiniciar a sessão" por essa rota: o que ela faz é exigir QR novo.

**`phoneE164` e `pushName` vêm `null`.** O WhatsApp migrou para endereçamento LID (`…@lid`) e o número real não vem mais no evento. Não quebra nada (responder para o `@lid` funciona), mas qualquer código que dependa do telefone precisa saber disso.

---

## n8n

**`N8N_BLOCK_ENV_ACCESS_IN_NODE` bloqueia `$env` nos nós.** Com ele ligado (padrão do n8n), o fluxo executa, o agente responde, **gasta cota**, e a resposta morre no nó HTTP com URL e token vazios, sem erro visível no gateway. O compose já define `false`.

**Credencial salva pela tela pode não colar.** Aconteceu com o Header Auth: a tela dava como salva e o webhook continuava devolvendo 403. O caminho confiável é o CLI:

```powershell
docker compose exec -T n8n n8n import:credentials --input=/tmp/cred.json
```

**Importar workflow pelo CLI o desativa.** O `import:workflow` respeita o campo `active` do JSON, que vem `false`. Depois de importar é preciso `n8n publish:workflow --id=…` **e reiniciar o container** para a rota voltar a responder. Pela tela isso não acontece, e reiniciar o n8n derruba o WhatsApp por alguns segundos.

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

**Sobrecarga do Gemini derruba todos os canais de uma vez.** O Google responde 503 ("high demand") por minutos seguidos num modelo, e as 3 tentativas do agente caem todas dentro do pico. O chat mostra "Não consegui responder agora" para todo mundo. Os dois fluxos têm um modelo de reserva (`Gemini reserva`, ligado ao AI Agent com *Enable Fallback Model*). No `/`, a reserva é o `2.5-flash-lite`, de cota gratuita pequena: não trocar a ordem, senão a cota diária acaba antes do meio-dia. O staging não tem essa escolha (ver "Projeto Google novo não tem os modelos 2.5", abaixo). O painel faz o mesmo na curadoria e no relatório do dia (três tentativas e `GEMINI_TEXT_MODEL_RESERVA`, com o mesmo modelo como padrão), e o relatório grava qual modelo de fato respondeu. O agente aceita um modelo de reserva só, então a terceira camada do PWA (`gemini-3.5-flash-lite`) é um segundo agente na saída de erro do primeiro, depois do nó "Recuperar pergunta": sem ele, o segundo agente receberia o erro no lugar da pergunta, e a memória ficaria sem o id da conversa. O `3.5` vive sobrecarregado, por isso é a última tentativa e não a primeira.

**Reescrita quebrada não derruba o chat do staging, e por isso passa despercebida.** Os dois nós que chamam o Gemini, o principal e a reserva, seguem em frente quando falham (credencial `Gemini Reescrita` ausente, chave sem cota, prazo de 9 s cada), e a busca usa o texto original. O chat responde como o do `/`, e a validação mediria o fluxo sem reescrita achando que mede o com. A mensagem grava `reescritaFalhou`, e o painel mostra a pergunta entendida nos bastidores de cada resposta: conferir ali depois de importar o fluxo ou trocar a chave.

**Os avisos de etapa do staging dependem da posição dos nós no editor.** Na ordem de execução v1, quando um nó tem dois filhos, o n8n roda um ramo inteiro antes do outro, começando pelo de cima. O aviso só chega antes da etapa porque está posicionado acima dela. Arrastado para baixo, ele passa a rodar depois que a etapa e tudo que vem a seguir terminam, e a tela mostra a etapa errada, sem erro em lugar nenhum.

**O agente do n8n não tem prazo.** O nó de modelo de chat do Gemini não aceita prazo, e a biblioteca por baixo dele refaz a chamada sozinha a cada 503, esperando mais a cada vez; o nó do agente ainda tenta de novo por cima. Uma resposta levou 91 s numa etapa só. Quem precisa de prazo chama o Gemini por um nó HTTP, como a reescrita e o modo com limite de tempo do staging.

**A busca que falha, com "continuar", devolve a consulta, e não um erro.** Com `onError: continueRegularOutput`, o nó do vector store entrega o próprio item que recebeu, sem `document` e sem campo `error`. Procurar `error` deixava a falha passar como "nenhum trecho encontrado", e o modelo respondia sem a base. O "Montar contexto" do staging reconhece a falha pela forma do item; o teste dos nós de código usa essa forma, e não um `{ error }` inventado.

**Sem a `N8N_PWA_STAGING_WEBHOOK_URL` na Vercel, o `/staging` conversa pelo fluxo do `/`.** A variável vazia é o padrão seguro, e por isso nada avisa: a resposta chega, só que sem reescrita, e a continuação ("e qual o horário de lá?") volta como "não encontrei". O sinal é a mensagem do staging sem `perguntaCompleta`. Ligar exige a ordem certa: primeiro o fluxo de staging ativo no n8n (um `GET` em `/webhook/pwa-chat-staging` responde "not registered for GET requests", e não "not registered"), depois a variável e um novo deploy. Na ordem inversa, o webhook devolve 404 e a conversa do staging mostra erro para a equipe.

**O `Montar contexto` do staging sabe de qual consulta veio cada trecho pelo `pairedItem`.** O n8n liga cada saída da busca à consulta que a gerou, e é isso que faz o rodízio e o limite de 3 trechos por consulta extra funcionarem. Sem a ligação, o código conta por posição (10 trechos por consulta), o que só vale enquanto cada busca devolver exatamente 10. Ao trocar o nó de busca ou mudar o `topK`, conferir nos bastidores de uma resposta se a coluna da consulta bate com o assunto.

**Projeto Google novo não tem os modelos 2.5.** O `gemini-2.5-flash-lite` e o `gemini-2.5-flash` respondem 404 ("no longer available to new users") para a chave de um projeto criado depois que o Google os fechou, como a `_3` e a `_4`, e continuam aparecendo na lista de modelos dessa mesma chave. Num nó de reserva, o erro só aparece no dia em que o modelo principal cai, e aí as duas camadas falham juntas. O `/` (chave `_2`) e o painel (`GEMINI_API_KEY`, com `GEMINI_TEXT_MODEL_RESERVA` vazia caindo no `2.5-flash-lite`) funcionam porque as chaves são de projetos antigos. Trocar uma delas por chave nova exige trocar a reserva junto. Para conferir, chamar o modelo de reserva com a chave, e não só listar os modelos.

**Fluxo copiado herda as credenciais do original.** O staging nasceu como cópia do fluxo do `/` e ficou com a credencial `Gemini PWA` na resposta e nos embeddings. Testar o staging gastava a cota de quem conversa no `/`, sem nenhum erro que mostrasse isso. Ao copiar um fluxo, conferir a credencial de cada nó.

**O corte de nota fixo derruba a pergunta curta.** Frase curta ou abreviada tem nota menor mesmo quando a busca acerta: em "endereço nga", as cinco primeiras FAQs eram do NGA, todas perto de 0,78, abaixo do corte de 0,82, e o `/` respondeu "não encontrei" com a resposta na base. O corte não erra por ser alto, erra por medir a frase da pessoa. No staging, a reescrita põe a pergunta no estilo das FAQs antes de buscar, e a nota sobe. Antes de mexer no corte, medir com o teste de conversas: `--so-busca` mostra se a FAQ esperada chega ao contexto, sem gastar a cota da resposta.

**A base tem a mesma pergunta para 184 exames.** "Como me preparar para o Exame?", "Onde eu realizo a coleta do exame?" e "Para que serve o Exame?" se repetem em 551 FAQs, e o nome do exame só está no assunto. Numa busca sobre endoscopia com a frase da pessoa, 5 das 10 vagas iam para o preparo de outros exames, e o preparo muda de um exame para outro (glicose pede jejum de 8 a 12 horas; colesterol total não pede). No staging, a reescrita põe o nome do exame na consulta, e os casos de exame do teste acertam. Deixar uma vaga só para cada pergunta repetida foi medido e não mudou o resultado. Reescrever as 551 perguntas com o nome do exame resolveria na origem, inclusive no `/`, mas muda a busca do canal em uso: é decisão da equipe.

**A memória do agente guarda os trechos de cada turno.** O AI Agent salva no Redis a entrada inteira, e nos dois fluxos a entrada inclui o bloco de trechos. Na pergunta seguinte, o agente lê os trechos das perguntas anteriores, de outros assuntos, junto dos novos. Uma versão do staging sem o agente e sem a memória, com só o texto das últimas mensagens, foi medida junto com outras mudanças e inventou mais (ver [arquitetura.md](arquitetura.md#a-reescrita-em-validação-no-staging)). Antes de trocar o agente, medir.

**Sem temperatura definida, a mesma pergunta muda de resposta.** O nó do modelo com as opções vazias usa a temperatura padrão, e a mesma pergunta sobre o preparo da endoscopia recebeu "não encontrei" numa rodada e a resposta certa na outra, com a mesma busca. Comparar dois fluxos rodando cada um uma vez mede esse sorteio junto com a mudança. Por isso o teste de conversas guarda cada resposta em cache e só refaz o que mudou. Fixar temperatura 0 no staging foi medido e não melhorou o acerto.

---

## Dashboard

**pnpm 11 recusa rodar scripts com builds pendentes.** Migrations, seed e build falham com `ERR_PNPM_IGNORED_BUILDS`, mensagem que não menciona nenhum dos três comandos. A aprovação vive no `pnpm-workspace.yaml` (`allowBuilds`).

**O build do front tem Cloudflare Workers como alvo padrão.** O `@lovable.dev/vite-tanstack-config` fixa isso. Buildado sem ajuste, o `.output/server/index.mjs` sai como Worker: rodado com `node`, encerra na hora, código 0, sem log, e o container fica reiniciando em silêncio. O Dockerfile do front já define `NITRO_PRESET=node-server`. Ao publicar noutra plataforma, reavalie se o preset automático dela resolve.

**As duas formas de subir disputam as portas 3333 e 5173.** Container e `pnpm start:dev` não convivem.

**Tipo TypeScript derivado de lista num `@Prop` derruba o boot do Nest.** `type X = (typeof LISTA)[number]` num campo do schema compila, mas o Mongoose não consegue inferir o tipo em tempo de execução e o módulo recusa subir com *"Cannot determine a type for the … field"*. O `tsc` passa; só o teste do service ou o boot acusam. Declare `@Prop({ type: String })`.

**`$ne: null` numa expressão de agregação conta campo ausente como preenchido.** Em `$cond`, campo que não existe não é igual a `null`, e a contagem de "exibidas" contaria todo aviso antigo. Use `$gt: [campo, null]`.

**Limpar a sessão em qualquer erro tira da conta quem está trabalhando.** O `getSession` do front só pode apagar o cookie quando a API responde 401 ou 403. Tratando rede fora, 5xx ou API acordando como "sessão inválida", cada deploy do back e cada soneca do plano grátis mandava a equipe para o login, e o login batia na mesma API parada.

**A análise automática da curadoria para quando o painel dorme.** O relógio que confere a fila roda dentro do back, e o plano gratuito do Render desliga o serviço sem visita. Nada avisa: a fila só cresce até alguém abrir o painel, e aí a análise sai. Se ela precisar rodar sem ninguém entrar, o caminho é um ping externo no painel ou um plano que não dorme. Rodar o back localmente contra o banco de produção também dispara a análise sobre a fila real; na verificação local, use `CURADORIA_AUTOMATICA=0`.

**O PDF do painel falha com "unsupported number" em documento grande.** A biblioteca (`@react-pdf/renderer`) erra a conta de layout com `gap` combinado com largura em porcentagem, e com uma tabela de cabeçalho fixo dentro de um bloco que quebra de página. Com pouco conteúdo o PDF sai; com um dia inteiro de perguntas, não sai nada. O [relatorio-pdf.tsx](../Dashboard-PetSaude/front/src/lib/pdf/relatorio-pdf.tsx) usa largura em pontos e margem no lugar de `gap`, e cada tabela longa numa `<Page>` própria.

**Texto com `render` sai em branco no PDF.** É o jeito documentado de escrever "Página 2 de 5", e nesta versão da biblioteca ele simplesmente não aparece, sem erro. O rodapé é texto fixo comum. Ao atualizar a biblioteca, conferir extraindo o texto do PDF gerado: olhando o código, parece funcionar.

**Aba aberta antes de um deploy pede arquivos que não existem mais.** Os arquivos de cada tela mudam de nome a cada build. O [versao-nova.ts](../Dashboard-PetSaude/front/src/lib/versao-nova.ts) recarrega a página quando isso acontece. Para testar localmente, reconstruir só o front (`docker compose up -d --build --no-deps dashboard-front`), em navegador sem cache: sem `--no-deps` a API reinicia junto, e com cache o arquivo antigo vem dele e a falha não aparece.

---

## Protótipo PWA

**`output: 'standalone'` derruba o build na Vercel.** Ele é obrigatório para a imagem Docker não passar de 1 GB, e proibido na Vercel: o build de lá termina com um passo próprio que procura arquivos de rastreio que o modo standalone não produz. O erro é

```
ENOENT: no such file or directory, open '.next/next-server.js.nft.json'
```

Ele não menciona `output` nem `standalone`, e leva a procurar no lugar errado. O [next.config.ts](../pwa/next.config.ts) resolve com `process.env.VERCEL ? undefined : 'standalone'`. É a mesma família da armadilha do `NITRO_PRESET` acima: o alvo do build precisa diferir entre o Docker e a plataforma.

**`HOSTNAME=0.0.0.0` no Dockerfile não é decorativo.** O servidor gerado pelo `output: standalone` escuta só em `localhost` *dentro* do container; sem a variável, a porta publicada responde *connection refused* e o container parece saudável.

**Ordenar a conversa só por data põe a resposta antes da pergunta.** A resposta do bot nasce pendente no mesmo milissegundo da pergunta, e com `sort({ em: 1 })` o banco escolhe a ordem do empate. Aconteceu nas conversas do primeiro teste de campo, na conversa reaberta e na transcrição do painel. Toda leitura de transcrição usa `ORDEM_DA_CONVERSA` (`{ em: 1, papel: -1 }`, de [db.ts](../pwa/src/lib/db.ts)); o painel usa a mesma ordem, e o relatório do dia pareia pelo `correlationId`.

**Um `data:` URI de SVG não enxerga as variáveis CSS da página.** O padrão de fundo do chat é renderizado em contexto isolado, por isso a cor do traço está fixa dentro do SVG e o tema escuro troca a imagem inteira. Usar `var(--x)` ali dentro faz o fundo sumir, sem erro no console.

**`PWA_PUBLIC_URL` precisa ser alcançável pelo container do n8n.** É o endereço para onde o fluxo devolve a resposta pronta. Deduzi-lo do cabeçalho `Host` não funciona: `localhost` dentro do n8n é o próprio n8n, e a resposta morre com `ECONNREFUSED`. No Docker, `http://pwa:8080`.

**O limite de mensagens tem dois tetos, e o baixo é o da conversa.** São 30 mensagens por conversa e 300 por IP a cada 10 minutos. O acidente que gasta a cota (aba segurando F5) acontece dentro de uma conversa só. Num teste presencial a turma inteira sai pelo mesmo IP do Wi-Fi, e um teto baixo por IP travava o chat para todos: com o antigo, de 40, vinte pessoas mandavam duas perguntas cada. Os valores estão em `pwa/src/lib/limite.ts`.

**Instalar como aplicativo exige HTTPS.** Por IP da rede local o chat funciona, mas o navegador recusa registrar o service worker e o "Adicionar à tela de início" não aparece. Não é defeito do protótipo.

**Service worker que espera a rede sem prazo trava justamente quem já usou o site.** Com rede pendurada (sinal fraco, Wi-Fi com portal, função da Vercel acordando), a navegação fica em branco até o navegador desistir, com uma cópia boa da página parada no cache. Para quem nunca abriu, não há service worker e o erro aparece rápido, então o problema parece ser "só no meu celular". O [sw.js](../pwa/public/sw.js) dá 4 segundos à rede e depois abre a cópia. Mexer nele pede o roteiro que coloca a rede em quatro estados (normal, pendurada, fora do ar, com 500).

**O ditado não existe em todo navegador, e no Chrome precisa de internet.** O Firefox não tem reconhecimento de voz, e alguns apps instalados na Tela de Início do iPhone também não. No Chrome o áudio vai para o serviço do Google, e sem rede o erro é `network`, não "sem microfone". A tela trata os três casos com frase própria ([usar-ditado.ts](../pwa/src/lib/usar-ditado.ts)); quem testa só no Chrome do computador não vê nenhum deles.

**A lista de vozes chega vazia na primeira chamada.** No Chrome, `speechSynthesis.getVoices()` devolve `[]` até o evento `voiceschanged`, e o código que confia na primeira resposta conclui que o aparelho não tem voz em português. O [leitura-em-voz.ts](../pwa/src/lib/leitura-em-voz.ts) espera o evento antes de desistir.

**O service worker do `/` enxerga o `/staging` inteiro.** Enquanto o do staging não foi registrado, é o do `/` que atende as páginas de lá, com conta e histórico. Por isso ele não guarda nada do `/staging`, e o nome do cache muda (`prototipo-pwa-v2`, e assim por diante) sempre que for preciso apagar o que uma versão anterior guardou.

**O modelo de fala lê a instrução de estilo em voz alta.** "Leia com voz calma: ..." sai falado junto com a resposta, em português ou em inglês, nos dois modelos de fala testados, e o lite recusa o `systemInstruction`. Para a voz natural vai só o texto. A calma vem da voz escolhida e da velocidade, aplicada pelo navegador (`playbackRate`). Ao trocar de modelo, transcrever uma amostra com o Gemini mostra se ele voltou a ler a instrução.

**A cota gratuita da fala é de 10 por dia, e o 429 também vem do minuto.** O id da violação diz qual é (`...PerDay...` ou `...PerMinute...`). Tratar todo 429 como "acabou por hoje" desligaria a voz natural o dia inteiro depois de um pico. O [voz-ia.ts](../pwa/src/lib/voz-ia.ts) só marca o dia como esgotado quando a violação é diária, e marca a combinação de chave e modelo, e não a chave inteira. Testar a voz gasta essa cota: as amostras de Acessibilidade são arquivos fixos por isso.

**Sem `media-src blob:` na CSP, o áudio não toca e nada avisa.** A gravação e a voz natural tocam de um endereço `blob:` criado pela página. Com a política sem essa linha, o tocador fica em 0:00 e o play não faz nada; o motivo só aparece no console do navegador ([next.config.ts](../pwa/next.config.ts)).

**Camada que fecha pela tela precisa tirar a entrada do histórico.** O voltar do celular só fecha menu e painel porque cada abertura põe uma entrada (`pushState`). Fechar pelo botão sem o `history.back()` correspondente deixa uma entrada a mais, e o próximo voltar não faz nada que a pessoa veja. A pilha de [camadas.ts](../pwa/src/lib/camadas.ts) cuida disso e de duas pegadinhas: trocar o menu pelo painel no mesmo toque não pode voltar e empilhar ao mesmo tempo (a ordem entre os dois muda de navegador para navegador), e um link de dentro da camada não pode voltar depois de navegar, senão desfaz a navegação. E `queueMicrotask` passado como método de objeto quebra com "Illegal invocation".

**Áudio que ainda está chegando toca junto com o novo.** A voz natural leva alguns segundos para ser gerada. Parar "o que está tocando" ao dar play em outro não alcança o que ainda está chegando: ele termina de carregar e começa por cima. Em [som-unico.ts](../pwa/src/lib/som-unico.ts), a vez é um número, e o áudio confere `aindaEAVez` depois do `await`, antes de tocar.

**No plano gratuito, o Gemini fica lento e recusa por sobrecarga em certas horas do dia.** A mesma reescrita que leva de 1 a 5 s pela manhã chegou a 10 a 25 s à tarde (horário comercial dos Estados Unidos), com 503 "high demand" no meio, em todos os modelos lite ao mesmo tempo. A reserva da reescrita cobre o 503 rápido de um modelo só; com os dois congestionados, a reescrita falha (`reescritaFalhou`) e a busca segue com o texto original. Antes de concluir que uma mudança piorou o fluxo, comparar a hora do teste e o `reescritaMs`.

**A voz natural em PCM não cabe na resposta da Vercel.** O Gemini devolve PCM de 24 kHz, e a resposta mais longa da base daria mais de 7 MB, acima do limite de 4,5 MB de corpo das funções. A rota converte para MP3 de 48 kbps (cerca de 300 KB numa resposta típica), o que também ajuda quem está no 4G.

---

## Contas e avisos push

**Trocar as chaves VAPID desliga todos os aparelhos.** Apagar o documento `vapid` de `pwa_prototipo.configuracoes`, derrubar o banco do protótipo ou preencher `VAPID_*` com outro par faz os serviços de push responderem 401/403, e o despachante apaga as inscrições uma a uma, sem alarme nenhum. Cada pessoa precisa ativar os avisos de novo.

**`navigator.serviceWorker.ready` pode devolver o service worker errado.** O do chat `/` tem escopo no site inteiro, e o `ready` devolve o que controla a página *naquele momento*. Numa página do staging aberta antes de o service worker dela assumir, ele devolve o do `/`, e a inscrição de push vai para lá. O Google aceita todo envio (201), o celular recebe, e como o service worker do `/` não tem código de aviso, o Chrome mostra no lugar dele o genérico "Este site foi atualizado em segundo plano". Inscrever sempre no registro que o próprio `register('/staging/sw.js')` devolve. Pelo mesmo motivo, `getRegistration('/staging/')` cai no do `/` quando o do staging não existe: conferir o `scope` antes de confiar.

**No iPhone, push só existe no app da Tela de Início.** Numa aba do Safari o navegador nem oferece a permissão, e parece que o botão não faz nada. A tela de avisos detecta e explica, mas quem testa sem ler a frase conclui que "não funciona no iPhone".

**Na Vercel, os avisos ficam "Na fila" para sempre** se o container do Docker não estiver no ar: o relógio que envia só roda lá. Não há erro: o aviso só não sai, e vence.

**Documento de aviso com um campo de nome errado fica parado na fila.** Quem grava na fila por fora do dashboard precisa do formato exato de [notificacoes-push.md](notificacoes-push.md#a-fila); o despachante não reclama de documento que não reconhece, só não o encontra. Para aviso automático, use um gatilho ([gatilhos-de-avisos.md](gatilhos-de-avisos.md)), que monta o documento pelo mesmo código.

**Gatilho ligado pela primeira vez olha para trás.** Na primeira rodada não há `ultimaExecucao`, e um gatilho que não limita o período manda aviso sobre tudo que já aconteceu. Ligue sempre com `GATILHOS_ENSAIO=1` antes e confira o número em `gatilhos_execucoes`.

**O endereço de volta do Google não pode vir de `PWA_PUBLIC_URL`.** No Docker ela é `http://pwa:8080`, que só o n8n alcança. O login usa os cabeçalhos `x-forwarded-*`; se um proxy novo não os repassar, o Google responde `redirect_uri_mismatch` com um endereço interno.

**O cookie da conta vale para o site inteiro, inclusive o `/`.** Por isso a conversa só é ligada à conta com `comConta: true` explícito, e nunca por existir o cookie. Deduzir a conta do cookie faria alguém logado no staging que abrisse o `/` ter a conversa anônima gravada na conta.
