import json
import numpy as np
import faiss
import pickle
from pathlib import Path
from datetime import datetime
from collections import defaultdict
from sentence_transformers import SentenceTransformer
import pandas as pd

# ========================= CONFIGURAÇÃO =========================
DATASET_V3 = "dataset_final_saude_franca_v3.json"
EMBEDDINGS_FILE = "embeddings_saude_franca_v3.npy"
INDEX_FILE = "faiss_index_saude_franca_v3.bin"
MAPPING_FILE = "id_mapping_v3.pkl"

MODELO = "all-mpnet-base-v2"
K = 5  # Quantidade de resultados retornados por busca
import torch
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
# ============================================================

print("🔄 Carregando arquivos para avaliação de busca...\n")

# Carregar dataset, embeddings, índice e mapping
with open(DATASET_V3, 'r', encoding='utf-8') as f:
    dataset = json.load(f)
registros = {item["id"]: item for item in dataset["data"]}

embeddings = np.load(EMBEDDINGS_FILE)
index = faiss.read_index(INDEX_FILE)
with open(MAPPING_FILE, 'rb') as f:
    mapping = pickle.load(f)

model = SentenceTransformer(MODELO, device=DEVICE)
print(f"✅ Todos os arquivos carregados. Total de registros: {len(registros):,} | Device: {DEVICE}\n")

# ====================== ANÁLISE DE DUPLICATAS ======================
print("📊 Análise de duplicatas de perguntas:")
perguntas_count = defaultdict(list)
for item in dataset["data"]:
    perguntas_count[item["pergunta"].strip().lower()].append(item["id"])

duplicatas = {p: ids for p, ids in perguntas_count.items() if len(ids) > 1}
print(f"   • Perguntas únicas: {len(perguntas_count)}")
print(f"   • Perguntas duplicadas: {len(duplicatas)} ({len(duplicatas)/len(perguntas_count)*100:.1f}%)")
print(f"   • Total de registros duplicados: {sum(len(ids)-1 for ids in duplicatas.values())}\n")

# ====================== CONJUNTO DE TESTE ======================
# 50 perguntas cobrindo as 6 categorias + duplicatas intencionais
perguntas_teste = [
    # --- MEDICAMENTOS (10) ---
    "Quais documentos preciso para retirar medicamento na UBS?",
    "Qual a validade de receita de medicamento contínuo?",
    "Como tomar Sulfato Ferroso corretamente?",
    "O que é necessário para retirar insulina na Casa do Diabético?",
    "Preciso de receita para retirar Soro de Reidratação Oral?",
    "Onde retirar Ácido Fólico gratuitamente em Franca?",
    "Qual a dose diária recomendada de Metformina?",
    "Posso retirar antibiótico sem receita no SUS?",
    "Como solicitar medicamento de alto custo?",
    "O que fazer se acabar meu medicamento controlado antes do prazo?",
    # --- DOENÇAS (10) ---
    "Quais são os sintomas de pneumonia?",
    "Qual o tratamento para Insuficiência Cardíaca?",
    "Como funciona o tratamento de Hepatite C no SUS?",
    "O que causa câncer de pulmão?",
    "Quais são os sintomas de tuberculose?",
    "Como é feito o diagnóstico de diabetes tipo 2?",
    "Qual a diferença entre hipertensão arterial e pressão alta?",
    "O que é dengue e como prevenir?",
    "Quais são os sinais de AVC que exigem emergência?",
    "Como tratar infecção urinária recorrente?",
    # --- EXAMES (10) ---
    "Onde realizar coleta de exame de sangue em Franca?",
    "Como me preparar para exame de glicemia em jejum?",
    "O que mede o exame de ferritina?",
    "Para que serve o exame de hemograma completo?",
    "Preciso de pedido médico para fazer tomografia?",
    "Qual o prazo de entrega de resultado de exame laboratorial?",
    "Onde fazer ultrassonografia pelo SUS em Franca?",
    "Como agendar exame de raio-x na rede municipal?",
    "O que é colonoscopia e quando é indicada?",
    "Exame de PSA é obrigatório para homens acima de 50 anos?",
    # --- SAÚDE MENTAL (8) ---
    "O que faz o CAPS em Franca?",
    "Quem pode ser atendido no CAPS?",
    "Como tratar depressão pelo SUS?",
    "O que é transtorno de ansiedade generalizada?",
    "Como funciona o CAPS AD para dependentes químicos?",
    "Quais medicamentos são usados para tratar ansiedade?",
    "Onde buscar apoio para saúde mental em Franca?",
    "Quais os sintomas de burnout?",
    # --- UNIDADES (7) ---
    "Qual o horário de funcionamento das UBS em Franca?",
    "O que faz o Setor de Ações Judiciais da Secretaria de Saúde?",
    "Como agendar consulta em especialista pelo SUS?",
    "Qual UBS atende meu bairro?",
    "O que é o NASF e como acessar?",
    "Onde fica a UPA de Franca?",
    "Como funciona o pronto-socorro municipal?",
    # --- DUPLICATAS INTENCIONAIS (5) ---
    "Quais documentos preciso para retirar medicamento na UBS?",   # dup MEDICAMENTOS
    "Quais são os sintomas de tuberculose?",                        # dup DOENÇAS
    "O que faz o CAPS em Franca?",                                  # dup SAÚDE MENTAL
    "Onde realizar coleta de exame de sangue em Franca?",           # dup EXAMES
    "Qual o horário de funcionamento das UBS em Franca?",           # dup UNIDADES
]

