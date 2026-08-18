"""Varredura da pasta de FAQs no Google Drive.

Fica aqui, e não dentro de cada script, porque `enviar_dados.py` e
`test_enviar_dados.py` precisam enxergar exatamente o mesmo conjunto de
arquivos. Enquanto cada um tinha sua própria cópia da consulta, o teste
afirmava estar validando o que a sincronização faria — e não estava.
"""
from typing import Callable, Dict, List

MIME_PASTA = "application/vnd.google-apps.folder"
MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
MIME_GOOGLE_DOCS = "application/vnd.google-apps.document"

# Arquivos ignorados por nome (gabaritos, rascunhos), sem distinguir
# maiúsculas de minúsculas. Um modelo virando FAQ faz o bot responder ao
# cidadão com texto de exemplo.
ARQUIVOS_IGNORADOS = {"padrão faq", "padrao faq"}


def listar_arquivos_faq(service, pasta_id: str, log: Callable[[str], None] = print) -> List[dict]:
    """Devolve os documentos de FAQ abaixo de `pasta_id`, incluindo subpastas.

    Três diferenças em relação à consulta que existia antes, que era um
    `files().list()` único:

    - percorre subpastas, então basta jogar o arquivo em qualquer lugar abaixo
      da pasta configurada (subpasta herda o compartilhamento da pasta mãe, e
      portanto continua visível para a Conta de Serviço);
    - pagina o resultado — a API devolve 100 itens por padrão e o restante
      ficava de fora sem nenhum aviso;
    - aceita Google Docs nativo além de `.docx`. Arquivo criado dentro do Drive
      não é `.docx`; ele só vira um na exportação, e por isso era ignorado.

    Cada item devolvido traz `id`, `name`, `mimeType` e `modifiedTime`. Quem
    baixa precisa olhar o `mimeType`: Google Docs exige `export_media`, os
    demais usam `get_media`.
    """
    encontrados: List[dict] = []
    fila = [pasta_id]

    while fila:
        atual = fila.pop()
        token = None

        while True:
            resposta = service.files().list(
                q=f"'{atual}' in parents and trashed = false",
                fields="nextPageToken, files(id, name, mimeType, modifiedTime)",
                pageSize=1000,
                pageToken=token,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            ).execute()

            for arquivo in resposta.get("files", []):
                mime, nome = arquivo["mimeType"], arquivo["name"]

                if mime == MIME_PASTA:
                    fila.append(arquivo["id"])
                elif nome.strip().lower() in ARQUIVOS_IGNORADOS:
                    log(f"⏭️  Ignorado por nome: {nome}")
                elif mime == MIME_GOOGLE_DOCS or (mime == MIME_DOCX and ".docx" in nome):
                    encontrados.append(arquivo)

            token = resposta.get("nextPageToken")
            if not token:
                break

    return _remover_duplicatas(encontrados, log)


def _remover_duplicatas(arquivos: List[dict], log: Callable[[str], None]) -> List[dict]:
    """Mantém um arquivo por nome quando o mesmo nome aparece em ids diferentes.

    Subir a mesma pasta duas vezes no Drive não sobrescreve nada: cria um
    segundo arquivo, de mesmo nome e id diferente. Sem este filtro, cada cópia
    entraria como um `file_id` distinto — gastando embedding duas vezes pelo
    mesmo conteúdo e deixando o acervo com FAQs repetidas, que é exatamente o
    que faz o agente responder sempre a mesma coisa.

    O critério é determinístico de propósito (mais recente; empate resolvido
    pelo id): se a escolha mudasse entre execuções, cada uma gravaria sob um
    `file_id` diferente e a limpeza por arquivo deixaria a cópia anterior órfã
    no banco.
    """
    por_nome: Dict[str, List[dict]] = {}
    for arquivo in arquivos:
        por_nome.setdefault(arquivo["name"], []).append(arquivo)

    mantidos: List[dict] = []
    descartados = 0

    for nome, versoes in por_nome.items():
        if len(versoes) > 1:
            descartados += len(versoes) - 1
            log(f"♻️  {nome}: {len(versoes)} cópias no Drive, mantendo 1")
        versoes.sort(key=lambda a: (a.get("modifiedTime", ""), a["id"]), reverse=True)
        mantidos.append(versoes[0])

    if descartados:
        log(f"♻️  {descartados} cópia(s) duplicada(s) ignorada(s).")
    log(f"📂 {len(mantidos)} documento(s) de FAQ encontrado(s) no Drive.")
    return mantidos
