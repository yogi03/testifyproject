import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { db, auth } from "../firebase/config";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { Award, AlertCircle, RefreshCw, Loader2, BookOpen, Quote, Network, BarChart3, PieChart } from "lucide-react";
import Markdown from 'react-markdown';
import Plot from "react-plotly.js";
import { apiUrl } from "../lib/api";

export function ResultsPage() {
    const { attemptId } = useParams();
    const navigate = useNavigate();
    const [attempt, setAttempt] = useState<any>(null);
    const [test, setTest] = useState<any>(null);
    const [notes, setNotes] = useState<string>("");
    const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);
    const [topicOutline, setTopicOutline] = useState<any[]>([]);
    const [selectedReattemptTopics, setSelectedReattemptTopics] = useState<string[]>([]);

    // Reattempt States
    const [showReattempt, setShowReattempt] = useState(false);
    const [isReattempting, setIsReattempting] = useState(false);
    const [isGeneratingMap, setIsGeneratingMap] = useState(false);

    // Test configuration states for reattempt
    const [numQuestions, setNumQuestions] = useState(5);
    const [difficulty, setDifficulty] = useState("Medium");
    const [questionTypes, setQuestionTypes] = useState<string[]>(["mcq", "short"]);

    useEffect(() => {
        async function loadAttemptAndNotes() {
            if (!attemptId) return;
            const docRef = doc(db, "attempts", attemptId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const attemptData = docSnap.data();
                setAttempt(attemptData);

                // Fetch the original test to correlate questions to topics
                const testRef = doc(db, "tests", attemptData.test_id);
                const testSnap = await getDoc(testRef);
                if (testSnap.exists()) {
                    const testData = testSnap.data();
                    setTest(testData);
                    setSelectedReattemptTopics((testData.selected_topics || []).map((topic: any) => topic.id || topic.name).filter(Boolean));

                    if (testData.doc_id) {
                        const sourceDocRef = doc(db, "documents", testData.doc_id);
                        const sourceDocSnap = await getDoc(sourceDocRef);
                        if (sourceDocSnap.exists()) {
                            const sourceDocData = sourceDocSnap.data();
                            setTopicOutline(sourceDocData.topic_outline || []);
                        }
                    }

                    const quizQuestions = testData.quiz?.quiz || testData.quiz?.questions || testData.quiz || [];
                    const incorrectTopicsList = getIncorrectTopics(attemptData.detailed_feedback || [], quizQuestions);
                    const savedNotesTopics = Array.isArray(attemptData.notes_topics) ? [...attemptData.notes_topics].sort() : [];
                    const expectedNotesTopics = [...incorrectTopicsList].sort();
                    const hasMatchingScopedNotes =
                        typeof attemptData.notes === "string" &&
                        attemptData.notes.length > 0 &&
                        attemptData.notes_scope === "incorrect_only" &&
                        JSON.stringify(savedNotesTopics) === JSON.stringify(expectedNotesTopics);

                    if (hasMatchingScopedNotes) {
                        setNotes(attemptData.notes);
                    } else if (incorrectTopicsList.length > 0) {
                        setIsGeneratingNotes(true);
                        try {
                            const res = await fetch(apiUrl("/tests/notes"), {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    user_id: attemptData.user_id,
                                    doc_id: testData.doc_id,
                                    topics: incorrectTopicsList
                                })
                            });
                            const data = await res.json();
                            setNotes(data.notes);

                            // Save the scoped notes so historical views can safely reuse them.
                            await updateDoc(docRef, {
                                notes: data.notes,
                                notes_topics: incorrectTopicsList,
                                notes_scope: "incorrect_only"
                            });
                        } catch (err) {
                            console.error("Failed to generating notes", err);
                        } finally {
                            setIsGeneratingNotes(false);
                        }
                    } else {
                        setNotes("");
                    }
                }
            }
        }
        loadAttemptAndNotes();
    }, [attemptId]);

    if (!attempt) return <div className="p-12 text-center animate-pulse"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" /> Loading evaluation results...</div>;

    const totalScore = attempt.score;
    const feedback = attempt.detailed_feedback || [];

    // Analytics calculations
    let correctCount = 0;
    let partialCount = 0;
    let incorrectCount = 0;
    const topicScores: Record<string, { earned: number, max: number }> = {};
    const quizQuestions = test?.quiz?.quiz || test?.quiz?.questions || test?.quiz || [];

    if (attempt && test) {
        feedback.forEach((item: any) => {
            const originalQ = quizQuestions.find((q: any, idx: number) => String(q.id) === String(item.id) || String(idx) === String(item.id));
            const maxMarks = originalQ?.marks || 1;
            const topic = originalQ?.topic || "General";

            if (item.score === maxMarks) correctCount++;
            else if (item.score > 0) partialCount++;
            else incorrectCount++;

            if (!topicScores[topic]) topicScores[topic] = { earned: 0, max: 0 };
            topicScores[topic].earned += item.score;
            topicScores[topic].max += maxMarks;
        });
    }

    const handleTypeChange = (type: string) => {
        setQuestionTypes(prev =>
            prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
        );
    };

    const toggleReattemptTopic = (topicId: string) => {
        setSelectedReattemptTopics(prev =>
            prev.includes(topicId) ? prev.filter(id => id !== topicId) : [...prev, topicId]
        );
    };

    const handleReattempt = async () => {
        if (!test) return;
        setIsReattempting(true);
        try {
            const res = await fetch(apiUrl("/tests/generate"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: auth.currentUser?.uid || attempt.user_id,
                    doc_id: test.doc_id,
                    topics: selectedReattemptTopics,
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
            setIsReattempting(false);
        }
    };

    const handleGenerateMindMap = async () => {
        if (!test?.doc_id) return;
        setIsGeneratingMap(true);
        try {
            const mindmapRes = await fetch(apiUrl("/tests/mindmap"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: auth.currentUser?.uid || attempt.user_id,
                    doc_id: test.doc_id
                })
            });
            const mindmapData = await mindmapRes.json();
            navigate(`/mindmap/${mindmapData.mindmap_id}`);
        } catch (err) {
            console.error(err);
            alert("Mind Map generation failed.");
        } finally {
            setIsGeneratingMap(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 fade-in">
            <div className="premium-panel p-12 rounded-3xl text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-chart-1 via-chart-2 to-chart-4" />
                <Award className="w-20 h-20 text-yellow-500 mx-auto mb-6 drop-shadow-lg" />
                <h1 className="text-5xl font-black mb-4">You scored {totalScore}</h1>
                <p className="text-xl text-muted-foreground max-w-lg mx-auto">
                    Testify evaluated your answers and instantly graded them.
                </p>
                <div className="mt-8 flex justify-center gap-4 flex-wrap">
                    <button onClick={() => setShowReattempt(!showReattempt)} disabled={isGeneratingMap} className="px-6 py-3 rounded-full bg-primary text-primary-foreground font-bold hover:brightness-110 transition-all flex items-center gap-2 disabled:opacity-50">
                        <RefreshCw className="w-4 h-4" /> Reattempt Test
                    </button>
                    {test?.doc_id && (
                        <button
                            onClick={handleGenerateMindMap}
                            disabled={isGeneratingMap}
                            className="px-6 py-3 rounded-full bg-[rgba(238,242,255,0.75)] text-indigo-600 border border-indigo-200/80 font-bold hover:bg-[rgba(238,242,255,0.92)] transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                            {isGeneratingMap ? <Loader2 className="w-4 h-4 animate-spin" /> : <Network className="w-4 h-4" />}
                            {isGeneratingMap ? "Generating Map..." : "Generate Mind Map"}
                        </button>
                    )}
                    <Link to="/dashboard" className="px-6 py-3 rounded-full border border-white/60 bg-white/65 font-bold hover:bg-white/80 transition-all">
                        Return to Dashboard
                    </Link>
                </div>

                {showReattempt && (
                    <div className="mt-8 p-6 bg-white/68 rounded-2xl border border-white/70 text-left flex flex-col gap-6 animate-in slide-in-from-top-4 relative z-10 w-full max-w-2xl mx-auto shadow-xl backdrop-blur-md">
                        <h3 className="font-bold text-xl">Reconfigure Test</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium mb-2">Number of Questions ({numQuestions})</label>
                                <input
                                    type="range"
                                    min="3" max="20"
                                    value={numQuestions}
                                    onChange={(e) => setNumQuestions(parseInt(e.target.value))}
                                    className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Difficulty</label>
                                <select
                                    className="w-full px-4 py-2 rounded-xl border border-white/65 bg-white/75 focus:ring-2 focus:ring-primary focus:outline-none"
                                    value={difficulty}
                                    onChange={(e) => setDifficulty(e.target.value)}
                                >
                                    <option value="Easy">Easy</option>
                                    <option value="Medium">Medium</option>
                                    <option value="Hard">Hard</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-3">Question Types</label>
                            <div className="flex flex-wrap gap-3">
                                {[{ id: "mcq", label: "Multiple Choice" }, { id: "true_false", label: "True/False" }, { id: "short", label: "Short Answer" }, { id: "long", label: "Long Answer" }].map(t => (
                                    <label key={t.id} className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/60 bg-white/60 cursor-pointer hover:bg-white/78 transition-colors has-[:checked]:bg-white/85 has-[:checked]:border-primary has-[:checked]:text-primary select-none">
                                        <input
                                            type="checkbox"
                                            className="hidden"
                                            checked={questionTypes.includes(t.id)}
                                            onChange={() => handleTypeChange(t.id)}
                                        />
                                        <span className="text-sm font-bold">{t.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        {topicOutline.length > 0 && (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <label className="block text-sm font-medium">Topics for Reattempt</label>
                                    <span className="text-xs text-muted-foreground">{selectedReattemptTopics.length} selected</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {topicOutline.map((topic: any) => {
                                        const isSelected = selectedReattemptTopics.includes(topic.id);
                                        return (
                                            <button
                                                key={topic.id}
                                                type="button"
                                                onClick={() => toggleReattemptTopic(topic.id)}
                                                className={`text-left p-4 rounded-xl border transition-colors ${isSelected ? "border-primary bg-white/85" : "border-white/60 bg-white/55 hover:bg-white/78"}`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <div className="font-semibold">{topic.name}</div>
                                                        {topic.subtopics?.length > 0 && (
                                                            <div className="mt-2 flex flex-wrap gap-2">
                                                                {topic.subtopics.map((subtopic: string, index: number) => (
                                                                    <span key={`${topic.id}-${index}`} className="rounded-full border border-white/60 bg-white/70 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                                                                        {subtopic}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className="shrink-0 rounded-full border border-white/65 bg-white/78 px-2.5 py-1 text-[11px] font-bold text-primary">
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
                            onClick={handleReattempt}
                            disabled={isReattempting || (topicOutline.length > 0 && selectedReattemptTopics.length === 0)}
                            className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-bold hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                        >
                            {isReattempting ? <><Loader2 className="w-5 h-5 animate-spin" /> Generating Test...</> : "Start New Attempt"}
                        </button>
                    </div>
                )}
            </div>

            {/* Test Analytics Section */}
            {attempt && test && (
                <div className="space-y-6 pt-4">
                    <h2 className="text-2xl font-bold px-2 flex items-center gap-2">
                        <BarChart3 className="w-6 h-6 text-primary" /> Test Analytics
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="premium-panel p-6 rounded-3xl flex flex-col items-center">
                            <h3 className="text-lg font-bold mb-2 flex items-center gap-2 w-full justify-start">
                                <PieChart className="w-5 h-5 text-muted-foreground" /> Accuracy Breakdown
                            </h3>
                            <div className="h-[250px] w-full mt-2">
                                <Plot
                                    data={[
                                        {
                                            values: [correctCount, partialCount, incorrectCount].filter(v => v > 0),
                                            labels: ['Correct', 'Partial', 'Incorrect'].filter((_, i) => [correctCount, partialCount, incorrectCount][i] > 0),
                                            type: 'pie',
                                            hole: 0.4,
                                            marker: {
                                                colors: ['rgb(34, 197, 94)', 'rgb(234, 179, 8)', 'var(--destructive)'].filter((_, i) => [correctCount, partialCount, incorrectCount][i] > 0)
                                            },
                                            textinfo: 'label+percent',
                                            hoverinfo: 'label+value',
                                        }
                                    ]}
                                    layout={{
                                        autosize: true,
                                        margin: { t: 10, b: 30, l: 10, r: 10 },
                                        paper_bgcolor: 'transparent',
                                        plot_bgcolor: 'transparent',
                                        font: { color: 'var(--foreground)' },
                                        showlegend: true,
                                        legend: { orientation: 'h', y: -0.15, xanchor: 'center', x: 0.5 }
                                    }}
                                    useResizeHandler
                                    className="w-full h-full"
                                />
                            </div>
                        </div>

                        <div className="premium-panel p-6 rounded-3xl flex flex-col items-center">
                            <h3 className="text-lg font-bold mb-2 flex items-center gap-2 w-full justify-start">
                                <BarChart3 className="w-5 h-5 text-muted-foreground" /> Topic Performance
                            </h3>
                            <div className="h-[250px] w-full mt-2">
                                {Object.keys(topicScores).length > 0 ? (
                                    <Plot
                                        data={[
                                            {
                                                x: Object.keys(topicScores),
                                                y: Object.values(topicScores).map(ts => (ts.earned / ts.max) * 100),
                                                type: 'bar',
                                                marker: { color: 'var(--chart-1)', opacity: 0.8 },
                                                hovertemplate: '%{x}: %{y:.1f}%<extra></extra>'
                                            }
                                        ]}
                                        layout={{
                                            autosize: true,
                                            margin: { t: 10, b: 60, l: 40, r: 20 },
                                            paper_bgcolor: 'transparent',
                                            plot_bgcolor: 'transparent',
                                            font: { color: 'var(--foreground)' },
                                            xaxis: {
                                                tickangle: -45,
                                                tickfont: { size: 10 }
                                            },
                                            yaxis: {
                                                title: { text: 'Score (%)' },
                                                range: [0, 100],
                                                tickfont: { size: 10 }
                                            }
                                        }}
                                        useResizeHandler
                                        className="w-full h-full"
                                    />
                                ) : (
                                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                                        No topic data available
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {(isGeneratingNotes || notes) && (
                <div className="p-8 rounded-3xl bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(247,245,239,0.68))] border border-white/75 space-y-4 backdrop-blur-md">
                    <h2 className="text-2xl font-bold flex items-center gap-2 text-primary"><BookOpen className="w-6 h-6" /> Adaptive Study Notes</h2>
                    {isGeneratingNotes ? (
                        <div className="py-8 text-center animate-pulse text-muted-foreground flex flex-col items-center gap-2">
                            <Loader2 className="w-6 h-6 animate-spin" /> Abstracting intelligence for your weak topics...
                        </div>
                    ) : (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                            <Markdown>{notes}</Markdown>
                        </div>
                    )}
                </div>
            )}

            <div className="space-y-4 pt-8">
                <h2 className="text-2xl font-bold px-2 flex items-center gap-2"><AlertCircle className="w-6 h-6 text-primary" /> Detailed Question Analysis</h2>
                {feedback.map((item: any, i: number) => {
                    const isCorrect = item.score > 0;
                    const quizQuestions = test?.quiz?.quiz || test?.quiz?.questions || test?.quiz || [];
                    const originalQ = quizQuestions.find((q: any, idx: number) => String(q.id) === String(item.id) || String(idx) === String(item.id));
                    const maxMarks = originalQ?.marks || 1;
                    const isFullMarks = item.score === maxMarks;
                    const isPartialMarks = isCorrect && !isFullMarks;
                    const userGivenAnswer = attempt?.answers?.[item.id] || attempt?.answers?.[String(item.id)] || "No answer provided";

                    const qIndex = quizQuestions.findIndex((q: any, idx: number) => String(q.id) === String(item.id) || String(idx) === String(item.id));
                    const displayQuestionNumber = qIndex !== -1 ? qIndex + 1 : i + 1;

                    let bgClass = 'bg-destructive/5';
                    if (isFullMarks) bgClass = 'bg-green-500/5';
                    else if (isPartialMarks) bgClass = 'bg-yellow-500/5';

                    return (
                        <div key={i} className={`p-8 rounded-2xl border border-white/70 ${bgClass} space-y-6 pt-6 relative overflow-hidden backdrop-blur-md`}>
                            {isFullMarks && <div className="absolute top-0 left-0 w-1 h-full bg-green-500" />}
                            {!isCorrect && <div className="absolute top-0 left-0 w-1 h-full bg-destructive" />}
                            {isPartialMarks && <div className="absolute top-0 left-0 w-1 h-full bg-yellow-500" />}

                            <div className="flex justify-between items-start gap-4">
                                <div>
                                    <div className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                                        Question {displayQuestionNumber} <span className="w-1 h-1 rounded-full bg-muted-foreground opacity-50 block" /> {originalQ?.topic || "General"}
                                    </div>
                                    <h4 className="font-bold text-xl flex items-start gap-3">
                                        {originalQ?.question || originalQ?.text || "Unknown Question"}
                                    </h4>
                                </div>
                                <span className={`font-black px-4 py-2 rounded-full text-sm shrink-0 uppercase tracking-tighter shadow-sm border ${isFullMarks ? 'bg-green-500 text-white border-green-600' : isPartialMarks ? 'bg-yellow-500 text-white border-yellow-600' : 'bg-destructive text-white border-destructive'}`}>
                                    {item.score} / {maxMarks} Marks
                                </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                                <div className="p-4 rounded-xl bg-white/68 border border-white/70 relative">
                                    <span className="absolute -top-3 left-4 bg-[rgba(247,245,239,0.92)] px-2 text-xs font-bold text-muted-foreground uppercase">Your Answer</span>
                                    <p className="text-muted-foreground">{userGivenAnswer}</p>
                                </div>

                                <div className="p-4 rounded-xl bg-white/68 border border-white/70 relative">
                                    <span className="absolute -top-3 left-4 bg-[rgba(247,245,239,0.92)] px-2 text-xs font-bold text-muted-foreground uppercase">Correct Answer</span>
                                    <p className="font-medium text-foreground">{getDisplayCorrectAnswer(originalQ) || "Detailed evaluation above"}</p>
                                </div>
                            </div>

                            <div className={`p-4 rounded-xl border flex items-start gap-3 mt-4 ${isFullMarks ? 'bg-green-500/10 border-green-500/20 text-green-700' : isPartialMarks ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-700' : 'bg-destructive/10 border-destructive/20 text-destructive'}`}>
                                <Quote className="w-5 h-5 shrink-0 mt-0.5 opacity-50" />
                                <div className="flex-1">
                                    <p className="font-medium leading-relaxed">{item.feedback}</p>
                                    {originalQ?.explanation && !isFullMarks && (
                                        <p className="text-sm mt-3 pt-3 border-t border-current/10 opacity-80">
                                            <strong>Key Concept:</strong> {originalQ.explanation}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function getIncorrectTopics(detailedFeedback: any[], quizQuestions: any[]) {
    const incorrectTopics = new Set<string>();

    detailedFeedback.forEach((feedbackItem: any) => {
        const originalQ = quizQuestions.find(
            (q: any, idx: number) => String(q.id) === String(feedbackItem.id) || String(idx) === String(feedbackItem.id)
        );

        if (originalQ && feedbackItem.score === 0 && originalQ.topic) {
            incorrectTopics.add(originalQ.topic);
        }
    });

    return Array.from(incorrectTopics);
}

function getDisplayCorrectAnswer(question: any) {
    const answer = String(question?.answer || "").trim();
    const options = Array.isArray(question?.options) ? question.options : [];

    if (!answer || options.length === 0) {
        return answer;
    }

    const loweredOptions = options.map((option: string) => String(option).trim().toLowerCase());
    if (loweredOptions.includes(answer.toLowerCase())) {
        return answer;
    }

    const indexLookup: Record<string, number> = {
        a: 0,
        b: 1,
        c: 2,
        d: 3,
        "1": 0,
        "2": 1,
        "3": 2,
        "4": 3,
    };

    const normalizedAnswer = answer.toLowerCase().replace("option", "").replace(".", "").replace(")", "").trim();
    const optionIndex = indexLookup[normalizedAnswer];
    if (optionIndex !== undefined && optionIndex < options.length) {
        return options[optionIndex];
    }

    return answer;
}
