import json
from pathlib import Path
from datetime import datetime
import re
from collections import Counter

# ========================= CONFIGURAÇÃO =========================
INPUT_DATASET = "dataset_final_saude_franca_v2.json"
OUTPUT_DATASET = "dataset_final_saude_franca_v3.json"

# Dicionário expandido e mais inteligente de palavras-chave
TAG_DICTIONARY = {
    "pneumonia": ["#pneumonia", "#respiratorio", "#infeccao_pulmonar"],
    "fratura": ["#fratura", "#ortopedia", "#trauma", "#osso"],
    "antibiótico": ["#antibiotico", "#medicamento", "#tratamento_infeccao"],
    "depressão": ["#depressao", "#saude_mental", "#transtorno_humor"],
    "ansiedade": ["#ansiedade", "#saude_mental", "#transtorno_ansioso"],
    "tomografia": ["#tomografia", "#exame_imagem", "#diagnostico"],
    "raio x": ["#rx", "#exame_imagem", "#radiologia"],
    "ultrassonografia": ["#ultrassom", "#exame_imagem"],
    "vacina": ["#vacina", "#imunizacao", "#prevencao"],
    "ubs": ["#ubs", "#atencao_primaria", "#unidade_basica"],
    "hospital": ["#hospital", "#atencao_secundaria"],
    "sus": ["#sus", "#sistema_unico_saude"],
    "medicamento": ["#medicamento", "#farmacologia"],
    "exame": ["#exame", "#diagnostico"],
    "tratamento": ["#tratamento", "#terapia"],
    "sintoma": ["#sintomas", "#clinica"],
    "prevenção": ["#prevencao", "#saude_coletiva"],
    "gestão": ["#gestao", "#administracao", "#organizacao"],
    "mental": ["#saude_mental", "#psicologia", "#psiquiatria"]
}

def gerar_tags_inteligentes(pergunta: str, resposta: str) -> list:
    texto = (pergunta + " " + resposta).lower()
    tags = set()
    
    # 1. Aplicar dicionário de palavras-chave
    for keyword, tag_list in TAG_DICTIONARY.items():
        if keyword in texto:
            tags.update(tag_list)
    
    # 2. Regras específicas por categoria
    if "DOENCAS" in pergunta.upper() or "DOENCAS" in resposta.upper():
        tags.add("#doenca")
    if "MEDICAMENTOS" in pergunta.upper() or any(x in texto for x in ["mg", "comprimido", "dose", "via oral"]):
        tags.add("#medicamento")
    if any(x in texto for x in ["exame", "laboratorial", "sangue", "coleta"]):
        tags.add("#exame")
    if any(x in texto for x in ["ubs", "unidade básica", "posto de saúde"]):
        tags.add("#ubs")
    if any(x in texto for x in ["hospital", "pronto socorro", "upa"]):
        tags.add("#hospital")
    
    # 3. Tags genéricas de segurança
    if not tags:
        tags.add("#saude")
        if "como" in texto[:30]:
            tags.add("#orientacao")
    
    return sorted(list(tags))

# ====================== EXECUÇÃO ======================
print("🔄 Iniciando melhoria de Tags - Gerando Dataset v3.0\n")

with open(INPUT_DATASET, 'r', encoding='utf-8') as f:
    dataset = json.load(f)

registros = dataset["data"]
tags_geradas = 0
registros_sem_tag_antes = 0

for item in registros:
    if not item.get("tags") or len(item.get("tags", [])) == 0:
        registros_sem_tag_antes += 1
        novas_tags = gerar_tags_inteligentes(item["pergunta"], item["resposta"])
        item["tags"] = novas_tags
        tags_geradas += 1
    else:
        # Mesmo quem já tem tags, podemos enriquecer
        novas_tags = gerar_tags_inteligentes(item["pergunta"], item["resposta"])
        item["tags"] = sorted(list(set(item["tags"] + novas_tags)))

# Atualizar metadata
dataset["metadata"]["versao"] = "3.0"
dataset["metadata"]["data_geracao"] = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
dataset["metadata"]["observacao"] = "Versão 3.0 - Tags aprimoradas automaticamente. Cobertura de tags próxima de 100%."

with open(OUTPUT_DATASET, 'w', encoding='utf-8') as f:
    json.dump(dataset, f, ensure_ascii=False, indent=2)

print("="*80)
print("✅ DATASET V3 GERADO COM SUCESSO!")
print("="*80)
print(f"Registros analisados          : {len(registros)}")
print(f"Registros sem tag (antes)     : {registros_sem_tag_antes}")
print(f"Tags geradas automaticamente  : {tags_geradas}")
print(f"Arquivo final salvo como      : {OUTPUT_DATASET}")
print("\nCobertura estimada de tags agora: > 98%")
print("\nPróximo passo recomendado: Gerar os embeddings a partir da v3.")
print("="*80)