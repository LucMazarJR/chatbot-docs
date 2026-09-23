# Como trabalhar neste projeto

Regras de trabalho, não de arquitetura. A arquitetura está em [docs/](docs/), começando por [docs/arquitetura.md](docs/arquitetura.md), e o que quebra em silêncio está em [docs/armadilhas.md](docs/armadilhas.md).

## Idioma

Tudo em português do Brasil: as respostas ao usuário durante o trabalho, os resumos, as mensagens de commit, os comentários, a documentação e o texto de tela.

## Commits pequenos, na main

Commitar por partes ao longo do trabalho, e não um commit gigante no fim. Cada commit precisa compilar e passar nos testes sozinho. Sem criar branch.

A mensagem diz o **porquê**, em português, e não só o que mudou. Sem o trailer `Co-Authored-By`.

Push só depois de garantir que não quebra o que já está rodando: build, teste de unidade e a verificação contra o ambiente real da parte mexida.

Commit vai sendo feito ao longo do trabalho, mas o push é um só, no fim de cada funcionalidade terminada e verificada, e quem faz é o Claude. Cada push na `main` gera deploy na Vercel, e o plano grátis tem limite de deploys por dia. No painel, publicar o back antes do front, porque o front novo pode chamar rota que só o back novo tem.

## É produto, não protótipo descartável

O chat vai para a mão de gente no posto de saúde, e o painel é a ferramenta de trabalho da equipe. Vale o padrão de aplicação profissional:

* Nada de texto de exemplo, botão que não faz nada ou tela "em breve".
* Todo erro vira uma frase que diz o que fazer em seguida. "Erro ao salvar" não serve.
* Funciona no celular pequeno (390 px), com teclado aberto, no tema claro e no escuro.
* Alvo de toque de 44 px, foco visível, navegação por teclado, nome para leitor de tela.
* Estado vazio, estado de carregando e estado de falha existem em toda tela, e um não se passa pelo outro.

### Carregando não é vazio

Tela que busca dado mostra o **sinal de carregamento** até a resposta chegar, e só então decide o que exibir:

* "Nenhum aviso", "0 resultados" ou lista em branco só aparecem **depois** que a resposta chegou vazia. Mostrar isso durante a espera diz à pessoa que não existe nada, e ela vai embora antes de os dados aparecerem.
* O sinal é o componente `Carregando` de cada projeto (`pwa/src/components/Carregando.tsx` e `Dashboard-PetSaude/front/src/components/carregando.tsx`), com o giro e uma frase que diz **o que** está chegando. Texto cinza sozinho passa despercebido.
* Falha não é vazio nem carregando: tem frase própria e um jeito de tentar de novo.
* Número que depende da resposta (contador, total, percentual) não aparece como zero enquanto espera.
* Conferir no navegador com a rede lenta (DevTools, *Slow 4G*): é assim que o vazio falso aparece.

## UX antes de dar por pronto

* **Toda frase tem que apontar para algo que existe na tela.** Dizer "toque em Aceitar acima" quando o botão sumiu é defeito, mesmo que o código esteja certo.
* **Não travar botão sem explicar.** Deixar tocar e dizer o que falta é melhor que um botão apagado que ninguém sabe por que está apagado.
* **Sempre existe caminho de volta:** sair da conta, cancelar, desfazer, voltar. E ele fica onde a pessoa está, não só dentro de outra tela.
* O que é obrigatório por lei, como o aceite, ainda precisa ser fácil de entender e de encontrar.
* Antes de dar por pronto: abrir a tela de verdade, no tamanho de celular, e percorrer o caminho inteiro.

## Escrita sem marcadores de IA

Vale para código, comentário, documentação, mensagem de commit e texto de tela.

* **Nada de travessão (—).** Usar vírgula, dois-pontos, parênteses ou dois períodos.
* Evitar as fórmulas que denunciam texto gerado: "não apenas X, mas também Y", "vale ressaltar", "em resumo", "é importante notar", negrito em toda frase, emoji decorativo, título em Caixa Alta De Cada Palavra.
* Frase curta, voz ativa, português comum. Sem "simplesmente", "basicamente", "de forma robusta".
* Comentário explica **por que** a decisão foi tomada, e o que aconteceria sem ela. O que a linha faz já está na linha.

## Verificar contra o ambiente real

Este projeto quebra em silêncio: URI sem nome de banco, modelo de embedding divergente, campo com nome errado na fila de avisos. Teste de unidade não pega nada disso.

* Teste de unidade só para lógica pura, sem rede e sem banco.
* O que envolve banco, container, navegador ou serviço externo se verifica rodando de verdade, contra o ambiente real, com um roteiro que confere estado no banco depois.
* Dado de teste é apagado ao final, inclusive registro de auditoria que o teste criou.

## Privacidade não é opcional

Conversa de saúde é dado pessoal sensível. As regras já implementadas precisam continuar valendo em tudo que for novo:

* Conteúdo escrito por cidadão nunca vai para log, auditoria ou mensagem de erro.
* Tela bloqueada do celular não mostra dado de saúde por padrão.
* Exclusão alcança as cópias em outros bancos, não só o registro principal.
* Quem só analisa resposta não precisa ver de quem ela é.
* Acionamento de IA fica registrado: quem, quando e qual conteúdo entrou, não só o resultado.

## Documentação atemporal

Documento descreve o sistema, não o momento. Nada de "hoje fizemos", "nesta fase", "conforme conversamos". Quem ler daqui a um ano precisa entender sem contexto de conversa.

Decisão não óbvia vira comentário no código, com o motivo, ou uma linha em [docs/armadilhas.md](docs/armadilhas.md) quando é do tipo que quebra em silêncio.

## O que exige cuidado extra

* **O `/` do chat está em teste de campo** e não pode mudar de comportamento. Coisa nova entra em `/staging` primeiro.
* **O painel é o que a equipe usa todo dia.** Mexer nele pede verificação antes do push.
* Variável de ambiente nova nasce com padrão vazio e o sistema funciona sem ela, como o login do Google, que fica oculto enquanto não houver credencial.
* Segredo não entra no código nem no log, e `.env` não vai para o repositório.

## Comandos

```powershell
# PWA
cd pwa; npm test; npx tsc --noEmit
docker compose up -d --build pwa        # recriar, para variável nova valer

# Dashboard (repositório próprio, dentro desta pasta)
cd Dashboard-PetSaude/back;  npx jest; npx tsc --noEmit -p tsconfig.json
cd Dashboard-PetSaude/front; npx tsc --noEmit; npx vite build
```
