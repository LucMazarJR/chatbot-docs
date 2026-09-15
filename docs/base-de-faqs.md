# A base de FAQs

O conteúdo que o chatbot responde. É o ativo mais importante do projeto: o código se reescreve em semanas, a base é trabalho de meses da equipe de saúde.

Fica em `ministerio_saude.faq_medicamentos`, no MongoDB Atlas, e é **compartilhada** por três coisas: os scripts de ingestão, o dashboard e a busca do chatbot. Quem lê e quem escreve estão em lugares diferentes, o que torna os contratos abaixo mais importantes que o normal.

---

## O documento

| Campo | Para que serve |
|---|---|
| `question`, `answer` | O par que a equipe de saúde escreve |
| `question_normalized` | A pergunta sem acento e em minúsculo, para busca por texto e para detectar duplicata parecida |
| `category` | O assunto. **Entra no texto embedado**, então muda o resultado da busca |
| `tags`, `source` | Metadados de curadoria |
| `text` | O texto que virou vetor: `Assunto: … / Pergunta: … / Resposta: …` |
| `embedding` | O vetor, 3072 dimensões |
| `embedding_model`, `embedding_dim`, `embedded_at` | Procedência do vetor — permite achar o que ficou para trás numa troca de modelo |
| `content_hash` | MD5 de `pergunta\|resposta`. É o contrato de deduplicação entre a ingestão Python e a importação do dashboard |
| `embedding_content_hash` | O `content_hash` que o vetor representa. Diferente do atual = vetor desatualizado |
| `isActive` | `false` é exclusão suave. O fluxo filtra por isto |
| `file_id`, `file_origin`, `line_reference` | De onde veio: arquivo do Drive, importação em lote, formulário manual ou curadoria |

> `content_hash` é MD5 de pergunta + resposta e **ignora a categoria**, de propósito: mudar a fórmula faria a ingestão Python e a importação em lote deixarem de reconhecer o que já está na base. Como a categoria entra no texto embedado, quem decide se precisa regerar o vetor é a comparação do **texto**, não do hash.

---

## O índice vetorial

| | |
|---|---|
| Nome | `vector_index_3072` |
| Dimensões | 3072 |
| Similaridade | cosine |
| Campo filtrável | `isActive` |

O [enviar_dados.py](../scripts/enviar_dados.py) cria o índice se não existir, e o [limpar_banco.py](../scripts/limpar_banco.py) o recria com os mesmos valores. Os dois fluxos do n8n consultam esse mesmo nome.

**Por que `isActive` precisa ser filtrável.** A exclusão no dashboard é suave: marca `isActive: false` e mantém o documento — com embedding — na coleção indexada. Sem pré-filtro, uma FAQ "excluída" continuava voltando em primeiro lugar na busca, com a equipe convencida de que a tinha removido. O fluxo usa `preFilter: {"isActive": true}`.

---

## A regra que quebra tudo em silêncio

**O modelo de embedding precisa ser idêntico em três lugares.** Divergir não gera erro em lugar nenhum — a busca só devolve resultado ruim, ou a FAQ nunca aparece, porque pergunta e documentos caem em espaços vetoriais diferentes.

| Onde | Configuração |
|---|---|
| Ingestão | `GEMINI_EMBEDDING_MODEL` no `.env` da raiz → [lib/gemini_embendding.py](../scripts/lib/gemini_embendding.py) |
| Dashboard | `GEMINI_EMBEDDING_MODEL` no `Dashboard-PetSaude/back/.env` |
| n8n | o nó `Embeddings Google Gemini` do fluxo |

Hoje os três estão em `gemini-embedding-2`, 3072 dimensões. Já aconteceu de o nó do n8n ficar com os parâmetros **vazios**, usando o modelo padrão dele enquanto a base estava no `gemini-embedding-2` — e nada acusou.

Trocar de modelo exige **reindexar a base inteira** e atualizar os três lugares. Não é troca de uma linha.

### Por que o assunto entra no texto embedado

O texto vetorizado é `Assunto: … / Pergunta: … / Resposta: …`. Antes era só pergunta + resposta, e isso tinha uma consequência ruim: muitas FAQs de exames diferentes têm o **texto idêntico** ("Como me preparar para o exame?"). Zinco e paratormônio chegaram a dar score igual até a última casa decimal — o desempate era arbitrário.

Depois da mudança, na consulta *"preciso de jejum para o exame de zinco?"*: 3 dos 5 primeiros passaram a ser do zinco, e a faixa entre o 1º e o 5º colocado ficou **6× mais larga**. O ganho não é o primeiro lugar, é a **discriminação** — a busca passa a separar assuntos que antes colidiam.

---

## Ingestão a partir do Google Drive

```
Google Drive (.docx) → extração P/R → embeddings Gemini → MongoDB Atlas
```

Os scripts ficam em [scripts/](../scripts/) e só são necessários quando entram arquivos novos no Drive.

