import axios from "axios";
import { DEMO_USERS } from "../constants/demoUsers";
import {
  createMockAccessRequest,
  createMockLedger,
  decideMockAccessRequest,
  deleteMockAsset,
  deleteMockLedger,
  getMockAlerts,
  getMockAssets,
  getMockBlockchainStats,
  getMockContract,
  getMockDataset,
  getMockGovernance,
  getMockLedger,
  getMockOverview,
  getMockPrivacy,
  getMockTrace,
  importMockAsset,
  mockLogin,
  mockLogout,
  mockRegister,
  mockSession,
  updateMockAsset,
  updateMockLedger
} from "../mocks/platformMockService";

export const apiClient = axios.create({
  baseURL: "/api",
  timeout: 5000
});

const SESSION_KEY = "apron-platform-session";

function shouldPreferMockData() {
  if (typeof window === "undefined") {
    return false;
  }
  return !window.localStorage.getItem(SESSION_KEY);
}

async function withFallback<T>(request: () => Promise<T>, fallback: () => T | Promise<T>, preferFallback = false): Promise<T> {
  if (preferFallback) {
    return await fallback();
  }
  try {
    return await request();
  } catch {
    return await fallback();
  }
}

export interface AuthUser {
  user_id: string;
  username: string;
  display_name: string;
  role: string;
  org_name: string;
  permissions: string[];
  home_path: string;
}

export interface AuthResponse {
  session_id: string;
  user: AuthUser;
}

export interface RegisterPayload {
  username: string;
  password: string;
  display_name: string;
  role: string;
  org_name: string;
}

export interface LoginPayload {
  username: string;
  password: string;
  account?: string;
}

export interface KpiItem {
  label: string;
  value: number;
  suffix: string;
}

export interface MetricCard {
  label: string;
  value: number;
  suffix: string;
  description?: string;
}

export interface ValueCard {
  name: string;
  value: number;
  unit?: string;
  description?: string;
}

export interface AlertItem {
  case_id: string;
  flight_identity: string;
  vehicle_id: string;
  time: string;
  severity: string;
  title: string;
  detail: string;
}

export interface AssetItem {
  asset_id: string;
  dataset_key: string;
  dataset_name: string;
  source_name: string;
  owner_org: string;
  rows: number;
  privacy_level: string;
  share_scope: string;
  status: string;
  description: string;
  masked_fields: string[];
  last_sync_at: string;
  updated_at: string;
}

export interface ImportJob {
  job_id: string;
  dataset_key: string;
  source_name: string;
  status: string;
  rows_added: number;
  operator: string;
  created_at: string;
  finished_at?: string | null;
}

export interface LedgerItem {
  ledger_id: string;
  case_id: string;
  flight_identity: string;
  subject_type: string;
  owner_org: string;
  privacy_level: string;
  status: string;
  remark: string;
  updated_at: string;
}

export interface AccessRequestItem {
  request_id: string;
  dataset_key: string;
  role: string;
  requester_org: string;
  purpose: string;
  scope: string;
  status: string;
  reviewer?: string | null;
  created_at: string;
  reviewed_at?: string | null;
  note?: string | null;
}

export interface PrivacyResponse {
  stats: {
    approved_requests: number;
    pending_requests: number;
    restricted_assets: number;
    masked_datasets: number;
  };
  policies: { policy: string; detail: string }[];
  requests: AccessRequestItem[];
}

export interface ControlCenterResponse {
  operations: MetricCard[];
  chain_board: { lane: string; value: number; unit: string; detail: string }[];
  action_queue: { id: string; title: string; subtitle: string; status: string; priority: string; time: string; category: string }[];
  privacy_board: { stats: PrivacyResponse["stats"]; policies: PrivacyResponse["policies"] };
  data_assets: AssetItem[];
  import_jobs: ImportJob[];
  ledger_records: LedgerItem[];
  dataset_sync: { dataset: string; status: string; owner_org: string; updated_at: string }[];
  subject_workspaces: { role: string; org_name: string; lane: string; description: string; modules: string[]; notifications: number; approvals: number }[];
  authorization_chain: { stage: string; actor: string; count: number; status: string }[];
}

