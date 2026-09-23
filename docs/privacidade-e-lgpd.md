# Privacidade e LGPD

O que o sistema guarda, por quanto tempo, quem alcança, e o que ainda depende de decisão da instituição.

Conversa de saúde é **dado pessoal sensível** (LGPD, Art. 11), o regime mais restritivo da lei. Vale para o texto que o cidadão escreve, não só para um diagnóstico formal: "estou com dor no peito há três dias" identifica e revela saúde ao mesmo tempo.

---

## Os dois canais guardam coisas diferentes

| | WhatsApp (canal) | Protótipo PWA |
|---|---|---|
| Conteúdo das mensagens | **Não é persistido** pelo gateway | **É gravado**, em `pwa_prototipo` |
| Log | Nunca registra o texto: só tamanho, ids e `correlationId` | não se aplica |
| Por quê | O canal só precisa entregar a mensagem | Validar a qualidade das respostas é o objetivo do protótipo |
| Consentimento | Ainda não existe fluxo próprio | Exigido antes da primeira pergunta, com data gravada |

O gateway também **mascara segredos no log**: falha de entrega ao n8n registra mensagem, código, status e URL, nunca os headers com o token.

> As execuções do n8n guardam pergunta e resposta enquanto existirem, nos dois canais. São podadas em 14 dias (`EXECUTIONS_DATA_MAX_AGE`, no compose).

---

## O que já está feito, no protótipo

- **Base legal: consentimento** (Art. 7º, I, e Art. 11, I). A conversa só começa depois de tocar em *Aceitar*, e a data do aceite, ou da recusa, fica gravada na sessão. Um aviso na tela vale menos, numa auditoria, que "esta conversa começou às 14h32, com aceite às 14h31".
- **Política publicada** em `/privacidade`, escrita para quem está no posto com o celular na mão: o que fica registrado, para que, quem mais recebe (Gemini do Google para gerar a resposta, MongoDB Atlas para guardar), por quanto tempo e como exercer os direitos. O prazo que ela mostra é lido do ambiente, então a página não promete número diferente do que o banco aplica.
- **Aviso antes da primeira pergunta**, com link para a política no topo da conversa, no menu e no painel de acessibilidade.
- **Prazo de retenção aplicado pelo banco.** As conversas se apagam sozinhas em `PWA_RETENCAO_DIAS` (180 por padrão), por índice TTL do Mongo. Prazo que depende de alguém lembrar de rodar um script não é prazo.
- **Exclusão a pedido, por duas portas.** A própria pessoa, no menu do chat (*Apagar minha conversa*), ou a equipe, pela transcrição em `/conversas`, para quem não tem mais a conversa no aparelho. A exclusão pela equipe fica registrada no histórico: quem apagou, quando e quantos registros, sem nenhum conteúdo.
- **Minimização no que não é texto.** Arquivo e áudio nunca saem do aparelho: fica registrado só o tipo, o tamanho e a duração da tentativa. O nome do arquivo não é guardado, porque "exame_maria_silva.pdf" é exatamente o dado que o aviso pede para ninguém mandar.
- **Acesso restrito.** As conversas só abrem para quem tem papel `admin` no dashboard, com login individual.

### A exclusão alcança as cópias

As perguntas que o chatbot não soube responder são **copiadas** para a curadoria (em `sugestoes_faq` e `curadoria_rodadas`, no banco das FAQs) justamente para sobreviverem ao fim do protótipo. Apagar só a conversa daria à pessoa a impressão de exclusão com o texto dela ainda guardado noutro lugar, então a exclusão vai até lá e troca esses textos por uma marca.

As cópias saem **primeiro**. Se a limpeza falhar no meio, a conversa continua existindo e o pedido pode ser repetido; na ordem inversa, sem a sessão não haveria como achar as cópias.

O que a exclusão **não** alcança, e por quê:

- A memória do agente no Redis, que expira sozinha em 1 hora.
- As execuções do n8n, que somem pela poda de 14 dias.
- A resposta crua do modelo numa rodada de curadoria é apagada **inteira**, e não só o trecho daquela pessoa: o texto do modelo pode repetir a pergunta com outras palavras, e não há como separar com segurança. Custa a auditoria daquela rodada, que é o preço certo diante de um pedido de exclusão.
- A pergunta reescrita pelo modelo numa sugestão fica: ela já não é a frase da pessoa, é o rascunho de uma FAQ.

---

## Contas e avisos, no `/staging`

