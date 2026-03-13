from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import PromptTemplate
from pydantic import BaseModel, Field
from typing import List
import re

from rag.retriever import get_retriever
from services.llm import invoke_with_fallback


class MindMapBranch(BaseModel):
    name: str = Field(description="Main branch name")
    subtopics: List[str] = Field(description="Important children under this branch")


class MindMapSchema(BaseModel):
    root: str = Field(description="Central theme of the document")
    branches: List[MindMapBranch] = Field(description="Main branches of the mind map")


def _escape_label(label: str) -> str:
    cleaned = " ".join(str(label or "").replace('"', "'").split()).strip()
    return cleaned or "Untitled"


def _build_mermaid_tree(root: str, branches: List[MindMapBranch]) -> str:
    lines = ["mindmap", f'  root(("{_escape_label(root)}"))']

    for branch in branches:
        lines.append(f'    "{_escape_label(branch.name)}"')
        for subtopic in branch.subtopics[:8]:
            lines.append(f'      "{_escape_label(subtopic)}"')

    return "\n".join(lines)


def _build_minimal_mindmap(title: str) -> str:
    return _build_mermaid_tree(
        title or "Study Material",
        [MindMapBranch(name="Key Concepts", subtopics=["Review the uploaded content"])],
    )


def _topic_outline_fallback(title: str, topic_outline: List[dict]) -> str:
    branches = [
        MindMapBranch(
            name=str(topic.get("name") or "Topic").strip(),
            subtopics=[str(subtopic).strip() for subtopic in (topic.get("subtopics") or []) if str(subtopic).strip()],
        )
        for topic in (topic_outline or [])[:8]
        if str(topic.get("name") or "").strip()
    ]

    if not branches:
        return _build_minimal_mindmap(title)

    root = title or "Study Material"
    return _build_mermaid_tree(root, branches)


def _extract_label(line: str) -> str:
    stripped = (line or "").strip().lstrip("-").strip()
    if not stripped:
        return ""

    quoted = re.match(r'^"(.*)"$', stripped)
    if quoted:
        return _escape_label(quoted.group(1))

    root_match = re.match(r'^root\s*[\(\[\{"]*(.*?)[\)\]\}"]*$', stripped)
    if root_match and root_match.group(1).strip():
        return _escape_label(root_match.group(1))

    inner_match = re.search(r'[\(\[\{"](.+?)[\)\]\}"]$', stripped)
    if inner_match and inner_match.group(1).strip():
        return _escape_label(inner_match.group(1))

    return _escape_label(stripped)


def normalize_mindmap_data(content: str, title: str = "Study Material") -> str:
    if not isinstance(content, str) or not content.strip():
        return _build_minimal_mindmap(title)

    normalized = content.replace("\r\n", "\n").strip()
    fence_match = re.search(r"```(?:mermaid)?\s*(.*?)```", normalized, re.IGNORECASE | re.DOTALL)
    if fence_match:
        normalized = fence_match.group(1).strip()

    lines = [line.rstrip() for line in normalized.splitlines() if line.strip()]
    mindmap_start = next((idx for idx, line in enumerate(lines) if line.strip().startswith("mindmap")), -1)
    if mindmap_start == -1:
        return _build_minimal_mindmap(title)

    lines = lines[mindmap_start:]
    root_label = title or "Study Material"
    branches: list[MindMapBranch] = []
    current_branch: MindMapBranch | None = None

    for raw_line in lines[1:]:
        leading_spaces = len(raw_line) - len(raw_line.lstrip(" "))
        stripped = raw_line.strip()
        if not stripped:
            continue

        if stripped.startswith("root"):
            candidate = _extract_label(stripped)
            if candidate:
                root_label = candidate
            continue

        label = _extract_label(stripped)
        if not label:
            continue

        if leading_spaces <= 4:
            current_branch = MindMapBranch(name=label, subtopics=[])
            branches.append(current_branch)
            continue

        if current_branch is None:
            current_branch = MindMapBranch(name="Key Concepts", subtopics=[])
            branches.append(current_branch)
        current_branch.subtopics.append(label)

    if not branches:
        return _build_minimal_mindmap(root_label)

    return _build_mermaid_tree(root_label, branches)


def is_valid_mindmap_data(content: str) -> bool:
    if not isinstance(content, str):
        return False

    normalized = content.strip()
    if not normalized.startswith("mindmap"):
        return False

    lines = [line.rstrip() for line in normalized.splitlines() if line.strip()]
    if len(lines) < 3:
        return False

    if not lines[1].strip().startswith('root(("') or not lines[1].strip().endswith('"))'):
        return False

    for line in lines[2:]:
        stripped = line.strip()
        if not stripped:
            continue
        if not (stripped.startswith('"') and stripped.endswith('"')):
            return False

    return True


def is_placeholder_mindmap_data(content: str) -> bool:
    if not isinstance(content, str):
        return False

    normalized = "\n".join(line.strip() for line in content.splitlines() if line.strip())
    placeholder = '\n'.join([
        "mindmap",
        'root(("Study Material"))',
        '"Key Concepts"',
        '"Review the uploaded content"',
    ])
    return placeholder in normalized.replace("  ", "")


def generate_mindmap_data(doc_id: str, topic_outline: List[dict] | None = None, title: str = "Study Material"):
    retriever = get_retriever(k=15, doc_id=doc_id)
    docs = retriever.invoke("core concepts, section headings, and main topics")
    context_text = "\n\n".join([doc.page_content for doc in docs])

    parser = JsonOutputParser(pydantic_object=MindMapSchema)

    prompt_template = """
    You are an expert at summarizing study material into a mind map outline.

    Read the context and return a valid JSON object with:
    - "root": the overall title or central idea
    - "branches": 4 to 8 main branches
    - each branch should have a concise "name"
    - each branch should have 2 to 6 concise "subtopics"

    Keep labels short and readable.
    Do not include Markdown, Mermaid syntax, code fences, or explanations.

    Context:
    {context}
    """

    prompt = PromptTemplate(template=prompt_template, input_variables=["context"])
    try:
        response = invoke_with_fallback(
            lambda llm: prompt | llm | parser,
            {"context": context_text},
        )
        root = response.get("root", "Study Material")
        raw_branches = response.get("branches", [])
        branches = [MindMapBranch(**branch) for branch in raw_branches if branch.get("name")]
        if not branches:
            return _topic_outline_fallback(title, topic_outline or [])
        return normalize_mindmap_data(_build_mermaid_tree(root, branches), title=title)
    except Exception as e:
        print(f"Error generating mind map: {e}")
        return normalize_mindmap_data(_topic_outline_fallback(title, topic_outline or []), title=title)
