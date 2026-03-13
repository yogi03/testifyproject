from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any
import uuid
from datetime import datetime
from database.firestore import get_db
from services.topic_progress import calculate_attempt_topic_performance

router = APIRouter(prefix="/api/evaluation", tags=["Evaluation"])

class EvaluationRequest(BaseModel):
    user_id: str
    test_id: str
    answers: Dict[str, Any]

@router.post("/submit")
async def submit_test(req: EvaluationRequest):
    from services.evaluator import grade_test

    db = get_db()
    if not db:
        return {"message": "Test evaluated (No DB)", "score": 0}
        
    test_doc = db.collection("tests").document(req.test_id).get()
    if not test_doc.exists:
        raise HTTPException(status_code=404, detail="Test not found")
        
    quiz_data = test_doc.to_dict().get("quiz", {})
    test_data = test_doc.to_dict()
    quiz_questions = quiz_data.get("questions", []) if isinstance(quiz_data, dict) else quiz_data
    
    results = grade_test(req.answers, quiz_questions)
    max_score = sum([float(question.get("marks", 1) or 1) for question in quiz_questions])
    score_percentage = round((results["total_score"] / max_score) * 100, 2) if max_score > 0 else 0.0
    topic_performance = calculate_attempt_topic_performance(quiz_questions, results["detailed_feedback"])
    
    attempt_id = str(uuid.uuid4())
    db.collection("attempts").document(attempt_id).set({
        "attempt_id": attempt_id,
        "test_id": req.test_id,
        "user_id": req.user_id,
        "answers": req.answers,
        "score": results["total_score"],
        "max_score": max_score,
        "score_percentage": score_percentage,
        "detailed_feedback": results["detailed_feedback"],
        "topic_performance": topic_performance,
        "selected_topics": test_data.get("selected_topics", []),
        "created_at": datetime.utcnow().isoformat()
    })
    
    return {"attempt_id": attempt_id, "results": {**results, "max_score": max_score, "score_percentage": score_percentage}}
