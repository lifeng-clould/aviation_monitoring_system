import { Alert, Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  createAccessRequest,
  createLedger,
  deleteAsset,
  deleteLedger,
  decideAccessRequest,
  fetchDataset,
  fetchGovernance,
  importAsset,
  updateAsset,
  updateLedger,
  type AccessRequestItem,
  type AssetItem,
  type GovernanceResponse,
  type LedgerItem
} from "../api/client";
import LoadingView from "../components/common/LoadingView";
import PageQuickNav from "../components/layout/PageQuickNav";
import { HorizontalBarChart } from "../components/charts/LightCharts";
import { useAuthStore } from "../store/useAuthStore";

interface DataRow { key: string; [key: string]: unknown; }
interface AssetFormValues { dataset_key: string; source_name: string; owner_org: string; rows_added: number; privacy_level: string; share_scope: string; description?: string; }
interface LedgerFormValues { case_id: string; flight_identity: string; subject_type: string; owner_org: string; privacy_level: string; status: string; remark?: string; }

const VIEW_ITEMS = [
  { key: "asset", label: "资产登记", targetId: "data-asset-zone" },
  { key: "import", label: "导入校验", targetId: "data-import-zone" },
  { key: "privacy", label: "授权审批", targetId: "data-privacy-zone" },
  { key: "ledger", label: "监管台账", targetId: "data-ledger-zone" },
  { key: "preview", label: "数据预览", targetId: "data-preview-zone" }
];

const CN = {
  pending: "待审批",
  done: "已完成",
  internal: "内部",
  restricted: "受限",
  raw: "原始视图",
  masked: "脱敏视图"
};

function roleBrief(role: string) {
  if (role === "机场运控") return ["原始字段申请", "任务核查", "跨主体同步"];
  if (role === "地服公司") return ["回传上传", "现场补录", "校验跟进"];
  if (role === "航空公司") return ["脱敏查看", "责任复核", "授权申请"];
  return ["敏感访问审批", "完整度抽检", "台账归档"];
}

