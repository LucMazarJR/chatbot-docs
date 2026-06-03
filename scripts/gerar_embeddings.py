import os
import time
from dotenv import load_dotenv
from pymongo import MongoClient
from lib.gemini_embendding import gerarEmbedding

load_dotenv()

URI_MONGO = os.getenv("MONGODB_URI")
DB_NAME = "ministerio_saude"
COL_DADOS = "faq_medicamentos"
LIMITE_EMBEDDINGS = 200

def main():
    client = MongoClient(URI_MONGO)
    
    try:
        db = client[DB_NAME]
        col_dados = db[COL_DADOS]
        
        docs_sem_embedding = list(col_dados.find({"embedding": None}))
        total_sem_embedding = len(docs_sem_embedding)
        
        print("\n" + "═"*60)
        print("🔄 GERAÇÃO DE EMBEDDINGS")
        print("─"*60)
        print(f"📊 Documentos sem embedding: {total_sem_embedding}")
        
        if total_sem_embedding == 0:
            print("✅ Todos os documentos já possuem embedding!")
            return
        
        limite_atual = min(LIMITE_EMBEDDINGS, total_sem_embedding)
        print(f"🎯 Serão processados: {limite_atual} embeddings")
        
        confirmacao = input("\n▶️  Deseja continuar? (sim/não): ")
        
        if confirmacao.lower() != "sim":
            print("❌ Operação cancelada.")
            return
        
        print("\n🚀 Iniciando geração de embeddings...\n")
        
        embeddings_gerados = 0
        erros = 0
        
        for idx, doc in enumerate(docs_sem_embedding[:LIMITE_EMBEDDINGS], 1):
            try:
                texto = f"{doc['question']} {doc['answer']}"
                print(f"   🔄 [{idx}/{limite_atual}] Gerando embedding...")
                
                embedding_result = gerarEmbedding(texto)
                embedding_vector = embedding_result.embeddings[0].values
                
                col_dados.update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"embedding": embedding_vector}}
                )
                
                embeddings_gerados += 1
                
            except Exception as e:
                erros += 1
                print(f"   ❌ Erro no documento {doc.get('file_origin', 'desconhecido')}: {e}")
                
                erro_str = str(e).lower()
                if any(termo in erro_str for termo in ['rate limit', 'quota', 'resource exhausted', '429', 'limit exceeded']):
                    print("\n🛑 Limite da API atingido! Parando execução.")
                    break
        
        print("\n" + "📊 RELATÓRIO FINAL")
        print("─"*60)
        print(f"✅ Embeddings gerados: {embeddings_gerados}")
        print(f"❌ Erros: {erros}")
        print(f"⏭️  Restantes: {total_sem_embedding - embeddings_gerados}")
        print("═"*60 + "\n")
        
    except Exception as e:
        print(f"❌ Erro crítico: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    main()
