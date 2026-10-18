import json
from pathlib import Path
from collections import Counter
import re
from datetime import datetime

# ====================== CONFIGURAÇÃO ======================
ARQUIVO_DATASET = "dataset_final_saude_franca_v1.json"

# ==========================================================

def carregar_dataset(caminho: str):
    with open(caminho, 'r', encoding='utf-8') as f:
        return json.load(f)

def analisar_dataset(data):
    registros = data.get("data", [])
    metadata = data.get("metadata", {})
    
    print("="*90)
    print("📊 ANÁLISE DO DATASET - CHATBOT SAÚDE FRANCA")
    print("="*90)
    print(f"Data de geração: {metadata.get('data_geracao', 'N/A')}")
    print(f"Total de registros: {len(registros):,} \n")
    
    # 1. Distribuição por Categoria
    categorias = Counter([item['categoria'] for item in registros])
    print("📌 DISTRIBUIÇÃO POR CATEGORIA:")
    for cat, qtd in sorted(categorias.items(), key=lambda x: -x[1]):
        percent = (qtd / len(registros)) * 100
        print(f"   • {cat:18} → {qtd:4} registros ({percent:5.1f}%)")
    print()
    
    # 2. Estatísticas de Texto
    tam_perguntas = [len(item['pergunta']) for item in registros]
    tam_respostas = [len(item['resposta']) for item in registros]
    
    print("📏 ESTATÍSTICAS DE TEXTO:")
    print(f"   Tamanho médio das perguntas : {sum(tam_perguntas)/len(tam_perguntas):.1f} caracteres")
    print(f"   Tamanho médio das respostas : {sum(tam_respostas)/len(tam_respostas):.1f} caracteres")
    print(f"   Resposta mais longa         : {max(tam_respostas):,} caracteres")
    print(f"   Resposta mais curta         : {min(tam_respostas):,} caracteres\n")
    
    # 3. Presença de Tags e Referências
    com_tags = sum(1 for item in registros if item.get('tags'))
    com_referencia = sum(1 for item in registros if item.get('referencia'))
    
    print("🏷️  QUALIDADE DOS DADOS:")
    print(f"   Registros com Tags          : {com_tags} ({com_tags/len(registros)*100:.1f}%)")
    print(f"   Registros com Referências   : {com_referencia} ({com_referencia/len(registros)*100:.1f}%)")
    print()
    
    # 4. Exemplos por Categoria (2 por categoria)
    print("📋 EXEMPLOS DE PERGUNTAS POR CATEGORIA:")
    print("-" * 60)
    
    categorias_unicas = sorted(set(item['categoria'] for item in registros))
    for cat in categorias_unicas:
        exemplos = [item for item in registros if item['categoria'] == cat][:2]
        print(f"\n🔹 {cat}:")
        for ex in exemplos:
            print(f"   Q: {ex['pergunta'][:85]}{'...' if len(ex['pergunta']) > 85 else ''}")
            print(f"   R: {ex['resposta'][:95]}{'...' if len(ex['resposta']) > 95 else ''}")
            print("   ──")
    
    # 5. Recomendações
    print("\n" + "="*90)
    print("💡 RECOMENDAÇÕES PARA PRÓXIMA ETAPA:")
    print("="*90)
    print("• Gerar embeddings usando sentence-transformers/all-mpnet-base-v2")
    print("• Criar índice FAISS ou ChromaDB")
    print("• Implementar comparação: MEV v3 × Similaridade de Cosseno")
    print("• Criar conjunto de teste com 150 perguntas reais")
    print("="*90)

# ====================== EXECUÇÃO ======================

if __name__ == "__main__":
    caminho = Path(ARQUIVO_DATASET)
    
    if caminho.exists():
        print(f"Carregando dataset: {ARQUIVO_DATASET}\n")
        dataset = carregar_dataset(ARQUIVO_DATASET)
        analisar_dataset(dataset)
    else:
        print(f"❌ Erro: Arquivo '{ARQUIVO_DATASET}' não encontrado.")
        print("Execute primeiro o script 'gerar_dataset_saude_franca.py'")