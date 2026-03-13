from typing import List

from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import PromptTemplate
from pydantic import BaseModel, Field

from rag.retriever import get_retriever
from services.llm import invoke_with_fallback
from services.topic_progress import DEFAULT_TOPIC_QUESTION_BUDGET, normalize_topic_outline


class TopicOutlineItem(BaseModel):
    name: str = Field(description="Main topic heading")
    subtopics: List[str] = Field(description="Important subtopics covered under the main topic")
    weight: int = Field(description="Relative share of the document from 1 to 10")
    summary: str = Field(description="A short summary of what the topic covers")


class TopicOutlineResponse(BaseModel):
    topics: List[TopicOutlineItem] = Field(description="Main topics in the study material")


def generate_topic_outline(doc_id: str):
    retriever = get_retriever(k=18, doc_id=doc_id)
    docs = retriever.invoke("List the main topics, subtopics, and section coverage in this study material.")
    context = "\n\n".join([doc.page_content for doc in docs])

    parser = JsonOutputParser(pydantic_object=TopicOutlineResponse)

    prompt_template = """
    You are an expert study planner.
    Read the study material context and extract the major topics and their important subtopics.
    Return between 3 and 10 major topics when possible.
    Each topic should include:
    - a clear topic name
    - a list of concise subtopics
    - a relative weight from 1 to 10 based on how much of the material it covers
    - a short summary

    Context:
    {context}

    Return valid JSON in this shape:
    {{
      "topics": [
        {{
          "name": "Topic name",
          "subtopics": ["Subtopic A", "Subtopic B"],
          "weight": 4,
          "summary": "What this topic covers"
        }}
      ]
    }}
    """

    prompt = PromptTemplate(template=prompt_template, input_variables=["context"])
    try:
        response = invoke_with_fallback(
            lambda llm: prompt | llm | parser,
            {"context": context},
        )
        return normalize_topic_outline(response.get("topics", []), total_questions=DEFAULT_TOPIC_QUESTION_BUDGET)
    except Exception as exc:
        print(f"Error generating topic outline: {exc}")
        return []
