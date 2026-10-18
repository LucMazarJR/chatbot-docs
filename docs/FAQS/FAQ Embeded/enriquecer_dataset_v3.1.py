import json
from pathlib import Path
from datetime import datetime
import re
from collections import defaultdict

# ========================= CONFIGURAÇÃO =========================
INPUT_DATASET = "dataset_final_saude_franca_v3.json"
OUTPUT_DATASET = "dataset_final_saude_franca_v3.1.json"

# Tags genéricas que NÃO identificam o exame específico
TAGS_GENERICAS = {
    "#exame", "#diagnostico", "#coleta", "#laboratorial", "#laboratorio",
    "#sus", "#gestao", "#farmacologia", "#medicamento", "#dosagem",
    "#atencao_primaria", "#ubs", "#unidade_basica", "#saude",
    "#endereço", "#telefone", "#horario", "#laboratório",
    "#anemia", "#infeccao", "#gordura", "#hormônios", "#ferro",
    "#colesterol", "#tireoide", "#gestacao", "#gravidez",
}

# Lista positiva de tags que SÃO nomes de exames — têm prioridade máxima
TAGS_NOMES_EXAME = {
    "#hemograma", "#glicemia", "#ferritina", "#tsh", "#t4", "#psa",
    "#triglicerides", "#triglicérides", "#colesterol_total", "#creatinina",
    "#ureia", "#vitamina_d", "#vitamina_b12", "#urocultura",
    "#parasitologico", "#eletroforese", "#hiv", "#hepatite_b", "#hepatite_c",
    "#sifilis", "#fator_reumatoide", "#calcio", "#sodio", "#potassio",
    "#tgo", "#tgp", "#tomografia", "#rx", "#ultrassom",
}

# Padrões genéricos de perguntas de EXAMES que devem ser enriquecidos
PADROES_GENERICOS = [
    (r"(?i)^para que serve o exame\??$",  "Para que serve o exame de {nome}?"),
    (r"(?i)^onde eu realizo a coleta do exame\??$", "Onde realizo a coleta do exame de {nome} em Franca?"),
    (r"(?i)^como me preparar para o exame\??$", "Como me preparar para o exame de {nome}?"),
]

def extrair_nome_exame(tags: list) -> str:
    """Extrai o nome do exame a partir das tags. Prioriza lista positiva de nomes de exames."""
    # Prioridade 1: tag que é nome de exame conhecido
    for tag in tags:
        if tag in TAGS_NOMES_EXAME:
            return tag.lstrip("#").replace("_", " ").capitalize()
    # Sem match na lista positiva → não enriquece (evita termos errados)
    return ""

def enriquecer_pergunta_exame(pergunta: str, resposta: str, tags: list) -> str:
    """Substitui perguntas genéricas de exames pelo nome específico extraído das tags."""
    nome = extrair_nome_exame(tags)
    if not nome:
        return pergunta
    for padrao, template in PADROES_GENERICOS:
        if re.match(padrao, pergunta.strip()):
            return template.format(nome=nome)
    return pergunta

