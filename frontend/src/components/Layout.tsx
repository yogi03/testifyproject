import { useEffect, useRef, useState } from "react";
import { Outlet, Link, useNavigate } from "react-router-dom";
import { LogOut, LayoutDashboard, UploadCloud, ChevronDown } from "lucide-react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import { auth } from "../firebase/config";

export function Layout() {
    return (
        <div className="app-shell min-h-screen text-foreground flex flex-col relative overflow-hidden">
            <div className="app-shell-glow pointer-events-none absolute inset-x-0 top-0 h-[420px]" />
            <div className="app-shell-glow-secondary pointer-events-none absolute inset-x-0 top-[240px] h-[520px]" />

            <AppNavbar />
            <main className="relative z-10 flex-1 container max-w-7xl mx-auto p-6 animate-in fade-in duration-500">
                <Outlet />
            </main>
        </div>
    );
}

type AppNavbarProps = {
    onLogin?: () => void | Promise<void>;
};

export function AppNavbar({ onLogin }: AppNavbarProps) {
    const navigate = useNavigate();
    const [user, setUser] = useState<User | null>(auth.currentUser);
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [profileImageFailed, setProfileImageFailed] = useState(false);
    const profileMenuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
            setUser(nextUser);
            setProfileImageFailed(false);
        });

        return unsubscribe;
    }, []);

    useEffect(() => {
        function handleOutsideClick(event: MouseEvent) {
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
                setShowProfileMenu(false);
            }
        }

        document.addEventListener("mousedown", handleOutsideClick);
        return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, []);

    const handleLogout = async () => {
        await signOut(auth);
        setShowProfileMenu(false);
        navigate("/");
    };

    return (
        <header className="app-navbar border-b sticky top-0 z-50">
            <div className="container max-w-7xl mx-auto flex items-center justify-between h-16 px-6">
                <Link to="/" className="flex items-center gap-2 text-xl font-bold tracking-tighter text-slate-950 transition-transform duration-300 hover:scale-[1.02]">
                    <img src="/logo.png" alt="TESTIFY logo" className="w-8 h-8 object-contain" />
                    TESTIFY
                </Link>
                <nav className="flex items-center gap-6 text-sm font-medium text-slate-700">
                    <Link to="/dashboard" className="flex items-center gap-2 hover:text-slate-950 transition-colors">
                        <LayoutDashboard className="w-4 h-4" />
                        Dashboard
                    </Link>
                    <Link to="/upload" className="flex items-center gap-2 hover:text-slate-950 transition-colors">
                        <UploadCloud className="w-4 h-4" />
                        Upload Content
                    </Link>
                    {user ? (
                        <div className="relative" ref={profileMenuRef}>
                            <button
                                onClick={() => setShowProfileMenu(prev => !prev)}
                                className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/85 pl-2 pr-3 py-1.5 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.45)] backdrop-blur-md hover:bg-white transition-colors"
                            >
                                {user.photoURL && !profileImageFailed ? (
                                    <img
                                        src={user.photoURL}
                                        alt={user.displayName || "Profile"}
                                        className="w-9 h-9 rounded-full object-cover border border-slate-200"
                                        onError={() => setProfileImageFailed(true)}
                                        referrerPolicy="no-referrer"
                                    />
                                ) : (
                                    <div className="w-9 h-9 rounded-full border border-slate-200 bg-slate-950 text-white flex items-center justify-center text-sm font-bold">
                                        {getUserInitial(user)}
                                    </div>
                                )}
                                <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${showProfileMenu ? "rotate-180" : ""}`} />
                            </button>

                            {showProfileMenu && (
                                <div className="absolute right-0 mt-3 w-52 rounded-2xl border border-slate-200 bg-white/95 shadow-xl backdrop-blur-xl p-2">
                                    <div className="px-3 py-2 border-b border-slate-100">
                                        <p className="text-sm font-semibold truncate">{user.displayName || "Signed in"}</p>
                                        <p className="text-xs text-slate-500 truncate">{user.email}</p>
                                    </div>
                                    <button
                                        onClick={handleLogout}
                                        className="w-full mt-2 flex items-center gap-2 px-3 py-2 rounded-xl text-left text-red-600 hover:bg-red-50 transition-colors"
                                    >
                                        <LogOut className="w-4 h-4" />
                                        Logout
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : onLogin ? (
                        <button
                            onClick={onLogin}
                            className="inline-flex items-center justify-center rounded-full bg-slate-950 text-white px-5 py-2.5 text-sm font-semibold shadow-sm hover:opacity-90 hover:-translate-y-0.5 transition-all duration-300"
                        >
                            Login
                        </button>
                    ) : null}
                </nav>
            </div>
        </header>
    );
}

function getUserInitial(user: User | null) {
    if (!user) return "U";
    const source = user.displayName || user.email || "User";
    return source.trim().charAt(0).toUpperCase() || "U";
}
