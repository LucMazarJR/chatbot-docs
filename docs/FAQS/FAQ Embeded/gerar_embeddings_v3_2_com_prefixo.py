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
DATASET_V31 = "dataset_final_saude_franca_v3.1.json"

MODELO_EMBEDDING = "all-mpnet-base-v2"

ARQUIVO_EMBEDDINGS = "embeddings_saude_franca_v3.2.npy"
ARQUIVO_INDEX_FAISS = "faiss_index_saude_franca_v3.2.bin"
ARQUIVO_METADATA = "metadata_embeddings_v3.2.json"
ARQUIVO_MAPPING = "id_mapping_v3.2.pkl"

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
# ============================================================

print(f"🚀 Gerando Embeddings v3.2 com Prefixos de Categoria | Device: {DEVICE}\n")

with open(DATASET_V31, 'r', encoding='utf-8') as f:
    dataset = json.load(f)

registros = dataset["data"]
print(f"✅ Dataset v3.1 carregado: {len(registros):,} registros\n")

# ====================== CRIAÇÃO DE TEXTO COM PREFIXO ======================
textos_para_embedding = []
mapping = []

prefixo_map = {
    "EXAMES": "[EXAME] ",
    "UNIDADES": "[UNIDADE] ",
    "MEDICAMENTOS": "[MEDICAMENTO] ",
    "DOENCAS": "[DOENÇA] ",
    "SAUDE_MENTAL": "[SAÚDE MENTAL] ",
    "OUTROS": ""
}

for item in registros:
    cat = item.get("categoria", "OUTROS").upper()
    prefixo = prefixo_map.get(cat, "")
    
    tags_str = " ".join(item.get("tags", []))
    
    texto_combinado = (
        f"{prefixo}Pergunta: {item['pergunta']}\n"
        f"Resposta: {item['resposta']}\n"
        f"Tags: {tags_str}\n"
        f"Categoria: {cat}"
    )
    textos_para_embedding.append(texto_combinado)
    
    mapping.append({
        "id": item.get("id", ""),
        "categoria": cat,
        "pergunta": item["pergunta"],
        "fonte": item.get("fonte", "original"),
        "tags": item.get("tags", [])
    })

print("Carregando modelo e gerando embeddings com prefixos...")
model = SentenceTransformer(MODELO_EMBEDDING, device=DEVICE)

batch_size = 128
t0 = time.time()
embeddings = model.encode(
    textos_para_embedding,
    batch_size=batch_size,
    show_progress_bar=True,
    convert_to_numpy=True,
    normalize_embeddings=True
)
elapsed = time.time() - t0

print(f"\n✅ Embeddings v3.2 gerados em {elapsed:.1f}s ({len(textos_para_embedding)/elapsed:.0f} reg/s)")
print(f"   Formato: {embeddings.shape} | dtype: {embeddings.dtype}")

# ====================== SALVAR ======================
dimension = embeddings.shape[1]
index = faiss.IndexFlatIP(dimension)
index.add(embeddings)

np.save(ARQUIVO_EMBEDDINGS, embeddings)
faiss.write_index(index, ARQUIVO_INDEX_FAISS)

with open(ARQUIVO_MAPPING, 'wb') as f:
    pickle.dump(mapping, f)

metadata = {
    "versao": "3.2",
    "data_geracao": datetime.now().isoformat(),
    "modelo_embedding": MODELO_EMBEDDING,
    "dimensao": int(dimension),
    "total_registros": len(registros),
    "device_usado": DEVICE,
    "tempo_encoding_s": round(elapsed, 2),
    "tecnica_usada": "Prefixos de categoria no texto de embedding ([EXAME], [MEDICAMENTO], etc.)",
    "melhoria_esperada": "Principalmente em EXAMES e UNIDADES com perguntas genéricas",
    "dataset_origem": "dataset_final_saude_franca_v3.1.json",
    "observacao": "v3.2 - Embeddings com prefixos categóricos fortes. Estratégia mais eficaz para reduzir ambiguidade entre categorias."
}

with open(ARQUIVO_METADATA, 'w', encoding='utf-8') as f:
    json.dump(metadata, f, ensure_ascii=False, indent=2)

print("\n" + "="*95)
print("🎉 EMBEDDINGS V3.2 (COM PREFIXOS) GERADOS COM SUCESSO!")
print("="*95)
print("Arquivos gerados:")
print(f"   • {ARQUIVO_EMBEDDINGS}")
print(f"   • {ARQUIVO_INDEX_FAISS}")
print(f"   • {ARQUIVO_MAPPING}")
print(f"   • {ARQUIVO_METADATA}")
print(f"\nEsta versão deve melhorar significativamente o acerto de categoria em queries genéricas.")
print("Próximo passo: Rodar a avaliação comparativa v3.1 × v3.2")
print("="*95)