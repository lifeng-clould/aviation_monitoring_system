import { Button, Empty, Tag, Typography } from "antd";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AreaTrendChart, HorizontalBarChart, SignalTimeline } from "../components/charts/LightCharts";
import LoadingView from "../components/common/LoadingView";
import { DEMO_USERS } from "../constants/demoUsers";
import { useAuthStore } from "../store/useAuthStore";
import { useSummaryStore } from "../store/useSummaryStore";

interface WorkspaceCard {
  title: string;
  detail: string;
  tag: string;
}

interface WorkspaceAction {
  title: string;
  detail: string;
  path: string;
  action: string;
}

interface WorkspaceStep {
  label: string;
  owner: string;
  detail: string;
  value: string;
  path: string;
}

function buildWorkspace(role: string, caseCount: number, highRiskCount: number, pendingAlerts: number, totalBlocks: number) {
  if (role === "机场运控") {
    return {
      kicker: "主体工作台 / 机场运控",
      title: "运控指挥总席",
      subtitle: "围绕放行编排、机位释放、风险升级和跨主体调度组织牵引作业。",
      primaryAction: { label: "进入综合总览", path: "/dashboard?view=command" },
      secondaryAction: { label: "查看轨迹联动", path: "/trajectory?view=map" },
      overview: [
        { title: "待决策案例", detail: `${caseCount} 起作业进入总览监控`, tag: "放行编排" },
        { title: "高风险升级", detail: `${highRiskCount} 起需优先联动`, tag: "风险升级" },
        { title: "链上记录", detail: `${totalBlocks} 条存证可追溯`, tag: "审计底账" }
      ],
      queue: [
        { title: "机位释放复核", detail: "核对推出窗口、拖行路径和跑道占用。", tag: "待复核" },
        { title: "异常升级下发", detail: "对净距不足、超速与证据缺口发出处置指令。", tag: "高优先级" },
        { title: "跨主体协调", detail: "推动运控、地服、航司在同一案例内同步处理。", tag: "协同中" }
      ],
      steps: [
        { label: "放行预审", owner: "运控席", detail: "校核机位和计划时间窗。", value: `${caseCount} 起`, path: "/dashboard?view=command" },
        { label: "拖行监控", owner: "轨迹席", detail: "回看牵引车与飞机时空关系。", value: `${pendingAlerts} 条告警`, path: "/trajectory?view=analysis" },
        { label: "风险升级", owner: "风险席", detail: "联动相关主体快速签收处置。", value: `${highRiskCount} 起`, path: "/risk-lab?view=live" },
        { label: "链上归档", owner: "审计席", detail: "将最终结论回写监管台账。", value: `${totalBlocks} 条`, path: "/data-hub?view=ledger" }
      ],
      actions: [
        { title: "打开总览工位", detail: "按风险等级、主体和航班状态查看全局态势。", path: "/dashboard?view=command", action: "进入总览" },
        { title: "打开风险总台", detail: "直接处理高风险案例与实时异常。", path: "/risk-lab?view=live", action: "进入联动" },
        { title: "打开授权审批", detail: "查看跨主体数据调阅申请与审批进度。", path: "/data-hub?view=privacy", action: "进入审批" }
      ]
    };
  }

  if (role === "地服公司") {
    return {
      kicker: "主体工作台 / 地服公司",
      title: "地服执行总席",
      subtitle: "聚焦拖行执行、过程回传、异常签收和证据补录，保障现场作业真实完整。",
      primaryAction: { label: "进入轨迹追溯", path: "/trajectory?view=map" },
      secondaryAction: { label: "进入风险指挥", path: "/risk-lab?view=dispatch" },
      overview: [
        { title: "执行案例", detail: `${caseCount} 起作业可回放`, tag: "轨迹追溯" },
        { title: "待签收告警", detail: `${pendingAlerts} 条现场异常待处理`, tag: "异常签收" },
        { title: "链上记录", detail: `${totalBlocks} 条执行留痕`, tag: "证据归档" }
      ],
      queue: [
        { title: "释放前定位校核", detail: "核实牵引车接近、对接与开始牵引时刻。", tag: "待校核" },
        { title: "风险事件签收", detail: "对净距不足、速度异常补充现场说明。", tag: "待签收" },
        { title: "执行材料归档", detail: "上传说明、图片与补录证据。", tag: "待归档" }
      ],
      steps: [
        { label: "任务接收", owner: "执行席", detail: "确认车辆、飞机、作业窗口。", value: `${caseCount} 起`, path: "/trajectory?view=map" },
        { label: "执行回传", owner: "车载终端", detail: "上传轨迹、速度与阶段变化。", value: `${pendingAlerts} 条告警`, path: "/trajectory?view=analysis" },
        { label: "异常签收", owner: "班组长", detail: "补充原因、责任和处置结果。", value: `${highRiskCount} 起`, path: "/risk-lab?view=dispatch" },
        { label: "证据回写", owner: "审计链", detail: "将结果同步归档。", value: `${totalBlocks} 条`, path: "/data-hub?view=ledger" }
      ],
      actions: [
        { title: "地图回放", detail: "自动回放牵引车与飞机轨迹。", path: "/trajectory?view=map", action: "打开地图" },
        { title: "事件定位", detail: "跳转关键阶段并核查释放和起飞衔接。", path: "/trajectory?view=event", action: "进入定位" },
        { title: "材料补录", detail: "将说明与证据回写到链上台账。", path: "/data-hub?view=import", action: "补录材料" }
      ]
    };
  }

  if (role === "航空公司") {
    return {
      kicker: "主体工作台 / 航空公司",
      title: "航司复核总席",
      subtitle: "围绕航班影响、责任边界、授权申请和复核结论开展协同确认。",
      primaryAction: { label: "进入案例复核", path: "/risk-lab?view=cases" },
      secondaryAction: { label: "进入数据治理", path: "/data-hub?view=privacy" },
      overview: [
        { title: "待复核案例", detail: `${caseCount} 起案例可联查`, tag: "航班影响" },
        { title: "高风险案例", detail: `${highRiskCount} 起需要重点关注`, tag: "责任复核" },
        { title: "链上记录", detail: `${totalBlocks} 条授权与结论`, tag: "审计轨迹" }
      ],
      queue: [
        { title: "责任边界复核", detail: "结合轨迹、告警与授权记录复核责任。", tag: "待复核" },
        { title: "关键字段申请", detail: "申请精确轨迹、敏感字段或图像材料。", tag: "待授权" },
        { title: "结论意见回写", detail: "将复核结果同步监管与协同主体。", tag: "待回写" }
      ],
      steps: [
        { label: "影响识别", owner: "航司席", detail: "识别受影响航班与时段。", value: `${caseCount} 起`, path: "/dashboard?view=cases" },
        { label: "调阅申请", owner: "授权席", detail: "申请关键数据访问。", value: `${pendingAlerts} 条提示`, path: "/data-hub?view=privacy" },
        { label: "案例复核", owner: "复核席", detail: "判断责任边界和影响程度。", value: `${highRiskCount} 起`, path: "/risk-lab?view=cases" },
        { label: "结论归档", owner: "审计链", detail: "保留授权和结论全过程。", value: `${totalBlocks} 条`, path: "/data-hub?view=ledger" }
      ],
      actions: [
        { title: "案例复核池", detail: "按风险、航班和状态筛选案例。", path: "/risk-lab?view=cases", action: "进入复核" },
        { title: "授权审批进度", detail: "查看每项申请的状态和范围。", path: "/data-hub?view=privacy", action: "查看审批" },
        { title: "责任台账", detail: "联查风险记录和闭环结论。", path: "/data-hub?view=ledger", action: "联查台账" }
      ]
    };
  }

  return {
    kicker: "主体工作台 / 监管审计",
    title: "监管审计总席",
    subtitle: "负责授权审批、风险督办、台账抽检和闭环归档，确保多主体协同过程责任清晰。",
    primaryAction: { label: "进入数据治理", path: "/data-hub?view=privacy" },
    secondaryAction: { label: "进入风险总台", path: "/risk-lab?view=live" },
    overview: [
      { title: "高风险督办", detail: `${highRiskCount} 起案例在重点跟踪`, tag: "风险督办" },
      { title: "实时告警", detail: `${pendingAlerts} 条告警待联动`, tag: "实时联动" },
      { title: "链上底账", detail: `${totalBlocks} 条记录可审计`, tag: "闭环归档" }
    ],
    queue: [
      { title: "原始字段审批", detail: "审核敏感字段与精确坐标的访问申请。", tag: "待审批" },
      { title: "高风险督办", detail: "跟踪签收、处置和回写时效。", tag: "督办中" },
      { title: "台账抽检", detail: "抽查案例证据与区块记录的一致性。", tag: "待抽检" }
    ],
    steps: [
      { label: "授权审批", owner: "监管席", detail: "审批跨主体数据访问。", value: `${caseCount} 起`, path: "/data-hub?view=privacy" },
      { label: "风险督办", owner: "风险席", detail: "联动相关部门快速响应。", value: `${pendingAlerts} 条`, path: "/risk-lab?view=live" },
      { label: "案例抽检", owner: "审计席", detail: "抽核证据、轨迹与处置结论。", value: `${highRiskCount} 起`, path: "/risk-lab?view=cases" },
      { label: "闭环归档", owner: "联盟链", detail: "归档审批、告警与责任结果。", value: `${totalBlocks} 条`, path: "/data-hub?view=ledger" }
    ],
    actions: [
      { title: "授权审批台", detail: "处理敏感数据访问与跨主体调阅。", path: "/data-hub?view=privacy", action: "进入审批" },
      { title: "风险联动总台", detail: "实时查看异常、通知部门和处理进展。", path: "/risk-lab?view=live", action: "查看联动" },
      { title: "案例台账", detail: "检查证据完整性与闭环状态。", path: "/data-hub?view=ledger", action: "打开台账" }
    ]
  };
}

