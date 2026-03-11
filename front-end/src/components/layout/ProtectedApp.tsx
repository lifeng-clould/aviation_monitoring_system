import { useEffect, useRef, useState } from "react";
import { Button, ConfigProvider, Layout } from "antd";
import { VerticalAlignTopOutlined } from "@ant-design/icons";
import zhCN from "antd/locale/zh_CN";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import AppErrorBoundary from "../common/AppErrorBoundary";
import AppHeader from "./AppHeader";
import AppSidebar from "./AppSidebar";
import DashboardPage from "../../pages/DashboardPage";
import DataHubPage from "../../pages/DataHubPage";
import RiskLabPage from "../../pages/RiskLabPage";
import RoleWorkspacePage from "../../pages/RoleWorkspacePage";
import ShowcasePage from "../../pages/ShowcasePage";
import TrajectoryPage from "../../pages/TrajectoryPage";

const { Content } = Layout;
const HEADER_RESTORE_POSITION_KEY = "apron-platform-header-restore-position";

interface ProtectedAppProps {
  collapsed: boolean;
  headerVisible: boolean;
  onToggle: () => void;
  onToggleHeader: () => void;
}

interface FloatPosition {
  x: number;
  y: number;
}

function SafePage({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return <AppErrorBoundary key={`${location.pathname}${location.search}`}>{children}</AppErrorBoundary>;
}

function getDefaultRestorePosition(): FloatPosition {
  if (typeof window === "undefined") {
    return { x: 24, y: 180 };
  }
  return { x: Math.max(window.innerWidth - 168, 24), y: Math.max(window.innerHeight * 0.44, 120) };
}

export default function ProtectedApp({ collapsed, headerVisible, onToggle, onToggleHeader }: ProtectedAppProps) {
  const [restoreButtonPosition, setRestoreButtonPosition] = useState<FloatPosition>(() => {
    if (typeof window === "undefined") return { x: 24, y: 180 };
    const stored = window.localStorage.getItem(HEADER_RESTORE_POSITION_KEY);
    if (!stored) return getDefaultRestorePosition();
    try {
      const parsed = JSON.parse(stored) as FloatPosition;
      if (typeof parsed.x === "number" && typeof parsed.y === "number") {
        return parsed;
      }
    } catch {
      return getDefaultRestorePosition();
    }
    return getDefaultRestorePosition();
  });
  const dragStartRef = useRef<{ pointerX: number; pointerY: number; originX: number; originY: number } | null>(null);
  const dragMovedRef = useRef(false);
  const [draggingRestoreButton, setDraggingRestoreButton] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HEADER_RESTORE_POSITION_KEY, JSON.stringify(restoreButtonPosition));
  }, [restoreButtonPosition]);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      if (!dragStartRef.current) return;
      dragMovedRef.current = true;
      setDraggingRestoreButton(true);
      const deltaX = event.clientX - dragStartRef.current.pointerX;
      const deltaY = event.clientY - dragStartRef.current.pointerY;
      const nextX = Math.min(Math.max(dragStartRef.current.originX + deltaX, 12), window.innerWidth - 170);
      const nextY = Math.min(Math.max(dragStartRef.current.originY + deltaY, 12), window.innerHeight - 60);
      setRestoreButtonPosition({ x: nextX, y: nextY });
    };

    const handleUp = () => {
      dragStartRef.current = null;
      window.setTimeout(() => {
        dragMovedRef.current = false;
      }, 0);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, []);

  const handleRestoreMouseDown = (event: React.MouseEvent<HTMLButtonElement>) => {
    dragStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: restoreButtonPosition.x,
      originY: restoreButtonPosition.y
    };
  };

  const handleRestoreClick = () => {
    if (dragMovedRef.current) return;
    onToggleHeader();
  };

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
      <Layout style={{ minHeight: "100vh", background: "transparent" }} className={headerVisible ? "platform-shell" : "platform-shell header-hidden"}>
        {headerVisible ? <AppHeader collapsed={collapsed} onToggle={onToggle} onToggleHeader={onToggleHeader} /> : null}
        <Layout style={{ background: "transparent" }}>
          <AppSidebar collapsed={collapsed} onToggle={onToggle} />
          <Content className="platform-content-shell">
            {!headerVisible ? (
              <Button
                type="default"
                icon={<VerticalAlignTopOutlined />}
                onMouseDown={handleRestoreMouseDown}
                onClick={handleRestoreClick}
                className={`header-restore-button ${draggingRestoreButton ? "is-dragging" : ""}`}
                style={{ left: restoreButtonPosition.x, top: restoreButtonPosition.y }}
                title="显示顶栏"
                aria-label="显示顶栏"
              />
            ) : null}
            <SafePage>
              <Routes>
                <Route path="/" element={<Navigate to="/workspace" replace />} />
                <Route path="/workspace" element={<RoleWorkspacePage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/trajectory" element={<TrajectoryPage />} />
                <Route path="/risk-lab" element={<RiskLabPage />} />
                <Route path="/data-hub" element={<DataHubPage />} />
                <Route path="/showcase" element={<ShowcasePage />} />
                <Route path="*" element={<Navigate to="/workspace" replace />} />
              </Routes>
            </SafePage>
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}



