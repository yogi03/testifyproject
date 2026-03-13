import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import Plot from "react-plotly.js";
import { auth } from "../firebase/config";
import { apiUrl } from "../lib/api";
import { FileText, Target, TrendingUp, CheckCircle2, ChevronDown, ChevronRight, FileX2, Network, Trash2 } from "lucide-react";

export function Dashboard() {
    const user = auth.currentUser;

    const { data: analytics, isLoading } = useQuery({
        queryKey: ['analytics', user?.uid],
        queryFn: async () => {
            const res = await fetch(apiUrl(`/analytics/${user?.uid}`));
            return res.json();
        },
        enabled: !!user?.uid
    });

    const queryClient = useQueryClient();

    const deleteDocument = async (docId: string) => {
        if (!confirm("Are you sure you want to delete this document and all its related tests and mindmaps? This cannot be undone.")) return;
        try {
            const res = await fetch(apiUrl(`/documents/${docId}?user_id=${user?.uid}`), { method: 'DELETE' });
            if (res.ok) queryClient.invalidateQueries({ queryKey: ['analytics', user?.uid] });
            else alert("Failed to delete document.");
        } catch (error) {
            console.error("Error deleting document:", error);
            alert("Error deleting document.");
        }
    };

    const deleteAttempt = async (attemptId: string) => {
        if (!confirm("Are you sure you want to delete this test attempt?")) return;
        try {
            const res = await fetch(apiUrl(`/attempts/${attemptId}?user_id=${user?.uid}`), { method: 'DELETE' });
            if (res.ok) queryClient.invalidateQueries({ queryKey: ['analytics', user?.uid] });
            else alert("Failed to delete attempt.");
        } catch (error) {
            console.error("Error deleting attempt:", error);
            alert("Error deleting attempt.");
        }
    };

    const deleteMindmap = async (mindmapId: string) => {
        if (!confirm("Are you sure you want to delete this mindmap?")) return;
        try {
            const res = await fetch(apiUrl(`/mindmaps/${mindmapId}?user_id=${user?.uid}`), { method: 'DELETE' });
            if (res.ok) queryClient.invalidateQueries({ queryKey: ['analytics', user?.uid] });
            else alert("Failed to delete mindmap.");
        } catch (error) {
            console.error("Error deleting mindmap:", error);
            alert("Error deleting mindmap.");
        }
    };

    if (!user) return <div className="p-8 text-center text-muted-foreground">Please log in to view dashboard.</div>;
    if (isLoading) return <div className="p-8 text-center animate-pulse">Loading analytics...</div>;

    return (
        <div className="space-y-8 fade-in">
            <div>
                <h1 className="text-4xl font-bold tracking-tight mb-2">Welcome back, {user.displayName}</h1>
                <p className="text-muted-foreground">Here is your learning progress across all assessments.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 ">
                <StatCard icon={<FileText />} title="Uploaded Docs" value={analytics?.uploaded_documents || 0} />
                <StatCard icon={<CheckCircle2 />} title="Tests Taken" value={analytics?.total_tests || 0} />
                <StatCard icon={<TrendingUp />} title="Average Score" value={`${analytics?.average_score || 0}%`} />
                <StatCard icon={<Target />} title="Well Prepared" value={analytics?.prepared_topics || 0} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="premium-panel p-6 rounded-[1.75rem]">
                    <h3 className="text-xl font-bold mb-4">Score Progression</h3>
                    <div className="w-full h-[300px] overflow-hidden rounded-lg">
                        <Plot
                            data={[
                                {
                                    x: Array.from({ length: analytics?.recent_scores?.length || 1 }, (_, i) => i + 1),
                                    y: analytics?.recent_scores?.length > 0 ? analytics.recent_scores : [0],
                                    type: 'scatter',
                                    mode: 'lines+markers',
                                    marker: { color: 'var(--primary)', size: 8 },
                                    line: { shape: 'spline', smoothing: 1.3 }
                                }
                            ]}
                            layout={{
                                autosize: true,
                                margin: { t: 20, r: 20, l: 40, b: 40 },
                                paper_bgcolor: 'transparent',
                                plot_bgcolor: 'transparent',
                                font: { color: 'var(--foreground)' },
                                xaxis: { gridcolor: 'var(--border)' },
                                yaxis: { gridcolor: 'var(--border)' }
                            }}
                            useResizeHandler
                            className="w-full h-full"
                        />
                    </div>
                </div>

                <div className="premium-panel p-6 rounded-[1.75rem]">
                    <h3 className="text-xl font-bold mb-4">Uploaded Documents & URLs</h3>
                    {analytics?.documents?.length > 0 ? (
                        <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                            {analytics.documents.map((doc: any, i: number) => (
                                <details key={i} className="group border border-white/60 rounded-2xl bg-white/70 backdrop-blur-sm overflow-hidden shadow-[0_18px_35px_-30px_rgba(15,23,42,0.4)]">
                                    <summary className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/80 transition-colors font-medium select-none">
                                        <div className="flex items-center gap-3 truncate max-w-[70%]">
                                            <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0">
                                                <FileText className="w-5 h-5" />
                                            </div>
                                            <span className="truncate">{doc.filename}</span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <div className="text-sm text-muted-foreground flex items-center gap-2">
                                                {doc.attempts.length + (doc.mindmaps?.length || 0)} resources <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                                            </div>
                                            <button
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteDocument(doc.doc_id); }}
                                                className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors ml-2"
                                                title="Delete Document"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </summary>
                                    <div className="border-t border-white/60 bg-white/45 p-4 space-y-2">
                                        {doc.topics?.length > 0 && (
                                            <div className="bg-white/75 border border-white/70 p-4 rounded-2xl space-y-3 backdrop-blur-sm">
                                                <div className="flex items-center justify-between gap-3">
                                                    <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Topic Preparation</h4>
                                                    <span className="text-xs text-muted-foreground">Coverage is tracked against the document's AI-estimated practice budget.</span>
                                                </div>
                                                <div className="space-y-3">
                                                    {doc.topics.map((topic: any) => (
                                                        <div key={topic.topic_id} className="rounded-xl border border-white/70 bg-white/70 p-4 space-y-3">
                                                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                                                <div>
                                                                    <div className="font-semibold">{topic.topic_name}</div>
                                                                    {topic.subtopics?.length > 0 && (
                                                                        <div className="mt-2 flex flex-wrap gap-2">
                                                                            {topic.subtopics.map((subtopic: string, index: number) => (
                                                                                <span key={`${topic.topic_id}-${index}`} className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground">
                                                                                    {subtopic}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <span className={`text-xs font-bold px-3 py-1 rounded-full ${topic.well_prepared ? "bg-green-500/10 text-green-700" : "bg-amber-500/10 text-amber-700"}`}>
                                                                    {topic.status_message}
                                                                </span>
                                                            </div>

                                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                                                                <MetricBox label="Coverage" value={`${topic.coverage_percent}%`} helper={`${topic.questions_seen}/${topic.recommended_questions || 0} questions`} />
                                                                <MetricBox label="Accuracy" value={`${topic.accuracy_percent}%`} helper={`${topic.correct_questions}/${topic.questions_seen} correct`} />
                                                                <MetricBox label="Marks" value={`${topic.marks_accuracy_percent}%`} helper={`${topic.earned_marks}/${topic.max_marks} marks`} />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {doc.attempts.map((att: any, j: number) => (
                                            <div key={`att-${j}`} className="flex justify-between items-center bg-white/75 border border-white/70 p-3 rounded-xl hover:border-primary/40 transition-colors group/item">
                                                <Link to={`/results/${att.attempt_id}`} className="flex-1 font-medium text-sm flex items-center gap-2">
                                                    <Target className="w-4 h-4 text-primary" /> Test Attempt {j + 1}
                                                </Link>
                                                <div className="flex items-center gap-3">
                                                    <Link to={`/results/${att.attempt_id}`} className="text-sm font-bold bg-primary/10 text-primary px-3 py-1 rounded-full hover:bg-primary/20 transition-colors">{att.score_percentage || 0}% <ChevronRight className="w-4 h-4 inline mb-0.5 ml-1" /></Link>
                                                    <button onClick={() => deleteAttempt(att.attempt_id)} className="p-1.5 opacity-0 group-hover/item:opacity-100 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-md transition-all border border-transparent hover:border-red-500/20" title="Delete Attempt">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        {doc.mindmaps?.map((mm: any, j: number) => (
                                            <div key={`mm-${j}`} className="flex justify-between items-center bg-white/75 border border-white/70 p-3 rounded-xl hover:border-indigo-500/40 transition-colors group/item">
                                                <Link to={`/mindmap/${mm.mindmap_id}`} className="flex-1 font-medium text-sm flex items-center gap-2">
                                                    <Network className="w-4 h-4 text-indigo-500" /> Topic Mind Map {j + 1}
                                                </Link>
                                                <div className="flex items-center gap-3">
                                                    <Link to={`/mindmap/${mm.mindmap_id}`} className="text-sm font-bold bg-indigo-500/10 text-indigo-500 px-3 py-1 rounded-full"><ChevronRight className="w-4 h-4 inline" /></Link>
                                                    <button onClick={() => deleteMindmap(mm.mindmap_id)} className="p-1.5 opacity-0 group-hover/item:opacity-100 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-md transition-all border border-transparent hover:border-red-500/20" title="Delete Mindmap">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        {doc.attempts.length === 0 && (!doc.mindmaps || doc.mindmaps.length === 0) && <p className="text-sm text-muted-foreground text-center py-2">No tests or maps generated yet for this document.</p>}
                                    </div>
                                </details>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-[250px] text-muted-foreground border-2 border-dashed border-slate-300/70 rounded-2xl bg-white/45">
                            <FileX2 className="w-12 h-12 mb-4 text-muted border border-muted p-2 rounded-xl" />
                            <p>No documents uploaded yet.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function StatCard({ icon, title, value }: { icon: React.ReactNode, title: string, value: string | number }) {
    return (
        <div className="premium-panel p-6 rounded-[1.75rem] flex items-center gap-4 bg-[#f7f5ef]/90">
            <div className="p-4 rounded-xl bg-slate-950/5 text-slate-800">
                {icon}
            </div>
            <div>
                <p className="text-sm font-medium text-muted-foreground">{title}</p>
                <p className="text-3xl font-black">{value}</p>
            </div>
        </div>
    );
}

function MetricBox({ label, value, helper }: { label: string, value: string, helper: string }) {
    return (
        <div className="rounded-xl bg-muted/30 border px-3 py-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="text-lg font-bold">{value}</div>
            <div className="text-xs text-muted-foreground">{helper}</div>
        </div>
    );
}
