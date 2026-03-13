from langchain_core.prompts import PromptTemplate
from rag.retriever import get_retriever
from services.llm import invoke_with_fallback

def generate_study_notes(doc_id: str, weak_topics: list):
    if not weak_topics:
        return "No weak topics identified yet. Keep up the good work!"
        
    retriever = get_retriever(k=10, doc_id=doc_id)
    docs = retriever.invoke(f"topics covering {', '.join(weak_topics)}")
    context = "\n\n".join([doc.page_content for doc in docs])
    
    prompt_template = """
    You are a helpful tutor. The student struggled with the following topics: {topics}.
    Based on the provided context, write concise study notes only for these topics to help them improve.
    Do not provide an overall summary of the full document, and do not include unrelated topics.

    Context:
    {context}
    
    Format the output as Markdown.
    """
    
    prompt = PromptTemplate(
        template=prompt_template,
        input_variables=["topics", "context"]
    )

    result = invoke_with_fallback(
        lambda llm: prompt | llm,
        {"context": context, "topics": ", ".join(weak_topics)},
    )
    return result.content