export default function RoleWorkspacePage() {
  const { currentUser } = useAuthStore();
  const { summary, loading, error, load } = useSummaryStore();
  const navigate = useNavigate();

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
      <div className="page-shell role-workspace-page">
        <section className="board-panel board-panel-hard">
          <Typography.Title level={4} style={{ marginTop: 0 }}>主体工作台暂不可用</Typography.Title>
          <Typography.Paragraph>{error || "概览数据尚未就绪，请刷新后重试。"}</Typography.Paragraph>
          <Button type="primary" onClick={() => void load()}>重新加载</Button>
        </section>
      </div>
    );
  }

  const highRiskCount = summary.risk_distribution.find((item) => item.name === "高风险")?.value ?? 0;
  const totalBlocks = summary.channel_stats.reduce((acc, item) => acc + item.blocks, 0);
  const pendingAlerts = summary.alerts.length;
  const workspace = buildWorkspace(currentUser.role, summary.case_options.length, highRiskCount, pendingAlerts, totalBlocks);
  const trendItems = summary.hourly_cases.slice(-8).map((item) => ({ label: item.hour, value: item.value }));
  const confidenceItems = summary.association_distribution.map((item, index) => ({
    label: item.name,
    value: item.value,
    tone: ["linear-gradient(90deg, #0d5bd7, #58a7ff)", "linear-gradient(90deg, #f5b955, #ffd88f)", "linear-gradient(90deg, #ef6b6b, #f59a52)"][index] || "linear-gradient(90deg, #0d5bd7, #58a7ff)",
    note: `${item.value} 起`
  }));
  const signalItems = summary.alerts.slice(0, 6).map((item) => ({
    label: item.time.slice(11, 16),
    value: item.severity === "critical" ? 96 : item.severity === "high" ? 78 : item.severity === "medium" ? 54 : 32,
    tone: item.severity === "critical" ? "linear-gradient(180deg, #ef6b6b, #f18f3b)" : item.severity === "high" ? "linear-gradient(180deg, #f18f3b, #f5b955)" : item.severity === "medium" ? "linear-gradient(180deg, #f5b955, #ffd88f)" : "linear-gradient(180deg, #2e8fff, #7dc5ff)",
    note: item.title
  }));
  const partnerItems = DEMO_USERS.filter((item) => item.role !== currentUser.role);

  return (
    <div className="page-shell role-workspace-page">
      <section className="hero-card hero-card-plain">
        <div className="hero-surface hero-surface-dashboard hero-surface-dense">
          <div>
            <Typography.Text className="section-kicker">{workspace.kicker}</Typography.Text>
            <Typography.Title level={1} style={{ margin: "10px 0 10px", color: "#0f3976", fontSize: 36 }}>
              {workspace.title}
            </Typography.Title>
            <Typography.Paragraph style={{ maxWidth: 760, margin: 0 }}>{workspace.subtitle}</Typography.Paragraph>
            <div className="tag-ribbon" style={{ marginTop: 14 }}>
              <Tag color="blue" className="header-tag">{currentUser.org_name}</Tag>
              <Tag color="processing" className="header-tag">{currentUser.role}</Tag>
              <Tag color="gold" className="header-tag">高风险 {highRiskCount} 起</Tag>
              <Tag color="purple" className="header-tag">链上记录 {totalBlocks} 条</Tag>
            </div>
          </div>
          <div className="workspace-hero-actions">
            <Button type="primary" size="large" onClick={() => navigate(workspace.primaryAction.path)}>{workspace.primaryAction.label}</Button>
            <Button size="large" onClick={() => navigate(workspace.secondaryAction.path)}>{workspace.secondaryAction.label}</Button>
          </div>
        </div>
      </section>

      <section className="workspace-process-grid">
        <div className="board-panel board-panel-hard">
          <div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>角色操作链</Typography.Title></div>
          <div className="workflow-step-strip">
            {workspace.steps.map((item, index) => (
              <button key={item.label} type="button" className="workflow-step-card" onClick={() => navigate(item.path)}>
                <span className="workflow-step-index">0{index + 1}</span>
                <div className="workflow-step-main">
                  <strong>{item.label}</strong>
                  <Typography.Text>{item.detail}</Typography.Text>
                </div>
                <div className="workflow-step-meta">
                  <Tag color="blue">{item.owner}</Tag>
                  <span>{item.value}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="workspace-command-grid">
        <div className="board-panel board-panel-hard">
          <div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>席位总览</Typography.Title></div>
          <div className="workspace-decision-grid">
            {workspace.overview.map((item) => (
              <div className="workspace-decision-card" key={item.title}>
                <span>{item.title}</span>
                <strong>{item.tag}</strong>
                <Typography.Text type="secondary">{item.detail}</Typography.Text>
              </div>
            ))}
          </div>
        </div>
        <div className="board-panel board-panel-hard">
          <div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>当前待办</Typography.Title></div>
          <div className="workspace-focus-list">
            {workspace.queue.map((item) => (
              <div className="workspace-focus-item" key={item.title}>
                <div>
                  <Typography.Text strong>{item.title}</Typography.Text>
                  <Typography.Text type="secondary">{item.detail}</Typography.Text>
                </div>
                <strong>{item.tag}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="workspace-ops-grid">
        <div className="board-panel board-panel-hard">
          <div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>快捷入口</Typography.Title></div>
          <div className="workspace-tool-grid">
            {workspace.actions.map((item) => (
              <div className="workspace-tool-card" key={item.title}>
                <div className="workspace-tool-copy">
                  <strong>{item.title}</strong>
                  <Typography.Paragraph>{item.detail}</Typography.Paragraph>
                </div>
                <Button onClick={() => navigate(item.path)}>{item.action}</Button>
              </div>
            ))}
          </div>
        </div>
        <div className="board-panel board-panel-hard">
          <div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>协同主体</Typography.Title></div>
          {partnerItems.length ? (
            <div className="workspace-partner-grid">
              {partnerItems.map((item) => (
                <div className="workspace-partner-card" key={item.role}>
                  <strong>{item.role}</strong>
                  <Typography.Paragraph>{item.org_name}</Typography.Paragraph>
                  <div className="workspace-tool-chip-row">
                    {item.permissions.slice(0, 3).map((permission) => <span key={permission} className="workspace-tool-chip is-subtle">{permission}</span>)}
                  </div>
                </div>
              ))}
            </div>
          ) : <Empty description="暂无协同主体信息" />}
        </div>
      </section>

      <section className="workspace-analytics-grid">
        <div className="board-panel board-panel-hard">
          <div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>班次作业节奏</Typography.Title></div>
          <AreaTrendChart points={trendItems} valueFormatter={(value) => `${value} 起`} />
        </div>
        <div className="board-panel board-panel-hard">
          <div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>关联可信度结构</Typography.Title></div>
          <HorizontalBarChart items={confidenceItems} maxValue={Math.max(...confidenceItems.map((item) => item.value), 1)} valueFormatter={(value) => `${value} 起`} />
        </div>
        <div className="board-panel board-panel-hard">
          <div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>实时告警强度</Typography.Title></div>
          <SignalTimeline items={signalItems} valueFormatter={(value) => `${value}`} />
        </div>
      </section>
    </div>
  );
}
