from fastapi import APIRouter

from database.firestore import get_db
from services.topic_progress import summarize_document_topics

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


@router.get("/{user_id}")
async def get_user_analytics(user_id: str):
    db = get_db()
    if not db:
        return {"error": "Database not connected"}

    attempts = [doc.to_dict() for doc in db.collection("attempts").where("user_id", "==", user_id).stream()]
    documents = [doc.to_dict() for doc in db.collection("documents").where("user_id", "==", user_id).stream()]
    mindmaps = [doc.to_dict() for doc in db.collection("mindmaps").where("user_id", "==", user_id).stream()]
    tests = [doc.to_dict() for doc in db.collection("tests").where("user_id", "==", user_id).stream()]

    tests_by_id = {test.get("test_id"): test for test in tests}
    total_tests = len(attempts)

    attempt_percentages = []
    recent_scores = []
    for attempt in sorted(attempts, key=lambda item: item.get("created_at", item.get("attempt_id", ""))):
        if "score_percentage" in attempt:
            percentage = float(attempt.get("score_percentage", 0) or 0)
        else:
            max_score = float(attempt.get("max_score", 0) or 0)
            raw_score = float(attempt.get("score", 0) or 0)
            percentage = round((raw_score / max_score) * 100, 2) if max_score > 0 else raw_score
        attempt_percentages.append(percentage)
        recent_scores.append(round(percentage, 2))

    average_score = round(sum(attempt_percentages) / total_tests, 2) if total_tests > 0 else 0
    recent_scores = recent_scores[-10:] if recent_scores else [0]

    docs_with_attempts = []
    all_topic_progress = []

    for document in documents:
        doc_id = document.get("doc_id")
        doc_attempts = []
        for attempt in attempts:
            test_data = tests_by_id.get(attempt.get("test_id"))
            if test_data and test_data.get("doc_id") == doc_id:
                doc_attempts.append(attempt)

        doc_mindmaps = [
            {
                "mindmap_id": mindmap.get("mindmap_id"),
                "created_at": mindmap.get("created_at"),
            }
            for mindmap in mindmaps
            if mindmap.get("doc_id") == doc_id
        ]

        topic_progress = summarize_document_topics(document.get("topic_outline", []), doc_attempts)
        all_topic_progress.extend(topic_progress)

        docs_with_attempts.append(
            {
                "doc_id": doc_id,
                "filename": document.get("title", "Unknown Document"),
                "type": document.get("type"),
                "attempts": [
                    {
                        "attempt_id": attempt.get("attempt_id"),
                        "score": attempt.get("score", 0),
                        "max_score": attempt.get("max_score", 0),
                        "score_percentage": attempt.get("score_percentage", 0),
                        "created_at": attempt.get("created_at"),
                    }
                    for attempt in doc_attempts
                ],
                "mindmaps": doc_mindmaps,
                "topics": topic_progress,
                "well_prepared_topics": [topic["topic_name"] for topic in topic_progress if topic.get("well_prepared")],
            }
        )

    weak_topic_candidates = [
        topic
        for topic in all_topic_progress
        if topic.get("questions_seen", 0) > 0 and not topic.get("well_prepared")
    ]
    weak_topic_candidates.sort(key=lambda topic: (topic.get("accuracy_percent", 0), topic.get("coverage_percent", 0)))
    weak_topics = [topic["topic_name"] for topic in weak_topic_candidates[:3]]

    prepared_topics = [topic for topic in all_topic_progress if topic.get("well_prepared")]

    return {
        "user_id": user_id,
        "total_tests": total_tests,
        "average_score": average_score,
        "weak_topics": weak_topics,
        "recent_scores": recent_scores,
        "uploaded_documents": len(documents),
        "prepared_topics": len(prepared_topics),
        "documents": docs_with_attempts,
    }
