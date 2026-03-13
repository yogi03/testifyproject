import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    ArrowRight,
    Zap,
    Target,
    BookOpen,
    Network,
    UploadCloud,
    BarChart3,
    Brain,
} from "lucide-react";
import { AppNavbar } from "../components/Layout";
import { auth, db } from "../firebase/config";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup } from "firebase/auth";
import type { User } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";

const showcaseSections = [
    {
        icon: <UploadCloud className="w-5 h-5" />,
        eyebrow: "Upload your material",
        title: "Drop in a PDF or URL and turn static content into practice-ready study space.",
        body: "TESTIFY ingests lecture notes, articles, Wikipedia pages, and PDFs, extracts the main topics and subtopics, and prepares them for adaptive testing.",
        visual: <UploadVisual />,
    },
    {
        icon: <Target className="w-5 h-5" />,
        eyebrow: "Attempt adaptive tests",
        title: "Generate focused quizzes from the exact topics you want to improve.",
        body: "Choose one topic or mix multiple topics. TESTIFY distributes questions based on topic depth, tracks repeated attempts, and keeps pushing practice where you still need it.",
        visual: <TestVisual />,
    },
    {
        icon: <BookOpen className="w-5 h-5" />,
        eyebrow: "Study what you missed",
        title: "Get notes only for the concepts you got wrong, not generic summaries.",
        body: "After every test, TESTIFY creates targeted revision notes for incorrect topics so review time stays focused and useful.",
        visual: <NotesVisual />,
    },
    {
        icon: <Network className="w-5 h-5" />,
        eyebrow: "See the full picture",
        title: "Generate mind maps and monitor topic preparedness over time.",
        body: "Visualize connections between concepts, revisit selected topics, and watch coverage and accuracy climb until TESTIFY marks you as well prepared.",
        visual: <MindMapVisual />,
    },
];

const usageCards = [
    {
        icon: <Zap className="w-5 h-5 text-chart-4" />,
        title: "Revise faster",
        description: "Turn a chapter into tests, notes, and a mind map in minutes instead of building revision material by hand.",
    },
    {
        icon: <BarChart3 className="w-5 h-5 text-chart-2" />,
        title: "Track mastery",
        description: "Measure topic coverage, question accuracy, and readiness across multiple attempts instead of guessing your progress.",
    },
    {
        icon: <Brain className="w-5 h-5 text-chart-3" />,
        title: "Practice smarter",
        description: "Reattempt only the selected topics you want, with the app adapting question focus to your weaker areas.",
    },
];

