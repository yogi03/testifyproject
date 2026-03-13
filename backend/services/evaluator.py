from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from services.llm import invoke_with_fallback


def _resolve_objective_answer(question: dict) -> str:
    options = question.get("options") or []
    answer = str(question.get("answer", "")).strip()
    if not answer or not options:
        return answer

    lowered_options = [str(option).strip().lower() for option in options]
    if answer.lower() in lowered_options:
        return answer

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
        return str(options[option_index])

    return answer

def evaluate_free_text(question_text: str, user_answer: str, correct_answer: str, max_marks: int):
    parser = JsonOutputParser()
    
    prompt_template = """
    You are an expert teacher grading a student's answer.
    
    Question: {question}
    Correct Answer/Key Points: {correct_answer}
    Student Answer: {user_answer}
    Maximum Marks: {max_marks}
    
    Evaluate the student's answer based on correctness and completeness compared to the key points.
    Assign a score between 0 and {max_marks}.
    Provide brief feedback explanations.
    
    Output strictly in JSON format:
    {{
        "score": 0.0,
        "feedback": "Feedback text here"
    }}
    """
    
    prompt = PromptTemplate(
        template=prompt_template,
        input_variables=["question", "correct_answer", "user_answer", "max_marks"]
    )
    
    try:
        result = invoke_with_fallback(
            lambda llm: prompt | llm | parser,
            {
                "question": question_text,
                "correct_answer": correct_answer,
                "user_answer": user_answer,
                "max_marks": max_marks
            },
        )
        return {"score": result.get("score", 0), "feedback": result.get("feedback", "No feedback generated.")}
    except Exception as e:
        print(f"Error evaluating answer: {e}")
        return {"score": 0, "feedback": f"Error during evaluation: {e}"}

def grade_test(attempted_answers: dict, quiz_questions: list):
    # attempted_answers mapping question index -> user answer string
    total_score = 0
    feedback_list = []
    
    for i, q in enumerate(quiz_questions):
        # Frontend might send answers with key str(i) or f"q_{i}" or q.get("id")
        ans = attempted_answers.get(str(q.get("id"))) if q.get("id") else attempted_answers.get(str(i)) or attempted_answers.get(f"q_{i}")
        
        q_id = q.get("id", i)
        
        if ans is None:
            feedback_list.append({"id": q_id, "score": 0, "feedback": "Not attempted"})
            continue
            
        q_type = q.get("type", "mcq")
        correct_answer = _resolve_objective_answer(q)
        marks = q.get("marks", 1)
        question_text = q.get("question", "")
            
        if q_type in ["mcq", "t/f", "true_false"]:
            if str(ans).strip().lower() == str(correct_answer).strip().lower():
                total_score += marks
                feedback_list.append({"id": q_id, "score": marks, "feedback": "Correct!"})
            else:
                feedback_list.append({"id": q_id, "score": 0, "feedback": f"Incorrect. Correct answer: {correct_answer}"})
        else: # short, long
            with_spinner = "Grading Q..." # simulated wait string
            eval_res = evaluate_free_text(question_text, str(ans), correct_answer, marks)
            total_score += eval_res["score"]
            feedback_list.append({"id": q_id, "score": eval_res["score"], "feedback": eval_res["feedback"]})
            
    return {"total_score": total_score, "detailed_feedback": feedback_list}
