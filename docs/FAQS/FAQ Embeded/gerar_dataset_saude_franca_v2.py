import json
import re
from pathlib import Path
from datetime import datetime
from docx import Document
from collections import defaultdict
import unicodedata

# ========================= CONFIGURAÇÃO =========================
DATASET_V1 = "dataset_final_saude_franca_v1.json"
ARQUIVO_SAIDA = "dataset_final_saude_franca_v2.json"

ARQUIVOS_DOCX = [
    "FAQ MEDICAMENTOS.docx",
    "FAQ MEDICINA 1.docx",
    "FAQ PROCEDIMENTOS.docx",
    "FAQ SAUDE MENTAL.docx",
    "FAQ UNIDADES DE SAUDE.docx",
    "ORGANOGRAMA SEC SAUDE .docx",
    "PADRÃO FAQ.docx",
    "FAQ DOENCAS - MEDICINA .docx"
]

CATEGORIAS = {
    "FAQ MEDICAMENTOS.docx": "MEDICAMENTOS",
    "FAQ MEDICINA 1.docx": "DOENCAS",
    "FAQ PROCEDIMENTOS.docx": "EXAMES",
    "FAQ SAUDE MENTAL.docx": "SAUDE_MENTAL",
    "FAQ UNIDADES DE SAUDE.docx": "UNIDADES",
    "ORGANOGRAMA SEC SAUDE .docx": "GESTAO",
    "PADRÃO FAQ.docx": "TEMPLATE",
    "FAQ DOENCAS - MEDICINA .docx": "DOENCAS"
}

# Dicionário de tags automáticas por palavra-chave
KEYWORDS_TO_TAGS = {
    "pneumonia": "#pneumonia #respiratorio",
    "fratura": "#fratura #ortopedia #trauma",
    "antibiótico": "#antibiotico #medicamento",
    "exame": "#diagnostico #exame",
    "tomografia": "#imagem #tomografia",
    "depressão": "#depressao #saude_mental",
    "ansiedade": "#ansiedade #saude_mental",
    "vacina": "#vacina #prevencao",
    "hospital": "#unidade #hospital",
    "ubs": "#ubs #atencao_primaria",
    "sus": "#sus #gestao"
}

# ============================================================

def limpar_texto(texto: str) -> str:
    if not texto: return ""
    texto = re.sub(r'\s+', ' ', texto.strip())
    return texto

def extrair_tags_e_referencia(texto: str):
    tags = []
    referencia = ""
    
    # Captura tags (#palavra)
    tags_encontradas = re.findall(r'#[\w_]+', texto)
    tags.extend(tags_encontradas)
    
    # Captura referências (Ref:, Referência:, Fonte:, etc.)
    ref_match = re.search(r'(?:Ref|Referência|Fonte|Bibliografia)[:\s]+(.+?)(?=P:|R:|TAGS:|#|$)', texto, re.I)
    if ref_match:
        referencia = limpar_texto(ref_match.group(1))
    
    # Geração automática de tags
    texto_lower = texto.lower()
    for keyword, tag_str in KEYWORDS_TO_TAGS.items():
        if keyword in texto_lower and not any(t in tag_str for t in tags):
            tags.extend(tag_str.split())
    
    return list(set(tags)), referencia

def extrair_perguntas_respostas_v2(docx_path: Path) -> list:
    doc = Document(docx_path)
    full_text = "\n".join([p.text for p in doc.paragraphs])
    categoria = CATEGORIAS.get(docx_path.name, "GERAL")
    registros = []
    
    # Regex mais robusto (melhorado)
    pattern = re.compile(r'P[:\.]\s*(.+?)\s*(?=R[:\.]|TAGS[:\.]|Ref|Referência|Fonte)', re.DOTALL | re.I)
    matches = pattern.finditer(full_text)
    
    for match in matches:
        pergunta = limpar_texto(match.group(1))
        # Pega o restante até o próximo P:
        start = match.end()
        next_p = re.search(r'P[:\.]', full_text[start:])
        end = start + (next_p.start() if next_p else len(full_text))
        bloco = full_text[start:end]
        
        resposta_match = re.search(r'R[:\.]\s*(.+?)(?=P[:\.]|TAGS[:\.]|Ref|Referência|Fonte|$)', bloco, re.DOTALL | re.I)
        resposta = limpar_texto(resposta_match.group(1)) if resposta_match else limpar_texto(bloco)
        
        if len(pergunta) < 10 or len(resposta) < 20:
            continue
            
        tags, referencia = extrair_tags_e_referencia(bloco + resposta)
        
        registros.append({
            "pergunta": pergunta,
            "resposta": resposta,
            "categoria": categoria,
            "tags": tags,
            "referencia": referencia,
            "fonte_arquivo": docx_path.name,
            "subcategoria": ""  # pode ser aprimorado depois
        })
    
    return registros

# ====================== EXECUÇÃO ======================
print("🚀 Gerando Dataset v2.0 - Saúde Franca (Melhorado)\n")

todos_registros = []

for arquivo_nome in ARQUIVOS_DOCX:
    caminho = Path(arquivo_nome)
    if caminho.exists():
        print(f"📄 Processando: {arquivo_nome}")
        registros = extrair_perguntas_respostas_v2(caminho)
        todos_registros.extend(registros)
        print(f"   → Extraídos {len(registros)} registros (com tags)")
    else:
        print(f"⚠️  Arquivo não encontrado: {arquivo_nome}")

# Montagem final
dataset_v2 = {
    "metadata": {
        "versao": "2.0",
        "data_geracao": datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
        "total_registros": len(todos_registros),
        "descricao": "Dataset v2 com parser aprimorado, tags automáticas e referências extraídas.",
        "observacao": "Tags agora são geradas automaticamente quando não presentes no documento original."
    },
    "data": []
}

for i, item in enumerate(todos_registros, 1):
    item["id"] = i
    item["data_criacao"] = datetime.now().isoformat()
    dataset_v2["data"].append(item)

with open(ARQUIVO_SAIDA, 'w', encoding='utf-8') as f:
    json.dump(dataset_v2, f, ensure_ascii=False, indent=2)

print("\n" + "="*85)
print("✅ DATASET V2 GERADO COM SUCESSO!")
print(f"📊 Total de registros: {len(todos_registros)}")
print(f"💾 Arquivo salvo: {ARQUIVO_SAIDA}")
print("\nPróximo passo recomendado: Rodar o script de análise v2.")
print("="*85)