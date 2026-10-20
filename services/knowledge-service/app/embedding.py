"""Versioned multilingual embeddings; no silently substituted hash vectors."""

from __future__ import annotations

from functools import lru_cache

MODEL = "intfloat/multilingual-e5-small"
REVISION = "614241f622f53c4eeff9890bdc4f31cfecc418b3"
VERSION = f"{MODEL}@{REVISION}:title-heading-v2"


@lru_cache(maxsize=1)
def _model():
    from sentence_transformers import SentenceTransformer

    # The approved model is downloaded during installation/image build. Runtime
    # retrieval must be deterministic and cannot wait on an external model hub.
    return SentenceTransformer(MODEL, revision=REVISION, local_files_only=True)


def embed(texts: list[str], *, query: bool = False) -> list[list[float]]:
    prefix = "query: " if query else "passage: "
    vectors = _model().encode([prefix + text for text in texts], normalize_embeddings=True)
    return [vector.tolist() for vector in vectors]
