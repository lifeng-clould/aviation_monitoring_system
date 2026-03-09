import { Button, Layout, Select, Space, Tag, Typography } from "antd";
import { BorderOutlined, DeploymentUnitOutlined, LoginOutlined, MenuFoldOutlined, MenuUnfoldOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { DEMO_USERS } from "../../constants/demoUsers";
import { useAuthStore } from "../../store/useAuthStore";

const { Header } = Layout;

interface AppHeaderProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function AppHeader({ collapsed, onToggle }: AppHeaderProps) {
  const navigate = useNavigate();
  const { currentUser, isDemoMode, switchRole } = useAuthStore();

  const handleRoleChange = (role: string) => {
    switchRole(role);
    navigate("/workspace", { replace: true });
  };

  return (
    <Header className="platform-header platform-header-shell">
      <div className="header-shell-main">
        <Button type="text" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={onToggle} className="header-shell-trigger" />
        <div className="header-title-block">
          <Typography.Text className="header-caption">多主体协同监管系统</Typography.Text>
          <Typography.Title level={3} style={{ margin: 0, color: "#0f3976" }}>
            机坪牵引作业监管平台
          </Typography.Title>
          <Typography.Text type="secondary">区块链存证、轨迹追溯、跨主体授权、实时告警联动</Typography.Text>
        </div>
      </div>
      <Space wrap size={12} className="header-ops-block">
        <Tag icon={<DeploymentUnitOutlined />} color="processing" className="header-tag">轨迹追溯</Tag>
        <Tag icon={<BorderOutlined />} color="blue" className="header-tag">链上存证</Tag>
        <Tag icon={<SafetyCertificateOutlined />} color="gold" className="header-tag">实时联动</Tag>
        <Select
          value={currentUser?.role}
          onChange={handleRoleChange}
          className="header-role-select"
          popupMatchSelectWidth={false}
          options={DEMO_USERS.map((item) => ({ value: item.role, label: `${item.role} · ${item.org_name}` }))}
        />
        {currentUser ? <Tag color={isDemoMode ? "purple" : "default"} className="header-tag">{isDemoMode ? "演示模式" : currentUser.display_name}</Tag> : null}
        {currentUser ? <Tag color="default" className="header-tag">{currentUser.org_name}</Tag> : null}
        <Button icon={<LoginOutlined />} onClick={() => navigate("/auth")}>账号入口</Button>
      </Space>
    </Header>
  );
}
