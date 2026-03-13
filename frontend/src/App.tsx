import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "./components/Layout";
import { LandingPage } from "./pages/LandingPage";
import { Dashboard } from "./pages/Dashboard";
import { UploadPage } from "./pages/UploadPage";
import { TestPage } from "./pages/TestPage";
import { ResultsPage } from "./pages/ResultsPage";
import { MindMapPage } from "./pages/MindMapPage";
import { auth } from "./firebase/config";
import { onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";

const queryClient = new QueryClient();

function App() {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setIsAuthReady(true);
    });

    return unsubscribe;
  }, []);

  if (!isAuthReady) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route element={user ? <Layout /> : <Navigate to="/" replace />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/test/:id" element={<TestPage />} />
            <Route path="/results/:attemptId" element={<ResultsPage />} />
            <Route path="/mindmap/:docId" element={<MindMapPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