export interface OverviewResponse {
  generated_at: string;
  kpis: KpiItem[];
  architecture: { title: string; detail: string }[];
  risk_distribution: { name: string; value: number }[];
  task_composition: { name: string; value: number }[];
  hourly_cases: { hour: string; value: number }[];
  dataset_quality: { dataset: string; records: number; completeness: number; missing_fields: string[] }[];
  channel_stats: { channel: string; blocks: number; description: string }[];
  network: {
    nodes: { id: string; name: string; role: string }[];
    channels: { name: string; description: string; blocks: number }[];
  };
  top_vehicles: { name: string; value: number }[];
  verification_metrics: MetricCard[];
  association_distribution: { name: string; value: number }[];
  blockchain_value: ValueCard[];
  case_options: {
    case_id: string;
    flight_identity: string;
    risk_level: string;
    status: string;
    vehicle_id: string;
    stand_id: string;
    blockchain_records: number;
    association_confidence: number;
    validation_label: string;
    evidence_score: number;
  }[];
  alerts: AlertItem[];
  default_case_id?: string;
}

export interface TracePoint {
  lon: number;
  lat: number;
  time: string;
  speed?: number;
  vehicle_id?: string;
}

export interface TraceCase {
  case_id: string;
  flight_identity: string;
  direction: string;
  stand_id: string;
  vehicle_id: string;
  task_count: number;
  status: string;
  risk_level: string;
  risk_score: number;
  summary: string;
  association: {
    vehicle_id: string;
    confidence_score: number;
    confidence_label: string;
    candidate_vehicle_count: number;
    interaction_ratio: number;
    min_distance_m?: number | null;
    median_distance_m?: number | null;
    validation_label: string;
    operation_start?: string | null;
    operation_end?: string | null;
    release_time?: string | null;
    top_candidates: { vehicle_id: string; score: number; min_distance_m?: number | null; interaction_ratio: number; point_count: number }[];
  };
  legend: { aircraft: { label: string; color: string }; vehicle: { label: string; color: string } };
  phases: { tow_start?: string | null; tow_release?: string | null; runway_entry?: string | null; takeoff?: string | null; track_end?: string | null };
  metrics: {
    delay_minutes: number;
    speed_peak: number;
    speed_mean: number;
    overspeed_points: number;
    adsb_coverage: number;
    vehicle_coverage: number;
    evidence_score: number;
    association_confidence: number;
    interaction_ratio: number;
    min_distance_m?: number | null;
    median_distance_m?: number | null;
    paired_samples: number;
    tow_duration_min: number;
    taxi_after_release_min: number;
    release_to_takeoff_min: number;
    missing_fields: number;
    task_begin?: string | null;
    task_end?: string | null;
    risk_score: number;
    risk_level: string;
    status: string;
  };
  timeline: { stage: string; channel: string; time: string; actor: string; detail: string; hash: string; status: string }[];
  blockchain_records: { channel: string; block_index: number; timestamp: string; hash: string; previous_hash: string; actor: string; payload: Record<string, unknown> }[];
  alerts: { severity: string; title: string; detail: string; time: string }[];
  evidence: {
    adsb_points: number;
    vehicle_points: number;
    task_vehicle_groups: { task_id: string; task_name: string; begin_time: string; end_time: string; vehicle_id: string; point_count: number; match: { confidence_score?: number; confidence_label?: string } }[];
    aircraft_path: TracePoint[];
    aircraft_tow_path: TracePoint[];
    aircraft_departure_path: TracePoint[];
    vehicle_path: TracePoint[];
    interaction_samples: { time: string; distance_m: number; vehicle_speed: number; time_gap_s: number }[];
  };
}

export interface TraceResponse {
  case: TraceCase;
  cases: { case_id: string; flight_identity: string; risk_level: string; status: string; confidence: number }[];
}

export interface GovernanceResponse {
  dataset_quality: { dataset: string; records: number; completeness: number; missing_fields: string[] }[];
  channel_stats: { channel: string; blocks: number; description: string }[];
  network: { nodes: { id: string; name: string; role: string }[]; channels: { name: string; description: string; blocks: number }[] };
  integrity: Record<string, boolean>;
  validation_summary: {
    association_distribution: { name: string; value: number }[];
    verification_metrics: MetricCard[];
    blockchain_value: ValueCard[];
    case_integrity: { case_id: string; flight_identity: string; confidence: number; validation_label: string; evidence_score: number }[];
  };
  privacy: PrivacyResponse;
  data_assets: AssetItem[];
  import_jobs: ImportJob[];
  ledger_records: LedgerItem[];
}

