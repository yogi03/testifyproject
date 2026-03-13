import math
import re
from typing import Any, Dict, List

DEFAULT_TOPIC_QUESTION_BUDGET = 30
PREPAREDNESS_THRESHOLD = 80


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "topic"


def allocate_weighted_counts(weights: List[float], total: int, ensure_minimum: bool = True) -> List[int]:
    if total <= 0 or not weights:
        return [0 for _ in weights]

    safe_weights = [max(float(weight or 0), 0.0) for weight in weights]
    if sum(safe_weights) == 0:
        safe_weights = [1.0 for _ in safe_weights]

    allocations = [0 for _ in safe_weights]
    remaining = total

    if ensure_minimum and total >= len(safe_weights):
        allocations = [1 for _ in safe_weights]
        remaining -= len(safe_weights)

    if remaining <= 0:
        return allocations

    total_weight = sum(safe_weights)
    raw_targets = [(weight / total_weight) * remaining for weight in safe_weights]
    base_counts = [math.floor(target) for target in raw_targets]
    allocations = [allocations[i] + base_counts[i] for i in range(len(allocations))]

    distributed = sum(base_counts)
    extra = remaining - distributed
    remainders = sorted(
        [(raw_targets[i] - base_counts[i], i) for i in range(len(raw_targets))],
        key=lambda item: item[0],
        reverse=True,
    )

    for _, index in remainders[:extra]:
        allocations[index] += 1

    return allocations


def normalize_topic_outline(raw_topics: List[Dict[str, Any]], total_questions: int = DEFAULT_TOPIC_QUESTION_BUDGET) -> List[Dict[str, Any]]:
    normalized_topics: List[Dict[str, Any]] = []
    used_ids = set()
    used_names = set()

    for index, raw_topic in enumerate(raw_topics or []):
        name = str(raw_topic.get("name") or raw_topic.get("topic") or "").strip()
        if not name:
            continue

        lowered_name = name.lower()
        if lowered_name in used_names:
            continue
        used_names.add(lowered_name)

        subtopics = []
        for subtopic in raw_topic.get("subtopics", []) or []:
            label = str(subtopic).strip()
            if label and label.lower() not in {existing.lower() for existing in subtopics}:
                subtopics.append(label)

        weight = raw_topic.get("weight", raw_topic.get("importance", len(subtopics) or 1))
        topic_id = slugify(name)
        unique_id = topic_id
        suffix = 2
        while unique_id in used_ids:
            unique_id = f"{topic_id}-{suffix}"
            suffix += 1
        used_ids.add(unique_id)

        normalized_topics.append(
            {
                "id": unique_id,
                "name": name,
                "subtopics": subtopics,
                "weight": max(float(weight or 1), 1.0),
                "summary": str(raw_topic.get("summary") or "").strip(),
                "recommended_questions": 0,
                "order": index,
            }
        )

    recommended_counts = allocate_weighted_counts(
        [topic["weight"] for topic in normalized_topics],
        total_questions,
        ensure_minimum=False,
    )

    for topic, recommended_questions in zip(normalized_topics, recommended_counts):
        topic["recommended_questions"] = max(recommended_questions, 1 if len(normalized_topics) <= total_questions else 0)

    return normalized_topics


def build_topic_plan(
    topic_outline: List[Dict[str, Any]],
    selected_topics: List[str],
    num_questions: int,
) -> List[Dict[str, Any]]:
    selected_tokens = {str(topic).strip().lower() for topic in selected_topics or [] if str(topic).strip()}

    if selected_tokens:
        filtered_topics = [
            topic
            for topic in topic_outline
            if topic.get("id", "").lower() in selected_tokens or topic.get("name", "").lower() in selected_tokens
        ]
    else:
        filtered_topics = list(topic_outline)

    if not filtered_topics:
        filtered_topics = normalize_topic_outline(
            [{"name": token, "subtopics": [], "weight": 1} for token in selected_topics or []],
            total_questions=DEFAULT_TOPIC_QUESTION_BUDGET,
        )

    if not filtered_topics:
        return []

    allocations = allocate_weighted_counts(
        [topic.get("recommended_questions", topic.get("weight", 1)) for topic in filtered_topics],
        num_questions,
        ensure_minimum=True,
    )

    topic_plan = []
    for topic, question_count in zip(filtered_topics, allocations):
        if question_count <= 0:
            continue
        topic_plan.append(
            {
                "id": topic.get("id"),
                "name": topic.get("name"),
                "subtopics": topic.get("subtopics", []),
                "recommended_questions": topic.get("recommended_questions", 0),
                "question_count": question_count,
            }
        )

    return topic_plan