### Configuração

1. **Python 3.8+** e `pip install -r requirements.txt`, a partir de `scripts/`
2. **Gemini** — chave em [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
3. **Google Drive** — crie um projeto no [Google Cloud Console](https://console.cloud.google.com/), ative a **Google Drive API**, crie uma **Conta de Serviço**, gere a chave JSON como `scripts/credentials.json` e **compartilhe a pasta do Drive com o e-mail da conta de serviço**
4. **`.env`** — `cp .env.example .env` dentro de `scripts/`

> `credentials.json` e `.env` estão no `.gitignore`. Se uma chave privada for parar no histórico do git, revogue no Google Cloud Console — tirar do repositório não basta.

### Os scripts

Rode a partir de `scripts/`:

| Comando | O que faz |
|---|---|
| `python enviar_dados.py` | Sincroniza as FAQs do Drive com o Mongo |
| `python test_enviar_dados.py` | Valida a extração sem tocar no banco |
| `python gerar_embeddings.py` | Preenche embeddings dos documentos que ficaram sem vetor |
| `python reindexar_embeddings.py` | Regera os vetores da base inteira (troca de modelo) |
| `python backup_faqs.py` | Exporta a coleção antes de qualquer operação destrutiva |
| `python limpar_embeddings.py` | Remove só os embeddings, mantendo o conteúdo |
| `python limpar_banco.py` | **Apaga tudo** e recria o índice. Exige `--confirmo-apagar-tudo` e confirmação digitada |

Fluxo normal de uma ingestão:

```powershell
cd scripts
python enviar_dados.py
# quantos ficaram sem vetor:
python -c "import os;from dotenv import load_dotenv;from pymongo import MongoClient;load_dotenv();c=MongoClient(os.getenv('MONGODB_URI'))['ministerio_saude']['faq_medicamentos'];print('sem vetor:',c.count_documents({'embedding':None}))"
python gerar_embeddings.py   # repita até zerar
```

### Formato dos documentos `.docx`

Dois formatos são reconhecidos:

```
P: Qual a dose do paracetamol? R: 500mg. TAGS: dose, paracetamol. FONTE: Protocolo MS 2024.
```

```
P: Como armazenar a insulina?
R: Deve ser mantida em refrigeração entre 2°C e 8°C.
TAGS: armazenamento, insulina. FONTE: Manual ABC.
```

Troca de assunto dentro do documento:

```
[ASSUNTO: Medicamentos Especiais]
```

### Comportamento incremental

| Situação | O que acontece |
|---|---|
| Arquivo não mudou no Drive | Pula — não gasta API nem tempo |
| Arquivo foi editado | Reprocessa só esse arquivo |
| Conteúdo P/R igual ao anterior | Reutiliza o embedding existente |
| Conteúdo P/R mudou | Gera embedding novo |
| Teto de embeddings por execução (700) | Envia o restante sem vetor — rode `gerar_embeddings.py` depois |

---

## Pelo dashboard

O caminho do dia a dia, para quem não mexe em script:

- **Criar e editar FAQ** — o embedding é gerado na hora, e só quando o texto embedado realmente muda. Corrigir só a tag não gasta cota; corrigir a categoria gasta, porque ela entra no vetor.
- **Importação em lote** — prévia antes de gravar, marcando duplicata exata (pelo `content_hash`), pergunta parecida já existente e assunto fora da lista oficial. Nada disso bloqueia o lote: a decisão é de quem está olhando a prévia.
- **Categorias** — a lista oficial de assuntos, com chave canônica (minúsculo, sem acento) e índice único. Renomear um assunto reescreve o `category` e o `text` de todas as FAQs dele, e devolve quantas precisam ser reindexadas.
- **Saúde dos vetores** — quantas FAQs estão sem vetor, com dimensão errada, com modelo divergente ou com vetor desatualizado, e um backfill por modo, com limite e parada.
- **Testar a busca** — roda a mesma busca do chatbot para uma pergunta digitada e mostra os scores, marcando quais passariam do corte.

Detalhes de uso e telas em [Dashboard-PetSaude/README.md](../Dashboard-PetSaude/README.md).

---

## Verificar a integridade

Não gasta cota:

```powershell
cd scripts
python -c "import os;from dotenv import load_dotenv;from pymongo import MongoClient;load_dotenv();c=MongoClient(os.getenv('MONGODB_URI'))['ministerio_saude']['faq_medicamentos'];print('total',c.count_documents({}),'| modelo 2:',c.count_documents({'embedding_model':'gemini-embedding-2'}),'| sem vetor:',c.count_documents({'embedding':None}))"
```

Os três números contam a história: total muito menor que o esperado costuma ser [URI sem nome de banco](armadilhas.md); "sem vetor" acima de zero pede `gerar_embeddings.py`; "modelo 2" menor que o total significa que sobrou documento de uma indexação antiga.
