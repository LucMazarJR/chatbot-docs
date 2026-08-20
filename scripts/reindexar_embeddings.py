"""Regera os embeddings das FAQs com outro modelo, sem apagar nada.

Por que existe: os vetores atuais foram gerados a partir de `pergunta + resposta`
apenas, **sem a categoria**. Como muitas FAQs compartilham a mesma pergunta
("Como me preparar para o Exame?") e a mesma resposta, exames diferentes
acabaram com vetores idênticos — numa busca real, zinco e paratormônio deram
score igual até a última casa decimal, e o ranqueamento virou sorteio.

O que muda aqui: o texto embedado passa a ser o campo `text`
(`Assunto / Pergunta / Resposta`), que já distingue os assuntos, e o modelo pode
ser trocado numa passada só.

Segurança: só faz `update_one` com `$set`. Nunca apaga documento, nunca mexe no
índice. Rode `python backup_faqs.py` antes mesmo assim.

Retomável: cada documento processado recebe `embedding_model`. A seleção é
"tudo que ainda não está no modelo alvo", então interromper (Ctrl+C, cota
estourada, queda de rede) e rodar de novo continua exatamente de onde parou.

Uso:
    python reindexar_embeddings.py                      # simula, não grava
    python reindexar_embeddings.py --aplicar
    python reindexar_embeddings.py --aplicar --modelo gemini-embedding-001
"""
import argparse
import os
import sys
import time
from datetime import datetime, timezone

from dotenv import find_dotenv, load_dotenv
from pymongo import MongoClient

from lib.gemini_embendding import CotaEsgotadaError, chaves_disponiveis, gerarEmbedding

load_dotenv(find_dotenv(usecwd=True))

URI_MONGO = os.getenv("MONGODB_URI")
if not URI_MONGO:
    raise ValueError("MONGODB_URI não definido! Configure no arquivo .env")

DB_NAME = "ministerio_saude"
COL_DADOS = "faq_medicamentos"
MODELO_ALVO = "gemini-embedding-2"

# Dimensão do índice vector_index_3072 no Atlas. Vetor de outro tamanho entra
# no banco sem reclamar e some da busca.
DIMENSOES_INDICE = 3072


def montar_texto(doc: dict) -> str:
    """Texto que vai virar vetor. Prefere o campo `text` já gravado."""
    texto = (doc.get("text") or "").strip()
    if texto:
        return texto

    # Documento antigo, anterior ao campo `text`: remonta no mesmo formato.
    partes = [
        f"Assunto: {doc.get('category', '')}",
        f"Pergunta: {doc.get('question', '')}",
        f"Resposta: {doc.get('answer', '')}",
    ]
    return "\n".join(partes)


