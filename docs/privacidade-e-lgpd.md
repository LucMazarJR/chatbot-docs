# Privacidade e LGPD

O que o sistema guarda, por quanto tempo, quem alcança, e o que ainda depende de decisão da instituição.

Conversa de saúde é **dado pessoal sensível** (LGPD, Art. 11) — o regime mais restritivo da lei. Vale para o texto que o cidadão escreve, não só para um diagnóstico formal: "estou com dor no peito há três dias" identifica e revela saúde ao mesmo tempo.

---

## Os dois canais guardam coisas diferentes

| | WhatsApp (canal) | Protótipo PWA |
|---|---|---|
| Conteúdo das mensagens | **Não é persistido** pelo gateway | **É gravado**, em `pwa_prototipo` |
| Log | Nunca registra o texto — só tamanho, ids e `correlationId` | — |
| Por quê | O canal só precisa entregar a mensagem | Validar a qualidade das respostas é o objetivo do protótipo |
| Consentimento | Ainda não existe fluxo próprio | Exigido antes da primeira pergunta, com data gravada |

O gateway também **mascara segredos no log**: falha de entrega ao n8n registra mensagem, código, status e URL — nunca os headers com o token.

> As execuções do n8n guardam pergunta e resposta enquanto existirem, nos dois canais. São podadas em 14 dias (`EXECUTIONS_DATA_MAX_AGE`, no compose).

---

## O que já está feito, no protótipo

- **Base legal: consentimento** (Art. 7º, I, e Art. 11, I). A conversa só começa depois de tocar em *Aceitar*, e a data do aceite — ou da recusa — fica gravada na sessão. Um aviso na tela vale menos, numa auditoria, que "esta conversa começou às 14h32, com aceite às 14h31".
- **Política publicada** em `/privacidade`, escrita para quem está no posto com o celular na mão: o que fica registrado, para que, quem mais recebe (Gemini do Google para gerar a resposta, MongoDB Atlas para guardar), por quanto tempo e como exercer os direitos. O prazo que ela mostra é lido do ambiente, então a página não promete número diferente do que o banco aplica.
- **Aviso antes da primeira pergunta**, com link para a política no topo da conversa, no menu e no painel de acessibilidade.
- **Prazo de retenção aplicado pelo banco.** As conversas se apagam sozinhas em `PWA_RETENCAO_DIAS` (180 por padrão), por índice TTL do Mongo. Prazo que depende de alguém lembrar de rodar um script não é prazo.
- **Exclusão a pedido, por duas portas.** A própria pessoa, no menu do chat (*Apagar minha conversa*), ou a equipe, pela transcrição em `/conversas`, para quem não tem mais a conversa no aparelho. A exclusão pela equipe fica registrada no histórico — quem apagou, quando e quantos registros, sem nenhum conteúdo.
- **Minimização no que não é texto.** Arquivo e áudio nunca saem do aparelho: fica registrado só o tipo, o tamanho e a duração da tentativa. O nome do arquivo não é guardado, porque "exame_maria_silva.pdf" é exatamente o dado que o aviso pede para ninguém mandar.
- **Acesso restrito.** As conversas só abrem para quem tem papel `admin` no dashboard, com login individual.

### A exclusão alcança as cópias

As perguntas que o chatbot não soube responder são **copiadas** para a curadoria — em `sugestoes_faq` e `curadoria_rodadas`, no banco das FAQs — justamente para sobreviverem ao fim do protótipo. Apagar só a conversa daria à pessoa a impressão de exclusão com o texto dela ainda guardado noutro lugar, então a exclusão vai até lá e troca esses textos por uma marca.

As cópias saem **primeiro**. Se a limpeza falhar no meio, a conversa continua existindo e o pedido pode ser repetido; na ordem inversa, sem a sessão não haveria como achar as cópias.

O que a exclusão **não** alcança, e por quê:

- A memória do agente no Redis — expira sozinha em 1 hora.
- As execuções do n8n — somem pela poda de 14 dias.
- A resposta crua do modelo numa rodada de curadoria é apagada **inteira**, e não só o trecho daquela pessoa: o texto do modelo pode repetir a pergunta com outras palavras, e não há como separar com segurança. Custa a auditoria daquela rodada, que é o preço certo diante de um pedido de exclusão.
- A pergunta reescrita pelo modelo numa sugestão fica: ela já não é a frase da pessoa, é o rascunho de uma FAQ.

---

## O que depende da instituição

Estes não são itens técnicos — nenhum código resolve:

- [ ] **Base legal para o serviço de verdade.** Consentimento serve a um teste com voluntários. Para um órgão público atendendo a população, a base costuma ser execução de política pública (Art. 11, II, "b").
- [ ] **Encarregado de dados (DPO)** designado. Quando houver, o contato vai em `PWA_CONTATO_PRIVACIDADE` e a página passa a mostrá-lo; hoje ela orienta a procurar a pessoa responsável pelo teste.
- [ ] **Política de privacidade oficial do órgão.** A página do protótipo descreve o protótipo; não substitui a política da instituição.
- [ ] **Opt-out no WhatsApp ("PARAR")** e exercício de direitos no canal. Hoje o canal não persiste conversa, o que reduz o problema, mas não o elimina — a Meta e o provedor guardam o que trafega.
- [ ] **Prazo de retenção definido pela área**, se for diferente dos 180 dias que o protótipo aplica hoje.

Ver também [caminho-para-producao.md](caminho-para-producao.md), que reúne o que precisa estar pronto antes de atender cidadãos de verdade.