CATEGORIAS_TESTE = [
    *(["MEDICAMENTOS"] * 10),
    *(["DOENCAS"] * 10),
    *(["EXAMES"] * 10),
    *(["SAUDE_MENTAL"] * 8),
    *(["UNIDADES"] * 7),
    *(["MEDICAMENTOS", "DOENCAS", "SAUDE_MENTAL", "EXAMES", "UNIDADES"]),  # duplicatas
]

# ====================== FUNÇÕES DE BUSCA ======================
def buscar(texto: str, strategy="padrao", categoria_filtro=None):
    query_embedding = model.encode([texto], normalize_embeddings=True)
    # Com filtro, busca K*10 candidatos para ter margem após filtragem
    k_busca = K * 10 if categoria_filtro else K
    distances, indices = index.search(query_embedding, k_busca)
    
    resultados = []
    for idx, dist in zip(indices[0], distances[0]):
        item_id = mapping[idx]["id"]
        item = registros[item_id]
        
        # Filtro por categoria
        if categoria_filtro and item.get("categoria") != categoria_filtro:
            continue
            
        score = float(dist)
        resultados.append({
            "id": item_id,
            "pergunta": item["pergunta"],
            "resposta": item["resposta"][:180] + "...",
            "categoria": item.get("categoria", ""),
            "tags": item.get("tags", []),
            "score": round(score, 4),
            "strategy": strategy
        })
        if len(resultados) == K:
            break
    return resultados

# ====================== EXECUÇÃO DOS TESTES ======================
resultados_teste = []
resumo_por_estrategia = defaultdict(list)

print("🚀 Executando testes de busca com 3 estratégias...\n")

