"""Backup das coleções de FAQ do MongoDB Atlas.

Rode isto ANTES de qualquer operação que escreva em massa: reindexação de
embeddings, limpeza de banco, migração de schema.

O que justifica existir: as FAQs criadas pelo dashboard têm
`file_id: "dashboard_manual"` e **não existem no Google Drive**. Reingestão não
as recupera — se forem apagadas, some. Este backup é a única forma de trazê-las
de volta.

Saída: `scripts/backups/faq_medicamentos_AAAAMMDD-HHMMSS.jsonl.gz` (um documento
por linha, comprimido). Os embeddings vão junto, e é por isso que o arquivo é
comprimido: 2451 vetores de 3072 dimensões passam de 100 MB em JSON puro.

Uso:
    python backup_faqs.py                  # backup das duas coleções
    python backup_faqs.py --sem-embedding  # menor e mais rápido, NÃO restaura busca
"""
import argparse
import gzip
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from bson import ObjectId
from dotenv import find_dotenv, load_dotenv
from pymongo import MongoClient

load_dotenv(find_dotenv(usecwd=True))

URI_MONGO = os.getenv("MONGODB_URI")
if not URI_MONGO:
    raise ValueError("❌ MONGODB_URI não definido! Configure no arquivo .env")

DB_NAME = "ministerio_saude"
COLECOES = ["faq_medicamentos", "sync_metadata"]
PASTA_BACKUP = Path(__file__).parent / "backups"


def serializar(valor):
    """Converte tipos do BSON que o json não conhece."""
    if isinstance(valor, ObjectId):
        return str(valor)
    if isinstance(valor, datetime):
        return valor.isoformat()
    raise TypeError(f"Tipo não serializável: {type(valor)}")


def exportar(db, nome_colecao: str, carimbo: str, sem_embedding: bool) -> Path:
    colecao = db[nome_colecao]
    total = colecao.count_documents({})
    destino = PASTA_BACKUP / f"{nome_colecao}_{carimbo}.jsonl.gz"

    projecao = {"embedding": 0} if sem_embedding else None
    gravados = 0

    with gzip.open(destino, "wt", encoding="utf-8") as saida:
        for doc in colecao.find({}, projecao):
            saida.write(json.dumps(doc, default=serializar, ensure_ascii=False) + "\n")
            gravados += 1
            if gravados % 500 == 0:
                print(f"   {gravados}/{total}...", flush=True)

    tamanho_mb = destino.stat().st_size / (1024 * 1024)
    print(f"   ✅ {nome_colecao}: {gravados} documentos → {destino.name} ({tamanho_mb:.1f} MB)")

    if gravados != total:
        print(f"   ⚠️  Esperava {total} documentos, gravou {gravados}. Verifique antes de prosseguir.")

    return destino


def main() -> int:
    parser = argparse.ArgumentParser(description="Backup das coleções de FAQ")
    parser.add_argument(
        "--sem-embedding",
        action="store_true",
        help="Omite os vetores. Arquivo bem menor, mas o backup NÃO restaura a busca semântica.",
    )
    args = parser.parse_args()

    PASTA_BACKUP.mkdir(exist_ok=True)
    carimbo = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    print("\n" + "=" * 60)
    print("💾 BACKUP DAS FAQs")
    print("-" * 60)
    if args.sem_embedding:
        print("⚠️  Modo --sem-embedding: os vetores NÃO vão para o arquivo.")

    cliente = MongoClient(URI_MONGO)
    try:
        db = cliente[DB_NAME]
        for nome in COLECOES:
            exportar(db, nome, carimbo, args.sem_embedding)
    finally:
        cliente.close()

    print("-" * 60)
    print(f"📁 {PASTA_BACKUP}")
    print("=" * 60 + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
