import { Button, Select, Table, Tag, Typography } from "antd";
import { DownloadOutlined, ReloadOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AreaTrendChart, HorizontalBarChart } from "../components/charts/LightCharts";
import LoadingView from "../components/common/LoadingView";
import PageQuickNav from "../components/layout/PageQuickNav";
import { DEMO_USERS } from "../constants/demoUsers";
import { useAuthStore } from "../store/useAuthStore";
import { useSummaryStore } from "../store/useSummaryStore";

function roleBrief(role: string) {
  if (role === "机场运控") return { title: "运控关注", items: ["放行编排", "机位释放", "高风险升级"] };
  if (role === "地服公司") return { title: "地服关注", items: ["执行回传", "异常签收", "证据补录"] };
  if (role === "航空公司") return { title: "航司关注", items: ["航班影响", "责任复核", "授权申请"] };
  return { title: "监管关注", items: ["访问审批", "风险督办", "台账抽检"] };
}

export default function DashboardPage() {
  const { currentUser } = useAuthStore();
  const { summary, loading, error, load } = useSummaryStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [riskFilter, setRiskFilter] = useState<string>("全部");
  const roleSeats = useMemo(() => DEMO_USERS.map((item) => ({
    ...item,
    modules: item.role === "监管审计" ? ["风险督办", "授权审批", "台账抽检"] : item.role === "机场运控" ? ["放行编排", "全局监控", "升级联动"] : item.role === "地服公司" ? ["执行回传", "轨迹补证", "事件签收"] : ["责任复核", "影响评估", "授权申请"]
  })), []);

  useEffect(() => {
    if (!summary && !loading) {
      void load();
    }
  }, [summary, loading, load]);

  if (!currentUser || (loading && !summary)) {
    return <LoadingView />;
  }

  if (!summary) {
    return (
      <div className="page-shell dashboard-page">
        <section className="board-panel board-panel-hard">
          <Typography.Title level={4} style={{ marginTop: 0 }}>综合总览暂不可用</Typography.Title>
          <Typography.Paragraph>{error || "当前未能完成总览数据装载，请稍后刷新重试。"}</Typography.Paragraph>
          <Button type="primary" onClick={() => void load()}>重新加载</Button>
        </section>
      </div>
    );
  }

  const activeView = searchParams.get("view") || "command";
  const roleInfo = roleBrief(currentUser.role);
  const highRiskCount = summary.risk_distribution.find((item) => item.name === "高风险")?.value ?? 0;
  const mediumRiskCount = summary.risk_distribution.find((item) => item.name === "中风险")?.value ?? 0;
  const lowRiskCount = summary.risk_distribution.find((item) => item.name === "低风险")?.value ?? Math.max(summary.case_options.length - highRiskCount - mediumRiskCount, 0);
  const filteredCases = summary.case_options.filter((item) => riskFilter === "全部" || item.risk_level === riskFilter);
  const trendItems = summary.hourly_cases.slice(-8).map((item) => ({ label: item.hour, value: item.value }));
  const confidenceItems = summary.association_distribution.map((item, index) => ({
    label: item.name,
    value: item.value,
    tone: ["linear-gradient(90deg, #0d5bd7, #58a7ff)", "linear-gradient(90deg, #f5b955, #ffd88f)", "linear-gradient(90deg, #ef6b6b, #f59a52)"][index] || "linear-gradient(90deg, #0d5bd7, #58a7ff)",
    note: `${item.value} 起`
  }));
  const totalBlocks = summary.channel_stats.reduce((acc, item) => acc + item.blocks, 0);
  const topCases = filteredCases.slice(0, 8);

  const exportCases = () => {
    const blob = new Blob([JSON.stringify(filteredCases, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "监管案例列表.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-shell dashboard-page">
      <PageQuickNav
        title="总览导航"
        items={[
          { key: "command", label: "指挥总台", targetId: "dashboard-command-zone" },
          { key: "workbench", label: "主体协同", targetId: "dashboard-subject-zone" },
          { key: "cases", label: "案例工位", targetId: "dashboard-case-zone" }
        ]}
      />

      <section className="hero-card hero-card-plain">
        <div className="hero-surface hero-surface-dashboard hero-surface-dense">
          <div>
            <Typography.Text className="section-kicker">综合总览 / 当前席位</Typography.Text>
            <Typography.Title level={1} style={{ margin: "10px 0 10px", color: "#0f3976", fontSize: 36 }}>
              机坪牵引作业综合总览
            </Typography.Title>
            <Typography.Paragraph style={{ maxWidth: 760, margin: 0 }}>
              统一查看计划上链、执行留痕、风险联动、授权审批和监管闭环，确保多主体协同过程可查、可控、可追溯。
            </Typography.Paragraph>
            <div className="tag-ribbon" style={{ marginTop: 14 }}>
              <Tag color="blue" className="header-tag">{currentUser.org_name}</Tag>
              <Tag color="processing" className="header-tag">{currentUser.role}</Tag>
              <Tag color="gold" className="header-tag">高风险 {highRiskCount} 起</Tag>
              <Tag color="purple" className="header-tag">链上记录 {totalBlocks} 条</Tag>
            </div>
          </div>
          <div className="hero-stage-chip hero-stage-chip-stack">
            <span className="hero-stage-label">当前值班重点</span>
            <span className="hero-stage-value">{roleInfo.title}</span>
            <Typography.Text type="secondary">{roleInfo.items.join(" / ")}</Typography.Text>
          </div>
        </div>
      </section>

      <section className="workspace-toolbar workspace-toolbar-hard">
        <div className="workspace-toolbar-group">
          <Select
            value={riskFilter}
            onChange={setRiskFilter}
            style={{ width: 160 }}
            options={[
              { value: "全部", label: "全部风险" },
              { value: "高", label: "高风险" },
              { value: "中", label: "中风险" },
              { value: "低", label: "低风险" }
            ]}
          />
        </div>
        <div className="workspace-toolbar-group">
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新数据</Button>
          <Button icon={<DownloadOutlined />} onClick={exportCases}>导出案例</Button>
        </div>
      </section>

      <section className="metric-ribbon-board">
        {summary.kpis.map((item) => (
          <div className="metric-ribbon-item" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}<em>{item.suffix}</em></strong>
          </div>
        ))}
      </section>

      {activeView === "command" ? (
        <section id="dashboard-command-zone" className="dashboard-atlas dashboard-atlas-command">
          <div className="board-panel board-panel-hard">
            <div className="board-title-row">
              <Typography.Title level={4} style={{ margin: 0 }}>作业节奏与可信度结构</Typography.Title>
            </div>
            <div className="light-dashboard-chart-grid">
              <div className="chart-block-shell">
                <Typography.Text strong>班次案例节奏</Typography.Text>
                <AreaTrendChart points={trendItems} valueFormatter={(value) => `${value} 起`} />
              </div>
              <div className="chart-block-shell">
                <Typography.Text strong>关联可信度分布</Typography.Text>
                <HorizontalBarChart items={confidenceItems} maxValue={Math.max(...confidenceItems.map((item) => item.value), 1)} valueFormatter={(value) => `${value} 起`} />
              </div>
            </div>
          </div>
          <div className="dashboard-side-stack workbench-side-stack">
            <div className="board-panel board-panel-hard">
              <div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>风险分布</Typography.Title></div>
              <div className="operations-strip">
                <div className="operation-tile"><span>高风险</span><strong>{highRiskCount} 起</strong><Typography.Text type="secondary">需要优先联动处置</Typography.Text></div>
                <div className="operation-tile"><span>中风险</span><strong>{mediumRiskCount} 起</strong><Typography.Text type="secondary">需要复核关键环节</Typography.Text></div>
                <div className="operation-tile"><span>低风险</span><strong>{lowRiskCount} 起</strong><Typography.Text type="secondary">持续保留过程留痕</Typography.Text></div>
              </div>
            </div>
            <div className="board-panel board-panel-hard">
              <div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>区块链价值</Typography.Title></div>
              <div className="chain-lane-strip">
                {summary.blockchain_value.map((item) => (
                  <div className="chain-lane-item" key={item.name}>
                    <div className="chain-lane-head">
                      <Typography.Text strong>{item.name}</Typography.Text>
                      <Tag color="blue">{item.value}{item.unit || ""}</Tag>
                    </div>
                    <Typography.Text type="secondary">{item.description}</Typography.Text>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : activeView === "workbench" ? (
        <section id="dashboard-subject-zone" className="dashboard-workbench-grid">
          <div className="board-panel board-panel-hard board-panel-wide">
            <div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>主体协同席位</Typography.Title></div>
            <div className="subject-seat-grid">
              {roleSeats.map((item) => (
                <div key={item.role} className={`subject-seat-card ${item.role === currentUser.role ? "is-current" : ""}`}>
                  <span>{item.role}</span>
                  <strong>{item.org_name}</strong>
                  <Typography.Text type="secondary">{item.display_name}</Typography.Text>
                  <div className="subject-seat-modules">
                    {item.modules.map((module) => <Tag key={module}>{module}</Tag>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="board-panel board-panel-hard">
            <div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>通道负载</Typography.Title></div>
            <div className="queue-list">
              {summary.channel_stats.map((item) => (
                <div className="queue-item" key={item.channel}>
                  <div>
                    <Typography.Text strong>{item.channel}</Typography.Text>
                    <Typography.Text type="secondary">{item.description}</Typography.Text>
                  </div>
                  <div className="queue-meta queue-meta-stack">
                    <Tag color="blue">{item.blocks} 条</Tag>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <section id="dashboard-case-zone" className="dashboard-operating-grid">
          <div className="board-panel board-panel-hard board-panel-wide">
            <div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>重点案例列表</Typography.Title></div>
            <Table
              rowKey="case_id"
              pagination={false}
              columns={[
                { title: "航班", dataIndex: "flight_identity", key: "flight_identity" },
                { title: "牵引车", dataIndex: "vehicle_id", key: "vehicle_id", width: 120 },
                { title: "机位", dataIndex: "stand_id", key: "stand_id", width: 90 },
                { title: "风险等级", dataIndex: "risk_level", key: "risk_level", width: 100, render: (value: string) => <Tag color={value === "高" ? "red" : value === "中" ? "gold" : "blue"}>{value}</Tag> },
                { title: "可信度", dataIndex: "association_confidence", key: "association_confidence", width: 100 },
                { title: "证据评分", dataIndex: "evidence_score", key: "evidence_score", width: 100 },
                { title: "校验状态", dataIndex: "validation_label", key: "validation_label" },
                { title: "操作", key: "action", width: 120, render: (_, record: { case_id: string }) => <Button type="link" onClick={() => navigate(`/trajectory?case=${record.case_id}`)}>查看轨迹</Button> }
              ]}
              dataSource={topCases}
              scroll={{ x: 980 }}
            />
          </div>
        </section>
      )}
    </div>
  );
}