# Contas de usuário

Contas de pessoas no chat, para que o histórico e os avisos pertençam a alguém e não a um aparelho. Existem **só em `/staging`**, a rota de validação do protótipo PWA. O `/`, que está em teste de campo, continua anônimo e não mudou em nada.

Os avisos que dependem da conta estão em [notificacoes-push.md](notificacoes-push.md).

---

## O `/staging`

Não é outro ambiente: é o **mesmo app, no mesmo deploy, com os mesmos bancos**. As FAQs são as mesmas, e as conversas feitas com conta caem em `pwa_prototipo.sessoes` e `mensagens`, junto das anônimas: aparecem em `/conversas` no dashboard e alimentam a curadoria como as demais.

O que o separa do `/`:

- Todas as páginas moram em [pwa/src/app/staging/](../pwa/src/app/staging/). Levar para o `/` depois é mover a pasta.
- Nenhum link do `/` leva até ele, e as páginas têm `noindex`. Uma faixa no topo diz que é ambiente de testes.
- Manifest e service worker próprios, com escopo `/staging/`: ver [notificacoes-push.md](notificacoes-push.md#isolamento-do-).
- As APIs têm nome de domínio (`/api/conta`, `/api/push`, `/api/notificacoes`), e não de staging, porque os dados já são os definitivos.

| Página | O que faz |
|---|---|
| `/staging/entrar` | Entrar e criar conta, na mesma tela, em duas abas |
| `/staging` | O chat, ligado à conta |
| `/staging/conta` | Dados da conta, conversas anteriores, sair e apagar a conta |
| `/staging/conversas/:id` | Uma conversa anterior, só leitura |
| `/staging/avisos` | Ativar os avisos no aparelho e ver os recebidos |

---

## Conta com e-mail e senha

Funciona sem nenhuma variável nova.

- **Coleção `usuarios`**: e-mail como digitado e normalizado (único), se o e-mail foi provado, hash da senha, id do Google, nome opcional, data do aceite e da criação.
- **Senha**: `scrypt` nativo do Node, N = 2¹⁵, r = 8, p = 1, salt de 16 bytes por conta, gravado como `scrypt$N$r$p$salt$hash`. Os parâmetros ficam junto do hash, então dá para aumentá-los depois sem invalidar as senhas existentes. Entre 8 e 200 caracteres.
- **Sem enumeração de contas**: erro de login é sempre "E-mail ou senha incorretos", o scrypt roda mesmo quando o e-mail não existe (contra um hash descartável), e o cadastro com e-mail repetido não confirma que a conta existe.
- **Limites de tentativa**, contados no Mongo: cadastro, 10 por hora por IP; login, 30 por IP e 10 por e-mail a cada 15 minutos; volta do Google, 30 por IP a cada 15 minutos.
- **Aceite dos termos no cadastro**, com data. É a base legal para guardar as conversas da conta, sem ele a conta não nasce, e por isso o chat com conta não repete o pedido de aceite.

Não existe envio de e-mail no projeto. Por isso uma conta de senha tem `emailVerificado: false`: ninguém provou que quem a criou é o dono do endereço. Isso importa no [vínculo com o Google](#vínculo-com-conta-de-senha).

### Sessão

- Token aleatório de 32 bytes no cookie `pwa_conta`: `HttpOnly`, `SameSite=Lax` e `Secure` quando a requisição veio por HTTPS.
- No banco, em `contas_sessoes`, fica só o **SHA-256** do token, com TTL de 30 dias. Quem ler o banco não consegue entrar na conta de ninguém.
- `Secure` só por HTTPS, e não sempre: com ele fixo, o teste pelo IP da rede local (`http://192.168…:8080`) aceitaria a senha e esqueceria o login na tela seguinte, sem erro.
- Rotas que mudam algo conferem o cabeçalho `Origin`, além do `SameSite`.

### Rotas

| Rota | O que faz |
|---|---|
| `POST /api/conta/cadastro` | Cria a conta e já abre a sessão |
| `POST /api/conta/entrar` | Abre a sessão |
| `POST /api/conta/sair` | Encerra a sessão deste aparelho |
| `GET /api/conta` | A conta logada |
| `DELETE /api/conta` | Apaga a conta e tudo dela |
| `GET /api/conta/conversas` | As conversas da conta |
| `GET /api/conta/google` e `/retorno` | Login com Google |

---

## O chat com conta

`/staging` usa o mesmo componente de conversa do `/` ([pwa/src/components/Conversa.tsx](../pwa/src/components/Conversa.tsx)), com `modo="conta"`. As diferenças são todas decididas por esse modo:

- A conversa aberta é **retomada do servidor**, em qualquer aparelho, e não do `localStorage`.
- `POST /api/sessoes` com `comConta: true` cria a sessão com `usuarioId` e sem chave. Sessão com `usuarioId` só abre com o cookie da própria conta: a chave não vale para ela.
- **O `/` segue exatamente o caminho de antes.** A conta nunca é deduzida do cookie: só `comConta: true` explícito liga uma conversa a ela. Sem isso, alguém logado no staging que abrisse o `/` no mesmo navegador teria a conversa anônima gravada na conta.

O menu ⋮ do chat com conta ganha **Avisos**, **Minha conta** e **Sair da conta**: a saída fica onde a pessoa está, e não só dentro de outra tela, porque o aparelho pode ser emprestado.

No dashboard, `/conversas` mostra só um selo **"com conta"**, nunca o e-mail: quem analisa respostas não precisa saber de quem é o relato de saúde.

### Apagar a conta

Em `/staging/conta`, com confirmação em dois passos. Apaga, nesta ordem:

1. Cada conversa da conta, pelo mesmo `apagarConversa` do chat, que também troca as cópias das perguntas guardadas pela curadoria por uma marca.
2. Os avisos, os aparelhos inscritos e as sessões.
3. A conta, por último. Se algo falhar no meio, a pessoa continua logada e pode pedir de novo.

---

## Entrar com Google

O código está pronto e **desligado até haver credencial**: sem `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`, o botão não aparece e as rotas respondem como indisponíveis.

### O fluxo

Authorization code com PKCE e nonce, escrito à mão em [pwa/src/lib/conta/google.ts](../pwa/src/lib/conta/google.ts), sem NextAuth: uma biblioteca traria um modelo próprio de sessão e de usuário que brigaria com o que já existe.

1. `GET /api/conta/google` gera `state`, verificador PKCE e `nonce`, guarda os três num cookie de 10 minutos restrito a `/api/conta/google`, e manda para o Google pedindo `openid email profile` e a escolha de conta. Entrar e criar conta são o mesmo botão: quem ainda não tem conta ganha uma na volta.
2. O Google devolve em `GET /api/conta/google/retorno`. O `state` precisa bater com o do cookie.
3. O código é trocado pelo `id_token` direto no endpoint de token do Google, com uma segunda tentativa quando a chamada não completa: a primeira saída HTTPS de um container recém-criado falha de vez em quando, e isso virava "não foi possível entrar" sem nada de errado com a credencial. Como o token chega por TLS, em resposta a um código que só este servidor podia trocar, a assinatura não é conferida (OpenID Connect Core, 3.1.3.7); **emissor, audiência, validade e nonce são**, e o e-mail precisa estar verificado no Google.
4. As regras de vínculo decidem, e a sessão abre no mesmo cookie `pwa_conta` do login por senha.

Todo desfecho volta para `/staging/entrar?google=<motivo>`, com uma frase que diz o que fazer. O detalhe técnico vai só para o log do container, sem e-mail.

O endereço de volta é montado dos cabeçalhos `x-forwarded-host` e `x-forwarded-proto`, **não** de `PWA_PUBLIC_URL`: no Docker ela vale `http://pwa:8080`, o endereço interno que o n8n usa, e o Google mandaria a pessoa para um lugar que o celular não alcança.

### Vínculo com conta de senha

[pwa/src/lib/conta/vinculo.ts](../pwa/src/lib/conta/vinculo.ts), função pura, com testes:

1. **Já existe conta com esse Google** (pelo `sub`, que nunca muda; o e-mail a pessoa pode trocar lá) → entra.
2. **Existe conta de senha com o mesmo e-mail** → vincula e marca o e-mail como verificado.
   - Se o e-mail dessa conta **nunca tinha sido provado**, o vínculo **apaga a senha e derruba todas as sessões abertas**. Sem isso, alguém que cadastrou antes o e-mail de outra pessoa continuaria entrando pela senha na conta que o dono de verdade passou a usar pelo Google, lendo as conversas e os avisos de saúde dele. O dono não perde nada: continua entrando pelo Google.
   - Se a conta já está ligada a **outro** Google → recusa.
3. **Não existe conta** → cria. O aceite dos termos está escrito ao lado do botão do Google, e a data dele fica gravada na conta: é a base legal para guardar as conversas. Obrigar a marcar uma caixa antes de um botão que também serve para entrar deixava o fluxo confuso: quem já tinha conta não sabia em qual aba tocar.

### Criar a credencial

No [Google Cloud Console](https://console.cloud.google.com/), num projeto só para isso (não precisa de faturamento):

1. **Google Auth Platform → Branding**: nome do app ("Assistente de Saúde"), e-mail de suporte e contato do desenvolvedor. Em **Authorized domains**, o domínio próprio pelo qual o chat é acessado, como o do túnel. Sem logo: logo exige verificação da marca pelo Google.
2. **Audience**: *External*. Em modo **Testing**, só entram até 100 contas cadastradas em *Test users*. Para qualquer pessoa entrar, **Publish app**. Os escopos `openid`, `email` e `profile` não exigem verificação.
3. **Clients → Create client → Web application**. Em **Authorized redirect URIs**, um por endereço pelo qual o chat é aberto:

   ```
   https://<domínio-da-vercel>/api/conta/google/retorno
   https://<hostname-do-túnel>/api/conta/google/retorno
   http://localhost:8080/api/conta/google/retorno
   ```

   *Authorized JavaScript origins* não é necessário: a troca do código acontece no servidor.
4. Copie o **Client ID** e o **Client secret** para o `.env`:

   ```ini
   GOOGLE_CLIENT_ID=<...>.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=<...>
   ```

   e recrie o container com `docker compose up -d pwa` (e não `restart`, porque a variável entra na criação). Na Vercel, as mesmas duas variáveis e um novo deploy.
5. Abra `/staging/entrar`: o botão **Entrar com Google** aparece.

Pelo IP da rede local não há login com Google: o Google não aceita endereço de volta `http://` com IP privado. O login por senha continua funcionando.

### Quando não funciona

| Sintoma | Causa |
|---|---|
| O Google mostra `redirect_uri_mismatch` | O endereço de volta não está cadastrado **exatamente** igual. O detalhe do erro mostra o endereço que chegou; cadastre esse. Se ele vier com `http://pwa:8080`, o proxy não está repassando `x-forwarded-host` |
| O Google mostra "acesso bloqueado" ou "app não verificado" | O app está em *Testing* e a conta não está em *Test users* |
| Volta com "O login demorou demais ou foi aberto em outra aba" | O cookie do fluxo não voltou: mais de 10 minutos, outra aba, ou o navegador de outro aplicativo bloqueando cookies |
| Volta com "Não foi possível entrar com o Google agora" | O log do container diz o motivo (`[conta/google] erro: …`). `invalid_client` é Client ID ou secret errado |
| Volta com "O Google ainda não confirmou este e-mail" | A conta Google tem e-mail não verificado; a pessoa pode criar a conta por senha |
