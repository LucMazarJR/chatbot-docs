import json
import time
import numpy as np
from pathlib import Path
from datetime import datetime
from sentence_transformers import SentenceTransformer
import faiss
import pickle
import torch

# ========================= CONFIGURAÇÃO =========================
DATASET_V3 = "dataset_final_saude_franca_v3.json"

# Escolha do modelo (recomendado para este caso):
MODELO_EMBEDDING = "all-mpnet-base-v2"      # Melhor qualidade semântica (768 dimensões)
# MODELO_EMBEDDING = "all-MiniLM-L6-v2"     # Mais rápido, mas menos preciso (384 dimensões)

# Device: usa CUDA se disponível (RTX 3060 ~5-10x mais rápido que CPU)
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Arquivos de saída
ARQUIVO_EMBEDDINGS = "embeddings_saude_franca_v3.npy"
ARQUIVO_INDEX_FAISS = "faiss_index_saude_franca_v3.bin"
ARQUIVO_METADATA = "metadata_embeddings_v3.json"
ARQUIVO_MAPPING = "id_mapping_v3.pkl"
# ============================================================

print("🚀 Iniciando geração de Embeddings - Dataset Saúde Franca v3")
print(f"Modelo selecionado : {MODELO_EMBEDDING}")
print(f"Device             : {DEVICE}\n")

# 1. Carregar dataset v3
if not Path(DATASET_V3).exists():
    raise FileNotFoundError(f"Dataset não encontrado: {DATASET_V3}. Execute gerar_dataset_saude_franca_v3.py primeiro.")

with open(DATASET_V3, 'r', encoding='utf-8') as f:
    dataset = json.load(f)

registros = dataset["data"]
print(f"✅ Dataset v3 carregado: {len(registros):,} registros")

# Verificar duplicatas por pergunta
perguntas = [r['pergunta'] for r in registros]
duplicatas = len(perguntas) - len(set(perguntas))
if duplicatas:
    print(f"⚠️  Atenção: {duplicatas} perguntas duplicadas encontradas (serão codificadas mesmo assim)")
print()

# 2. Criar texto rico para embedding (Pergunta + Resposta + Tags)
textos_para_embedding = []
mapping = []  # Para manter rastreabilidade do ID original

for item in registros:
    tags_str = " ".join(item.get("tags", []))
    texto_combinado = (
        f"Pergunta: {item['pergunta']}\n"
        f"Resposta: {item['resposta']}\n"
        f"Tags: {tags_str}\n"
        f"Categoria: {item.get('categoria', '')}"
    )
    textos_para_embedding.append(texto_combinado)
    mapping.append({
        "id": item["id"],
        "categoria": item.get("categoria", ""),
        "pergunta": item["pergunta"],
        "tags": item.get("tags", [])
    })

print("Carregando modelo de embedding...")
model = SentenceTransformer(MODELO_EMBEDDING, device=DEVICE)
print(f"Modelo carregado em: {DEVICE}. Iniciando geração de embeddings...\n")

# 3. Gerar embeddings (em lotes para maior eficiência)
batch_size = 128  # GPU comporta batches maiores; use 32 se CPU
t0 = time.time()
embeddings = model.encode(
    textos_para_embedding,
    batch_size=batch_size,
    show_progress_bar=True,
    convert_to_numpy=True,
    normalize_embeddings=True
)
elapsed = time.time() - t0

print(f"\n✅ Embeddings gerados em {elapsed:.1f}s ({len(textos_para_embedding)/elapsed:.0f} registros/s)")
print(f"   Formato: {embeddings.shape} | dtype: {embeddings.dtype}")

# 4. Criar índice FAISS para busca vetorial rápida
dimension = embeddings.shape[1]
index = faiss.IndexFlatIP(dimension)   # Inner Product + embeddings normalizados = Similaridade de Cosseno
index.add(embeddings)

# 5. Salvar todos os arquivos
np.save(ARQUIVO_EMBEDDINGS, embeddings)
faiss.write_index(index, ARQUIVO_INDEX_FAISS)

with open(ARQUIVO_MAPPING, 'wb') as f:
    pickle.dump(mapping, f)

metadata = {
    "versao": "3.0",
    "data_geracao": datetime.now().isoformat(),
    "modelo_embedding": MODELO_EMBEDDING,
    "dimensao": int(dimension),
    "total_registros": len(registros),
    "batch_size": batch_size,
    "normalizacao": True,
    "texto_usado": "Pergunta + Resposta + Tags + Categoria",
    "dataset_origem": DATASET_V3,
    "device_usado": DEVICE,
    "tempo_encoding_s": round(elapsed, 2),
    "observacao": "Embeddings otimizados para RAG + sistema MEV v3. Índice FAISS pronto para busca."
}

with open(ARQUIVO_METADATA, 'w', encoding='utf-8') as f:
    json.dump(metadata, f, ensure_ascii=False, indent=2)

print("\n" + "="*90)
print("🎉 EMBEDDINGS V3 GERADOS COM SUCESSO!")
print("="*90)
print(f"📁 Arquivos criados:")
print(f"   • {ARQUIVO_EMBEDDINGS}          → Matriz de embeddings")
print(f"   • {ARQUIVO_INDEX_FAISS}      → Índice FAISS para busca rápida")
print(f"   • {ARQUIVO_MAPPING}         → Mapeamento ID → Conteúdo")
print(f"   • {ARQUIVO_METADATA}        → Metadados completos")
print(f"\nDimensão dos vetores: {dimension}")
print(f"Modelo utilizado: {MODELO_EMBEDDING}")
print(f"Total de registros vetorizados: {len(registros):,}")
print("\nO sistema MEV v3 agora pode usar este índice para recuperação semântica de alta qualidade.")
print("="*90)