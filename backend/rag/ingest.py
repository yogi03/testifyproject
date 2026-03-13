from langchain_community.document_loaders import PyPDFLoader, WebBaseLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from uuid import uuid5, NAMESPACE_URL

from rag.vectorstore import get_vectorstore

UPSERT_BATCH_SIZE = 32

def ingest_pdf(file_path: str, doc_id: str, user_id: str):
    loader = PyPDFLoader(file_path)
    docs = loader.load()
    return process_and_store(docs, doc_id, user_id)

def ingest_url(url: str, doc_id: str, user_id: str):
    loader = WebBaseLoader(url)
    docs = loader.load()
    title = docs[0].metadata.get("title", url) if docs else url
    chunks = process_and_store(docs, doc_id, user_id)
    return title, chunks

def process_and_store(docs, doc_id: str, user_id: str):
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    splits = text_splitter.split_documents(docs)

    vectorstore = get_vectorstore("testify_docs")
    texts = [doc.page_content for doc in splits]
    metadatas = [{"doc_id": doc_id, "user_id": user_id, "source": doc.metadata.get("source", "unknown")} for doc in splits]
    ids = [str(uuid5(NAMESPACE_URL, f"{doc_id}:{i}")) for i in range(len(splits))]

    for start in range(0, len(texts), UPSERT_BATCH_SIZE):
        end = start + UPSERT_BATCH_SIZE
        vectorstore.add_texts(
            texts=texts[start:end],
            metadatas=metadatas[start:end],
            ids=ids[start:end],
        )
    return len(splits)
