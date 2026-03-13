from rag.vectorstore import get_doc_filter, get_vectorstore


def get_retriever(k: int = 10, doc_id: str = None):
    vectorstore = get_vectorstore("testify_docs")

    search_kwargs = {"k": k}
    if doc_id:
        search_kwargs["filter"] = get_doc_filter(doc_id)

    return vectorstore.as_retriever(search_kwargs=search_kwargs)