export interface DatasetResponse {
  total: number;
  items: Record<string, unknown>[];
  available: string[];
  authorized: boolean;
  view_mode: string;
}

export interface ContractPayload {
  speed: number;
  distance_to_aircraft: number;
  brake_test_count: number;
}

export interface AssetImportPayload {
  dataset_key: string;
  source_name: string;
  owner_org: string;
  rows_added: number;
  privacy_level: string;
  share_scope: string;
  description?: string;
}

export interface AssetUpdatePayload {
  owner_org?: string;
  privacy_level?: string;
  share_scope?: string;
  status?: string;
  description?: string;
}

export interface LedgerPayload {
  case_id: string;
  flight_identity: string;
  subject_type: string;
  owner_org: string;
  privacy_level: string;
  status: string;
  remark?: string;
}

export interface AccessRequestPayload {
  dataset_key: string;
  role: string;
  requester_org: string;
  purpose: string;
  scope: string;
}

export const fetchOverview = async () => withFallback(async () => (await apiClient.get<OverviewResponse>("/platform/overview")).data, () => getMockOverview(), false);
export const fetchControlCenter = async () => withFallback(async () => (await apiClient.get<ControlCenterResponse>("/platform/control-center")).data, async () => {
  const mockOverview = getMockOverview();
  const mockGovernance = getMockGovernance();
  return {
    operations: [
      { label: "待处置工单", value: mockOverview.case_options.length, suffix: "项", description: "案例与授权待办" },
      { label: "待审批访问", value: mockGovernance.privacy.stats.pending_requests, suffix: "项", description: "敏感字段授权申请" },
      { label: "受限数据资产", value: mockGovernance.privacy.stats.restricted_assets, suffix: "个", description: "需要受控共享的数据资产" },
      { label: "监管台账", value: mockGovernance.ledger_records.length, suffix: "条", description: "链上归档记录" }
    ],
    chain_board: mockOverview.blockchain_value.map((item) => ({ lane: item.name, value: item.value, unit: item.unit || "", detail: item.description || "" })),
    action_queue: mockOverview.alerts.map((item, index) => ({ id: `${item.case_id}-${index}`, title: item.title, subtitle: item.detail, status: "待处理", priority: item.severity === "high" ? "高" : "中", time: item.time, category: "风险联动" })),
    privacy_board: { stats: mockGovernance.privacy.stats, policies: mockGovernance.privacy.policies },
    data_assets: mockGovernance.data_assets,
    import_jobs: mockGovernance.import_jobs,
    ledger_records: mockGovernance.ledger_records,
    dataset_sync: mockGovernance.data_assets.map((item) => ({ dataset: item.dataset_name, status: item.status, owner_org: item.owner_org, updated_at: item.updated_at })),
    subject_workspaces: DEMO_USERS.map((item) => ({ role: item.role, org_name: item.org_name, lane: item.display_name, description: `${item.role}围绕牵引作业协同处置。`, modules: item.permissions.slice(0, 3), notifications: mockOverview.alerts.length, approvals: mockGovernance.privacy.stats.pending_requests })),
    authorization_chain: [
      { stage: "申请发起", actor: "业务主体", count: mockGovernance.privacy.requests.length, status: "运行中" },
      { stage: "授权审批", actor: "监管审计节点", count: mockGovernance.privacy.stats.pending_requests, status: "待处理" },
      { stage: "通道写入", actor: "联盟链审计通道", count: mockOverview.channel_stats.find((item) => item.channel === "regulation")?.blocks || 0, status: "稳定" },
      { stage: "案例调用", actor: "责任主体", count: mockGovernance.ledger_records.length, status: "闭环中" }
    ]
  } as ControlCenterResponse;
}, false);
export const fetchTrace = async (caseId?: string) => withFallback(async () => (await apiClient.get<TraceResponse>(caseId ? `/platform/trace/${caseId}` : "/platform/trace")).data, () => getMockTrace(caseId), false);
export const fetchAlerts = async (limit = 8) => withFallback(async () => (await apiClient.get<{ items: AlertItem[] }>("/platform/alerts", { params: { limit } })).data, () => getMockAlerts(limit), false);
export const fetchGovernance = async () => withFallback(async () => (await apiClient.get<GovernanceResponse>("/platform/governance")).data, () => getMockGovernance(), false);
export const fetchPrivacy = async () => withFallback(async () => (await apiClient.get<PrivacyResponse>("/platform/privacy")).data, () => getMockPrivacy(), false);
export const fetchAssets = async () => withFallback(async () => (await apiClient.get<{ items: AssetItem[]; jobs: ImportJob[] }>("/platform/assets")).data, () => getMockAssets(), false);
 export const importAsset = async (payload: AssetImportPayload) => withFallback(async () => (await apiClient.post("/platform/assets/import", payload)).data, () => importMockAsset(payload), shouldPreferMockData());
 export const updateAsset = async (assetId: string, payload: AssetUpdatePayload) => withFallback(async () => (await apiClient.patch(`/platform/assets/${assetId}`, payload)).data, () => updateMockAsset(assetId, payload), shouldPreferMockData());
