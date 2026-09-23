# Como trabalhar no dashboard

Valem as regras de trabalho do repositório que hospeda este aqui, em `chatbot-docs/CLAUDE.md`: commits pequenos na main, padrão de aplicação profissional, UX conferida na tela de verdade, escrita sem marcadores de IA (nada de travessão), verificação contra o ambiente real e privacidade no conteúdo escrito por cidadão.

O que é específico daqui:

## Antes de mexer

Este painel é a única parte do projeto que a equipe usa todo dia, e ele grava na mesma base de FAQs que o chatbot lê. Mudança aqui se verifica antes do push, com login de verdade nos três papéis quando a tela muda.

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

Front publicado na Vercel, back no Render. Os dois saem do `main`, e o front novo depende do back novo: publicar o back primeiro.
