import { Spin, Typography } from "antd";

export default function LoadingView() {
  return (
    <div className="loading-stage">
      <div className="loading-panel">
        <Spin size="large" />
        <Typography.Title level={4} style={{ margin: 0, color: "#0f3976" }}>
          正在构建链上态势视图
        </Typography.Title>
        <Typography.Text type="secondary">
          加载案例编排、风险告警与审计证据…
        </Typography.Text>
      </div>
    </div>
  );
}