export const deleteAsset = async (assetId: string) => withFallback(async () => (await apiClient.delete(`/platform/assets/${assetId}`)).data, () => deleteMockAsset(assetId), shouldPreferMockData());
export const fetchLedger = async () => withFallback(async () => (await apiClient.get<{ items: LedgerItem[] }>("/platform/ledger")).data, () => getMockLedger(), false);
 export const createLedger = async (payload: LedgerPayload) => withFallback(async () => (await apiClient.post("/platform/ledger", payload)).data, () => createMockLedger(payload), shouldPreferMockData());
 export const updateLedger = async (ledgerId: string, payload: Partial<LedgerPayload>) => withFallback(async () => (await apiClient.patch(`/platform/ledger/${ledgerId}`, payload)).data, () => updateMockLedger(ledgerId, payload), shouldPreferMockData());
export const deleteLedger = async (ledgerId: string) => withFallback(async () => (await apiClient.delete(`/platform/ledger/${ledgerId}`)).data, () => deleteMockLedger(ledgerId), shouldPreferMockData());
export const createAccessRequest = async (payload: AccessRequestPayload) => withFallback(async () => (await apiClient.post("/platform/privacy/access-requests", payload)).data, () => createMockAccessRequest(payload), shouldPreferMockData());
export const decideAccessRequest = async (requestId: string, decision: "approve" | "reject", reviewer: string, note?: string) => withFallback(async () => (await apiClient.patch(`/platform/privacy/access-requests/${requestId}`, { decision, reviewer, note })).data, () => decideMockAccessRequest(requestId, decision, reviewer, note), shouldPreferMockData());
export const fetchDataset = async (dataset: string, keyword?: string, role = "监管审计", viewMode = "masked") => withFallback(async () => (await apiClient.get<DatasetResponse>(`/datasets/${dataset}`, { params: { limit: 60, keyword, role, view_mode: viewMode } })).data, () => getMockDataset(dataset, role, viewMode), false);
export const checkContract = async (payload: ContractPayload) => withFallback(async () => (await apiClient.post("/contracts/check", payload)).data, () => getMockContract(payload), shouldPreferMockData());
export const fetchBlockchainStats = async () => withFallback(async () => (await apiClient.get("/blockchain/stats")).data, () => getMockBlockchainStats(), false);
export const login = async (payload: LoginPayload) => withFallback(async () => (await apiClient.post<AuthResponse>("/auth/login", { ...payload, account: payload.account || payload.username })).data, () => mockLogin(payload));
export const register = async (payload: RegisterPayload) => withFallback(async () => (await apiClient.post<AuthResponse>("/auth/register", payload)).data, () => mockRegister(payload));
export const fetchSession = async (sessionId: string) => withFallback(async () => (await apiClient.get<AuthResponse>(`/auth/session/${sessionId}`)).data, () => mockSession(sessionId));
export const logout = async (sessionId: string) => withFallback(async () => (await apiClient.post("/auth/logout", { session_id: sessionId })).data, () => mockLogout());


