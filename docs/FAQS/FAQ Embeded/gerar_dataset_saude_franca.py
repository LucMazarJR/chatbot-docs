import json
import re
from pathlib import Path
from datetime import datetime
from docx import Document
from typing import List, Dict

# ========================= CONFIGURAÇÃO =========================
DATASET_EXISTENTE = "dataset_unificado_saude_franca.json"

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

# ============================================================

def limpar_texto(texto: str) -> str:
    if not texto:
        return ""
    texto = re.sub(r'\s+', ' ', texto.strip())
    return texto

def extrair_perguntas_respostas(docx_path: Path) -> List[Dict]:
    try:
        doc = Document(docx_path)
        full_text = "\n".join([para.text for para in doc.paragraphs if para.text.strip()])
        
        registros = []
        categoria = CATEGORIAS.get(docx_path.name, "OUTROS")
        
        # Padrão principal P: ... R: ...
        matches = re.findall(r'P:\s*(.*?)(?=R:|TAGS:|Ref:|Referência:|$)(.*?)R:\s*(.*?)(?=P:|R:|TAGS:|Ref:|Referência:|$)', 
                            full_text, re.DOTALL | re.IGNORECASE)
        
        for match in matches:
            pergunta = limpar_texto(match[0])
            resposta = limpar_texto(match[1] + " " + match[2])
            
            if pergunta and resposta and len(pergunta) > 8 and len(resposta) > 15:
                registros.append({
                    "pergunta": pergunta,
                    "resposta": resposta,
                    "categoria": categoria,
                    "fonte_arquivo": docx_path.name
                })
        
        # Fallback para arquivos com formatação diferente
        if len(registros) < 5:
            lines = [line.strip() for line in full_text.split('\n') if line.strip()]
            i = 0
            while i < len(lines):
                if any(x in lines[i].upper() for x in ['P:', 'PERGUNTA:', 'O QUE', 'COMO', 'ONDE', 'QUANDO', 'QUAL']):
                    pergunta = limpar_texto(lines[i])
                    resposta = ""
                    i += 1
                    while i < len(lines) and not any(x in lines[i].upper() for x in ['P:', 'PERGUNTA:', 'R:']):
                        resposta += " " + lines[i]
                        i += 1
                    resposta = limpar_texto(resposta)
                    if pergunta and resposta and len(resposta) > 20:
                        registros.append({
                            "pergunta": pergunta,
                            "resposta": resposta,
                            "categoria": categoria,
                            "fonte_arquivo": docx_path.name
                        })
                    continue
                i += 1
        
        return registros
        
    except Exception as e:
        print(f"Erro ao processar {docx_path.name}: {e}")
        return []

# ====================== EXECUÇÃO ======================

print("🚀 Iniciando geração do Dataset Unificado de Saúde de Franca...\n")

todos_registros = []

# Carregar dataset existente (doenças já processadas)
try:
    with open(DATASET_EXISTENTE, 'r', encoding='utf-8') as f:
        dados_existentes = json.load(f)
        if isinstance(dados_existentes, dict) and 'data' in dados_existentes:
            todos_registros.extend(dados_existentes['data'])
            print(f"✓ Carregados {len(dados_existentes['data'])} registros do dataset de doenças.")
except:
    print("⚠️  Dataset existente não encontrado. Será criado do zero.")

# Processar todos os arquivos .docx
for arquivo_nome in ARQUIVOS_DOCX:
    caminho = Path(arquivo_nome)
    if caminho.exists():
        print(f"📄 Processando: {arquivo_nome}")
        registros = extrair_perguntas_respostas(caminho)
        todos_registros.extend(registros)
        print(f"   → Extraídos {len(registros)} registros")
    else:
        print(f"⚠️  Arquivo não encontrado: {arquivo_nome}")

# Criar estrutura final
dataset_final = {
    "metadata": {
        "versao": "1.0",
        "data_geracao": datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
        "total_registros": len(todos_registros),
        "descricao": "Dataset completo unificado do Chatbot de Saúde de Franca-SP. Preparado para embeddings e integração com MEV v3.",
        "observacao": "Gerado automaticamente a partir de 8 arquivos .docx"
    },
    "data": []
}

for i, item in enumerate(todos_registros, 1):
    registro = {
        "id": i,
        "categoria": item.get("categoria", "GERAL"),
        "pergunta": item.get("pergunta", ""),
        "resposta": item.get("resposta", ""),
        "tags": item.get("tags", []),
        "referencia": item.get("referencia", ""),
        "fonte_arquivo": item.get("fonte_arquivo", ""),
        "data_criacao": datetime.now().isoformat()
    }
    dataset_final["data"].append(registro)

# Salvar arquivo final
nome_final = "dataset_final_saude_franca_v1.json"
with open(nome_final, 'w', encoding='utf-8') as f:
    json.dump(dataset_final, f, ensure_ascii=False, indent=2)

print("\n" + "="*90)
print("✅ DATASET GERADO COM SUCESSO!")
print(f"📊 Total de registros: {len(todos_registros)}")
print(f"💾 Arquivo salvo: {nome_final}")
print("="*90)