export default function DataHubPage() {
  const { currentUser } = useAuthStore();
  const [searchParams] = useSearchParams();
  const activeView = searchParams.get("view") || "asset";
  const [governance, setGovernance] = useState<GovernanceResponse>();
  const [rows, setRows] = useState<DataRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [errorText, setErrorText] = useState<string>();
  const [dataset, setDataset] = useState("clean_main");
  const [keyword, setKeyword] = useState("");
  const [viewMode, setViewMode] = useState("masked");
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false);
  const [assetEditing, setAssetEditing] = useState<AssetItem>();
  const [ledgerEditing, setLedgerEditing] = useState<LedgerItem>();
  const [submitting, setSubmitting] = useState(false);
  const [assetForm] = Form.useForm<AssetFormValues>();
  const [ledgerForm] = Form.useForm<LedgerFormValues>();
  const [requestForm] = Form.useForm();

  const refreshGovernance = async () => {
    setLoading(true);
    try {
      setGovernance(await fetchGovernance());
      setErrorText(undefined);
    } catch (error) {
      setErrorText((error as Error).message || "数据治理加载失败");
    } finally {
      setLoading(false);
    }
  };

  const loadPreview = async (targetDataset: string, targetKeyword?: string, mode = viewMode) => {
    if (!currentUser) return;
    setTableLoading(true);
    try {
      const response = await fetchDataset(targetDataset, targetKeyword, currentUser.role, mode);
      setRows(response.items.map((item, index) => ({ key: `${targetDataset}-${index}`, ...item })));
      if (mode === "raw" && !response.authorized) {
        message.info("当前账号未获得原始字段授权，已自动回退为脱敏视图。");
      }
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => { void refreshGovernance(); }, []);
  useEffect(() => {
    if (!currentUser) return;
    requestForm.setFieldsValue({
      role: currentUser.role,
      requester_org: currentUser.org_name,
      scope: currentUser.role === "监管审计" || currentUser.role === "机场运控" ? "原始字段" : "脱敏摘要"
    });
  }, [currentUser, requestForm]);
  useEffect(() => { if (activeView === "preview") void loadPreview(dataset, keyword || undefined, viewMode); }, [activeView, dataset, viewMode, currentUser]);
  useEffect(() => {
    if (!governance?.data_assets.length) return;
    if (!governance.data_assets.some((item) => item.dataset_key === dataset)) setDataset(governance.data_assets[0].dataset_key);
  }, [governance, dataset]);

  const previewColumns = useMemo(() => !rows.length ? [] : Object.keys(rows[0]).slice(0, 10).map((key) => ({ title: key, dataIndex: key, key, ellipsis: true })), [rows]);

  if (!currentUser || loading) return <LoadingView />;
  if (!governance) {
    return <div className="page-shell data-page datahub-page"><section className="board-panel board-panel-hard"><Alert type="warning" showIcon message="数据治理暂不可用" description={errorText || "当前未能完成治理数据装载，请稍后刷新。"} /></section></div>;
  }

  const pendingRequests = governance.privacy.requests.filter((item) => item.status === CN.pending).length;
  const pendingImports = governance.import_jobs.filter((item) => item.status !== CN.done).length;
  const selectedAsset = governance.data_assets.find((item) => item.dataset_key === dataset) ?? governance.data_assets[0];
  const selectedQuality = governance.dataset_quality.find((item) => item.dataset === dataset) ?? governance.dataset_quality[0];
  const qualityItems = governance.dataset_quality.map((item) => ({
    label: item.dataset,
    value: item.completeness,
    tone: item.completeness >= 85 ? "linear-gradient(90deg, #0d5bd7, #58a7ff)" : item.completeness >= 65 ? "linear-gradient(90deg, #f5b955, #ffd88f)" : "linear-gradient(90deg, #ef6b6b, #f59a52)",
    note: `${item.records} 条记录`
  }));

  const meta = {
    asset: { kicker: "数据治理 / 资产登记", title: "数据资产登记与同步管理", desc: "只显示资产目录、共享策略和维护操作。", tags: [currentUser.role, currentUser.org_name, `资产 ${governance.data_assets.length} 份`] },
    import: { kicker: "数据治理 / 导入校验", title: "导入任务与质量校验", desc: "只保留真实数据导入及质量校验工作面。", tags: [currentUser.role, currentUser.org_name, `待校验 ${pendingImports} 项`] },
    privacy: { kicker: "数据治理 / 授权审批", title: "跨主体访问授权审批", desc: "只显示申请列表与授权发起面板。", tags: [currentUser.role, currentUser.org_name, `待审批 ${pendingRequests} 项`] },
    ledger: { kicker: "数据治理 / 监管台账", title: "链上监管台账与归档", desc: "只显示台账列表、编辑与归档操作。", tags: [currentUser.role, currentUser.org_name, `台账 ${governance.ledger_records.length} 条`] },
    preview: { kicker: "数据治理 / 数据预览", title: "处理后真实数据预览", desc: "只读取后端已处理的真实数据表，不混入其他功能面板。", tags: [currentUser.role, selectedAsset?.dataset_name || dataset, `${selectedQuality?.records || 0} 条记录`] }
  }[activeView as keyof typeof meta] || { kicker: "", title: "", desc: "", tags: [] };

  const openCreateAsset = () => { setAssetEditing(undefined); assetForm.resetFields(); assetForm.setFieldsValue({ dataset_key: dataset, rows_added: 1000, owner_org: currentUser.org_name, privacy_level: CN.internal, share_scope: "协同节点可见" }); setAssetModalOpen(true); };
  const openEditAsset = (item: AssetItem) => { setAssetEditing(item); assetForm.setFieldsValue({ dataset_key: item.dataset_key, source_name: item.source_name, owner_org: item.owner_org, rows_added: item.rows, privacy_level: item.privacy_level, share_scope: item.share_scope, description: item.description }); setAssetModalOpen(true); };
  const submitAsset = async () => { const values = await assetForm.validateFields(); setSubmitting(true); try { if (assetEditing) { await updateAsset(assetEditing.asset_id, { owner_org: values.owner_org, privacy_level: values.privacy_level, share_scope: values.share_scope, description: values.description, status: "已接入" }); message.success("资产已更新"); } else { await importAsset(values); message.success("导入任务已登记"); } setAssetModalOpen(false); await refreshGovernance(); } finally { setSubmitting(false); } };
  const removeAsset = async (assetId: string) => { await deleteAsset(assetId); message.success("资产已删除"); await refreshGovernance(); };
  const openCreateLedger = () => { setLedgerEditing(undefined); ledgerForm.resetFields(); ledgerForm.setFieldsValue({ subject_type: "牵引监管案例", owner_org: currentUser.org_name, privacy_level: CN.restricted, status: "链上复核中" }); setLedgerModalOpen(true); };
  const openEditLedger = (item: LedgerItem) => { setLedgerEditing(item); ledgerForm.setFieldsValue({ ...item }); setLedgerModalOpen(true); };
  const submitLedger = async () => { const values = await ledgerForm.validateFields(); setSubmitting(true); try { if (ledgerEditing) { await updateLedger(ledgerEditing.ledger_id, values); message.success("台账已更新"); } else { await createLedger(values); message.success("台账已创建"); } setLedgerModalOpen(false); await refreshGovernance(); } finally { setSubmitting(false); } };
  const removeLedger = async (ledgerId: string) => { await deleteLedger(ledgerId); message.success("台账已删除"); await refreshGovernance(); };
  const submitAccessRequest = async () => { const values = await requestForm.validateFields(); setSubmitting(true); try { await createAccessRequest(values); message.success("访问申请已提交"); requestForm.setFieldValue("purpose", undefined); await refreshGovernance(); } finally { setSubmitting(false); } };
  const decideRequest = async (item: AccessRequestItem, decision: "approve" | "reject") => { await decideAccessRequest(item.request_id, decision, currentUser.org_name, decision === "approve" ? "按最小必要原则放行" : "当前不满足共享要求"); message.success(decision === "approve" ? "已批准访问请求" : "已驳回访问请求"); await refreshGovernance(); };

  return (
    <div className="page-shell data-page datahub-page">
      <PageQuickNav title="数据治理导航" items={VIEW_ITEMS} />
      <section className="hero-card hero-card-plain"><div className="hero-surface hero-surface-dashboard hero-surface-dense"><div><Typography.Text className="section-kicker">{meta.kicker}</Typography.Text><Typography.Title level={1} style={{ margin: "10px 0 10px", color: "#0f3976", fontSize: 34 }}>{meta.title}</Typography.Title><Typography.Paragraph style={{ maxWidth: 760, margin: 0 }}>{meta.desc}</Typography.Paragraph><div className="tag-ribbon" style={{ marginTop: 14 }}>{meta.tags.map((tag) => <Tag key={tag} color="blue" className="header-tag">{tag}</Tag>)}</div></div><div className="hero-stage-chip hero-stage-chip-stack"><span className="hero-stage-label">席位重点</span><span className="hero-stage-value">{currentUser.display_name}</span><Typography.Text type="secondary">{roleBrief(currentUser.role).join(" / ")}</Typography.Text></div></div></section>

      {activeView === "asset" && <section id="data-asset-zone" className="dashboard-operating-grid governance-grid-two"><div className="board-panel board-panel-hard board-panel-wide"><div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>数据资产清单</Typography.Title></div><Table rowKey="asset_id" pagination={false} scroll={{ x: 1080 }} dataSource={governance.data_assets} columns={[{ title: "数据集", dataIndex: "dataset_name", key: "dataset_name" }, { title: "来源", dataIndex: "source_name", key: "source_name" }, { title: "所属单位", dataIndex: "owner_org", key: "owner_org" }, { title: "隐私级别", dataIndex: "privacy_level", key: "privacy_level" }, { title: "共享范围", dataIndex: "share_scope", key: "share_scope" }, { title: "状态", dataIndex: "status", key: "status" }, { title: "操作", key: "action", render: (_, record: AssetItem) => <Space><Button type="link" onClick={() => openEditAsset(record)}>编辑</Button><Popconfirm title="确认删除该资产吗？" onConfirm={() => void removeAsset(record.asset_id)}><Button type="link" danger>删除</Button></Popconfirm></Space> }]} /></div><div className="board-panel board-panel-hard governance-side-panel"><div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>资产操作台</Typography.Title></div><div className="policy-stack"><div className="policy-item"><Typography.Text strong>登记新资产</Typography.Text><Typography.Text type="secondary">将处理后的轨迹、任务或附件注册到治理目录。</Typography.Text><Button type="primary" onClick={openCreateAsset}>新建资产</Button></div><div className="policy-item"><Typography.Text strong>同步提醒</Typography.Text><Typography.Text type="secondary">当前有 {pendingImports} 项导入任务处于处理中。</Typography.Text></div></div></div></section>}
      {activeView === "import" && <section id="data-import-zone" className="dashboard-operating-grid governance-grid-two"><div className="board-panel board-panel-hard board-panel-wide"><div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>导入任务列表</Typography.Title></div><Table rowKey="job_id" pagination={false} scroll={{ x: 960 }} dataSource={governance.import_jobs} columns={[{ title: "数据集", dataIndex: "dataset_key", key: "dataset_key" }, { title: "来源", dataIndex: "source_name", key: "source_name" }, { title: "新增记录", dataIndex: "rows_added", key: "rows_added" }, { title: "状态", dataIndex: "status", key: "status" }, { title: "操作人", dataIndex: "operator", key: "operator" }, { title: "创建时间", dataIndex: "created_at", key: "created_at" }]} /></div><div className="board-panel board-panel-hard governance-side-panel"><div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>质量校验概览</Typography.Title></div><HorizontalBarChart items={qualityItems} maxValue={100} valueFormatter={(value) => `${value}%`} /></div></section>}
      {activeView === "privacy" && <section id="data-privacy-zone" className="dashboard-operating-grid governance-grid-two"><div className="board-panel board-panel-hard board-panel-wide"><div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>访问申请列表</Typography.Title></div><Table rowKey="request_id" pagination={false} scroll={{ x: 1080 }} dataSource={governance.privacy.requests} columns={[{ title: "数据集", dataIndex: "dataset_key", key: "dataset_key" }, { title: "申请主体", dataIndex: "requester_org", key: "requester_org" }, { title: "申请用途", dataIndex: "purpose", key: "purpose" }, { title: "范围", dataIndex: "scope", key: "scope" }, { title: "状态", dataIndex: "status", key: "status", render: (value: string) => <Tag color={value === "已批准" ? "blue" : value === "已驳回" ? "red" : "gold"}>{value}</Tag> }, { title: "操作", key: "action", render: (_, record: AccessRequestItem) => record.status === CN.pending ? <Space><Button type="link" onClick={() => void decideRequest(record, "approve")}>批准</Button><Button type="link" danger onClick={() => void decideRequest(record, "reject")}>驳回</Button></Space> : <Typography.Text type="secondary">已处理</Typography.Text> }]} /></div><div className="board-panel board-panel-hard governance-side-panel"><div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>发起访问申请</Typography.Title></div><Form form={requestForm} layout="vertical"><Form.Item name="dataset_key" label="数据集" rules={[{ required: true, message: "请选择数据集" }]}><Select options={governance.data_assets.map((item) => ({ value: item.dataset_key, label: item.dataset_name }))} /></Form.Item><Form.Item name="purpose" label="申请用途" rules={[{ required: true, message: "请输入用途" }]}><Input.TextArea rows={4} placeholder="例如：责任复核、放行决策、异常排查" /></Form.Item><Form.Item name="role" hidden><Input /></Form.Item><Form.Item name="requester_org" hidden><Input /></Form.Item><Form.Item name="scope" hidden><Input /></Form.Item><Button type="primary" onClick={() => void submitAccessRequest()} loading={submitting}>提交申请</Button></Form></div></section>}
      {activeView === "ledger" && <section id="data-ledger-zone" className="dashboard-operating-grid governance-grid-two"><div className="board-panel board-panel-hard board-panel-wide"><div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>监管台账</Typography.Title></div><Table rowKey="ledger_id" pagination={false} scroll={{ x: 1080 }} dataSource={governance.ledger_records} columns={[{ title: "案例", dataIndex: "case_id", key: "case_id" }, { title: "航班", dataIndex: "flight_identity", key: "flight_identity" }, { title: "主体类型", dataIndex: "subject_type", key: "subject_type" }, { title: "所属单位", dataIndex: "owner_org", key: "owner_org" }, { title: "状态", dataIndex: "status", key: "status" }, { title: "说明", dataIndex: "remark", key: "remark" }, { title: "操作", key: "action", render: (_, record: LedgerItem) => <Space><Button type="link" onClick={() => openEditLedger(record)}>编辑</Button><Popconfirm title="确认删除该台账吗？" onConfirm={() => void removeLedger(record.ledger_id)}><Button type="link" danger>删除</Button></Popconfirm></Space> }]} /></div><div className="board-panel board-panel-hard governance-side-panel"><div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>归档操作</Typography.Title></div><div className="policy-stack"><div className="policy-item"><Typography.Text strong>新建台账</Typography.Text><Typography.Text type="secondary">将复核结论、责任说明和处置结果写入监管台账。</Typography.Text><Button type="primary" onClick={openCreateLedger}>新建台账</Button></div></div></div></section>}
      {activeView === "preview" && <section id="data-preview-zone" className="dashboard-operating-grid governance-grid-two"><div className="board-panel board-panel-hard board-panel-wide"><div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>数据预览</Typography.Title></div><div className="workspace-toolbar" style={{ paddingInline: 0 }}><div className="workspace-toolbar-group"><Select value={dataset} onChange={setDataset} style={{ width: 220 }} options={governance.data_assets.map((item) => ({ value: item.dataset_key, label: item.dataset_name }))} /><Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="输入关键字筛选" style={{ width: 220 }} /><Select value={viewMode} onChange={setViewMode} style={{ width: 150 }} options={[{ value: "masked", label: CN.masked }, { value: "raw", label: CN.raw }]} /></div><div className="workspace-toolbar-group"><Button onClick={() => void loadPreview(dataset, keyword || undefined, viewMode)}>刷新预览</Button></div></div><Table rowKey="key" loading={tableLoading} pagination={{ pageSize: 10 }} columns={previewColumns} dataSource={rows} scroll={{ x: 1080 }} /></div><div className="board-panel board-panel-hard governance-side-panel"><div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>预览说明</Typography.Title></div><div className="governance-info-grid"><div className="governance-info-item"><span>当前数据集</span><strong>{selectedAsset?.dataset_name || "未选择"}</strong></div><div className="governance-info-item"><span>记录总数</span><strong>{selectedQuality?.records || 0}</strong></div><div className="governance-info-item"><span>完整度</span><strong>{selectedQuality?.completeness || 0}%</strong></div><div className="governance-info-item"><span>展示模式</span><strong>{viewMode === "raw" ? CN.raw : CN.masked}</strong></div></div><div className="policy-stack"><div className="policy-item"><Typography.Text strong>真实数据来源</Typography.Text><Typography.Text type="secondary">读取后端已处理的真实数据表，不使用展示型假数据覆盖预览结果。</Typography.Text></div><div className="policy-item"><Typography.Text strong>缺失字段</Typography.Text><Typography.Text type="secondary">{selectedQuality?.missing_fields?.length ? selectedQuality.missing_fields.join("、") : "当前数据集缺失字段较少"}</Typography.Text></div></div></div></section>}

      <Modal title={assetEditing ? "编辑数据资产" : "登记数据资产"} open={assetModalOpen} onCancel={() => setAssetModalOpen(false)} onOk={() => void submitAsset()} confirmLoading={submitting} destroyOnClose><Form form={assetForm} layout="vertical"><Form.Item name="dataset_key" label="数据集标识" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="source_name" label="数据来源" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="owner_org" label="所属单位" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="rows_added" label="记录数" rules={[{ required: true }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item><Form.Item name="privacy_level" label="隐私级别" rules={[{ required: true }]}><Select options={[{ value: "公开", label: "公开" }, { value: CN.internal, label: CN.internal }, { value: CN.restricted, label: CN.restricted }]} /></Form.Item><Form.Item name="share_scope" label="共享范围" rules={[{ required: true }]}><Select options={[{ value: "协同节点可见", label: "协同节点可见" }, { value: "监管节点可见", label: "监管节点可见" }, { value: "需审批解锁", label: "需审批解锁" }]} /></Form.Item><Form.Item name="description" label="说明"><Input.TextArea rows={3} /></Form.Item></Form></Modal>
      <Modal title={ledgerEditing ? "编辑监管台账" : "新建监管台账"} open={ledgerModalOpen} onCancel={() => setLedgerModalOpen(false)} onOk={() => void submitLedger()} confirmLoading={submitting} destroyOnClose><Form form={ledgerForm} layout="vertical"><Form.Item name="case_id" label="案例编号" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="flight_identity" label="航班号" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="subject_type" label="主体类型" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="owner_org" label="所属单位" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="privacy_level" label="隐私级别" rules={[{ required: true }]}><Select options={[{ value: CN.internal, label: CN.internal }, { value: CN.restricted, label: CN.restricted }]} /></Form.Item><Form.Item name="status" label="状态" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="remark" label="说明"><Input.TextArea rows={3} /></Form.Item></Form></Modal>
    </div>
  );
}
