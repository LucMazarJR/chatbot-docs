"""Geração de embeddings no Gemini, com rotação entre várias chaves de API.

Por que rotacionar: a cota gratuita é de **1000 requisições por dia por
projeto** (`EmbedContentRequestsPerDayPerUserPerProjectPerModel-FreeTier`).
Reindexar as 2451 FAQs não cabe numa chave só. Com quatro projetos, o teto sobe
para ~4000/dia e a operação cabe numa sessão.

Quando uma chave devolve 429, ela é marcada como esgotada e a próxima assume.
Quando todas esgotam, `CotaEsgotadaError` é levantada para o chamador parar
limpo — os scripts que usam este módulo são retomáveis, então basta rodar de
novo no dia seguinte ou com chaves novas.

Configuração no `.env`:

    GEMINI_API_KEY=...            # obrigatória
    GEMINI_API_KEY_2=...          # opcionais, de projetos DIFERENTES
    GEMINI_API_KEY_3=...
    GEMINI_API_KEY_4=...
    GEMINI_EMBEDDING_MODEL=...    # padrão: gemini-embedding-001
    GEMINI_TASK_TYPE=...          # padrão: SEMANTIC_SIMILARITY

Chaves do mesmo projeto dividem o mesmo balde de cota — rotacionar entre elas
não adianta nada.
"""
import os
from typing import List, Optional

from dotenv import find_dotenv, load_dotenv
from google import genai
from google.genai import types

load_dotenv(find_dotenv(usecwd=True))

MODELO_PADRAO = os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")
TASK_TYPE_PADRAO = os.getenv("GEMINI_TASK_TYPE", "SEMANTIC_SIMILARITY")
DIMENSOES = 3072

# Marcadores de erro de cota devolvidos pela API do Gemini.
SINAIS_DE_COTA = ("rate limit", "quota", "resource exhausted", "429", "limit exceeded")


class CotaEsgotadaError(RuntimeError):
    """Todas as chaves configuradas bateram no limite diário."""


def _ler_chaves() -> List[str]:
    """Coleta as chaves do ambiente, sem repetir, preservando a ordem."""
    brutas = [os.getenv("GEMINI_API_KEY")]
    brutas += [os.getenv(f"GEMINI_API_KEY_{i}") for i in range(2, 10)]
    brutas += (os.getenv("GEMINI_API_KEYS") or "").split(",")

    chaves: List[str] = []
    for chave in brutas:
        chave = (chave or "").strip()
        if chave and chave not in chaves:
            chaves.append(chave)

    if not chaves:
        raise ValueError("❌ Nenhuma GEMINI_API_KEY definida! Configure no arquivo .env")
    return chaves


class _Rodizio:
    """Mantém um cliente por chave e pula as que já esgotaram."""

    def __init__(self) -> None:
        self._chaves = _ler_chaves()
        self._clientes: dict = {}
        self._esgotadas: set = set()
        self._atual = 0

    @property
    def total(self) -> int:
        return len(self._chaves)

    @property
    def disponiveis(self) -> int:
        return self.total - len(self._esgotadas)

    def _cliente(self, indice: int):
        if indice not in self._clientes:
            self._clientes[indice] = genai.Client(api_key=self._chaves[indice])
        return self._clientes[indice]

    def marcar_esgotada(self, indice: int) -> None:
        self._esgotadas.add(indice)

    def proxima(self):
        """Devolve (índice, cliente) da próxima chave utilizável."""
        for _ in range(self.total):
            if self._atual not in self._esgotadas:
                return self._atual, self._cliente(self._atual)
            self._atual = (self._atual + 1) % self.total
        raise CotaEsgotadaError(
            f"Todas as {self.total} chave(s) do Gemini esgotaram a cota diária. "
            "Rode de novo amanhã ou acrescente chaves de outros projetos no .env."
        )

    def avancar(self) -> None:
        self._atual = (self._atual + 1) % self.total


_rodizio: Optional[_Rodizio] = None


def _obter_rodizio() -> _Rodizio:
    global _rodizio
    if _rodizio is None:
        _rodizio = _Rodizio()
    return _rodizio


def e_erro_de_cota(erro: Exception) -> bool:
    texto = str(erro).lower()
    return any(sinal in texto for sinal in SINAIS_DE_COTA)


def chaves_disponiveis() -> int:
    """Quantas chaves ainda não bateram no limite nesta execução."""
    return _obter_rodizio().disponiveis


def gerarEmbedding(question: str, model: Optional[str] = None, task_type: Optional[str] = None):
    """Gera o embedding de um texto, trocando de chave quando a cota estoura.

    Devolve o objeto de resposta da API — o vetor está em
    `resultado.embeddings[0].values`. O formato foi mantido para não quebrar os
    scripts que já chamam esta função.
    """
    if not question or not question.strip():
        raise ValueError("Question não pode estar vazio")

    rodizio = _obter_rodizio()
    modelo = model or MODELO_PADRAO
    tarefa = task_type or TASK_TYPE_PADRAO

    ultimo_erro: Optional[Exception] = None

    # Uma tentativa por chave ainda viva: se a cota da atual estourou, a próxima
    # assume sem perder o documento em processamento.
    for _ in range(rodizio.total):
        indice, cliente = rodizio.proxima()
        try:
            return cliente.models.embed_content(
                model=modelo,
                contents=question,
                config=types.EmbedContentConfig(
                    task_type=tarefa,
                    output_dimensionality=DIMENSOES,
                ),
            )
        except Exception as erro:
            if not e_erro_de_cota(erro):
                raise
            ultimo_erro = erro
            rodizio.marcar_esgotada(indice)
            rodizio.avancar()

    raise CotaEsgotadaError(
        f"Todas as {rodizio.total} chave(s) esgotaram a cota diária. Último erro: {ultimo_erro}"
    )
