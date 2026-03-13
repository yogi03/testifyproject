from fastapi import APIRouter, HTTPException, Query
from database.firestore import get_db
from rag.vectorstore import delete_document_chunks

router = APIRouter(prefix="/api", tags=["Deletion"])

@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, user_id: str = Query(...)):
    db = get_db()
    if not db:
        raise HTTPException(status_code=500, detail="Database connection failed")

    # Verify ownership
    doc_ref = db.collection("documents").document(doc_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.to_dict().get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this document")

    try:
        # Delete related tests
        tests_ref = db.collection("tests").where("doc_id", "==", doc_id).where("user_id", "==", user_id).stream()
        for t in tests_ref:
            test_id = t.id
            # Delete attempts for this test
            attempts_ref = db.collection("attempts").where("test_id", "==", test_id).stream()
            for att in attempts_ref:
                db.collection("attempts").document(att.id).delete()
            # Delete test document itself
            db.collection("tests").document(test_id).delete()

        # Delete related mindmaps
        mindmaps_ref = db.collection("mindmaps").where("doc_id", "==", doc_id).where("user_id", "==", user_id).stream()
        for mm in mindmaps_ref:
            db.collection("mindmaps").document(mm.id).delete()

        # Delete vector chunks from Qdrant
        delete_document_chunks(doc_id)

        # Finally delete the document from Firestore
        doc_ref.delete()
        
        return {"message": "Document and all related data deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/attempts/{attempt_id}")
async def delete_attempt(attempt_id: str, user_id: str = Query(...)):
    db = get_db()
    if not db:
        raise HTTPException(status_code=500, detail="Database connection failed")

    att_ref = db.collection("attempts").document(attempt_id)
    att = att_ref.get()
    
    if not att.exists:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if att.to_dict().get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this attempt")

    try:
        att_ref.delete()
        return {"message": "Test attempt deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/mindmaps/{mindmap_id}")
async def delete_mindmap(mindmap_id: str, user_id: str = Query(...)):
    db = get_db()
    if not db:
        raise HTTPException(status_code=500, detail="Database connection failed")

    mm_ref = db.collection("mindmaps").document(mindmap_id)
    mm = mm_ref.get()
    
    if not mm.exists:
        raise HTTPException(status_code=404, detail="Mindmap not found")
    if mm.to_dict().get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this mindmap")

    try:
        mm_ref.delete()
        return {"message": "Mindmap deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
