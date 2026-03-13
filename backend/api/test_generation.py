from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import uuid
from datetime import datetime
from database.firestore import get_db
from services.topic_progress import build_topic_plan

router = APIRouter(prefix="/api/tests", tags=["Tests"])

class TestRequest(BaseModel):
    user_id: str
    doc_id: str
    topics: Optional[List[str]] = None
    num_questions: int = 5
    difficulty: str = "Medium"
    question_types: List[str] = ["mcq", "short"]

@router.post("/generate")
async def create_test(req: TestRequest):
    try:
        from services.quiz_generator import generate_quiz

        db = get_db()
        topic_outline = []
        if db:
            doc_snapshot = db.collection("documents").document(req.doc_id).get()
            if doc_snapshot.exists:
                topic_outline = doc_snapshot.to_dict().get("topic_outline", [])

        topic_plan = build_topic_plan(topic_outline, req.topics or [], req.num_questions)
        quiz = generate_quiz(req.doc_id, req.num_questions, req.difficulty, req.question_types, topic_plan)
        test_id = str(uuid.uuid4())
        
        if db:
            db.collection("tests").document(test_id).set({
                "test_id": test_id,
                "user_id": req.user_id,
                "doc_id": req.doc_id,
                "quiz": quiz,
                "selected_topics": topic_plan,
                "question_types": req.question_types,
                "difficulty": req.difficulty,
                "num_questions": req.num_questions,
                "created_at": datetime.utcnow().isoformat()
            })
            
        return {"test_id": test_id, "quiz": quiz, "selected_topics": topic_plan}
    except Exception as e:
        detail = str(e)
        status_code = 429 if "rate limit" in detail.lower() else 500
        raise HTTPException(status_code=status_code, detail=detail)


@router.get("/topics/{doc_id}")
async def get_document_topics(doc_id: str):
    db = get_db()
    if not db:
        raise HTTPException(status_code=500, detail="Database not connected")

    doc_snapshot = db.collection("documents").document(doc_id).get()
    if not doc_snapshot.exists:
        raise HTTPException(status_code=404, detail="Document not found")

    data = doc_snapshot.to_dict()
    return {
        "doc_id": doc_id,
        "title": data.get("title"),
        "topic_outline": data.get("topic_outline", []),
    }

@router.post("/notes")
async def get_notes(req: TestRequest):
    try:
        from services.notes_generator import generate_study_notes

        notes = generate_study_notes(req.doc_id, req.topics or [])
        return {"notes": notes}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/mindmap")
async def get_mindmap(req: TestRequest):
    try:
        from services.mindmap_generator import (
            generate_mindmap_data,
            is_placeholder_mindmap_data,
            is_valid_mindmap_data,
            normalize_mindmap_data,
        )

        db = get_db()
        source_document = {}
        topic_outline = []
        title = "Study Material"

        if db:
            doc_snapshot = db.collection("documents").document(req.doc_id).get()
            if doc_snapshot.exists:
                source_document = doc_snapshot.to_dict()
                topic_outline = source_document.get("topic_outline", [])
                title = source_document.get("title") or title

        if db:
            # Check if one already exists for this document to avoid duplicate AI generation fees
            existing_maps = db.collection("mindmaps").where("doc_id", "==", req.doc_id).where("user_id", "==", req.user_id).limit(1).get()
            for existing in existing_maps:
                existing_data = existing.to_dict()
                existing_mindmap = normalize_mindmap_data(existing_data.get("mermaid_data", ""), title=title)
                if is_valid_mindmap_data(existing_mindmap) and not is_placeholder_mindmap_data(existing_mindmap):
                    if existing_mindmap != existing_data.get("mermaid_data", ""):
                        db.collection("mindmaps").document(existing.id).set({
                            "mindmap_id": existing_data.get("mindmap_id", existing.id),
                            "user_id": req.user_id,
                            "doc_id": req.doc_id,
                            "mermaid_data": existing_mindmap,
                            "created_at": existing_data.get("created_at", datetime.utcnow().isoformat())
                        })
                    return {"mindmap_id": existing.id, "mindmap": existing_mindmap}

                regenerated_mindmap = normalize_mindmap_data(
                    generate_mindmap_data(req.doc_id, topic_outline=topic_outline, title=title),
                    title=title,
                )
                db.collection("mindmaps").document(existing.id).set({
                    "mindmap_id": existing_data.get("mindmap_id", existing.id),
                    "user_id": req.user_id,
                    "doc_id": req.doc_id,
                    "mermaid_data": regenerated_mindmap,
                    "created_at": datetime.utcnow().isoformat()
                })
                return {"mindmap_id": existing.id, "mindmap": regenerated_mindmap}

        mindmap = normalize_mindmap_data(
            generate_mindmap_data(req.doc_id, topic_outline=topic_outline, title=title),
            title=title,
        )
        mindmap_id = str(uuid.uuid4())
        
        if db:
            db.collection("mindmaps").document(mindmap_id).set({
                "mindmap_id": mindmap_id,
                "user_id": req.user_id,
                "doc_id": req.doc_id,
                "mermaid_data": mindmap,
                "created_at": datetime.utcnow().isoformat()
            })
            
        return {"mindmap_id": mindmap_id, "mindmap": mindmap}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
