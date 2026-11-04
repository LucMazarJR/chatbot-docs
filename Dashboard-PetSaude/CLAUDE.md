# Como trabalhar no dashboard

Valem as regras de trabalho do repositório que hospeda este aqui, em `chatbot-docs/CLAUDE.md`: commits pequenos numa branch por funcionalidade, padrão de aplicação profissional, UX conferida na tela de verdade, escrita sem marcadores de IA (nada de travessão), verificação contra o ambiente real e privacidade no conteúdo escrito por cidadão.

O que é específico daqui:

## Antes de mexer

O painel é a ferramenta de trabalho da equipe, e grava na mesma base de FAQs que o chatbot lê. Mudança aqui se verifica antes do push, com login de verdade nos três papéis quando a tela muda.

## Estrutura que precisa ser respeitada

* **Três bancos, com donos claros.** Mongo `ministerio_saude` para as FAQs, Postgres para identidade, e a segunda conexão Mongo (`CONEXAO_PROTOTIPO`) para o banco do protótipo PWA. Nenhum service mistura os dois primeiros.
* **Tela nova é uma linha** em `front/src/lib/navegacao.ts`, mais a rota com a guarda no `beforeLoad` e o conteúdo dentro de `GateShell`. Ver `front/src/routes/README.md`.
* **Coisa em validação entra com `emTeste: true`**, que mostra o selo "teste" no menu. Promover é apagar essa linha.
* **Toda escrita registra auditoria** pelo `ActivityService`, com quem, o quê e o alcance, nunca com conteúdo escrito por cidadão.
* O que o PWA escreve é contrato: os schemas daqui espelham `pwa/src/lib/**`, e mudar um lado exige mudar o outro na mesma alteração.

## Armadilhas daqui

* `@Prop` com tipo derivado de lista (`(typeof LISTA)[number]`) compila e derruba o boot do Nest. Declarar `@Prop({ type: String })`.
* Em agregação, `$ne: null` conta campo ausente como preenchido. Usar `$gt: [campo, null]`.
* Vários `Select` ou diálogo do Radix irmãos na mesma tela travam o clique da página inteira. Um diálogo por tela, montado sob demanda (ver o comentário em `front/src/routes/usuarios.tsx`).
* O back usa indentação de quatro espaços, que o Prettier configurado não aprova. Seguir o arquivo ao redor e não reformatar o que não foi tocado.

## Comandos

```powershell
cd back;  npx jest; npx tsc --noEmit -p tsconfig.json
cd front; npx tsc --noEmit; npx vite build; npx eslint src/<arquivo>
```

O front novo pode chamar rota que só o back novo tem: publicar o back primeiro. Onde cada parte está publicada fica no [README](README.md#hospedagem-e-produção-links).

Este arquivo guarda só regra de trabalho. Estado do momento vai para o README ou para `chatbot-docs/docs/`, e regra que deixou de valer é corrigida no mesmo commit da mudança que a invalidou.
