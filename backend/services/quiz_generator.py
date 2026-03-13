from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field
from typing import List, Optional
from rag.retriever import get_retriever
from services.llm import invoke_with_fallback, is_rate_limit_error
from services.topic_progress import slugify

class Question(BaseModel):
    question: str = Field(description="The question text")
    type: str = Field(description="Type of question: 'mcq', 'true_false', 'short', 'long'")
    options: List[str] = Field(description="List of options (require 4 for MCQ, 2 for True/False, empty for others)")
    answer: str = Field(description="The correct answer or model answer")
    explanation: str = Field(description="Explanation or key points for the answer")
    topic: str = Field(description="The specific topic this question relates to")
    marks: int = Field(description="Marks assigned: MCQ=1, True/False=1, Short=3, Long=5")

class Quiz(BaseModel):
    quiz: List[Question] = Field(description="List of questions")


def _normalize_objective_answer(question: dict) -> dict:
    question_type = str(question.get("type", "")).strip().lower()
    options = question.get("options") or []
    answer = str(question.get("answer", "")).strip()

    if question_type not in {"mcq", "true_false", "t/f"} or not options or not answer:
        return question

    lowered_options = [str(option).strip().lower() for option in options]
    if answer.lower() in lowered_options:
        return question

    index_lookup = {
        "a": 0,
        "b": 1,
        "c": 2,
        "d": 3,
        "1": 0,
        "2": 1,
        "3": 2,
        "4": 3,
    }

    normalized_answer = answer.lower().replace("option", "").replace(".", "").replace(")", "").strip()
    option_index = index_lookup.get(normalized_answer)
    if option_index is not None and option_index < len(options):
        question["answer"] = options[option_index]

    return question

def generate_quiz(doc_id: str, num_questions: int, difficulty: str, question_types: List[str], topic_plan: List[dict] = None):
    retriever = get_retriever(k=10, doc_id=doc_id)
    selected_topics = [topic.get("name", "") for topic in (topic_plan or []) if topic.get("name")]
    query = f"Concepts related to {', '.join(selected_topics)}" if selected_topics else "general overview"
    if selected_topics:
        print(f"Adaptively focusing on: {', '.join(selected_topics)}")
        
    docs = retriever.invoke(query)
    context_text = "\n\n".join([d.page_content for d in docs])

    parser = JsonOutputParser(pydantic_object=Quiz)
    
    topic_instruction = ""
    if topic_plan and len(topic_plan) > 0:
        topic_lines = []
        for topic in topic_plan:
            subtopics = topic.get("subtopics", [])
            subtopic_text = f" Focus on subtopics such as {', '.join(subtopics)}." if subtopics else ""
            topic_lines.append(f"- {topic.get('name')}: generate exactly {topic.get('question_count')} questions.{subtopic_text}")
        topic_instruction = (
            "IMPORTANT: Generate questions only from the selected topics below and respect the exact count for each topic:\n"
            + "\n".join(topic_lines)
        )

    if not question_types:
        question_types = ["mcq", "short"]

    if len(question_types) == 1:
        type_instruction = f"Strictly generate questions ONLY of the following type: {question_types[0]}. Do not generate any other type."
    else:
        type_instruction = f"Strictly generate a mix of questions ONLY from the following allowed types: {', '.join(question_types)}. Do not generate any other type."

    prompt_template = """
    You are an expert educational assessment creator.
    Create a {difficulty} level quiz with {num_questions} questions based on the following text context.
    
    Context:
    {context}
    
    Instructions:
    1. {topic_instruction}
    2. {type_instruction}
    3. Assign marks: MCQ (1 mark), True/False (1 mark), Short Answer (3 marks), Long Answer (5 marks).
    4. For MCQ, provide 4 options. For True/False, provide 2 options. For Short/Long, provide empty options list [].
    5. Return exactly {num_questions} questions.
    6. Each question's topic must match one of the selected topic names when topic guidance is provided.
    
    The output must constitute a valid JSON object matching the schema:
    {{
        "quiz": [
            {{
                "question": "Question text",
                "type": "mcq" | "true_false" | "short" | "long",
                "options": ["A", "B", ...],
                "answer": "Correct Answer",
                "explanation": "Explanation",
                "topic": "Topic",
                "marks": 5
            }}
        ]
    }}
    """
    
    prompt = PromptTemplate(
        template=prompt_template,
        input_variables=["context", "num_questions", "difficulty", "topic_instruction", "type_instruction"],
    )
    
    payload = {
        "context": context_text,
        "num_questions": num_questions,
        "difficulty": difficulty,
        "topic_instruction": topic_instruction,
        "type_instruction": type_instruction
    }

    try:
        response = invoke_with_fallback(lambda llm: prompt | llm | parser, payload)
        quiz = response["quiz"]
        if not quiz:
            raise RuntimeError("The model returned no questions. Please try again.")

        selected_topic_names = [topic.get("name", "") for topic in (topic_plan or []) if topic.get("name")]
        fallback_topic_name = selected_topic_names[0] if len(selected_topic_names) == 1 else ""

        for index, question in enumerate(quiz):
            question["id"] = question.get("id", index)
            question["topic"] = str(question.get("topic") or fallback_topic_name or "General").strip() or "General"
            question["topic_id"] = slugify(question["topic"])
            _normalize_objective_answer(question)
        return quiz
    except Exception as e:
        print(f"Error generating test: {e}")
        error_message = str(e)
        if is_rate_limit_error(e):
            raise RuntimeError(
                "Groq rate limit reached for test generation. Please wait a while and try again, "
                "or switch to another Groq API key/model."
            ) from e
        raise RuntimeError(f"Failed to generate test questions: {error_message}") from e