Só existem na rota de validação: ver [contas-de-usuario.md](contas-de-usuario.md) e [notificacoes-push.md](notificacoes-push.md). O `/` continua sem conta.

| O que | Onde | Por quanto tempo |
|---|---|---|
| A conta: e-mail, nome opcional, hash da senha, id do Google, data do aceite | `usuarios` | **Até a pessoa apagar a conta**. Não há prazo automático |
| As sessões de login: o hash do token e o tipo de aparelho | `contas_sessoes` | 30 dias, por TTL |
| As conversas feitas com a conta | `sessoes`, `mensagens` | O mesmo `PWA_RETENCAO_DIAS` das anônimas |
| Os aparelhos com avisos ativados: endereço no serviço de push, chaves e tipo de aparelho | `inscricoes_push` | Até a pessoa desativar, o aparelho deixar de existir para o serviço (é removido no envio seguinte) ou a conta ser apagada |
| Os avisos: texto escrito pela equipe e os recibos de exibição e abertura | `notificacoes` | 90 dias depois de sair da fila, por TTL |

- **Base legal: o aceite no cadastro**, com data. Ele cobre as conversas da conta, e por isso o chat com conta não pede o aceite de novo. Pelo Google, o aceite está escrito ao lado do botão, e a data fica gravada na conta criada.
- **O aviso é dado de saúde sobre a pessoa**, mesmo escrito pela equipe: "sua coleta de sangue é amanhã" diz o que ela vai fazer. Por isso a tela bloqueada mostra só "Você tem um lembrete", e o texto aparece dentro do app, com a conta logada. Mostrar o texto na tela bloqueada é uma escolha explícita, por aviso, e o formulário explica o risco antes.
- **Quem mais recebe:**
  - Os **serviços de push** do Google, da Apple ou da Mozilla, conforme o navegador, entregam o aviso ao aparelho. O conteúdo vai cifrado de ponta a ponta até o aparelho (RFC 8291); o serviço vê só que houve uma entrega, quando e de que tamanho.
  - O **Google**, se a pessoa entrar com ele: fica sabendo que ela entrou neste app, e o app recebe o nome, o e-mail e o id da conta Google. Nada das conversas vai para o Google por esse caminho.
- **Na equipe**, `/conversas` mostra só que a conversa tem conta, nunca o e-mail. Os e-mails aparecem apenas em `/notificacoes`, para quem tem papel `admin` escolher quem recebe. O histórico registra quem agendou ou cancelou um aviso, o tipo e quantas pessoas, nunca o texto nem quem recebeu.
- **Apagar a conta** leva as conversas (com as cópias da curadoria, pelo mesmo caminho da exclusão de conversa), os avisos, os aparelhos e as sessões, e a conta por último.
- **Senha**: guardada só como hash `scrypt`. As sessões guardam o hash do token, nunca o token.

---

## O que depende da instituição

Estes não são itens técnicos, e nenhum código resolve:

- [ ] **Base legal para o serviço de verdade.** Consentimento serve a um teste com voluntários. Para um órgão público atendendo a população, a base costuma ser execução de política pública (Art. 11, II, "b").
- [ ] **Encarregado de dados (DPO)** designado. Quando houver, o contato vai em `PWA_CONTATO_PRIVACIDADE` e a página passa a mostrá-lo; hoje ela orienta a procurar a pessoa responsável pelo teste.
- [ ] **Política de privacidade oficial do órgão.** A página do protótipo descreve o protótipo; não substitui a política da instituição.
- [ ] **Opt-out no WhatsApp ("PARAR")** e exercício de direitos no canal. Hoje o canal não persiste conversa, o que reduz o problema, mas não o elimina: a Meta e o provedor guardam o que trafega.
- [ ] **Prazo de retenção definido pela área**, se for diferente dos 180 dias que o protótipo aplica hoje.
- [ ] **Prazo para contas inativas.** Hoje a conta só some quando a pessoa a apaga. Se contas e avisos saírem da validação, é preciso decidir depois de quanto tempo sem uso a conta é apagada, e avisar antes.
- [ ] **Uso de lembretes com dado de saúde.** Mandar lembrete de exame ou consulta por push é tratamento de dado sensível para uma finalidade nova, com operadores novos (os serviços de push). Precisa estar previsto na base legal e na política do serviço de verdade.

Ver também [caminho-para-producao.md](caminho-para-producao.md), que reúne o que precisa estar pronto antes de atender cidadãos de verdade.
