from fastapi import APIRouter, UploadFile, File, Form, HTTPException
import os
import uuid
import shutil
from database.firestore import get_db

router = APIRouter(prefix="/api/upload", tags=["Upload"])

@router.post("/pdf")
async def upload_pdf(file: UploadFile = File(...), user_id: str = Form(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
        
    doc_id = str(uuid.uuid4())
    temp_file_path = f"temp_{doc_id}.pdf"
    
    try:
        from rag.ingest import ingest_pdf
        from services.topic_outline_generator import generate_topic_outline

        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        chunks = ingest_pdf(temp_file_path, doc_id, user_id)
        topic_outline = generate_topic_outline(doc_id)
        
        db = get_db()
        if db:
            db.collection("documents").document(doc_id).set({
                "doc_id": doc_id,
                "user_id": user_id,
                "title": file.filename,
                "type": "pdf",
                "chunks": chunks,
                "topic_outline": topic_outline
            })
            
        return {
            "message": "PDF uploaded successfully",
            "doc_id": doc_id,
            "title": file.filename,
            "chunks": chunks,
            "topic_outline": topic_outline,
        }
    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

@router.post("/url")
async def upload_url(url: str = Form(...), user_id: str = Form(...)):
    from rag.ingest import ingest_url
    from services.topic_outline_generator import generate_topic_outline

    doc_id = str(uuid.uuid4())
    title, chunks = ingest_url(url, doc_id, user_id)
    topic_outline = generate_topic_outline(doc_id)
    
    db = get_db()
    if db:
        db.collection("documents").document(doc_id).set({
            "doc_id": doc_id,
            "user_id": user_id,
            "title": title,
            "type": "url",
            "chunks": chunks,
            "topic_outline": topic_outline
        })
        
    return {
        "message": "URL ingested successfully",
        "doc_id": doc_id,
        "title": title,
        "chunks": chunks,
        "topic_outline": topic_outline,
    }
