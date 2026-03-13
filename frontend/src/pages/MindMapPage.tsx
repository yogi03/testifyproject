import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import mermaid from "mermaid";
import { db, auth } from "../firebase/config";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { Loader2, ArrowLeft, Maximize2, ZoomIn, ZoomOut, MousePointerClick, FileEdit, X } from "lucide-react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { apiUrl } from "../lib/api";

export function MindMapPage() {
    const { docId } = useParams();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);
    const [svgContent, setSvgContent] = useState<string>("");
    const [sourceDocId, setSourceDocId] = useState<string>("");
    const [hasAttemptedTest, setHasAttemptedTest] = useState(false);
    const [showTestConfig, setShowTestConfig] = useState(false);
    const [isGeneratingTest, setIsGeneratingTest] = useState(false);
    const [numQuestions, setNumQuestions] = useState(5);
    const [difficulty, setDifficulty] = useState("Medium");
    const [questionTypes, setQuestionTypes] = useState<string[]>(["mcq", "short"]);
    const [topicOutline, setTopicOutline] = useState<any[]>([]);
    const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
    const [mindMapError, setMindMapError] = useState<string>("");
    const hasRetriedRenderRef = useRef(false);

    useEffect(() => {
        mermaid.initialize({
            startOnLoad: false,
            theme: 'default',
            securityLevel: 'loose',
            mindmap: {
                padding: 20
            }
        });
    }, []);

    useEffect(() => {
        return () => {
            cleanupMermaidArtifacts();
        };
    }, []);

    const renderMindMap = async (mermaidData: string, mapSourceId: string) => {
        const normalizedMindMap = normalizeMindMapData(mermaidData);
        cleanupMermaidArtifacts();
        await mermaid.parse(normalizedMindMap, { suppressErrors: true });
        const renderId = `mermaid-${Math.random().toString(36).substring(7)}`;
        const tempContainer = document.createElement("div");
        tempContainer.style.position = "fixed";
        tempContainer.style.left = "-99999px";
        tempContainer.style.top = "0";
        tempContainer.style.opacity = "0";
        tempContainer.style.pointerEvents = "none";
        document.body.appendChild(tempContainer);

        try {
            const { svg } = await mermaid.render(renderId, normalizedMindMap, tempContainer);
            setSvgContent(svg);
            setMindMapError("");
            setSourceDocId(mapSourceId);
            hasRetriedRenderRef.current = false;
            cleanupMermaidArtifacts();
        } finally {
            tempContainer.remove();
        }
    };

    const regenerateMindMap = async (mapSourceId: string) => {
        if (!auth.currentUser || !mapSourceId) {
            throw new Error("Mind map regeneration requires a logged-in user and a source document.");
        }

        const response = await fetch(apiUrl("/tests/mindmap"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user_id: auth.currentUser.uid,
                doc_id: mapSourceId,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new Error(errorData?.detail || "Mind map regeneration failed.");
        }

        return response.json();
    };

    useEffect(() => {
        async function loadMindMap() {
            if (!docId) return;
            try {
                // Now docId is actually mindmapId based on our new navigation logic
                const docRef = doc(db, "mindmaps", docId);
                const docSnap = await getDoc(docRef);

                let mermaidData;
                if (docSnap.exists()) {
                    mermaidData = normalizeMindMapData(docSnap.data().mermaid_data);
                    const mapSourceId = docSnap.data().doc_id;
                    setSourceDocId(mapSourceId);

                    const sourceDocRef = doc(db, "documents", mapSourceId);
                    const sourceDocSnap = await getDoc(sourceDocRef);
                    if (sourceDocSnap.exists()) {
                        const sourceDocData = sourceDocSnap.data();
                        const outline = sourceDocData.topic_outline || [];
                        setTopicOutline(outline);
                        setSelectedTopics(outline.map((topic: any) => topic.id));
                    }

                    // Check if user has already attempted a test
                    if (auth.currentUser) {
                        const q = query(
                            collection(db, "tests"),
                            where("doc_id", "==", mapSourceId),
                            where("user_id", "==", auth.currentUser.uid)
                        );
                        const testSnaps = await getDocs(q);
                        setHasAttemptedTest(!testSnaps.empty);
                    } else {
                        // Fallback search without user if currentUser is slowly loading
                        const q = query(collection(db, "tests"), where("doc_id", "==", mapSourceId));
                        const testSnaps = await getDocs(q);
                        setHasAttemptedTest(!testSnaps.empty);
                    }
                } else {
                    console.error("Mind map not found in database.");
                    return;
                }

                if (mermaidData) {
                    try {
                        await renderMindMap(mermaidData, sourceDocId || docSnap.data().doc_id);
                    } catch (renderErr) {
                        console.error("Mermaid Render Error:", renderErr);
                        if (!hasRetriedRenderRef.current && (sourceDocId || docSnap.data().doc_id) && auth.currentUser) {
                            hasRetriedRenderRef.current = true;
                            try {
                                const regenerated = await regenerateMindMap(sourceDocId || docSnap.data().doc_id);
                                await renderMindMap(normalizeMindMapData(regenerated.mindmap), sourceDocId || docSnap.data().doc_id);
                            } catch (retryErr) {
                                console.error("Mind map regeneration error:", retryErr);
                                setSvgContent("");
                                setMindMapError("Failed to render this stored mind map, and automatic regeneration also failed.");
                                cleanupMermaidArtifacts();
                            }
                        } else {
                            setSvgContent("");
                            setMindMapError("Failed to render this stored mind map.");
                            cleanupMermaidArtifacts();
                        }
                    }
                }
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }
        loadMindMap();
    }, [docId]);

    const handleGenerateTest = async () => {
        if (!sourceDocId) return;
        setIsGeneratingTest(true);
        try {
            const res = await fetch(apiUrl("/tests/generate"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: auth.currentUser?.uid || "unknown",
                    doc_id: sourceDocId,
                    topics: selectedTopics,
                    num_questions: numQuestions,
                    difficulty: difficulty,
                    question_types: questionTypes
                })
            });
            const data = await res.json();
            navigate(`/test/${data.test_id}`);
        } catch (err) {
            console.error(err);
            alert("Failed to generate test.");
        } finally {
            setIsGeneratingTest(false);
        }
    };

    const toggleTopic = (topicId: string) => {
        setSelectedTopics(prev =>
            prev.includes(topicId) ? prev.filter(id => id !== topicId) : [...prev, topicId]
        );
    };

    if (isLoading) return <div className="h-[80vh] flex flex-col items-center justify-center animate-pulse"><Loader2 className="w-12 h-12 text-primary animate-spin mb-4" /><p className="text-xl">Loading your Mind Map...</p></div>;

    return (
        <div className="h-[80vh] premium-panel rounded-3xl overflow-hidden flex flex-col fade-in">
            <div className="p-4 border-b border-white/65 bg-[linear-gradient(180deg,rgba(247,245,239,0.82),rgba(247,245,239,0.72))] flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Link to="/dashboard" className="p-2 hover:bg-white/70 rounded-full transition-colors"><ArrowLeft className="w-5 h-5" /></Link>
                    <h1 className="text-2xl font-bold">Concept Mind Map</h1>
                </div>

                <div className="flex items-center gap-3 relative">
                    <button
                        onClick={() => setShowTestConfig(!showTestConfig)}
                        className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2"
                    >
                        <FileEdit className="w-4 h-4" /> {hasAttemptedTest ? "Reattempt Test" : "Attempt Test"}
                    </button>

                    {showTestConfig && (
                        <div className="absolute top-12 right-0 w-72 sm:w-80 p-4 bg-[rgba(247,245,239,0.9)] border border-white/70 shadow-xl rounded-2xl z-50 animate-in slide-in-from-top-2 backdrop-blur-md">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold">Test Configuration</h3>
                                <button onClick={() => setShowTestConfig(false)} className="p-1 hover:bg-white/70 rounded-full"><X className="w-4 h-4" /></button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Questions ({numQuestions})</label>
                                    <input type="range" min="3" max="20" value={numQuestions} onChange={(e) => setNumQuestions(parseInt(e.target.value))} className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-secondary accent-primary" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Difficulty</label>
                                    <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-full p-2 border border-white/65 rounded-lg bg-white/75">
                                        <option value="Easy">Easy</option><option value="Medium">Medium</option><option value="Hard">Hard</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Types</label>
                                    <div className="flex flex-wrap gap-2">
                                        {[{ id: "mcq", label: "MCQ" }, { id: "true_false", label: "T/F" }, { id: "short", label: "Short" }, { id: "long", label: "Long" }].map(t => (
                                            <label key={t.id} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-white/60 bg-white/60 cursor-pointer has-[:checked]:bg-white/85 has-[:checked]:border-primary select-none">
                                                <input type="checkbox" className="hidden" checked={questionTypes.includes(t.id)} onChange={() => setQuestionTypes(prev => prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id])} />
                                                {t.label}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                {topicOutline.length > 0 && (
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="block text-sm font-medium">Topics</label>
                                            <span className="text-xs text-muted-foreground">{selectedTopics.length} selected</span>
                                        </div>
                                        <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                                            {topicOutline.map((topic: any) => {
                                                const isSelected = selectedTopics.includes(topic.id);
                                                return (
                                                    <button
                                                        key={topic.id}
                                                        type="button"
                                                        onClick={() => toggleTopic(topic.id)}
                                                        className={`w-full text-left p-3 rounded-xl border transition-colors ${isSelected ? "border-primary bg-white/85" : "border-white/60 bg-white/55 hover:bg-white/78"}`}
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div>
                                                                <div className="font-medium text-sm">{topic.name}</div>
                                                                {topic.subtopics?.length > 0 && (
                                                                    <div className="mt-1 flex flex-wrap gap-1.5">
                                                                        {topic.subtopics.slice(0, 4).map((subtopic: string, index: number) => (
                                                                            <span key={`${topic.id}-${index}`} className="rounded-full border border-white/60 bg-white/70 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                                                                                {subtopic}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <span className="shrink-0 rounded-full border border-white/65 bg-white/78 px-2 py-0.5 text-[10px] font-bold text-primary">
                                                                ~{topic.recommended_questions} Q
                                                            </span>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                <button
                                    onClick={handleGenerateTest}
                                    disabled={isGeneratingTest || (topicOutline.length > 0 && selectedTopics.length === 0)}
                                    className="w-full py-2 mt-4 bg-primary text-primary-foreground font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 hover:brightness-110 active:scale-[0.98] transition-all"
                                >
                                    {isGeneratingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : "Generate & Start"}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <TransformWrapper
                initialScale={1}
                minScale={0.1}
                maxScale={20}
                centerOnInit={true}
                wheel={{ step: 0.1 }}
            >
                {({ zoomIn, zoomOut, resetTransform }) => (
                    <div className="flex-1 w-full h-full relative overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.55),_transparent_35%),linear-gradient(180deg,rgba(247,245,239,0.62),rgba(243,240,233,0.82))]">
                        {/* Overlay Controls */}
                        <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                            <button onClick={() => zoomIn(0.5)} className="p-3 bg-[rgba(247,245,239,0.88)] border border-white/70 shadow-md rounded-xl hover:bg-[rgba(255,255,255,0.95)] transition-colors backdrop-blur-md"><ZoomIn className="w-5 h-5" /></button>
                            <button onClick={() => resetTransform()} className="p-3 bg-[rgba(247,245,239,0.88)] border border-white/70 shadow-md rounded-xl hover:bg-[rgba(255,255,255,0.95)] transition-colors backdrop-blur-md"><Maximize2 className="w-5 h-5" /></button>
                            <button onClick={() => zoomOut(0.5)} className="p-3 bg-[rgba(247,245,239,0.88)] border border-white/70 shadow-md rounded-xl hover:bg-[rgba(255,255,255,0.95)] transition-colors backdrop-blur-md"><ZoomOut className="w-5 h-5" /></button>
                        </div>

                        <div className="absolute bottom-4 left-4 z-10 hidden sm:flex items-center gap-2 px-4 py-2 bg-[rgba(247,245,239,0.84)] backdrop-blur-md rounded-full shadow-sm border border-white/70 text-sm text-muted-foreground">
                            <MousePointerClick className="w-4 h-4" /> Scroll to zoom, drag to pan
                        </div>

                        {/* Interactive Canvas */}
                        <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {mindMapError ? (
                                <div className="max-w-2xl p-12">
                                    <div className="text-destructive p-4 border border-red-200 rounded-xl bg-[rgba(255,245,245,0.78)] backdrop-blur-sm">
                                        {mindMapError}
                                    </div>
                                </div>
                            ) : (
                                <div
                                    className="mindmap-canvas w-max h-max p-12"
                                    dangerouslySetInnerHTML={{ __html: svgContent }}
                                />
                            )}
                        </TransformComponent>
                    </div>
                )}
            </TransformWrapper>
        </div>
    );
}

function cleanupMermaidArtifacts() {
    if (typeof document === "undefined") return;

    const artifactSelectors = [
        '[id^="dmermaid-"]',
        '[id^="mermaid-"][aria-roledescription="error"]',
        'svg[aria-roledescription="error"]',
    ];

    artifactSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(node => {
            const element = node as HTMLElement;
            if (!element.closest(".mindmap-canvas")) {
                element.remove();
            }
        });
    });
}

function normalizeMindMapData(content: string) {
    if (typeof content !== "string" || !content.trim()) {
        return `mindmap\n  root(("Study Material"))\n    "Key Concepts"\n      "Review the uploaded content"`;
    }

    let normalized = content.replace(/\r\n/g, "\n").trim();
    const fencedBlock = normalized.match(/```(?:mermaid)?\s*([\s\S]*?)```/i);
    if (fencedBlock?.[1]) {
        normalized = fencedBlock[1].trim();
    }

    const lines = normalized
        .split("\n")
        .map((line) => line.replace(/\t/g, "  ").trimEnd())
        .filter(Boolean);

    const mindmapStartIndex = lines.findIndex((line) => line.trim().startsWith("mindmap"));
    if (mindmapStartIndex === -1) {
        return `mindmap\n  root(("Study Material"))\n    "Key Concepts"\n      "Review the uploaded content"`;
    }

    const relevantLines = lines.slice(mindmapStartIndex);
    const result: string[] = ["mindmap"];
    let rootLabel = "Study Material";
    let hasBranch = false;

    for (const rawLine of relevantLines.slice(1)) {
        const trimmed = rawLine.trim().replace(/^-+\s*/, "");
        if (!trimmed) continue;

        if (trimmed.startsWith("root")) {
            rootLabel = extractLabel(trimmed) || rootLabel;
            continue;
        }

        const label = extractLabel(trimmed);
        if (!label) continue;

        if (/^ {0,4}\S/.test(rawLine)) {
            result.push(`    "${label}"`);
            hasBranch = true;
        } else {
            result.push(`      "${label}"`);
        }
    }

    result.splice(1, 0, `  root(("${rootLabel}"))`);

    if (!hasBranch) {
        result.push(`    "Key Concepts"`);
        result.push(`      "Review the uploaded content"`);
    }

    return result.join("\n");
}

function extractLabel(line: string) {
    const quoted = line.match(/^"(.*)"$/);
    if (quoted?.[1]) {
        return sanitizeLabel(quoted[1]);
    }

    const rootMatch = line.match(/^root\s*[\(\[\{"]*(.*?)[\)\]\}"]*$/);
    if (rootMatch?.[1]) {
        return sanitizeLabel(rootMatch[1]);
    }

    const innerMatch = line.match(/[\(\[\{"](.+?)[\)\]\}"]$/);
    if (innerMatch?.[1]) {
        return sanitizeLabel(innerMatch[1]);
    }

    return sanitizeLabel(line);
}

function sanitizeLabel(label: string) {
    return label.replace(/"/g, "'").replace(/\s+/g, " ").trim();
}
