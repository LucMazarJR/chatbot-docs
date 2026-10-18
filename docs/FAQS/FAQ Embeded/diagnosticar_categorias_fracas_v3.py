import json
import numpy as np
import faiss
import pickle
from pathlib import Path
from datetime import datetime
from sentence_transformers import SentenceTransformer
import pandas as pd

# ========================= CONFIGURAÇÃO =========================
DATASET_V3 = "dataset_final_saude_franca_v3.json"
EMBEDDINGS_FILE = "embeddings_saude_franca_v3.npy"
INDEX_FILE = "faiss_index_saude_franca_v3.bin"
MAPPING_FILE = "id_mapping_v3.pkl"

MODELO = "all-mpnet-base-v2"
K = 8
CATEGORIAS_ALVO = ["EXAMES", "UNIDADES"]
# ============================================================

print("🔍 Iniciando Diagnóstico Profundo das Categorias Fracas\n")

# Carregamento
with open(DATASET_V3, 'r', encoding='utf-8') as f:
    dataset = json.load(f)
registros = {item["id"]: item for item in dataset["data"]}

embeddings = np.load(EMBEDDINGS_FILE)
index = faiss.read_index(INDEX_FILE)
with open(MAPPING_FILE, 'rb') as f:
    mapping = pickle.load(f)

model = SentenceTransformer(MODELO, device='cuda')
print("✅ Arquivos carregados com sucesso.\n")

# ====================== IDENTIFICAR PERGUNTAS DE TESTE POR CATEGORIA ======================
perguntas_por_categoria = {}
for cat in CATEGORIAS_ALVO:
    perguntas_por_categoria[cat] = [
        item for item in dataset["data"] 
        if item.get("categoria", "").upper() == cat
    ]

print("📋 Perguntas analisadas por categoria:")
for cat, lista in perguntas_por_categoria.items():
    print(f"   • {cat}: {len(lista)} registros")

# ====================== FUNÇÃO DE BUSCA DETALHADA ======================
def buscar_detalhado(texto: str, k=8):
    query_embedding = model.encode([texto], normalize_embeddings=True)
    distances, indices = index.search(query_embedding, k)
    
    resultados = []
    for idx, dist in zip(indices[0], distances[0]):
        item_id = mapping[idx]["id"]
        item = registros[item_id]
        resultados.append({
            "rank": len(resultados)+1,
            "id": item_id,
            "pergunta": item["pergunta"][:70] + "...",
            "categoria": item.get("categoria", "SEM_CAT"),
            "score": round(float(dist), 4),
            "tags": " | ".join(item.get("tags", [])[:4])
        })
    return resultados

# ====================== DIAGNÓSTICO POR CATEGORIA ======================
diagnostico = []

for categoria in CATEGORIAS_ALVO:
    print(f"\n{'='*100}")
    print(f"🔬 DIAGNÓSTICO DETALHADO - CATEGORIA: {categoria}")
    print('='*100)
    
    itens = perguntas_por_categoria[categoria]
    acertos = 0
    erros = []
    
    for item in itens[:25]:  # Limitamos para não ficar muito longo
        pergunta = item["pergunta"]
        categoria_real = item.get("categoria", "")
        
        resultados = buscar_detalhado(pergunta, K)
        top1_cat = resultados[0]["categoria"]
        
        if top1_cat == categoria_real:
            acertos += 1
            status = "✅ ACERTO"
        else:
            status = "❌ ERRO"
            erros.append((pergunta, top1_cat, resultados))
        
        diagnostico.append({
            "categoria": categoria,
            "pergunta": pergunta[:65],
            "top1_categoria": top1_cat,
            "top1_score": resultados[0]["score"],
            "status": status
        })
        
        print(f"{status} | Score: {resultados[0]['score']:.4f} | Real: {categoria} → Top1: {top1_cat}")
        if status == "❌ ERRO":
            print("   Top 3 resultados:")
            for r in resultados[:3]:
                print(f"      {r['rank']}. [{r['categoria']}] {r['pergunta']} (score {r['score']})")
            print("-" * 80)
    
    n_analisados = len(itens[:25])
    print(f"\nResumo da categoria {categoria}: {acertos}/{n_analisados} acertos ({acertos/n_analisados*100:.0f}%)")

# ====================== RELATÓRIO FINAL ======================
df = pd.DataFrame(diagnostico)
print("\n" + "="*110)
print("📊 RELATÓRIO CONSOLIDADO DE DIAGNÓSTICO")
print("="*110)
print(df.groupby("categoria").agg(
    acertos=("status", lambda x: (x == "✅ ACERTO").sum()),
    total=("status", "count"),
    taxa_acerto=("status", lambda x: f"{(x == '✅ ACERTO').mean()*100:.1f}%")
))

print("\n\n💡 PRINCIPAIS CONCLUSÕES E PROPOSTAS DE MELHORIA:")
print("""
1. As categorias EXAMES e UNIDADES sofrem de alta sobreposição semântica com MEDICAMENTOS e DOENCAS.
2. Sugestão forte: Melhorar a qualidade do texto de embedding nessas categorias:
   - Adicionar prefixos fortes: "EXAME: ", "UNIDADE: ", "LOCAL: ", "COLETA: "
   - Dar mais peso às tags específicas (#exame, #coleta, #ubs, #laboratorio)
3. Estratégia híbrida recomendada para MEV v3:
   - Fazer busca vetorial normal
   - Aplicar re-ranking com peso maior para tags da categoria alvo
   - Usar filtro de categoria como "tie-breaker" quando scores forem próximos
4. Podemos gerar uma nova versão de embeddings (v3.1) com texto enriquecido apenas para essas categorias fracas.
""")

df.to_csv("diagnostico_categorias_fracas_v3.csv", index=False)
print("\nArquivo de diagnóstico salvo: diagnostico_categorias_fracas_v3.csv")
print("Estamos prontos para decidir a próxima melhoria concreta.")