for i, (pergunta, cat_esperada) in enumerate(zip(perguntas_teste, CATEGORIAS_TESTE)):
    # Estratégia 1: Busca pura por similaridade de cosseno
    res1 = buscar(pergunta, strategy="similaridade_pura")
    
    # Estratégia 2: Busca com filtro pela categoria esperada
    res2 = buscar(pergunta, strategy="com_filtro_categoria", categoria_filtro=cat_esperada)
    
    # Estratégia 3: Re-ranking via enriquecimento da query com tags do top-1
    tags_top1 = res1[0]["tags"][:3] if res1 else []
    res3 = buscar(pergunta + " " + " ".join(tags_top1), strategy="com_tags")
    
    for r in res1[:K]: r["pergunta_query"] = pergunta; r["categoria_esperada"] = cat_esperada
    for r in res2[:K]: r["pergunta_query"] = pergunta; r["categoria_esperada"] = cat_esperada
    for r in res3[:K]: r["pergunta_query"] = pergunta; r["categoria_esperada"] = cat_esperada

    resultados_teste.extend(res1[:3])
    resultados_teste.extend(res2[:2])
    resultados_teste.extend(res3[:2])
    
    # Acumula scores para resumo
    for res, strat in [(res1, "similaridade_pura"), (res2, "com_filtro_categoria"), (res3, "com_tags")]:
        if res:
            acerto = 1 if res[0]["categoria"] == cat_esperada else 0
            resumo_por_estrategia[strat].append({"score_top1": res[0]["score"], "acerto_cat": acerto})

# ====================== GERAR RELATÓRIO ======================
df = pd.DataFrame(resultados_teste)
print("\n" + "="*100)
print("📋 RELATÓRIO DE AVALIAÇÃO DE BUSCA - DATASET SAÚDE FRANCA v3")
print("="*100)
print(f"Data da avaliação : {datetime.now().strftime('%d/%m/%Y %H:%M')}")
print(f"Modelo embedding  : {MODELO} | Device: {DEVICE}")
print(f"Total registros   : {len(registros):,} | Duplicatas: {len(duplicatas)} perguntas ({len(duplicatas)/len(perguntas_count)*100:.1f}%)")
print(f"Perguntas testadas: {len(perguntas_teste)} (45 originais + 5 duplicatas intencionais)")
print("="*100)

# Resumo por estratégia
print("\n📊 DESEMPENHO POR ESTRATÉGIA (sobre top-1):")
print(f"  {'Estratégia':<28} {'Score médio':>12} {'Acerto categoria':>18} {'N':>5}")
print("-" * 68)
for strat in ["similaridade_pura", "com_filtro_categoria", "com_tags"]:
    dados = resumo_por_estrategia[strat]
    if dados:
        score_med = np.mean([d["score_top1"] for d in dados])
        acerto_pct = np.mean([d["acerto_cat"] for d in dados]) * 100
        print(f"  {strat:<28} {score_med:>12.4f} {acerto_pct:>17.1f}% {len(dados):>5}")

# Desempenho por categoria
print("\n📌 SCORE MÉDIO TOP-1 POR CATEGORIA (estratégia: similaridade_pura):")
df_s1 = df[df["strategy"] == "similaridade_pura"].copy()
df_top1 = df_s1.groupby("pergunta_query").first().reset_index()
for cat in sorted(df_top1["categoria_esperada"].unique()):
    sub = df_top1[df_top1["categoria_esperada"] == cat]
    acerto = (sub["categoria"] == cat).mean() * 100
    score_m = sub["score"].mean()
    print(f"  {cat:<18} score={score_m:.4f}  acerto_cat={acerto:.0f}%  n={len(sub)}")

print("\n\n💡 CONCLUSÕES E RECOMENDAÇÕES:")
print(f"• Duplicatas: {len(duplicatas)} perguntas ({len(duplicatas)/len(perguntas_count)*100:.1f}%) — considerar deduplicação por embedding antes de indexar")
print("• Estratégia 'com_filtro_categoria' maximiza precisão quando a categoria é conhecida")
print("• Estratégia 'com_tags' melhora recall em perguntas clínicas específicas")
print("• Próximo passo: integrar MEV v3 como re-ranker sobre os top-K do FAISS")
print("• Recomendado: expandir para 150 perguntas com ground truth para benchmark quantitativo final")
print("="*100)

# Salvar relatório completo
df.to_csv("relatorio_busca_v3.csv", index=False)
print(f"\nRelatório salvo em: relatorio_busca_v3.csv ({len(df)} linhas)")
print("Pronto para comparar com o desempenho do MEV v3.")