def gerar_novas_perguntas_especificas(proximo_id: int):
    """Gera novas perguntas específicas e bem ancoradas"""
    novas = []
    
    # === EXAMES ESPECÍFICOS ===
    exames_especificos = [
        ("Para que serve o exame de Hemograma Completo e quais valores são preocupantes?", 
         "O hemograma avalia glóbulos vermelhos, brancos e plaquetas. Valores preocupantes incluem hemoglobina < 12g/dL (mulheres) ou < 13g/dL (homens), leucócitos fora do intervalo 4.000-11.000, plaquetas < 150.000. Deve ser interpretado por médico.", 
         "EXAMES", ["#exame", "#hemograma", "#laboratorio", "#coleta"]),
        
        ("Onde posso realizar exame de TSH e T4 Livre em Franca pelo SUS?", 
         "Os exames de TSH e T4 Livre são realizados no Laboratório Municipal ou em UBS com coleta. É necessário pedido médico. O resultado geralmente sai em 5 a 10 dias úteis.", 
         "EXAMES", ["#exame", "#tsh", "#t4", "#laboratorio", "#sus"]),
        
        ("Qual o preparo necessário para exame de glicemia de jejum?", 
         "Jejum de 8 a 12 horas. Pode beber água. Não pode ingerir café, chá ou balas. Medicamentos devem ser confirmados com o médico solicitante.", 
         "EXAMES", ["#exame", "#glicemia", "#laboratorio", "#preparo"]),
    ]
    
    # === UNIDADES E FLUXOS ===
    unidades = [
        ("Qual UBS atende a região do Jardim Progresso em Franca?", 
         "A UBS do Jardim Progresso atende de segunda a sexta, das 07:00 às 16:00. É referência para a região norte da cidade.", 
         "UNIDADES", ["#ubs", "#unidade_basica", "#jardim_progresso"]),
        
        ("Qual a diferença entre ir na UBS e no NGA-16 para retirar medicamentos?", 
         "UBS: medicamentos da atenção básica (AAS, Metformina, Omeprazol). NGA-16/CSI: medicamentos especializados (Varfarina, Clonidina, insumos complexos).", 
         "UNIDADES", ["#ubs", "#nga16", "#medicamento", "#fluxo"]),
    ]
    
    for p, r, cat, tags in exames_especificos + unidades:
        novas.append({
            "id": proximo_id + len(novas),
            "pergunta": p,
            "resposta": r,
            "categoria": cat,
            "tags": tags,
            "fonte": "enriquecimento_externo",
            "data_adicao": datetime.now().strftime("%d/%m/%Y"),
            "observacao": "Pergunta específica adicionada para melhorar cobertura semântica"
        })
    return novas

# ====================== EXECUÇÃO PRINCIPAL ======================
print("🔄 Iniciando Enriquecimento Inteligente - Dataset v3.1\n")

with open(INPUT_DATASET, 'r', encoding='utf-8') as f:
    dataset = json.load(f)

registros = dataset["data"]
registros_originais = len(registros)
proximo_id = max(item["id"] for item in registros if isinstance(item["id"], int)) + 1
modificados = 0
adicionados = 0

# 1. Melhorar perguntas genéricas de exames existentes
for item in registros:
    if item.get("categoria", "").upper() in ["EXAMES", "UNIDADES"]:
        pergunta_original = item["pergunta"]
        nova_pergunta = enriquecer_pergunta_exame(
            pergunta_original, item["resposta"], item.get("tags", [])
        )
        
        if nova_pergunta != pergunta_original:
            item["pergunta"] = nova_pergunta
            if "tags" not in item or not item["tags"]:
                item["tags"] = ["#exame", "#coleta"]
            item["fonte"] = item.get("fonte", "original")
            item["versao"] = "3.1"
            modificados += 1

# 2. Adicionar novas perguntas específicas
novas_perguntas = gerar_novas_perguntas_especificas(proximo_id)
registros.extend(novas_perguntas)
adicionados = len(novas_perguntas)

# Atualizar metadata
dataset["metadata"]["versao"] = "3.1"
dataset["metadata"]["data_geracao"] = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
dataset["metadata"]["total_registros"] = len(registros)
dataset["metadata"]["observacao"] = f"v3.1 - Enriquecimento de {modificados} perguntas genéricas + {adicionados} novas perguntas específicas marcadas com 'fonte: enriquecimento_externo'."

with open(OUTPUT_DATASET, 'w', encoding='utf-8') as f:
    json.dump(dataset, f, ensure_ascii=False, indent=2)

print("="*85)
print("✅ DATASET V3.1 GERADO COM SUCESSO!")
print("="*85)
print(f"Registros originais     : {registros_originais}")
print(f"Perguntas enriquecidas  : {modificados}")
print(f"Novas perguntas adicionadas : {adicionados}")
print(f"Total final             : {len(registros)} registros")
print(f"\nArquivo salvo como: {OUTPUT_DATASET}")
print("\nPróximo passo recomendado: Gerar novos embeddings (v3.1) a partir deste dataset enriquecido.")
print("="*85)