import { Layout, Menu, Tag, Typography } from "antd";
import {
  AlertOutlined,
  AppstoreOutlined,
  AuditOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  FundProjectionScreenOutlined,
  LockOutlined,
  RadarChartOutlined,
  SafetyOutlined,
  TagsOutlined,
  UserSwitchOutlined
} from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/useAuthStore";

const { Sider } = Layout;

interface AppSidebarProps {
  collapsed: boolean;
}

export default function AppSidebar({ collapsed }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const selectedKey = `${location.pathname}${location.search || ""}`;

  const activeGroup = useMemo(() => {
    if (location.pathname.startsWith("/workspace")) return "workspace-group";
    if (location.pathname.startsWith("/trajectory")) return "trajectory-group";
    if (location.pathname.startsWith("/risk-lab")) return "risk-group";
    if (location.pathname.startsWith("/data-hub")) return "data-group";
    return "dashboard-group";
  }, [location.pathname]);

  const [openKeys, setOpenKeys] = useState<string[]>(collapsed ? [] : [activeGroup]);

  useEffect(() => {
    setOpenKeys(collapsed ? [] : [activeGroup]);
  }, [collapsed, activeGroup]);

  const menuItems = [
    {
      key: "workspace-group",
      icon: <UserSwitchOutlined />,
      label: <span onClick={() => navigate("/workspace")}>主体工作台</span>,
      children: [
        { key: "/workspace", label: "专属席位", icon: <FundProjectionScreenOutlined /> }
      ]
    },
    {
      key: "dashboard-group",
      icon: <AppstoreOutlined />,
      label: <span onClick={() => navigate("/dashboard")}>综合总览</span>,
      children: [
        { key: "/dashboard?view=command", label: "指挥总台", icon: <RadarChartOutlined /> },
        { key: "/dashboard?view=workbench", label: "主体协同", icon: <UserSwitchOutlined /> },
        { key: "/dashboard?view=cases", label: "案例工位", icon: <SafetyOutlined /> }
      ]
    },
    {
      key: "trajectory-group",
      icon: <DeploymentUnitOutlined />,
      label: <span onClick={() => navigate("/trajectory?view=workbench")}>轨迹追溯</span>,
      children: [
        { key: "/trajectory?view=workbench", label: "追溯工作台", icon: <RadarChartOutlined /> },
        { key: "/trajectory?view=evidence", label: "链上证据", icon: <AuditOutlined /> }
      ]
    },
    {
      key: "risk-group",
      icon: <AlertOutlined />,
      label: <span onClick={() => navigate("/risk-lab?view=live")}>风险指挥</span>,
      children: [
        { key: "/risk-lab?view=live", label: "联动总台", icon: <RadarChartOutlined /> },
        { key: "/risk-lab?view=contract", label: "合约联动", icon: <TagsOutlined /> },
        { key: "/risk-lab?view=cases", label: "案例复核", icon: <SafetyOutlined /> }
      ]
    },
    {
      key: "data-group",
      icon: <DatabaseOutlined />,
      label: <span onClick={() => navigate("/data-hub?view=asset")}>数据治理</span>,
      children: [
        { key: "/data-hub?view=asset", label: "资产登记", icon: <RadarChartOutlined /> },
        { key: "/data-hub?view=import", label: "导入校验", icon: <TagsOutlined /> },
        { key: "/data-hub?view=privacy", label: "授权审批", icon: <LockOutlined /> },
        { key: "/data-hub?view=ledger", label: "监管台账", icon: <AuditOutlined /> },
        { key: "/data-hub?view=preview", label: "数据预览", icon: <SafetyOutlined /> }
      ]
    }
  ];

  return (
    <Sider width={276} collapsedWidth={88} theme="light" className="platform-sider platform-sider-shell" collapsible trigger={null} collapsed={collapsed}>
      {!collapsed && currentUser ? (
        <div className="sidebar-account-panel">
          <Typography.Text className="section-kicker">当前席位</Typography.Text>
          <Typography.Title level={5} style={{ margin: "8px 0 4px", color: "#0f3976" }}>{currentUser.org_name}</Typography.Title>
          <div className="sidebar-account-meta">
            <Tag color="blue">{currentUser.role}</Tag>
            <Typography.Text type="secondary">{currentUser.display_name}</Typography.Text>
          </div>
        </div>
      ) : null}
      <Menu
        mode="inline"
        selectedKeys={[selectedKey, location.pathname]}
        openKeys={openKeys}
        inlineCollapsed={collapsed}
        items={menuItems}
        onClick={(info) => navigate(info.key)}
        onOpenChange={(nextOpenKeys) => setOpenKeys(collapsed ? [] : (nextOpenKeys as string[]))}
        style={{ borderInlineEnd: 0, background: "transparent" }}
      />
    </Sider>
  );
}