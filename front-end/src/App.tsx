import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import LoadingView from "./components/common/LoadingView";
import ProtectedApp from "./components/layout/ProtectedApp";
import AuthPage from "./pages/AuthPage";
import { useAuthStore } from "./store/useAuthStore";

export default function App() {
  const [collapsed, setCollapsed] = useState(false);
  const { bootstrapped, hydrate } = useAuthStore();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!bootstrapped) {
    return <LoadingView />;
  }

  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/*" element={<ProtectedApp collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />} />
    </Routes>
  );
}
