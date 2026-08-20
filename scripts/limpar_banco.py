"""Apaga TODOS os dados das FAQs e recria o índice vetorial.

DESTRUTIVO E IRREVERSÍVEL. Leia antes de rodar.

As FAQs criadas pelo dashboard têm `file_id: "dashboard_manual"` e NÃO existem
no Google Drive. Rodar `enviar_dados.py` depois traz de volta apenas o que veio
do Drive — tudo que foi digitado no dashboard some para sempre.

Rode `python backup_faqs.py` antes. Sempre.

Por segurança, não faz nada sem a flag `--confirmo-apagar-tudo` e sem a
confirmação digitada.
"""

import argparse
import os
import sys
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

# Nome e dimensão precisam bater com o que o fluxo do n8n consulta
# (`vectorIndexName`) e com o que a ingestão gera. Já estiveram divergentes: o
# índice era recriado com 768 dimensões contra vetores de 3072, e a busca
# parava de funcionar sem erro nenhum aparecer.
INDEX_NAME = "vector_index_3072"
EMBEDDING_DIMENSION = 3072


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


def confirmar(col_dados) -> bool:
    """Mostra o que será perdido e exige confirmação digitada."""
    total = col_dados.count_documents({})
    do_dashboard = col_dados.count_documents({"file_id": "dashboard_manual"})

    print()
    print("!" * 60)
    print("ATENÇÃO — ESTA OPERAÇÃO É IRREVERSÍVEL")
    print("!" * 60)
    print(f"  FAQs que serão apagadas:     {total}")
    print(f"  ...criadas pelo dashboard:   {do_dashboard}  <-- NÃO voltam numa reingestão")
    print("  Metadados de sincronização:  serão zerados (força reprocessar tudo)")
    print(f"  Índice '{INDEX_NAME}':       será removido e recriado")
    print("!" * 60)

    if do_dashboard:
        print()
        print(f"  {do_dashboard} FAQ(s) só existem neste banco. Já rodou backup_faqs.py?")

    print()
    return input("Digite APAGAR TUDO para confirmar: ").strip() == "APAGAR TUDO"


def main():
    parser = argparse.ArgumentParser(description="Apaga todas as FAQs e recria o índice vetorial")
    parser.add_argument(
        "--confirmo-apagar-tudo",
        action="store_true",
        help="Obrigatória. Sem ela o script não executa nada.",
    )
    args = parser.parse_args()

    if not args.confirmo_apagar_tudo:
        print()
        print("Nada foi feito.")
        print("Este script apaga TODAS as FAQs, inclusive as criadas pelo dashboard,")
        print("que não existem no Drive e não voltam numa reingestão.")
        print()
        print("Se é mesmo isso que você quer:")
        print("  1. python backup_faqs.py")
        print("  2. python limpar_banco.py --confirmo-apagar-tudo")
        print()
        return 1

    client = MongoClient(URI_MONGO)
    try:
        db = client[DB_NAME]
        col_dados = db[COL_DADOS]

        if not confirmar(col_dados):
            logger.info("Operação cancelada — nada foi apagado.")
            return 1

        print()
        print("=" * 60)
        print("LIMPEZA DO BANCO E RECONFIGURAÇÃO DO ÍNDICE VETORIAL")
        print("=" * 60)

        logger.info("Etapa 1/2 — Limpando dados...")
        limpar_dados(db)

        logger.info("Etapa 2/2 — Verificando/recriando índice vetorial...")
        recriar_indice_vetorial(col_dados)

        print("=" * 60)
        logger.info("Limpeza concluída.")
        print("=" * 60)
        return 0

    except Exception as e:
        logger.critical(f"Falha crítica: {e}")
        return 1
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(main())
