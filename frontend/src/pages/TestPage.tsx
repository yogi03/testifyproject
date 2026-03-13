import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { auth, db } from "../firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { Loader2, ArrowRight } from "lucide-react";
import { apiUrl } from "../lib/api";

export function TestPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [test, setTest] = useState<any>(null);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        async function loadTest() {
            if (!id) return;
            const docRef = doc(db, "tests", id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setTest(docSnap.data());
            } else {
                alert("Test not found");
            }
        }
        loadTest();
    }, [id]);

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            const res = await fetch(apiUrl("/evaluation/submit"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: auth.currentUser?.uid,
                    test_id: id,
                    answers: answers
                })
            });
            const data = await res.json();
            navigate(`/results/${data.attempt_id}`);
        } catch (err) {
            console.error(err);
            alert("Evaluation failed.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!test) return <div className="p-12 text-center animate-pulse flex flex-col items-center"><Loader2 className="w-8 h-8 animate-spin text-primary mb-4" /> Loading your personalized test...</div>;

    const questions = test?.quiz?.questions || test?.quiz?.quiz || (Array.isArray(test?.quiz) ? test.quiz : []);
    const selectedTopics = test?.selected_topics || [];

    return (
        <div className="max-w-3xl mx-auto space-y-8 pb-24 fade-in">
            <div className="mb-12">
                <h1 className="text-3xl font-bold mb-2">Adaptive Assessment</h1>
                <p className="text-muted-foreground flex items-center justify-between">
                    <span>{questions.length} Questions</span>
                    <span className="border border-white/60 bg-white/65 text-primary px-3 py-1 rounded-full text-sm font-semibold">Multiple Formats</span>
                </p>
                {selectedTopics.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                        {selectedTopics.map((topic: any) => (
                            <span key={topic.id || topic.name} className="rounded-full border border-white/60 bg-white/65 px-3 py-1 text-xs font-semibold text-slate-700">
                                {topic.name}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            <div className="space-y-8">
                {questions.map((q: any, i: number) => (
                    <div key={q.id ?? i} className="premium-panel p-8 rounded-3xl transition-all hover:shadow-[0_28px_60px_-42px_rgba(15,23,42,0.34)]">
                        <div className="flex justify-between items-start mb-6">
                            <h3 className="text-xl font-bold">
                                <span className="text-muted-foreground mr-2">{i + 1}.</span>
                                {q.question || q.text}
                            </h3>
                            <span className="text-xs font-bold uppercase tracking-wider border border-white/60 bg-white/70 text-slate-700 px-3 py-1 rounded-full shrink-0 ml-4">
                                {q.marks} {q.marks === 1 ? 'mark' : 'marks'}
                            </span>
                        </div>

                        {(q.type === "mcq" || q.type === "true_false") ? (
                            <div className="space-y-3">
                                {q.options?.map((opt: string, optIdx: number) => (
                                    <label key={optIdx} className="flex items-center p-4 rounded-xl border border-white/60 bg-white/55 cursor-pointer hover:bg-white/75 transition-colors has-[:checked]:border-primary has-[:checked]:bg-white/85">
                                        <input
                                            type="radio"
                                            name={`q_${q.id ?? i}`}
                                            value={opt}
                                            className="w-5 h-5 accent-primary mr-4"
                                            onChange={(e) => setAnswers(prev => ({ ...prev, [q.id ?? i]: e.target.value }))}
                                        />
                                        <span className="text-lg">{opt}</span>
                                    </label>
                                ))}
                            </div>
                        ) : (
                            <textarea
                                className="w-full h-32 p-4 rounded-xl border border-white/60 bg-white/65 focus:ring-2 focus:ring-primary focus:outline-none resize-none transition-shadow"
                                placeholder={q.type === "short" ? "Write a short, concise answer..." : "Provide a detailed, well-structured explanation..."}
                                onChange={(e) => setAnswers(prev => ({ ...prev, [q.id ?? i]: e.target.value }))}
                            />
                        )}
                    </div>
                ))}
            </div>

            <div className="fixed bottom-0 left-0 w-full p-4 bg-[linear-gradient(180deg,rgba(247,245,239,0.88),rgba(247,245,239,0.82))] backdrop-blur-xl border-t border-slate-200/80 z-10">
                <div className="max-w-3xl mx-auto flex justify-between items-center">
                    <p className="text-sm font-medium text-muted-foreground">{Object.keys(answers).length} of {questions.length} answered</p>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || Object.keys(answers).length === 0}
                        className="px-8 py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
                    >
                        {isSubmitting ? <><Loader2 className="w-5 h-5 animate-spin" /> Evaluating...</> : <>Submit Test <ArrowRight className="w-5 h-5" /></>}
                    </button>
                </div>
            </div>
        </div>
    );
}
