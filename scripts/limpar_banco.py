"""
Script para limpar todos os dados do banco MongoDB e
recriar o índice vetorial configurado para embeddings de 768 dimensões.
"""

import os
import time
import logging
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.operations import SearchIndexModel

# ============================================================================
# CONFIGURAÇÕES
# ============================================================================
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

URI_MONGO = os.getenv("MONGODB_URI")
if not URI_MONGO:
    raise ValueError("❌ MONGODB_URI não definido! Configure no arquivo .env")

DB_NAME = "ministerio_saude"
COL_DADOS = "faq_medicamentos"
COL_META = "sync_metadata"

INDEX_NAME = "vector_index"
EMBEDDING_DIMENSION = 768


def limpar_dados(db):
    """Remove todos os documentos das coleções de dados e metadados."""
    col_dados = db[COL_DADOS]
    col_meta = db[COL_META]

    resultado_dados = col_dados.delete_many({})
    resultado_meta = col_meta.delete_many({})

    logger.info(f"🗑️  Documentos removidos de '{COL_DADOS}': {resultado_dados.deleted_count}")
    logger.info(f"🗑️  Documentos removidos de '{COL_META}': {resultado_meta.deleted_count}")


def recriar_indice_vetorial(collection):
    """Remove o índice vetorial existente e recria com 768 dimensões."""

    # 1. Verificar e remover índice existente
    existing_indexes = list(collection.list_search_indexes())
    for idx in existing_indexes:
        nome = idx.get("name")
        if nome == INDEX_NAME:
            # Checar dimensão atual
            fields = idx.get("latestDefinition", {}).get("fields", [])
            dim_atual = None
            for f in fields:
                if f.get("path") == "embedding" and f.get("type") == "vector":
                    dim_atual = f.get("numDimensions")

            if dim_atual == EMBEDDING_DIMENSION:
                logger.info(f"✅ Índice '{INDEX_NAME}' já existe com {EMBEDDING_DIMENSION} dimensões. Nada a fazer.")
                return
            else:
                logger.info(f"⚠️  Índice '{INDEX_NAME}' encontrado com {dim_atual} dimensões. Removendo...")
                collection.drop_search_index(INDEX_NAME)
                logger.info(f"🗑️  Índice '{INDEX_NAME}' removido.")
                # Aguardar o Atlas processar a remoção
                logger.info("⏳ Aguardando Atlas processar a remoção do índice...")
                time.sleep(10)
                break

    # 2. Criar novo índice com 768 dimensões
    search_index_model = SearchIndexModel(
        definition={
            "fields": [
                {
                    "type": "vector",
                    "path": "embedding",
                    "numDimensions": EMBEDDING_DIMENSION,
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
        logger.info(f"✅ Índice vetorial '{INDEX_NAME}' criado com {EMBEDDING_DIMENSION} dimensões (cosine).")
    except Exception as e:
        logger.error(f"❌ Falha ao criar índice vetorial: {e}")


def main():
    client = MongoClient(URI_MONGO)
    try:
        db = client[DB_NAME]
        col_dados = db[COL_DADOS]

        print("\n" + "═" * 60)
        print("🧹 LIMPEZA DO BANCO E RECONFIGURAÇÃO DO ÍNDICE VETORIAL")
        print("═" * 60)

        # Passo 1: Limpar dados
        logger.info("Etapa 1/2 — Limpando dados...")
        limpar_dados(db)

        # Passo 2: Recriar índice vetorial (768 dims)
        logger.info("Etapa 2/2 — Verificando/recriando índice vetorial...")
        recriar_indice_vetorial(col_dados)

        print("═" * 60)
        logger.info("✅ Limpeza concluída com sucesso!")
        print("═" * 60 + "\n")

    except Exception as e:
        logger.critical(f"❌ Falha crítica: {e}")
    finally:
        client.close()


if __name__ == "__main__":
    main()