def main() -> int:
    parser = argparse.ArgumentParser(description="Regera embeddings das FAQs")
    parser.add_argument("--aplicar", action="store_true", help="Grava de verdade. Sem isto, só simula.")
    parser.add_argument("--modelo", default=MODELO_ALVO, help=f"Modelo alvo (padrão: {MODELO_ALVO})")
    parser.add_argument("--limite", type=int, default=0, help="Processa no máximo N documentos (0 = sem teto)")
    parser.add_argument(
        "--pausa",
        type=float,
        default=0.35,
        help="Segundos entre documentos. Espaça as chamadas para não bater no limite por minuto (padrão: 0.35)",
    )
    args = parser.parse_args()

    cliente = MongoClient(URI_MONGO)
    col = cliente[DB_NAME][COL_DADOS]

    # Pendentes = tudo que ainda não está no modelo alvo. É o que torna o
    # script retomável sem guardar estado em arquivo nenhum.
    filtro = {"embedding_model": {"$ne": args.modelo}}
    total_geral = col.count_documents({})
    pendentes = col.count_documents(filtro)
    ja_feitos = total_geral - pendentes

    print()
    print("=" * 60)
    print("REINDEXAÇÃO DE EMBEDDINGS")
    print("=" * 60)
    print(f"  Modelo alvo:        {args.modelo}")
    print(f"  Documentos no total:{total_geral:>6}")
    print(f"  Já no modelo alvo:  {ja_feitos:>6}")
    print(f"  Pendentes:          {pendentes:>6}")
    print(f"  Chaves disponíveis: {chaves_disponiveis():>6}  (~1000 embeddings/dia cada)")
    if not args.aplicar:
        print()
        print("  MODO SIMULAÇÃO — nada será gravado. Use --aplicar para valer.")
    print("=" * 60)

    if pendentes == 0:
        print("Nada a fazer: todos os documentos já estão no modelo alvo.")
        cliente.close()
        return 0

    if not args.aplicar:
        exemplo = col.find_one(filtro)
        if exemplo:
            print()
            print("Exemplo do texto que seria embedado:")
            print("-" * 60)
            print(montar_texto(exemplo)[:400])
            print("-" * 60)
        cliente.close()
        return 0

    processados = erros = 0
    falhas_seguidas = 0
    interrompido = False

    # Erros de rede (TLS, conexão abortada) são intermitentes e não têm nada a
    # ver com a API: repetir o mesmo documento resolve na maioria das vezes.
    TENTATIVAS_POR_DOC = 3
    LIMITE_FALHAS_SEGUIDAS = 30

    try:
        for doc in col.find(filtro, {"text": 1, "question": 1, "answer": 1, "category": 1}):
            if args.limite and processados >= args.limite:
                print(f"Limite de {args.limite} atingido.")
                break

            try:
                resultado = None
                for tentativa in range(TENTATIVAS_POR_DOC):
                    try:
                        resultado = gerarEmbedding(montar_texto(doc), model=args.modelo)
                        break
                    except CotaEsgotadaError:
                        raise
                    except Exception:
                        if tentativa == TENTATIVAS_POR_DOC - 1:
                            raise
                        time.sleep(2 ** tentativa)

                vetor = resultado.embeddings[0].values

                # O índice do Atlas é fixo em 3072 dimensões. Gravar vetor de
                # outro tamanho não dá erro no Mongo — só faz a busca parar de
                # achar o documento, em silêncio.
                if len(vetor) != DIMENSOES_INDICE:
                    print()
                    print(f"ABORTADO: o modelo devolveu {len(vetor)} dimensões, "
                          f"mas o índice espera {DIMENSOES_INDICE}.")
                    interrompido = True
                    break

                col.update_one(
                    {"_id": doc["_id"]},
                    {
                        "$set": {
                            "embedding": vetor,
                            "embedding_model": args.modelo,
                            "embedding_dim": len(vetor),
                            "embedded_at": datetime.now(timezone.utc),
                        }
                    },
                )
                processados += 1
                falhas_seguidas = 0

                # Espaça as chamadas: sem isso a rajada bate no limite por
                # minuto da API e o rodízio gasta tempo esperando.
                if args.pausa:
                    time.sleep(args.pausa)

                if processados % 50 == 0:
                    print(f"   {processados}/{pendentes} — {chaves_disponiveis()} chave(s) com saldo", flush=True)

            except CotaEsgotadaError as erro:
                print()
                print(f"COTA ESGOTADA: {erro}")
                interrompido = True
                break
            except Exception as erro:
                erros += 1
                falhas_seguidas += 1
                print(f"   Falha em {doc['_id']}: {str(erro)[:120]}")
                # Só desiste quando as falhas são SEGUIDAS: erros de rede
                # espalhados ao longo de horas não deveriam parar a execução.
                if falhas_seguidas >= LIMITE_FALHAS_SEGUIDAS:
                    print(f"   {LIMITE_FALHAS_SEGUIDAS} falhas seguidas — algo está errado, interrompendo.")
                    interrompido = True
                    break

    except KeyboardInterrupt:
        print()
        print("Interrompido pelo usuário.")
        interrompido = True

    restantes = col.count_documents(filtro)
    print()
    print("=" * 60)
    print(f"  Processados nesta execução: {processados}")
    print(f"  Falhas:                     {erros}")
    print(f"  Ainda pendentes:            {restantes}")
    if restantes:
        print()
        print("  Rode de novo para continuar de onde parou.")
        if interrompido:
            print("  Se foi cota: troque as chaves no .env ou volte amanhã.")
    else:
        print()
        print("  Base inteira no modelo alvo.")
    print("=" * 60)

    cliente.close()
    return 0 if restantes == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
