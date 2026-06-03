import os
import re
import io
import json
from datetime import datetime, timezone
from dotenv import load_dotenv
from docx import Document

# Bibliotecas do Google API
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

load_dotenv()

# ============================================================================
# CONFIGURAÇÕES (carregadas do arquivo .env)
# ============================================================================
ID_PASTA_DRIVE = os.getenv("ID_PASTA_DRIVE")
FILE_CREDENTIALS = os.getenv("FILE_CREDENTIALS", "credentials.json")

if not ID_PASTA_DRIVE:
    raise ValueError("❌ ID_PASTA_DRIVE não definido! Configure no arquivo .env")

SCOPES = ['https://www.googleapis.com/auth/drive.readonly']

def get_drive_service():
    creds = service_account.Credentials.from_service_account_file(
        FILE_CREDENTIALS, scopes=SCOPES)
    return build('drive', 'v3', credentials=creds)

def extrair_metadados(texto_bloco):
    tags = []
    fonte = ""
    
    fonte_match = re.search(r'(?:FONTE:|Ref:|\(Ref:)\s*([^)\n\t]+)', texto_bloco, re.IGNORECASE)
    if fonte_match:
        fonte = fonte_match.group(1).strip().rstrip('.)').lower()

    tags_match = re.search(r'TAGS:\s*(.+?)(?=\s*P:|\s*PERGUNTA:|$|\n)', texto_bloco, re.IGNORECASE)
    if tags_match:
        conteudo_tags = tags_match.group(1).strip().lower()
        conteudo_tags = conteudo_tags.replace('#', ' ')
        lista_bruta = [t.strip() for t in re.split(r'[,\s\t]+', conteudo_tags) if t.strip()]
        tags = [t for t in lista_bruta if t not in ["p:", "r:", "pergunta:", "resposta:", "fonte:", "ref:"]]
    
    return tags, fonte

def processar_faqs_drive():
    service = get_drive_service()
    total_geral = 0

    query = f"'{ID_PASTA_DRIVE}' in parents and name contains '.docx' and mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'"
    results = service.files().list(q=query, fields="files(id, name)").execute()
    arquivos = results.get('files', [])

    if not arquivos:
        print("⚠️ Nenhum arquivo encontrado na pasta do Drive.")
        return 0

    for indice, arquivo in enumerate(arquivos, start=1):
        file_id = arquivo['id']
        nome_arquivo = arquivo['name']
        
        if nome_arquivo.startswith('~$'): continue

        print(f"\n📄 Lendo arquivo: {nome_arquivo}")
        
        request = service.files().get_media(fileId=file_id)
        fh = io.BytesIO()
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while not done:
            status, done = downloader.next_chunk()

        fh.seek(0)
        doc = Document(fh)
        
        itens_no_documento = 0
        categoria_atual = nome_arquivo.replace("FAQ", "").replace(".docx", "").strip().lower()
        paragrafos = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
        pergunta_pendente = ""
        
        for i, linha in enumerate(paragrafos):
            assunto_match = re.search(r'\[ASSUNTO:\s*(.+?)\]', linha, re.IGNORECASE)
            if assunto_match: 
                categoria_atual = assunto_match.group(1).strip().lower()
                if re.fullmatch(r'(\d+\.\s*)?\[ASSUNTO:.*?\]', linha, re.IGNORECASE):
                    continue

            pergunta, resposta = None, None

            # Caso A: P e R na mesma linha
            if re.search(r'\b(P|PERGUNTA):\s*', linha, re.IGNORECASE) and re.search(r'\b(R|RESPOSTA):\s*', linha, re.IGNORECASE):
                partes = re.split(r'\s*\b(R|RESPOSTA):\s*', linha, flags=re.IGNORECASE)
                pergunta = re.sub(r'(\d+\.\s*)?\b(P|PERGUNTA):\s*', '', partes[0], flags=re.IGNORECASE).strip().lower()
                resposta_bruta = partes[2].strip().lower()
                resposta = re.split(r'tags:|fonte:|ref:|\(ref:', resposta_bruta, flags=re.IGNORECASE)[0].strip()

            # Caso B: Linhas separadas
            elif re.search(r'^(\d+\.\s*)?\b(P|PERGUNTA):\s*', linha, re.IGNORECASE):
                pergunta_pendente = re.sub(r'^(\d+\.\s*)?\b(P|PERGUNTA):\s*', '', linha, flags=re.IGNORECASE).strip().lower()
                continue

            elif re.search(r'^\b(R|RESPOSTA):\s*', linha, re.IGNORECASE) and pergunta_pendente:
                pergunta = pergunta_pendente
                resposta_bruta = re.sub(r'^\b(R|RESPOSTA):\s*', '', linha, flags=re.IGNORECASE).strip().lower()
                resposta = re.split(r'tags:|fonte:|ref:|\(ref:', resposta_bruta, flags=re.IGNORECASE)[0].strip()
                pergunta_pendente = ""

            if pergunta and resposta:
                bloco_contexto = " ".join(paragrafos[max(0, i-1):min(len(paragrafos), i+2)])
                tags, fonte = extrair_metadados(bloco_contexto)

                # --- MODO TESTE: APENAS PRINT ---
                documento_simulado = {
                    "question": pergunta,
                    "answer": resposta,
                    "tags": tags,
                    "source": fonte,
                    "category": categoria_atual
                }
                print(f"  ✅ Item extraído: {json.dumps(documento_simulado, ensure_ascii=False)}")
                
                itens_no_documento += 1
                total_geral += 1
        
        print(f"  🏁 Fim do arquivo. Total processado aqui: {itens_no_documento}")
                
    return total_geral

def main():
    try:
        print("\n--- 🧪 INICIANDO TESTE DE EXTRAÇÃO (SEM BANCO DE DADOS) ---")
        total = processar_faqs_drive()
        print("\n---")
        print(f"Teste finalizado! Total de {total} itens seriam inseridos.")
    except Exception as e:
        print(f"❌ Erro Crítico: {e}")

if __name__ == "__main__":
    main()