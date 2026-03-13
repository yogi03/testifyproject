import os

from qdrant_client import QdrantClient, models
from qdrant_client.http.exceptions import UnexpectedResponse

from rag.embeddings import get_embeddings

QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "testify_docs")
QDRANT_TIMEOUT = float(os.getenv("QDRANT_TIMEOUT", "60"))

if not QDRANT_URL:
    raise RuntimeError("QDRANT_URL is not set. Configure it in your backend environment.")

qdrant_client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, timeout=QDRANT_TIMEOUT)


def _ensure_collection(collection_name: str) -> None:
    try:
        if qdrant_client.collection_exists(collection_name):
            _ensure_payload_indexes(collection_name)
            return
    except UnexpectedResponse:
        pass

    embedding_size = len(get_embeddings().embed_query("dimension probe"))
    qdrant_client.create_collection(
        collection_name=collection_name,
        vectors_config=models.VectorParams(
            size=embedding_size,
            distance=models.Distance.COSINE,
        ),
    )
    _ensure_payload_indexes(collection_name)


def _ensure_payload_indexes(collection_name: str) -> None:
    for field_name in ("metadata.doc_id", "metadata.user_id"):
        try:
            qdrant_client.create_payload_index(
                collection_name=collection_name,
                field_name=field_name,
                field_schema=models.PayloadSchemaType.KEYWORD,
            )
        except UnexpectedResponse:
            # Ignore duplicate/existing index responses and keep startup idempotent.
            pass


def get_vectorstore(collection_name: str = QDRANT_COLLECTION):
    from langchain_qdrant import QdrantVectorStore

    _ensure_collection(collection_name)
    return QdrantVectorStore(
        client=qdrant_client,
        collection_name=collection_name,
        embedding=get_embeddings(),
    )


def get_doc_filter(doc_id: str) -> models.Filter:
    return models.Filter(
        must=[
            models.FieldCondition(
                key="metadata.doc_id",
                match=models.MatchValue(value=doc_id),
            )
        ]
    )


def delete_document_chunks(doc_id: str, collection_name: str = QDRANT_COLLECTION) -> None:
    _ensure_collection(collection_name)
    qdrant_client.delete(
        collection_name=collection_name,
        points_selector=models.FilterSelector(
            filter=get_doc_filter(doc_id),
        ),
    )
