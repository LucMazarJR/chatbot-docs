# Scripts de Ingestão de FAQs

Scripts Python que sincronizam documentos `.docx` do Google Drive com o MongoDB Atlas, gerando embeddings vetoriais para busca semântica usada pelo chatbot.

## Como funciona

```
Google Drive (.docx) → extração P/R → embeddings Gemini → MongoDB Atlas
```

1. Conecta ao Google Drive via Conta de Serviço
2. Baixa arquivos `.docx` da pasta configurada
3. Extrai pares Pergunta/Resposta usando regex (`P:` / `R:`)
4. Gera embeddings vetoriais com a API do Google Gemini
5. Sincroniza incrementalmente no MongoDB (só reprocessa arquivos alterados)
6. Reutiliza embeddings de conteúdo que não mudou (economia de cota da API)

## Pré-requisitos

Python 3.8+ e as dependências:

```bash
cd scripts
pip install -r requirements.txt
```

## Configuração

### 1. MongoDB Atlas

Obtenha a connection string no painel do Atlas e configure o índice vetorial na coleção `faq_medicamentos` com 3072 dimensões (o script cria automaticamente se não existir).

### 2. Google Gemini

Obtenha a chave em [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

### 3. Google Drive

1. Crie um projeto no [Google Cloud Console](https://console.cloud.google.com/)
2. Ative a **Google Drive API**
3. Crie uma **Conta de Serviço**, gere a chave JSON e salve como `credentials.json` dentro de `scripts/`
4. Compartilhe a pasta do Drive com o e-mail da Conta de Serviço

### 4. Variáveis de ambiente

```bash
cd scripts
cp .env.example .env
# edite o .env com os valores reais
```

## Scripts disponíveis

Execute a partir da pasta `scripts/`:

| Script | Comando | O que faz |
|---|---|---|
| Sincronização principal | `python enviar_dados.py` | Processa FAQs do Drive e sincroniza com MongoDB |
| Teste de extração | `python test_enviar_dados.py` | Valida a extração sem tocar no banco |
| Gerar embeddings faltantes | `python gerar_embeddings.py` | Preenche embeddings de docs que ficaram sem vetor |
| Limpar banco | `python limpar_banco.py` | Remove todos os dados e recria o índice vetorial |
| Limpar embeddings | `python limpar_embeddings.py` | Remove apenas os embeddings (mantém os dados) |

## Formatação dos documentos .docx

O script reconhece dois formatos:

**Mesma linha:**
```
P: Qual a dose do paracetamol? R: 500mg. TAGS: dose, paracetamol. FONTE: Protocolo MS 2024.
```

**Linhas separadas:**
```
P: Como armazenar a insulina?
R: Deve ser mantida em refrigeração entre 2°C e 8°C.
TAGS: armazenamento, insulina. FONTE: Manual ABC.
```

**Troca de categoria dentro do documento:**
```
[ASSUNTO: Medicamentos Especiais]
```

## Comportamento incremental

| Situação | O que acontece |
|---|---|
| Arquivo não mudou no Drive | Pula — não gasta API nem tempo |
| Arquivo foi editado | Reprocessa só esse arquivo |
| Conteúdo P/R igual ao anterior | Reutiliza embedding existente |
| Conteúdo P/R mudou | Gera novo embedding |
| Limite de embeddings atingido (700/execução) | Envia o restante sem embedding |

## Segurança

- `credentials.json` e `.env` estão no `.gitignore` — nunca commite esses arquivos
- Se a chave privada foi exposta no histórico do Git, revogue-a imediatamente no Google Cloud Console