def calculate_attempt_topic_performance(quiz_questions: List[Dict[str, Any]], detailed_feedback: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    feedback_by_id = {str(item.get("id")): item for item in detailed_feedback or []}
    topic_performance: Dict[str, Dict[str, Any]] = {}

    for index, question in enumerate(quiz_questions or []):
        question_id = str(question.get("id", index))
        feedback_item = feedback_by_id.get(question_id, {})
        topic_name = str(question.get("topic") or "General").strip() or "General"
        topic_id = str(question.get("topic_id") or slugify(topic_name))
        marks = float(question.get("marks", 1) or 1)
        score = float(feedback_item.get("score", 0) or 0)

        if topic_id not in topic_performance:
            topic_performance[topic_id] = {
                "topic_id": topic_id,
                "topic_name": topic_name,
                "questions_seen": 0,
                "correct_questions": 0,
                "earned_marks": 0.0,
                "max_marks": 0.0,
            }

        topic_stats = topic_performance[topic_id]
        topic_stats["questions_seen"] += 1
        topic_stats["earned_marks"] += score
        topic_stats["max_marks"] += marks

        if marks > 0 and (score / marks) >= 0.8:
            topic_stats["correct_questions"] += 1

    for topic_stats in topic_performance.values():
        seen = topic_stats["questions_seen"]
        topic_stats["accuracy_percent"] = round((topic_stats["correct_questions"] / seen) * 100, 2) if seen else 0.0
        topic_stats["marks_accuracy_percent"] = (
            round((topic_stats["earned_marks"] / topic_stats["max_marks"]) * 100, 2)
            if topic_stats["max_marks"]
            else 0.0
        )

    return topic_performance


def summarize_document_topics(topic_outline: List[Dict[str, Any]], attempts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    progress_map: Dict[str, Dict[str, Any]] = {}

    for topic in topic_outline or []:
        topic_id = topic.get("id") or slugify(topic.get("name", "General"))
        progress_map[topic_id] = {
            "topic_id": topic_id,
            "topic_name": topic.get("name", "General"),
            "subtopics": topic.get("subtopics", []),
            "recommended_questions": int(topic.get("recommended_questions", 0) or 0),
            "questions_seen": 0,
            "correct_questions": 0,
            "earned_marks": 0.0,
            "max_marks": 0.0,
            "tests_taken": 0,
            "coverage_percent": 0.0,
            "accuracy_percent": 0.0,
            "marks_accuracy_percent": 0.0,
            "well_prepared": False,
            "status_message": "Needs more practice",
        }

    for attempt in attempts or []:
        for topic_id, topic_stats in (attempt.get("topic_performance") or {}).items():
            normalized_topic_id = str(topic_id or topic_stats.get("topic_id") or slugify(topic_stats.get("topic_name", "General")))
            entry = progress_map.get(normalized_topic_id)
            if not entry:
                entry = {
                    "topic_id": normalized_topic_id,
                    "topic_name": topic_stats.get("topic_name", "General"),
                    "subtopics": [],
                    "recommended_questions": 0,
                    "questions_seen": 0,
                    "correct_questions": 0,
                    "earned_marks": 0.0,
                    "max_marks": 0.0,
                    "tests_taken": 0,
                    "coverage_percent": 0.0,
                    "accuracy_percent": 0.0,
                    "marks_accuracy_percent": 0.0,
                    "well_prepared": False,
                    "status_message": "Needs more practice",
                }
                progress_map[normalized_topic_id] = entry

            entry["questions_seen"] += int(topic_stats.get("questions_seen", 0) or 0)
            entry["correct_questions"] += int(topic_stats.get("correct_questions", 0) or 0)
            entry["earned_marks"] += float(topic_stats.get("earned_marks", 0) or 0)
            entry["max_marks"] += float(topic_stats.get("max_marks", 0) or 0)
            entry["tests_taken"] += 1

    for entry in progress_map.values():
        recommended = entry["recommended_questions"]
        if recommended > 0:
            entry["coverage_percent"] = round(min(100.0, (entry["questions_seen"] / recommended) * 100), 2)
        else:
            entry["coverage_percent"] = 0.0

        if entry["questions_seen"] > 0:
            entry["accuracy_percent"] = round((entry["correct_questions"] / entry["questions_seen"]) * 100, 2)

        if entry["max_marks"] > 0:
            entry["marks_accuracy_percent"] = round((entry["earned_marks"] / entry["max_marks"]) * 100, 2)

        entry["well_prepared"] = (
            entry["coverage_percent"] >= PREPAREDNESS_THRESHOLD and entry["accuracy_percent"] >= PREPAREDNESS_THRESHOLD
        )
        entry["status_message"] = "You are well prepared" if entry["well_prepared"] else "Needs more practice"

    return sorted(progress_map.values(), key=lambda item: item["topic_name"].lower())
