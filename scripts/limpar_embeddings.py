import os
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

URI_MONGO = os.getenv("MONGODB_URI")
DB_NAME = "ministerio_saude"
COL_DADOS = "faq_medicamentos"

def main():
    client = MongoClient(URI_MONGO)
    
    try:
        db = client[DB_NAME]
        col_dados = db[COL_DADOS]
        
        total_docs = col_dados.count_documents({})
        docs_com_embedding = col_dados.count_documents({"embedding": {"$ne": None}})
        
        print("\n" + "═"*60)
        print("🧹 LIMPEZA DE EMBEDDINGS")
        print("─"*60)
        print(f"📊 Total de documentos: {total_docs}")
        print(f"🔢 Documentos com embedding: {docs_com_embedding}")
        
        if docs_com_embedding == 0:
            print("✅ Nenhum embedding para limpar!")
            return
        
        confirmacao = input("\n⚠️  Deseja remover TODOS os embeddings? (sim/não): ")
        
        if confirmacao.lower() != "sim":
            print("❌ Operação cancelada.")
            return
        
        resultado = col_dados.update_many(
            {},
            {"$unset": {"embedding": ""}}
        )
        
        print(f"\n✅ {resultado.modified_count} embeddings removidos com sucesso!")
        print("═"*60 + "\n")
        
    except Exception as e:
        print(f"❌ Erro: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    main()
