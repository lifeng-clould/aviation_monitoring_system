import { Alert, Button, InputNumber, Table, Tag, Typography, notification } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { checkContract, fetchAlerts, type AlertItem } from "../api/client";
import { HorizontalBarChart, SignalTimeline } from "../components/charts/LightCharts";
import LoadingView from "../components/common/LoadingView";
import PageQuickNav from "../components/layout/PageQuickNav";
import { useAuthStore } from "../store/useAuthStore";
import { useSummaryStore } from "../store/useSummaryStore";

interface ComplianceResult {
  compliant: boolean;
  violations?: { rule: string; violation: string; severity: string }[];
  notified_departments?: string[];
  response_sla_min?: number;
  chain_channel?: string;
  chain_written?: boolean;
  recommended_action?: string;
}

const presetList = [
  { key: "normal", name: "标准牵引", speed: 2.4, distance: 6.2, brake: 2, description: "保持正常速度和安全净距。" },
  { key: "overspeed", name: "超速拖行", speed: 6.8, distance: 6.0, brake: 2, description: "模拟速度超阈值场景。" },
  { key: "clearance", name: "净距不足", speed: 2.8, distance: 3.8, brake: 2, description: "模拟拖行过程中净距不足。" },
  { key: "brake", name: "制动缺失", speed: 2.7, distance: 5.8, brake: 1, description: "模拟制动测试未达标。" }
];

function departments(level?: string) {
  if (level === "critical") return ["监管审计", "机场运控", "机坪安全监察", "塔台协同"];
  if (level === "high") return ["机场运控", "地服保障", "车辆运行管理"];
  if (level === "medium") return ["机场运控", "地服保障"];
  return ["机场运控"];
}

function roleBrief(role: string) {
  if (role === "机场运控") return ["签收高风险告警", "联动塔台与地服", "决定是否冻结放行"];
  if (role === "地服公司") return ["接收异常派发", "现场复核拖行状态", "补录执行证据"];
  if (role === "航空公司") return ["确认航班影响", "追踪责任结果", "回收协同信息"];
  return ["审查处置时效", "核查链上写入", "推动案件闭环"];
}