export function LandingPage() {
    const navigate = useNavigate();
    const [user, setUser] = useState<User | null>(auth.currentUser);
    const pageRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
            setUser(nextUser);
        });

        return unsubscribe;
    }, []);

    useEffect(() => {
        const root = pageRef.current;
        if (!root) return;

        const revealTargets = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
        if (!revealTargets.length) return;

        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (prefersReducedMotion) {
            revealTargets.forEach((element) => element.classList.add("reveal-visible"));
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("reveal-visible");
                        observer.unobserve(entry.target);
                    }
                });
            },
            {
                threshold: 0.18,
                rootMargin: "0px 0px -10% 0px",
            }
        );

        revealTargets.forEach((element) => observer.observe(element));
        return () => observer.disconnect();
    }, []);

    const handleLogin = async () => {
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            const signedInUser = result.user;

            await setDoc(doc(db, "users", signedInUser.uid), {
                user_id: signedInUser.uid,
                name: signedInUser.displayName,
                email: signedInUser.email,
                created_at: new Date()
            }, { merge: true });

            navigate("/dashboard");
        } catch (error) {
            console.error("Login failed:", error);
        }
    };

    const handlePrimaryAction = async () => {
        if (user) {
            navigate("/dashboard");
            return;
        }

        await handleLogin();
    };

    return (
        <div ref={pageRef} className="landing-page min-h-screen bg-[#f7f5ef] text-slate-950 relative overflow-hidden">
            <div className="landing-hero-glow absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_top,_rgba(142,197,252,0.2),_transparent_55%),radial-gradient(circle_at_20%_25%,_rgba(196,255,143,0.22),_transparent_35%),linear-gradient(180deg,_rgba(255,255,255,0.6),_transparent)] pointer-events-none" />

            <AppNavbar onLogin={handleLogin} />

            <main className="relative z-10">
                <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
                    <div data-reveal className="reveal-up inline-flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 bg-white/80 text-sm font-medium text-slate-600 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.55)]">
                        <img src="/logo.png" alt="TESTIFY logo" className="w-5 h-5 object-contain" />
                        AI study tests, notes, mind maps, and readiness tracking
                    </div>

                    <h1 data-reveal className="reveal-up reveal-delay-1 mt-8 text-6xl md:text-8xl font-black tracking-tighter leading-[0.95]">
                        Master <span className="bg-gradient-to-r from-lime-500 via-emerald-500 to-sky-500 bg-clip-text text-transparent">Any Topic</span>
                    </h1>

                    <p data-reveal className="reveal-up reveal-delay-2 mt-6 max-w-3xl mx-auto text-lg md:text-xl text-slate-600 leading-relaxed">
                        Upload a PDF or URL, extract topics automatically, generate adaptive tests, revise only what you got wrong, and track when you are truly well prepared.
                    </p>

                    <div data-reveal className="reveal-up reveal-delay-3 mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                        <button
                            onClick={handlePrimaryAction}
                            className="inline-flex items-center justify-center px-8 py-4 rounded-full bg-slate-950 text-white font-semibold shadow-[0_18px_45px_-18px_rgba(15,23,42,0.7)] hover:translate-y-[-1px] hover:scale-[1.01] transition-all duration-300"
                        >
                            {user ? "Go to Dashboard" : "Try TESTIFY"}
                            <ArrowRight className="w-5 h-5 ml-2" />
                        </button>
                        <button
                            onClick={() => navigate("/upload")}
                            className="inline-flex items-center justify-center px-8 py-4 rounded-full border border-slate-300 bg-white/80 font-semibold text-slate-700 hover:bg-white hover:-translate-y-0.5 transition-all duration-300"
                        >
                            Explore Upload Flow
                        </button>
                    </div>
                </section>

                <section className="max-w-6xl mx-auto px-6 pb-20">
                    <div data-reveal className="reveal-up text-center mb-14">
                        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Your AI-powered exam prep partner</h2>
                        <p className="mt-3 text-slate-600 max-w-2xl mx-auto">
                            TESTIFY is built for focused revision: topic extraction, selective testing, wrong-answer notes, mind maps, and measurable preparedness.
                        </p>
                    </div>

                    <div className="space-y-10">
                        {showcaseSections.map((section, index) => (
                            <div
                                key={section.title}
                                data-reveal
                                className={`reveal-up grid grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(320px,1.05fr)] gap-8 items-center ${index % 2 === 1 ? "lg:[&>*:first-child]:order-2 lg:[&>*:last-child]:order-1" : ""}`}
                                style={{ transitionDelay: `${index * 90}ms` }}
                            >
                                <div className="px-2 max-w-xl">
                                    <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-700 mb-4 shadow-sm">
                                        {section.icon}
                                    </div>
                                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{section.eyebrow}</p>
                                    <h3 className="mt-3 text-2xl font-bold leading-tight">{section.title}</h3>
                                    <p className="mt-4 text-slate-600 leading-relaxed">{section.body}</p>
                                </div>
                                <div className="landing-showcase-card rounded-[2rem] border border-slate-200 bg-[#0d0f12] p-5 shadow-[0_25px_80px_-35px_rgba(15,23,42,0.6)] min-w-0">
                                    {section.visual}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="max-w-6xl mx-auto px-6 pb-20">
                    <div data-reveal className="reveal-up text-center mb-12">
                        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">How people use TESTIFY</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {usageCards.map((card, index) => (
                            <div
                                key={card.title}
                                data-reveal
                                className="reveal-up rounded-[1.75rem] border border-slate-200 bg-white/90 p-7 shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-34px_rgba(15,23,42,0.55)]"
                                style={{ transitionDelay: `${index * 80}ms` }}
                            >
                                <div className="w-11 h-11 rounded-xl bg-slate-950/5 flex items-center justify-center mb-5">
                                    {card.icon}
                                </div>
                                <h3 className="text-xl font-bold mb-3">{card.title}</h3>
                                <p className="text-slate-600 leading-relaxed">{card.description}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="max-w-5xl mx-auto px-6 pb-24">
                    <div data-reveal className="reveal-up rounded-[2.25rem] border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(196,255,143,0.18),_transparent_35%),linear-gradient(180deg,_rgba(255,255,255,0.92),_rgba(255,255,255,0.88))] p-10 text-center shadow-sm">
                        <div className="landing-logo-orb mx-auto w-20 h-20 rounded-full border border-slate-200 bg-white flex items-center justify-center shadow-sm">
                            <img src="/logo.png" alt="TESTIFY logo" className="w-10 h-10 object-contain" />
                        </div>
                        <h2 className="mt-8 text-3xl md:text-4xl font-bold tracking-tight">Practice from your own material. Improve with measurable signals.</h2>
                        <p className="mt-4 max-w-2xl mx-auto text-slate-600 leading-relaxed">
                            TESTIFY keeps the loop tight: upload content, pick topics, take adaptive tests, review wrong-answer notes, inspect the mind map, and keep going until topic coverage and accuracy say you are well prepared.
                        </p>
                        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                            <button
                                onClick={handlePrimaryAction}
                                className="inline-flex items-center justify-center px-7 py-3.5 rounded-full bg-slate-950 text-white font-semibold hover:opacity-90 hover:-translate-y-0.5 transition-all duration-300"
                            >
                                {user ? "Go to Dashboard" : "Try TESTIFY"}
                                <ArrowRight className="w-5 h-5 ml-2" />
                            </button>
                            <button
                                onClick={() => navigate("/upload")}
                                className="inline-flex items-center justify-center px-7 py-3.5 rounded-full border border-slate-300 bg-white font-semibold text-slate-700 hover:bg-slate-50 hover:-translate-y-0.5 transition-all duration-300"
                            >
                                Upload study content
                            </button>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}

function UploadVisual() {
    return (
        <div className="rounded-[1.5rem] bg-[radial-gradient(circle_at_20%_10%,_rgba(174,255,91,0.22),_transparent_30%),radial-gradient(circle_at_80%_10%,_rgba(64,200,255,0.22),_transparent_35%),linear-gradient(160deg,_#090b0f,_#151922)] p-6 min-h-[280px] text-white">
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 max-w-md">
                <div className="flex items-center justify-between text-xs text-white/60 mb-4">
                    <span>Source Upload</span>
                    <span>PDF / URL</span>
                </div>
                <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-8 text-center">
                    <UploadCloud className="w-10 h-10 mx-auto text-lime-300 mb-3" />
                    <p className="font-semibold">Environmental Pollution.pdf</p>
                    <p className="text-sm text-white/60 mt-2">Topics and subtopics extracted automatically</p>
                </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 max-w-lg">
                {["Air pollution", "Water pollution", "Waste management", "Climate effects"].map((topic) => (
                    <div key={topic} className="rounded-xl bg-white/10 border border-white/10 px-4 py-3 text-sm font-medium text-white/90">
                        {topic}
                    </div>
                ))}
            </div>
        </div>
    );
}

function TestVisual() {
    return (
        <div className="rounded-[1.5rem] bg-[radial-gradient(circle_at_15%_15%,_rgba(255,85,200,0.18),_transparent_28%),radial-gradient(circle_at_85%_25%,_rgba(88,193,255,0.18),_transparent_32%),linear-gradient(160deg,_#090b0f,_#12161d)] p-4 sm:p-6 min-h-[280px] text-white">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-5 max-w-[540px]">
                <div className="flex flex-wrap gap-2 mb-4">
                    {["LSTM Architecture", "Gates in LSTM", "Applications"].map((item) => (
                        <span key={item} className="rounded-full bg-white/10 border border-white/10 px-3 py-1 text-xs font-medium">
                            {item}
                        </span>
                    ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl bg-white/8 border border-white/10 p-4">
                        <p className="text-xs text-white/50 mb-1">Distribution</p>
                        <p className="font-semibold leading-snug">5 questions across selected topics</p>
                    </div>
                    <div className="rounded-xl bg-white/8 border border-white/10 p-4">
                        <p className="text-xs text-white/50 mb-1">Difficulty</p>
                        <p className="font-semibold leading-snug">Medium adaptive mix</p>
                    </div>
                </div>
                <div className="mt-4 rounded-xl bg-lime-300/10 border border-lime-300/20 p-4 text-sm text-lime-100">
                    Weak topics get more attention as the user reattempts tests.
                </div>
            </div>
        </div>
    );
}

function NotesVisual() {
    return (
        <div className="rounded-[1.5rem] bg-[radial-gradient(circle_at_18%_18%,_rgba(255,210,70,0.18),_transparent_30%),radial-gradient(circle_at_82%_22%,_rgba(90,255,200,0.18),_transparent_30%),linear-gradient(160deg,_#090b0f,_#151922)] p-6 min-h-[280px] text-white">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 max-w-xl">
                <div className="flex items-center gap-2 text-sm font-semibold text-white/90 mb-4">
                    <BookOpen className="w-4 h-4 text-cyan-300" />
                    Adaptive Study Notes
                </div>
                <div className="space-y-3 text-sm text-white/75">
                    <div className="rounded-xl bg-white/8 p-3 border border-white/10">
                        <p className="font-medium text-white">Topic: Input, forget, and output gates</p>
                        <p className="mt-1">Review how each gate controls information flow and preserves long-term dependencies.</p>
                    </div>
                    <div className="rounded-xl bg-white/8 p-3 border border-white/10">
                        <p className="font-medium text-white">Focus only on wrong-answer topics</p>
                        <p className="mt-1">No full-chapter summaries, only revision material tied to missed questions.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function MindMapVisual() {
    return (
        <div className="rounded-[1.5rem] bg-[radial-gradient(circle_at_18%_18%,_rgba(188,110,255,0.18),_transparent_30%),radial-gradient(circle_at_82%_22%,_rgba(72,255,171,0.18),_transparent_32%),linear-gradient(160deg,_#090b0f,_#131720)] p-4 sm:p-6 min-h-[280px] text-white">
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.9fr)] gap-4 h-full">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5 flex flex-col justify-between">
                    <div className="text-sm text-white/70">Mind map and preparedness</div>
                    <div className="space-y-3">
                        <div className="rounded-xl bg-white/8 p-3 border border-white/10">
                            <div className="flex items-center justify-between text-sm">
                                <span>LSTM Architecture</span>
                                <span>80%</span>
                            </div>
                            <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
                                <div className="h-full w-[80%] bg-gradient-to-r from-lime-300 to-cyan-300 rounded-full" />
                            </div>
                        </div>
                        <div className="rounded-xl bg-white/8 p-3 border border-white/10">
                            <div className="flex items-center justify-between text-sm">
                                <span>Applications</span>
                                <span>63%</span>
                            </div>
                            <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
                                <div className="h-full w-[63%] bg-gradient-to-r from-pink-300 to-orange-300 rounded-full" />
                            </div>
                        </div>
                    </div>
                    <div className="text-xs text-lime-200 font-medium">When coverage and accuracy reach the goal, TESTIFY marks the topic as well prepared.</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5 flex items-center justify-center">
                    <div className="relative w-full max-w-[280px] h-full min-h-[220px]">
                        <div className="absolute inset-x-1/2 top-4 -translate-x-1/2 rounded-2xl bg-cyan-400/20 border border-cyan-300/25 px-4 py-2 text-center text-sm font-semibold text-cyan-100 w-[150px]">
                            Long Short Term Memory
                        </div>
                        <div className="absolute left-1 top-20 rounded-full bg-lime-400/20 border border-lime-300/25 px-3 py-1.5 text-xs text-lime-100">
                            Gates
                        </div>
                        <div className="absolute right-1 top-20 rounded-full bg-pink-400/20 border border-pink-300/25 px-3 py-1.5 text-xs text-pink-100">
                            Applications
                        </div>
                        <div className="absolute left-5 bottom-6 rounded-full bg-amber-300/20 border border-amber-200/25 px-3 py-1.5 text-xs text-amber-100">
                            Equations
                        </div>
                        <div className="absolute right-4 bottom-6 rounded-full bg-violet-300/20 border border-violet-200/25 px-3 py-1.5 text-xs text-violet-100">
                            Challenges
                        </div>
                        <div className="absolute left-[74px] top-[74px] h-px w-14 rotate-[18deg] bg-white/20" />
                        <div className="absolute right-[72px] top-[74px] h-px w-14 -rotate-[18deg] bg-white/20" />
                        <div className="absolute left-[76px] bottom-[54px] h-px w-12 -rotate-[28deg] bg-white/20" />
                        <div className="absolute right-[72px] bottom-[54px] h-px w-12 rotate-[28deg] bg-white/20" />
                    </div>
                </div>
            </div>
        </div>
    );
}
