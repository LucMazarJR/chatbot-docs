import os
import re
import io
import logging
import unicodedata
import time
import hashlib
from datetime import datetime, timezone
from typing import List, Tuple, Dict, Optional

# Bibliotecas externas
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.operations import SearchIndexModel
from docx import Document
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

# Módulos locais
from lib.gemini_embendding import gerarEmbedding

# ============================================================================
# 1. CONFIGURAÇÕES E LOGGING
# ============================================================================
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler("sync_ms_inteligente.log", encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Configurações do Ambiente (carregadas do arquivo .env)
ID_PASTA_DRIVE = os.getenv("ID_PASTA_DRIVE")
FILE_CREDENTIALS = os.getenv("FILE_CREDENTIALS", "credentials.json")
URI_MONGO = os.getenv("MONGODB_URI")

if not ID_PASTA_DRIVE:
    raise ValueError("❌ ID_PASTA_DRIVE não definido! Configure no arquivo .env")
if not URI_MONGO:
    raise ValueError("❌ MONGODB_URI não definido! Configure no arquivo .env")
DB_NAME = "ministerio_saude"
COL_DADOS = "faq_medicamentos"
COL_META = "sync_metadata" 

# ============================================================================
# 2. FERRAMENTAS DE TRATAMENTO DE TEXTO
# ============================================================================

def normalizar_para_busca(texto: str) -> str:
    """Padroniza o texto para que o chatbot encontre respostas sem erro de acento."""
    if not texto: return ""
    nksel = unicodedata.normalize('NFKD', texto)
    sem_acentos = "".join([c for c in nksel if not unicodedata.combining(c)])
    limpo = re.sub(r'[^\w\s]', '', sem_acentos)
    return re.sub(r'\s+', ' ', limpo).strip().lower()

def converter_para_markdown(p) -> str:
    """Preserva a formatação de listas do Word para o Chatbot."""
    texto = p.text.strip()
    if p.style.name.startswith('List') or texto.startswith(('•', '-', '*', '➢')):
        texto_limpo = re.sub(r'^[•\-*➢]\s*', '', texto)
        return f"- {texto_limpo}"
    return texto

def extrair_tags_e_fonte(paragrafos: List[str], i: int) -> Tuple[List[str], str]:
    """Busca metadados ao redor da pergunta/resposta encontrada."""
    janela = " ".join(paragrafos[max(0, i-1):min(len(paragrafos), i+2)])
    
    f_match = re.search(r'(?:FONTE:|Ref:|\(Ref:)\s*([^)\n\t]+)', janela, re.IGNORECASE)
    fonte = f_match.group(1).strip().rstrip('.)') if f_match else ""

    t_match = re.search(r'TAGS:\s*(.+?)(?=\s*P:|\s*PERGUNTA:|$|\n)', janela, re.IGNORECASE)
    tags = [t.strip().lower() for t in re.split(r'[,\s]+', t_match.group(1).replace('#', '')) if t.strip()] if t_match else []
    
    return tags, fonte

def gerar_hash_conteudo(pergunta: str, resposta: str) -> str:
    """Gera hash MD5 do conteúdo para detectar mudanças."""
    conteudo = f"{pergunta}|{resposta}"
    return hashlib.md5(conteudo.encode('utf-8')).hexdigest()

def carregar_embeddings_existentes(collection, file_id: str) -> Dict[str, List[float]]:
    """Carrega embeddings existentes indexados por hash do conteúdo."""
    cache = {}
    docs = collection.find(
        {"file_id": file_id, "content_hash": {"$exists": True}, "embedding": {"$ne": None}},
        {"content_hash": 1, "embedding": 1}
    )
    for doc in docs:
        cache[doc["content_hash"]] = doc["embedding"]
    return cache

# ============================================================================
# 3. CONFIGURAÇÃO DO ÍNDICE VETORIAL ATLAS
# ============================================================================

def criar_indice_vetorial(collection):
    """Cria o índice vetorial no MongoDB Atlas para busca semântica."""
    INDEX_NAME = "vector_index"
    
    # Verifica se o índice já existe
    existing_indexes = list(collection.list_search_indexes())
    if any(idx.get("name") == INDEX_NAME for idx in existing_indexes):
        logger.info(f"✅ Índice vetorial '{INDEX_NAME}' já existe.")
        return
    
    search_index_model = SearchIndexModel(
        definition={
            "fields": [
                {
                    "type": "vector",
                    "path": "embedding",
                    "numDimensions": 3072,
                    "similarity": "cosine"
                },
                {
                    "type": "filter",
                    "path": "isActive"
                },
                {
                    "type": "filter",
                    "path": "category"
                }
            ]
        },
        name=INDEX_NAME,
        type="vectorSearch"
    )
    
    try:
        collection.create_search_index(model=search_index_model)
        logger.info(f"✅ Índice vetorial '{INDEX_NAME}' criado com sucesso.")
    except Exception as e:
        logger.warning(f"⚠️ Não foi possível criar índice vetorial: {e}")

# ============================================================================
# 4. LÓGICA DE SINCRONIZAÇÃO INTELIGENTE
# ============================================================================

# Limite máximo de embeddings novos gerados por execução (após atingir, envia sem embedding)
LIMITE_EMBEDDINGS = 700

def processar_faqs_drive(db) -> Tuple[int, int]:
    col_dados = db[COL_DADOS]
    col_meta = db[COL_META]
    
    creds = service_account.Credentials.from_service_account_file(
        FILE_CREDENTIALS, scopes=['https://www.googleapis.com/auth/drive.readonly'])
    service = build('drive', 'v3', credentials=creds)

    query = f"'{ID_PASTA_DRIVE}' in parents and name contains '.docx' and mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'"
    results = service.files().list(q=query, fields="files(id, name, modifiedTime)").execute()
    arquivos = results.get('files', [])

    itens_novos_total = 0
    arquivos_pulados = 0
    embeddings_gerados_global = 0  # Contador global de embeddings gerados nesta execução
    embedding_desativado = False   # Flag: True = parou de gerar embeddings (limite ou erro de API)

    for arq in arquivos:
        file_id = arq['id']
        nome_arq = arq['name']
        data_drive = arq['modifiedTime']

        meta = col_meta.find_one({"file_id": file_id})
        if meta and meta.get('last_modified') == data_drive:
            arquivos_pulados += 1
            continue

        logger.info(f"🔄 Atualizando: {nome_arq}")
        try:
            # Carregar cache de embeddings existentes antes de deletar
            cache_embeddings = carregar_embeddings_existentes(col_dados, file_id)
            embeddings_reutilizados = 0
            embeddings_gerados = 0
            
            request = service.files().get_media(fileId=file_id)
            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, request)
            done = False
            while not done: _, done = downloader.next_chunk()
            
            doc = Document(fh)
            linhas = [converter_para_markdown(p) for p in doc.paragraphs if p.text.strip()]
            
            lote_arquivo = []
            categoria_atual = nome_arq.replace("FAQ", "").replace(".docx", "").strip().lower()
            
            # Variáveis de controle para rastreamento de perguntas multi-linha
            pergunta_pendente = ""
            linha_inicio_pergunta = 0
            perguntas_no_arquivo = 0  # Contador para este arquivo

            # Iteração sobre os parágrafos do documento
            for i, linha in enumerate(linhas):
                try:
                    num_linha_real = i + 1 # Para facilitar a localização manual no Word (que não começa em 0)

                    # 1. Verificação de troca de Assunto/Categoria
                    assunto_m = re.search(r'\[ASSUNTO:\s*(.+?)\]', linha, re.IGNORECASE)
                    if assunto_m: 
                        categoria_atual = assunto_m.group(1).strip().lower()
                        continue

                    pergunta, resposta = None, None

                    # 2. EXTRAÇÃO: Caso Pergunta e Resposta estejam na MESMA LINHA
                    if re.search(r'\b(P|PERGUNTA):\s*', linha, re.IGNORECASE) and re.search(r'\b(R|RESPOSTA):\s*', linha, re.IGNORECASE):
                        partes = re.split(r'\s*\b(R|RESPOSTA):\s*', linha, flags=re.IGNORECASE)
                        pergunta = re.sub(r'(\d+\.\s*)?\b(P|PERGUNTA):\s*', '', partes[0], flags=re.IGNORECASE).strip()
                        # Extrai a resposta removendo possíveis tags/fontes que vierem na mesma linha
                        resposta = re.split(r'tags:|fonte:|ref:|\(ref:', partes[2], flags=re.IGNORECASE)[0].strip()

                    # 3. EXTRAÇÃO: Caso seja apenas o início de uma PERGUNTA (P:)
                    elif re.search(r'^(\d+\.\s*)?\b(P|PERGUNTA):\s*', linha, re.IGNORECASE):
                        pergunta_pendente = re.sub(r'^(\d+\.\s*)?\b(P|PERGUNTA):\s*', '', linha, flags=re.IGNORECASE).strip()
                        linha_inicio_pergunta = num_linha_real
                        continue

                    # 4. EXTRAÇÃO: Caso seja a RESPOSTA (R:) para uma pergunta detectada anteriormente
                    elif re.search(r'^\b(R|RESPOSTA):\s*', linha, re.IGNORECASE):
                        if pergunta_pendente:
                            pergunta = pergunta_pendente
                            # Limpa o prefixo 'R:' e remove metadados do final
                            corpo_res = re.sub(r'^\b(R|RESPOSTA):\s*', '', linha, flags=re.IGNORECASE)
                            resposta = re.split(r'tags:|fonte:|ref:|\(ref:', corpo_res, flags=re.IGNORECASE)[0].strip()
                            pergunta_pendente = "" # Reseta para a próxima captura
                        else:
                            # Log de aviso: encontrou um R: mas não viu o P: antes
                            logger.warning(f"  ⚠️ Resposta sem pergunta correspondente na linha {num_linha_real} de '{nome_arq}'")

                    # Se conseguimos formar um par P&R, salvamos no lote
                    if pergunta and resposta:
                        perguntas_no_arquivo += 1
                        total_ate_agora = itens_novos_total + perguntas_no_arquivo
                        tags, fonte = extrair_tags_e_fonte(linhas, i)
                        
                        # Verificar se já temos embedding cacheado para este conteúdo
                        content_hash = gerar_hash_conteudo(pergunta, resposta)
                        embedding_vector = cache_embeddings.get(content_hash)
                        
                        if embedding_vector:
                            embeddings_reutilizados += 1
                            logger.info(f"   📌 [{total_ate_agora}] Reutilizando embedding...")
                        elif embedding_desativado:
                            # Limite atingido ou erro de API — envia sem embedding
                            logger.info(f"   ⏭️  [{total_ate_agora}] Sem embedding (limite atingido).")
                            embedding_vector = None
                        else:
                            # Gerar novo embedding apenas se o conteúdo mudou
                            texto_para_embedding = f"{pergunta} {resposta}"
                            try:
                                logger.info(f"   🔄 [{total_ate_agora}] Gerando embedding ({embeddings_gerados_global + 1}/{LIMITE_EMBEDDINGS})...")
                                embedding_result = gerarEmbedding(texto_para_embedding)
                                embedding_vector = embedding_result.embeddings[0].values
                                embeddings_gerados += 1
                                embeddings_gerados_global += 1
                                
                                # Verificar se atingiu o limite
                                if embeddings_gerados_global >= LIMITE_EMBEDDINGS:
                                    embedding_desativado = True
                                    logger.warning(f"\n  🛑 LIMITE DE {LIMITE_EMBEDDINGS} EMBEDDINGS ATINGIDO!")
                                    logger.warning(f"  ⏭️  Restante será enviado SEM embedding para o banco.\n")
                            except Exception as emb_error:
                                logger.warning(f"  ⚠️ Falha ao gerar embedding na linha {num_linha_real}: {emb_error}")
                                embedding_vector = None
                                # Se o erro parece ser de limite/rate limit, desativa embeddings
                                erro_str = str(emb_error).lower()
                                if any(termo in erro_str for termo in ['rate limit', 'quota', 'resource exhausted', '429', 'limit exceeded']):
                                    embedding_desativado = True
                                    logger.warning(f"\n  🛑 ERRO DE LIMITE DA API GEMINI DETECTADO!")
                                    logger.warning(f"  ⏭️  Restante será enviado SEM embedding para o banco.\n")
                        
                        lote_arquivo.append({
                            "question": pergunta,
                            "question_normalized": normalizar_para_busca(pergunta),
                            "answer": resposta,
                            "category": categoria_atual,
                            "tags": tags,
                            "source": fonte,
                            "file_id": file_id,
                            "file_origin": nome_arq,
                            "line_reference": num_linha_real,
                            "content_hash": content_hash,  # Hash para cache de embeddings
                            "isActive": True,
                            "updatedAt": datetime.now(timezone.utc),
                            "embedding": embedding_vector
                        })

                except Exception as line_error:
                    # RASTREABILIDADE: Loga o erro sem parar o processamento do resto do arquivo
                    logger.error(f"  ❌ Erro ao processar parágrafo na linha {i+1} do arquivo '{nome_arq}': {line_error}")
                    continue

            # Verificação de segurança: sobrou pergunta sem resposta no final do arquivo?
            if pergunta_pendente:
                logger.warning(f"  ⚠️ Pergunta detectada na linha {linha_inicio_pergunta} de '{nome_arq}' ficou sem resposta (R:).")

            # ATUALIZAÇÃO ATÔMICA POR ARQUIVO
            if lote_arquivo:
                col_dados.delete_many({"file_id": file_id})
                col_dados.insert_many(lote_arquivo)
                col_meta.update_one(
                    {"file_id": file_id},
                    {"$set": {"last_modified": data_drive, "updated_at": datetime.now(timezone.utc)}},
                    upsert=True
                )
                itens_novos_total += len(lote_arquivo)
                sem_embedding = sum(1 for item in lote_arquivo if item.get('embedding') is None)
                logger.info(f"   ✔️ Sucesso: {len(lote_arquivo)} itens sincronizados.")
                logger.info(f"   💰 Embeddings: {embeddings_reutilizados} reutilizados, {embeddings_gerados} novos gerados, {sem_embedding} sem embedding.")

        except Exception as file_error:
            logger.error(f"   ❌ Falha crítica ao processar o arquivo {nome_arq}: {file_error}")

    return itens_novos_total, arquivos_pulados

# ============================================================================
# 5. EXECUÇÃO
# ============================================================================

def main():
    tempo_start = time.time()
    client = MongoClient(URI_MONGO)
    
    try:
        db = client[DB_NAME]
        col_dados = db[COL_DADOS]
        
        print("\n" + "═"*60)
        logger.info("🚀 INICIANDO SINCRONIZADOR INTELIGENTE (MODO INCREMENTAL)")
        
        # Garante que o índice vetorial existe
        criar_indice_vetorial(col_dados)
        
        novos, pulados = processar_faqs_drive(db)
        
        total_ativos = col_dados.count_documents({"isActive": True})

        print("\n" + "📊 RELATÓRIO FINAL DE OPERAÇÃO")
        print("─"*60)
        print(f"⏭️  Arquivos Pulados (Sem alteração): {pulados}")
        print(f"📥 Itens Novos/Atualizados:         {novos}")
        print(f"🟢 Total de FAQ Ativas no Chatbot:  {total_ativos}")
        print(f"🕒 Tempo de execução:               {time.time() - tempo_start:.2f}s")
        print("═"*60 + "\n")

    except Exception as e:
        logger.critical(f"Falha Crítica na execução principal: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    main()