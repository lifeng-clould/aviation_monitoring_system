import { ConfigProvider, Layout } from "antd";
import zhCN from "antd/locale/zh_CN";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import AppErrorBoundary from "../common/AppErrorBoundary";
import AppHeader from "./AppHeader";
import AppSidebar from "./AppSidebar";
import DashboardPage from "../../pages/DashboardPage";
import DataHubPage from "../../pages/DataHubPage";
import RiskLabPage from "../../pages/RiskLabPage";
import RoleWorkspacePage from "../../pages/RoleWorkspacePage";
import TrajectoryPage from "../../pages/TrajectoryPage";

const { Content } = Layout;

interface ProtectedAppProps {
  collapsed: boolean;
  onToggle: () => void;
}

function SafePage({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return <AppErrorBoundary key={`${location.pathname}${location.search}`}>{children}</AppErrorBoundary>;
}

export default function ProtectedApp({ collapsed, onToggle }: ProtectedAppProps) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#0d5bd7",
          colorInfo: "#0d5bd7",
          colorBgBase: "#edf3fb",
          colorBgContainer: "#ffffff",
          colorText: "#163a70",
          colorTextSecondary: "#5c76a6",
          colorBorder: "#d4e0f3",
          borderRadius: 18,
          fontFamily: "Aptos, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
        }
      }}
    >
      <Layout style={{ minHeight: "100vh", background: "transparent" }}>
        <AppHeader collapsed={collapsed} onToggle={onToggle} />
        <Layout style={{ background: "transparent" }}>
          <AppSidebar collapsed={collapsed} />
          <Content className="platform-content-shell">
            <SafePage>
              <Routes>
                <Route path="/" element={<Navigate to="/workspace" replace />} />
                <Route path="/workspace" element={<RoleWorkspacePage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/trajectory" element={<TrajectoryPage />} />
                <Route path="/risk-lab" element={<RiskLabPage />} />
                <Route path="/data-hub" element={<DataHubPage />} />
                <Route path="*" element={<Navigate to="/workspace" replace />} />
              </Routes>
            </SafePage>
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