export default function RiskLabPage() {
  const { currentUser } = useAuthStore();
  const { summary, loading, error, load } = useSummaryStore();
  const [searchParams] = useSearchParams();
  const [api, contextHolder] = notification.useNotification();
  const [liveAlerts, setLiveAlerts] = useState<AlertItem[]>([]);
  const [speed, setSpeed] = useState(2.4);
  const [distance, setDistance] = useState(6.2);
  const [brakeTests, setBrakeTests] = useState(2);
  const [result, setResult] = useState<ComplianceResult>();
  const [submitting, setSubmitting] = useState(false);
  const [activePreset, setActivePreset] = useState("normal");
  const seenKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!summary && !loading) {
      void load();
    }
  }, [summary, loading, load]);

  useEffect(() => {
    const preset = presetList.find((item) => item.key === activePreset);
    if (!preset) return;
    setSpeed(preset.speed);
    setDistance(preset.distance);
    setBrakeTests(preset.brake);
  }, [activePreset]);

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      const response = await fetchAlerts(10);
      if (!mounted) return;
      setLiveAlerts(response.items);
      response.items.forEach((item) => {
        const key = `${item.case_id}-${item.time}-${item.title}`;
        if (seenKeys.current.has(key)) return;
        seenKeys.current.add(key);
        if (item.severity === "high" || item.severity === "critical") {
          api.warning({
            message: item.title,
            description: `${item.detail} · 已通知 ${departments(item.severity).join(" / ")}`,
            placement: "topRight",
            duration: 4
          });
        }
      });
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, 12000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [api]);

  const runContract = async () => {
    setSubmitting(true);
    try {
      const response = await checkContract({ speed, distance_to_aircraft: distance, brake_test_count: brakeTests });
      setResult(response);
      if (response.compliant) {
        api.success({ message: "规则校验通过", description: response.recommended_action || "当前场景满足牵引规则。", placement: "topRight" });
      } else {
        api.error({ message: "规则触发联动", description: `${response.recommended_action || "已触发联动流程"} · 通知 ${(response.notified_departments || []).join(" / ")}`, placement: "topRight" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!currentUser || (loading && !summary)) {
    return <LoadingView />;
  }

  if (!summary) {
    return (
      <div className="page-shell risk-page">
        <section className="board-panel board-panel-hard">
          <Alert type="warning" showIcon message="风险指挥暂不可用" description={error || "当前未能完成风险数据装载，请稍后刷新。"} />
        </section>
      </div>
    );
  }

  const activeView = searchParams.get("view") || "live";
  const highRiskCount = summary.risk_distribution.find((item) => item.name === "高风险")?.value ?? 0;
  const caseRows = summary.case_options.map((item) => ({ ...item, riskScore: item.risk_level === "高" ? 90 : item.risk_level === "中" ? 62 : 30 }));
  const priorityRows = [...caseRows].sort((left, right) => right.riskScore - left.riskScore).slice(0, 10);
  const signalItems = liveAlerts.slice(0, 8).map((item) => ({
    label: item.time.slice(11, 16),
    value: item.severity === "critical" ? 96 : item.severity === "high" ? 78 : item.severity === "medium" ? 54 : 36,
    tone: item.severity === "critical" ? "linear-gradient(180deg, #ef6b6b, #f18f3b)" : item.severity === "high" ? "linear-gradient(180deg, #f18f3b, #f5b955)" : item.severity === "medium" ? "linear-gradient(180deg, #f5b955, #ffd88f)" : "linear-gradient(180deg, #2e8fff, #7dc5ff)",
    note: item.title
  }));
  const priorityBars = priorityRows.slice(0, 6).map((item) => ({
    label: item.flight_identity,
    value: item.riskScore,
    secondaryValue: item.association_confidence,
    tone: item.risk_level === "高" ? "linear-gradient(90deg, #ef6b6b, #f59a52)" : item.risk_level === "中" ? "linear-gradient(90deg, #f5b955, #ffd88f)" : "linear-gradient(90deg, #0d5bd7, #58a7ff)",
    note: "关联可信度"
  }));

  return (
    <div className="page-shell risk-page">
      {contextHolder}
      <PageQuickNav
        title="风险导航"
        items={[
          { key: "live", label: "联动总台", targetId: "risk-live-zone" },
          { key: "contract", label: "规则联动", targetId: "risk-contract-zone" },
          { key: "cases", label: "案例复核", targetId: "risk-case-zone" }
        ]}
      />

      <section className="hero-card hero-card-plain">
        <div className="hero-surface hero-surface-dashboard hero-surface-dense">
          <div>
            <Typography.Text className="section-kicker">风险指挥 / 当前席位</Typography.Text>
            <Typography.Title level={1} style={{ margin: "10px 0 10px", color: "#0f3976", fontSize: 34 }}>
              实时告警与联动处置总台
            </Typography.Title>
            <Typography.Paragraph style={{ maxWidth: 760, margin: 0 }}>
              围绕高风险拖行案例、规则巡检、责任部门通知与结论回写组织联动，保证异常发现后能够快速处置并留痕。
            </Typography.Paragraph>
            <div className="tag-ribbon" style={{ marginTop: 14 }}>
              <Tag color="processing" className="header-tag">{currentUser.role}</Tag>
              <Tag color="blue" className="header-tag">高风险 {highRiskCount} 起</Tag>
              <Tag color="gold" className="header-tag">实时告警 {liveAlerts.length} 条</Tag>
            </div>
          </div>
          <div className="hero-stage-chip hero-stage-chip-stack">
            <span className="hero-stage-label">席位重点</span>
            <span className="hero-stage-value">{currentUser.org_name}</span>
            <Typography.Text type="secondary">{roleBrief(currentUser.role).join(" / ")}</Typography.Text>
          </div>
        </div>
      </section>

      {activeView === "live" ? (
        <section id="risk-live-zone" className="dashboard-operating-grid governance-grid-two">
          <div className="board-panel board-panel-hard">
            <div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>实时告警流</Typography.Title></div>
            <div className="queue-list live-alert-list">
              {liveAlerts.map((item) => (
                <div className={`queue-item queue-item-alert ${item.severity}`} key={`${item.case_id}-${item.time}-${item.title}`}>
                  <div>
                    <Typography.Text strong>{item.title}</Typography.Text>
                    <Typography.Text type="secondary">{item.detail}</Typography.Text>
                  </div>
                  <div className="queue-meta queue-meta-stack">
                    <Tag color={item.severity === "critical" ? "red" : item.severity === "high" ? "orange" : item.severity === "medium" ? "gold" : "blue"}>{item.severity}</Tag>
                    <Typography.Text type="secondary">{departments(item.severity).join(" / ")}</Typography.Text>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="board-panel board-panel-hard">
            <div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>告警强度时间带</Typography.Title></div>
            <SignalTimeline items={signalItems} valueFormatter={(value) => `${value}`} />
          </div>
        </section>
      ) : activeView === "contract" ? (
        <section id="risk-contract-zone" className="dashboard-operating-grid governance-grid-two">
          <div className="board-panel board-panel-hard">
            <div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>规则联动仿真</Typography.Title></div>
            <div className="scenario-strip">
              {presetList.map((item) => (
                <button key={item.key} type="button" className={`scenario-chip ${activePreset === item.key ? "active" : ""}`} onClick={() => setActivePreset(item.key)}>
                  <strong>{item.name}</strong>
                  <span>{item.description}</span>
                </button>
              ))}
            </div>
            <div className="contract-simulator-grid control-deck">
              <div className="control-cell"><Typography.Text>牵引速度 (km/h)</Typography.Text><InputNumber min={0} max={10} step={0.1} value={speed} onChange={(value) => setSpeed(Number(value ?? 0))} style={{ width: "100%" }} /><strong>{speed.toFixed(1)}</strong></div>
              <div className="control-cell"><Typography.Text>安全净距 (m)</Typography.Text><InputNumber min={0} max={10} step={0.1} value={distance} onChange={(value) => setDistance(Number(value ?? 0))} style={{ width: "100%" }} /><strong>{distance.toFixed(1)}</strong></div>
              <div className="control-cell"><Typography.Text>制动测试次数</Typography.Text><InputNumber min={0} max={6} value={brakeTests} onChange={(value) => setBrakeTests(Number(value ?? 0))} style={{ width: "100%" }} /><strong>{brakeTests}</strong></div>
            </div>
            <Button type="primary" size="large" loading={submitting} onClick={runContract}>执行规则联动</Button>
          </div>
          <div className="board-panel board-panel-hard">
            <div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>联动结果</Typography.Title></div>
            {result ? (
              result.compliant ? <Alert type="success" showIcon message="当前场景通过规则校验" description={result.recommended_action || "继续保持当前作业状态。"} /> : <Alert type="error" showIcon message="已触发联动流程" description={`${result.recommended_action || "请立即处理"} · 通知 ${(result.notified_departments || []).join(" / ")}`} />
            ) : (
              <Alert type="info" showIcon message="尚未执行联动" description="选择一个场景后执行规则联动。" />
            )}
            <div className="policy-stack" style={{ marginTop: 14 }}>
              <div className="policy-item"><Typography.Text strong>通知部门</Typography.Text><Typography.Text type="secondary">{(result?.notified_departments || departments(result?.violations?.[0]?.severity)).join(" / ")}</Typography.Text></div>
              <div className="policy-item"><Typography.Text strong>响应时限</Typography.Text><Typography.Text type="secondary">{result?.response_sla_min ?? 2} 分钟内签收</Typography.Text></div>
              <div className="policy-item"><Typography.Text strong>链上写入</Typography.Text><Typography.Text type="secondary">{result?.chain_written ? "已写入风控通道" : "待执行后生成记录"}</Typography.Text></div>
            </div>
          </div>
        </section>
      ) : (
        <section id="risk-case-zone" className="dashboard-operating-grid governance-grid-two">
          <div className="board-panel board-panel-hard">
            <div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>复核优先级</Typography.Title></div>
            <HorizontalBarChart items={priorityBars} maxValue={100} valueFormatter={(value) => `${value} 分`} secondaryFormatter={(value) => `${value} 分`} />
          </div>
          <div className="board-panel board-panel-hard board-panel-wide">
            <div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>待复核案例</Typography.Title></div>
            <Table
              rowKey="case_id"
              pagination={false}
              columns={[
                { title: "航班", dataIndex: "flight_identity", key: "flight_identity" },
                { title: "机位", dataIndex: "stand_id", key: "stand_id", width: 90 },
                { title: "牵引车", dataIndex: "vehicle_id", key: "vehicle_id", width: 120 },
                { title: "风险等级", dataIndex: "risk_level", key: "risk_level", width: 100, render: (value: string) => <Tag color={value === "高" ? "red" : value === "中" ? "gold" : "blue"}>{value}</Tag> },
                { title: "可信度", dataIndex: "association_confidence", key: "association_confidence", width: 100 },
                { title: "证据评分", dataIndex: "evidence_score", key: "evidence_score", width: 100 },
                { title: "校验状态", dataIndex: "validation_label", key: "validation_label" }
              ]}
              dataSource={priorityRows}
              scroll={{ x: 920 }}
            />
          </div>
        </section>
      )}
    </div>
  );
}
