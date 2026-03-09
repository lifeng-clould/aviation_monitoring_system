import { DEMO_USERS } from "../constants/demoUsers";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const overview = {
  generated_at: "2026-03-09T15:00:00",
  kpis: [
    { label: "监管案例", value: 16, suffix: "起" },
    { label: "高风险", value: 5, suffix: "起" },
    { label: "链上记录", value: 104, suffix: "条" },
    { label: "授权申请", value: 7, suffix: "项" }
  ],
  architecture: [
    { title: "计划上链", detail: "放行计划、机位窗口与协同审批统一写链。" },
    { title: "执行留痕", detail: "拖行轨迹、阶段事件和异常签收全量留痕。" },
    { title: "授权审计", detail: "跨主体调阅申请和审批过程链上可审计。" }
  ],
  risk_distribution: [
    { name: "高风险", value: 5 },
    { name: "中风险", value: 6 },
    { name: "低风险", value: 5 }
  ],
  task_composition: [
    { name: "推出拖行", value: 8 },
    { name: "机位转场", value: 4 },
    { name: "异常复核", value: 4 }
  ],
  hourly_cases: [
    { hour: "08:00", value: 1 },
    { hour: "09:00", value: 2 },
    { hour: "10:00", value: 3 },
    { hour: "11:00", value: 4 },
    { hour: "12:00", value: 3 },
    { hour: "13:00", value: 5 },
    { hour: "14:00", value: 4 },
    { hour: "15:00", value: 2 }
  ],
  dataset_quality: [
    { dataset: "clean_main", records: 1502, completeness: 96, missing_fields: ["actual_gate_out"] },
    { dataset: "clean_task_info", records: 142, completeness: 91, missing_fields: ["driver_name"] },
    { dataset: "adsb_pvg_merged", records: 40218, completeness: 88, missing_fields: ["altitude"] },
    { dataset: "vehicle_gps_towing_merged", records: 51284, completeness: 84, missing_fields: ["heading"] }
  ],
  channel_stats: [
    { channel: "schedule", blocks: 22, description: "计划与放行调度" },
    { channel: "vehicle", blocks: 26, description: "执行轨迹与证据回传" },
    { channel: "risk", blocks: 18, description: "风险识别与联动告警" },
    { channel: "regulation", blocks: 38, description: "授权、台账与审计归档" }
  ],
  network: {
    nodes: DEMO_USERS.map((item, index) => ({ id: `node-${index + 1}`, name: item.org_name, role: item.role })),
    channels: [
      { name: "schedule", description: "计划编排通道", blocks: 22 },
      { name: "vehicle", description: "执行留痕通道", blocks: 26 },
      { name: "risk", description: "风控告警通道", blocks: 18 },
      { name: "regulation", description: "监管审计通道", blocks: 38 }
    ]
  },
  top_vehicles: [
    { name: "牵引车-17", value: 7 },
    { name: "牵引车-09", value: 5 },
    { name: "牵引车-22", value: 4 }
  ],
  verification_metrics: [
    { label: "关联可信度", value: 89, suffix: "分", description: "车辆与飞机轨迹匹配评分" },
    { label: "证据完整度", value: 92, suffix: "分", description: "轨迹、台账、审批多源齐备程度" }
  ],
  association_distribution: [
    { name: "高可信", value: 9 },
    { name: "中可信", value: 5 },
    { name: "待复核", value: 2 }
  ],
  blockchain_value: [
    { name: "计划上链", value: 22, unit: "条", description: "放行计划、机位和审批规则已固化" },
    { name: "执行留痕", value: 26, unit: "条", description: "执行轨迹和事件形成统一底账" },
    { name: "授权审计", value: 38, unit: "条", description: "跨主体授权和结论回写可追溯" }
  ],
  case_options: [
    { case_id: "case-001", flight_identity: "MU5101", risk_level: "高", status: "待复核", vehicle_id: "牵引车-17", stand_id: "A12", blockchain_records: 8, association_confidence: 93, validation_label: "已校验", evidence_score: 91 },
    { case_id: "case-002", flight_identity: "HO1168", risk_level: "中", status: "执行中", vehicle_id: "牵引车-09", stand_id: "B05", blockchain_records: 6, association_confidence: 86, validation_label: "已校验", evidence_score: 88 },
    { case_id: "case-003", flight_identity: "FM9203", risk_level: "低", status: "已归档", vehicle_id: "牵引车-22", stand_id: "C18", blockchain_records: 5, association_confidence: 81, validation_label: "待抽检", evidence_score: 79 },
    { case_id: "case-004", flight_identity: "CZ3812", risk_level: "高", status: "待处置", vehicle_id: "牵引车-05", stand_id: "D03", blockchain_records: 9, association_confidence: 90, validation_label: "已校验", evidence_score: 87 },
    { case_id: "case-005", flight_identity: "MU2418", risk_level: "中", status: "待复核", vehicle_id: "牵引车-11", stand_id: "A08", blockchain_records: 7, association_confidence: 88, validation_label: "已校验", evidence_score: 85 },
    { case_id: "case-006", flight_identity: "CA1886", risk_level: "低", status: "监测中", vehicle_id: "牵引车-13", stand_id: "E16", blockchain_records: 5, association_confidence: 84, validation_label: "待抽检", evidence_score: 80 },
    { case_id: "case-007", flight_identity: "KN5720", risk_level: "中", status: "执行中", vehicle_id: "牵引车-19", stand_id: "B11", blockchain_records: 6, association_confidence: 85, validation_label: "已校验", evidence_score: 83 },
    { case_id: "case-008", flight_identity: "9C7611", risk_level: "高", status: "待处置", vehicle_id: "牵引车-27", stand_id: "F02", blockchain_records: 10, association_confidence: 92, validation_label: "已校验", evidence_score: 90 }
  ],
  alerts: [
    { case_id: "case-001", flight_identity: "MU5101", vehicle_id: "牵引车-17", time: "2026-03-09T14:18:00", severity: "high", title: "净距不足", detail: "释放前 90 秒净距降至 4.2 米，已通知运控与地服。" },
    { case_id: "case-002", flight_identity: "HO1168", vehicle_id: "牵引车-09", time: "2026-03-09T14:26:00", severity: "medium", title: "速度波动", detail: "拖行中段速度波动偏大，建议复核执行过程。" },
    { case_id: "case-004", flight_identity: "CZ3812", vehicle_id: "牵引车-05", time: "2026-03-09T14:42:00", severity: "critical", title: "双重异常", detail: "净距和车速同时越界，已升级至监管席位。" },
    { case_id: "case-005", flight_identity: "MU2418", vehicle_id: "牵引车-11", time: "2026-03-09T14:51:00", severity: "medium", title: "释放后滑行偏慢", detail: "脱离后至跑道入口耗时偏长，建议核查现场调度。" },
    { case_id: "case-007", flight_identity: "KN5720", vehicle_id: "牵引车-19", time: "2026-03-09T15:02:00", severity: "high", title: "任务关联冲突", detail: "同时间窗存在两辆候选牵引车，需要人工复核。" },
    { case_id: "case-008", flight_identity: "9C7611", vehicle_id: "牵引车-27", time: "2026-03-09T15:08:00", severity: "high", title: "证据补录超时", detail: "异常告警触发后 2 分钟内未完成签收，已写入链上督办。" }
  ],
  default_case_id: "case-001"
};

const traceCase = {
  case_id: "case-001",
  flight_identity: "MU5101",
  direction: "离港",
  stand_id: "A12",
  vehicle_id: "牵引车-17",
  task_count: 1,
  status: "待复核",
  risk_level: "高",
  risk_score: 91,
  summary: "飞机由 A12 机位推出，牵引车完成拖行至滑行道释放，随后飞机自主滑行进入跑道并起飞。",
  association: {
    vehicle_id: "牵引车-17",
    confidence_score: 93,
    confidence_label: "高可信",
    candidate_vehicle_count: 3,
    interaction_ratio: 88,
    min_distance_m: 4.2,
    median_distance_m: 6.4,
    validation_label: "已校验",
    operation_start: "2026-03-09T14:12:00",
    operation_end: "2026-03-09T14:31:00",
    release_time: "2026-03-09T14:24:00",
    top_candidates: [
      { vehicle_id: "牵引车-17", score: 93, min_distance_m: 4.2, interaction_ratio: 88, point_count: 36 },
      { vehicle_id: "牵引车-09", score: 61, min_distance_m: 11.4, interaction_ratio: 32, point_count: 14 },
      { vehicle_id: "牵引车-22", score: 48, min_distance_m: 13.8, interaction_ratio: 21, point_count: 9 }
    ]
  },
  legend: {
    aircraft: { label: "飞机", color: "#0d5bd7" },
    vehicle: { label: "牵引车", color: "#f59a52" }
  },
  phases: {
    tow_start: "2026-03-09T14:12:00",
    tow_release: "2026-03-09T14:24:00",
    runway_entry: "2026-03-09T14:29:00",
    takeoff: "2026-03-09T14:31:00",
    track_end: "2026-03-09T14:33:00"
  },
  metrics: {
    delay_minutes: 7,
    speed_peak: 6.1,
    speed_mean: 2.8,
    overspeed_points: 2,
    adsb_coverage: 95,
    vehicle_coverage: 92,
    evidence_score: 91,
    association_confidence: 93,
    interaction_ratio: 88,
    min_distance_m: 4.2,
    median_distance_m: 6.4,
    paired_samples: 24,
    tow_duration_min: 12,
    taxi_after_release_min: 5,
    release_to_takeoff_min: 7,
    missing_fields: 1,
    task_begin: "2026-03-09T14:12:00",
    task_end: "2026-03-09T14:31:00",
    risk_score: 91,
    risk_level: "高",
    status: "待复核"
  },
  timeline: [
    { stage: "计划上链", channel: "schedule", time: "2026-03-09T14:00:00", actor: "机场运控中心", detail: "推出计划写入区块链。", hash: "hash-schedule-01", status: "完成" },
    { stage: "执行留痕", channel: "vehicle", time: "2026-03-09T14:12:00", actor: "地服保障中心", detail: "拖行开始并持续回传轨迹。", hash: "hash-vehicle-01", status: "完成" },
    { stage: "风险触发", channel: "risk", time: "2026-03-09T14:18:00", actor: "风险规则引擎", detail: "净距不足触发告警。", hash: "hash-risk-01", status: "已通知" },
    { stage: "审计归档", channel: "regulation", time: "2026-03-09T14:40:00", actor: "监管审计节点", detail: "案例进入复核台账。", hash: "hash-reg-01", status: "归档中" }
  ],
  blockchain_records: [
    { channel: "schedule", block_index: 12, timestamp: "2026-03-09T14:00:00", hash: "hash-schedule-01", previous_hash: "prev-01", actor: "机场运控中心", payload: { action: "schedule_create" } },
    { channel: "vehicle", block_index: 28, timestamp: "2026-03-09T14:12:00", hash: "hash-vehicle-01", previous_hash: "prev-02", actor: "地服保障中心", payload: { action: "tow_start" } },
    { channel: "risk", block_index: 9, timestamp: "2026-03-09T14:18:00", hash: "hash-risk-01", previous_hash: "prev-03", actor: "风险规则引擎", payload: { action: "alert_raise" } },
    { channel: "regulation", block_index: 31, timestamp: "2026-03-09T14:40:00", hash: "hash-reg-01", previous_hash: "prev-04", actor: "监管审计节点", payload: { action: "case_archive" } }
  ],
  alerts: overview.alerts,
  evidence: {
    adsb_points: 42,
    vehicle_points: 36,
    task_vehicle_groups: [
      { task_id: "task-001", task_name: "推出拖行", begin_time: "2026-03-09T14:12:00", end_time: "2026-03-09T14:24:00", vehicle_id: "牵引车-17", point_count: 36, match: { confidence_score: 93, confidence_label: "高可信" } }
    ],
    aircraft_path: [],
    aircraft_tow_path: [
      { lon: 121.802, lat: 31.145, time: "2026-03-09T14:12:00" },
      { lon: 121.804, lat: 31.146, time: "2026-03-09T14:15:00" },
      { lon: 121.807, lat: 31.148, time: "2026-03-09T14:20:00" },
      { lon: 121.811, lat: 31.151, time: "2026-03-09T14:24:00" }
    ],
    aircraft_departure_path: [
      { lon: 121.812, lat: 31.152, time: "2026-03-09T14:25:00" },
      { lon: 121.816, lat: 31.156, time: "2026-03-09T14:28:00" },
      { lon: 121.821, lat: 31.16, time: "2026-03-09T14:31:00" },
      { lon: 121.828, lat: 31.167, time: "2026-03-09T14:33:00" }
    ],
    vehicle_path: [
      { lon: 121.8015, lat: 31.1448, time: "2026-03-09T14:12:00", speed: 1.8 },
      { lon: 121.8037, lat: 31.1459, time: "2026-03-09T14:15:00", speed: 2.6 },
      { lon: 121.8065, lat: 31.1478, time: "2026-03-09T14:20:00", speed: 3.2 },
      { lon: 121.8108, lat: 31.1508, time: "2026-03-09T14:24:00", speed: 1.2 }
    ],
    interaction_samples: [
      { time: "2026-03-09T14:12:00", distance_m: 6.8, vehicle_speed: 1.8, time_gap_s: 0 },
      { time: "2026-03-09T14:15:00", distance_m: 5.4, vehicle_speed: 2.6, time_gap_s: 0 },
      { time: "2026-03-09T14:18:00", distance_m: 4.2, vehicle_speed: 3.4, time_gap_s: 0 },
      { time: "2026-03-09T14:20:00", distance_m: 4.8, vehicle_speed: 3.1, time_gap_s: 0 },
      { time: "2026-03-09T14:24:00", distance_m: 6.2, vehicle_speed: 1.2, time_gap_s: 0 }
    ]
  }
};
traceCase.evidence.aircraft_path = traceCase.evidence.aircraft_tow_path.concat(traceCase.evidence.aircraft_departure_path);

const TRACE_VARIANTS = {
  "case-001": { flight_identity: "MU5101", stand_id: "A12", vehicle_id: "牵引车-17", risk_level: "高", status: "待复核", confidence: 93, evidence_score: 91, risk_score: 91, lon_offset: 0, lat_offset: 0, minute_offset: 0, distance_delta: 0, speed_delta: 0 },
  "case-002": { flight_identity: "HO1168", stand_id: "B05", vehicle_id: "牵引车-09", risk_level: "中", status: "执行中", confidence: 86, evidence_score: 88, risk_score: 74, lon_offset: 0.012, lat_offset: 0.003, minute_offset: 8, distance_delta: 0.9, speed_delta: -0.2 },
  "case-003": { flight_identity: "FM9203", stand_id: "C18", vehicle_id: "牵引车-22", risk_level: "低", status: "已归档", confidence: 81, evidence_score: 79, risk_score: 41, lon_offset: -0.007, lat_offset: 0.006, minute_offset: 16, distance_delta: 1.8, speed_delta: -0.6 },
  "case-004": { flight_identity: "CZ3812", stand_id: "D03", vehicle_id: "牵引车-05", risk_level: "高", status: "待处置", confidence: 90, evidence_score: 87, risk_score: 89, lon_offset: 0.021, lat_offset: -0.004, minute_offset: 24, distance_delta: -0.7, speed_delta: 0.7 },
  "case-005": { flight_identity: "MU2418", stand_id: "A08", vehicle_id: "牵引车-11", risk_level: "中", status: "待复核", confidence: 88, evidence_score: 85, risk_score: 70, lon_offset: -0.013, lat_offset: -0.003, minute_offset: 32, distance_delta: 0.5, speed_delta: 0.1 },
  "case-006": { flight_identity: "CA1886", stand_id: "E16", vehicle_id: "牵引车-13", risk_level: "低", status: "监测中", confidence: 84, evidence_score: 80, risk_score: 46, lon_offset: 0.028, lat_offset: 0.01, minute_offset: 40, distance_delta: 1.2, speed_delta: -0.4 },
  "case-007": { flight_identity: "KN5720", stand_id: "B11", vehicle_id: "牵引车-19", risk_level: "中", status: "执行中", confidence: 85, evidence_score: 83, risk_score: 68, lon_offset: -0.018, lat_offset: 0.009, minute_offset: 48, distance_delta: 0.2, speed_delta: 0.5 },
  "case-008": { flight_identity: "9C7611", stand_id: "F02", vehicle_id: "牵引车-27", risk_level: "高", status: "待处置", confidence: 92, evidence_score: 90, risk_score: 92, lon_offset: 0.034, lat_offset: -0.008, minute_offset: 56, distance_delta: -0.5, speed_delta: 0.8 }
};

function shiftIso(value, minuteOffset) {
  const normalized = value.replace("T", " ");
  const [datePart, timePart] = normalized.split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, second] = timePart.split(":").map(Number);
  const date = new Date(year, month - 1, day, hour, minute + minuteOffset, second);
  const pad = (input) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function offsetPoints(points, lonOffset, latOffset, minuteOffset, speedDelta) {
  return points.map((point) => ({
    ...point,
    lon: Number((point.lon + lonOffset).toFixed(6)),
    lat: Number((point.lat + latOffset).toFixed(6)),
    time: shiftIso(point.time, minuteOffset),
    speed: point.speed !== undefined ? Number(Math.max(point.speed + speedDelta, 0.8).toFixed(1)) : point.speed
  }));
}

function buildMockTraceCase(caseId) {
  const variant = TRACE_VARIANTS[caseId] || TRACE_VARIANTS["case-001"];
  const selected = clone(traceCase);
  selected.case_id = caseId;
  selected.flight_identity = variant.flight_identity;
  selected.stand_id = variant.stand_id;
  selected.vehicle_id = variant.vehicle_id;
  selected.status = variant.status;
  selected.risk_level = variant.risk_level;
  selected.risk_score = variant.risk_score;
  selected.summary = `飞机由 ${variant.stand_id} 机位推出，牵引车 ${variant.vehicle_id} 完成拖行并在滑行道释放，飞机随后自主滑行进入跑道。`;
  selected.association.vehicle_id = variant.vehicle_id;
  selected.association.confidence_score = variant.confidence;
  selected.association.confidence_label = variant.confidence >= 90 ? "高可信" : variant.confidence >= 84 ? "中可信" : "待复核";
  selected.association.validation_label = variant.confidence >= 84 ? "已校验" : "待抽检";
  selected.phases.tow_start = shiftIso(traceCase.phases.tow_start, variant.minute_offset);
  selected.phases.tow_release = shiftIso(traceCase.phases.tow_release, variant.minute_offset);
  selected.phases.runway_entry = shiftIso(traceCase.phases.runway_entry, variant.minute_offset);
  selected.phases.takeoff = shiftIso(traceCase.phases.takeoff, variant.minute_offset);
  selected.phases.track_end = shiftIso(traceCase.phases.track_end, variant.minute_offset);
  selected.timeline = traceCase.timeline.map((item, index) => ({ ...item, time: shiftIso(item.time, variant.minute_offset), hash: `hash-${caseId}-${index + 1}` }));
  selected.blockchain_records = traceCase.blockchain_records.map((item, index) => ({ ...item, timestamp: shiftIso(item.timestamp, variant.minute_offset), hash: `hash-${caseId}-${index + 11}`, previous_hash: `prev-${caseId}-${index + 1}` }));
  selected.evidence.aircraft_tow_path = offsetPoints(traceCase.evidence.aircraft_tow_path, variant.lon_offset, variant.lat_offset, variant.minute_offset, 0);
  selected.evidence.aircraft_departure_path = offsetPoints(traceCase.evidence.aircraft_departure_path, variant.lon_offset, variant.lat_offset, variant.minute_offset, 0);
  selected.evidence.aircraft_path = selected.evidence.aircraft_tow_path.concat(selected.evidence.aircraft_departure_path);
  selected.evidence.vehicle_path = offsetPoints(traceCase.evidence.vehicle_path, variant.lon_offset - 0.0005, variant.lat_offset - 0.0002, variant.minute_offset, variant.speed_delta);
  selected.evidence.interaction_samples = traceCase.evidence.interaction_samples.map((item) => ({
    ...item,
    time: shiftIso(item.time, variant.minute_offset),
    distance_m: Number(Math.max(item.distance_m + variant.distance_delta, 3.2).toFixed(1)),
    vehicle_speed: Number(Math.max(item.vehicle_speed + variant.speed_delta, 1.1).toFixed(1))
  }));
  selected.evidence.task_vehicle_groups = traceCase.evidence.task_vehicle_groups.map((item) => ({
    ...item,
    vehicle_id: variant.vehicle_id,
    begin_time: shiftIso(item.begin_time, variant.minute_offset),
    end_time: shiftIso(item.end_time, variant.minute_offset),
    match: { confidence_score: variant.confidence, confidence_label: selected.association.confidence_label }
  }));
  const distances = selected.evidence.interaction_samples.map((item) => item.distance_m).sort((left, right) => left - right);
  const speeds = selected.evidence.interaction_samples.map((item) => item.vehicle_speed);
  selected.association.min_distance_m = distances[0];
  selected.association.median_distance_m = distances[Math.floor(distances.length / 2)];
  selected.association.release_time = selected.phases.tow_release;
  selected.association.operation_start = selected.phases.tow_start;
  selected.association.operation_end = selected.phases.track_end;
  selected.association.top_candidates = [
    { vehicle_id: variant.vehicle_id, score: variant.confidence, min_distance_m: selected.association.min_distance_m, interaction_ratio: Math.max(78, variant.confidence - 5), point_count: 36 },
    { vehicle_id: `牵引车-${String(Number(variant.vehicle_id.replace("牵引车-", "")) + 2).padStart(2, "0")}`, score: Math.max(variant.confidence - 22, 54), min_distance_m: Number((selected.association.min_distance_m + 6.4).toFixed(1)), interaction_ratio: 34, point_count: 17 },
    { vehicle_id: `牵引车-${String(Number(variant.vehicle_id.replace("牵引车-", "")) + 5).padStart(2, "0")}`, score: Math.max(variant.confidence - 37, 42), min_distance_m: Number((selected.association.min_distance_m + 8.8).toFixed(1)), interaction_ratio: 22, point_count: 9 }
  ];
  selected.metrics.speed_peak = Number(Math.max(...speeds).toFixed(1));
  selected.metrics.speed_mean = Number((speeds.reduce((acc, value) => acc + value, 0) / speeds.length).toFixed(1));
  selected.metrics.overspeed_points = speeds.filter((value) => value > 3).length;
  selected.metrics.evidence_score = variant.evidence_score;
  selected.metrics.association_confidence = variant.confidence;
  selected.metrics.interaction_ratio = Math.max(78, variant.confidence - 5);
  selected.metrics.min_distance_m = selected.association.min_distance_m;
  selected.metrics.median_distance_m = selected.association.median_distance_m;
  selected.metrics.risk_score = variant.risk_score;
  selected.metrics.risk_level = variant.risk_level;
  selected.metrics.status = variant.status;
  selected.metrics.task_begin = selected.phases.tow_start;
  selected.metrics.task_end = selected.phases.takeoff;
  selected.alerts = overview.alerts.filter((item) => item.case_id === caseId);
  return selected;
}

let accessRequests = [
  { request_id: "req-001", dataset_key: "clean_task_info", role: "航空公司", requester_org: "航空公司协同席位", purpose: "责任复核", scope: "脱敏摘要", status: "待审批", reviewer: null, created_at: "2026-03-09T14:35:00", reviewed_at: null, note: null },
  { request_id: "req-002", dataset_key: "vehicle_gps_towing_merged", role: "地服公司", requester_org: "地服保障中心", purpose: "异常补证", scope: "原始字段", status: "已批准", reviewer: "监管审计节点", created_at: "2026-03-09T14:20:00", reviewed_at: "2026-03-09T14:28:00", note: "开放 24 小时" }
];

let assets = [
  { asset_id: "asset-001", dataset_key: "clean_main", dataset_name: "clean_main", source_name: "航班主数据", owner_org: "机场运控中心", rows: 1502, privacy_level: "内部", share_scope: "协同节点可见", status: "已接入", description: "航班计划与动态主数据。", masked_fields: ["actual_gate_out"], last_sync_at: "2026-03-09T14:00:00", updated_at: "2026-03-09T14:00:00" },
  { asset_id: "asset-002", dataset_key: "vehicle_gps_towing_merged", dataset_name: "vehicle_gps_towing_merged", source_name: "牵引车轨迹", owner_org: "地服保障中心", rows: 51284, privacy_level: "受限", share_scope: "需审批解锁", status: "已接入", description: "牵引车 GPS 回传。", masked_fields: ["driver_name"], last_sync_at: "2026-03-09T14:05:00", updated_at: "2026-03-09T14:05:00" }
];

let importJobs = [
  { job_id: "job-001", dataset_key: "vehicle_gps_towing_merged", source_name: "车载终端同步", status: "已完成", rows_added: 12840, operator: "地服保障中心", created_at: "2026-03-09T13:20:00", finished_at: "2026-03-09T13:22:00" },
  { job_id: "job-002", dataset_key: "adsb_pvg_merged", source_name: "航迹补采任务", status: "待校验", rows_added: 2860, operator: "机场运控中心", created_at: "2026-03-09T14:10:00", finished_at: null }
];

let ledgerRecords = [
  { ledger_id: "ledger-001", case_id: "case-001", flight_identity: "MU5101", subject_type: "牵引监管案例", owner_org: "监管审计节点", privacy_level: "受限", status: "链上复核中", remark: "净距不足待复核。", updated_at: "2026-03-09T14:40:00" },
  { ledger_id: "ledger-002", case_id: "case-002", flight_identity: "HO1168", subject_type: "牵引监管案例", owner_org: "机场运控中心", privacy_level: "内部", status: "已归档", remark: "速度波动已说明。", updated_at: "2026-03-09T14:18:00" }
];

const previewRows = {
  clean_main: [
    { FUUID: "demo-fuuid-001", FLIGHTIDENTITY: "MU5101", STANDID: "A12", STATUS: "离港", SCHEDULEDOFFBLOCKDATETIME: "2026-03-09 14:00:00" },
    { FUUID: "demo-fuuid-002", FLIGHTIDENTITY: "HO1168", STANDID: "B05", STATUS: "离港", SCHEDULEDOFFBLOCKDATETIME: "2026-03-09 14:18:00" }
  ],
  clean_task_info: [
    { ID: "task-001", FUUID: "demo-fuuid-001", TASKTYPE: "推出拖行", RESOURCEID: "A12", VEHICLENO: "牵引车-17" },
    { ID: "task-002", FUUID: "demo-fuuid-002", TASKTYPE: "推出拖行", RESOURCEID: "B05", VEHICLENO: "牵引车-09" }
  ],
  adsb_pvg_merged: [
    { FUUID: "demo-fuuid-001", LATITUDE: 31.145, LONGITUDE: 121.802, SPEED: 18.2, TIME: "2026-03-09 14:12:00" },
    { FUUID: "demo-fuuid-001", LATITUDE: 31.16, LONGITUDE: 121.821, SPEED: 39.4, TIME: "2026-03-09 14:31:00" }
  ],
  vehicle_gps_towing_merged: [
    { VEHICLENO: "牵引车-17", LATITUDE: 31.1448, LONGITUDE: 121.8015, SPEED: 1.8, TIME: "2026-03-09 14:12:00" },
    { VEHICLENO: "牵引车-17", LATITUDE: 31.1508, LONGITUDE: 121.8108, SPEED: 1.2, TIME: "2026-03-09 14:24:00" }
  ]
};

function privacy() {
  return {
    stats: {
      approved_requests: accessRequests.filter((item) => item.status === "已批准").length,
      pending_requests: accessRequests.filter((item) => item.status === "待审批").length,
      restricted_assets: assets.filter((item) => item.privacy_level !== "公开").length,
      masked_datasets: 2
    },
    policies: [
      { policy: "最小必要展示", detail: "默认仅展示脱敏字段和聚合指标。" },
      { policy: "按主体授权", detail: "仅审批通过后开放原始字段。" },
      { policy: "全程留痕", detail: "所有授权和撤销动作写入监管链。" }
    ],
    requests: clone(accessRequests)
  };
}

function governance() {
  return {
    dataset_quality: clone(overview.dataset_quality),
    channel_stats: clone(overview.channel_stats),
    network: clone(overview.network),
    integrity: { schedule: true, vehicle: true, risk: true, regulation: true },
    validation_summary: {
      association_distribution: clone(overview.association_distribution),
      verification_metrics: clone(overview.verification_metrics),
      blockchain_value: clone(overview.blockchain_value),
      case_integrity: clone(overview.case_options.map((item) => ({ case_id: item.case_id, flight_identity: item.flight_identity, confidence: item.association_confidence, validation_label: item.validation_label, evidence_score: item.evidence_score })))
    },
    privacy: privacy(),
    data_assets: clone(assets),
    import_jobs: clone(importJobs),
    ledger_records: clone(ledgerRecords)
  };
}

function makeChainRecord(channel, actor) {
  return { channel, block_index: Math.floor(Math.random() * 100) + 10, hash: `hash-${channel}-${Date.now()}`, timestamp: new Date().toISOString(), actor };
}

export function getMockOverview() { return clone(overview); }
export function getMockTrace(caseId) {
  const fallbackCaseId = caseId || overview.default_case_id || overview.case_options[0].case_id;
  const selected = buildMockTraceCase(fallbackCaseId);
  return clone({
    case: selected,
    cases: overview.case_options.map((item) => ({ case_id: item.case_id, flight_identity: item.flight_identity, risk_level: item.risk_level, status: item.status, confidence: item.association_confidence }))
  });
}
export function getMockAlerts(limit = 8) { return { items: clone(overview.alerts.slice(0, limit)) }; }
export function getMockGovernance() { return governance(); }
export function getMockPrivacy() { return privacy(); }
export function getMockAssets() { return { items: clone(assets), jobs: clone(importJobs) }; }
export function importMockAsset(payload) {
  const now = new Date().toISOString();
  const item = { asset_id: `asset-${Date.now()}`, dataset_key: payload.dataset_key, dataset_name: payload.dataset_key, source_name: payload.source_name, owner_org: payload.owner_org, rows: payload.rows_added, privacy_level: payload.privacy_level, share_scope: payload.share_scope, status: "待校验", description: payload.description || "新增导入资产。", masked_fields: ["自动判定中"], last_sync_at: now, updated_at: now };
  const job = { job_id: `job-${Date.now()}`, dataset_key: payload.dataset_key, source_name: payload.source_name, status: "待校验", rows_added: payload.rows_added, operator: payload.owner_org, created_at: now, finished_at: null };
  assets = [item, ...assets];
  importJobs = [job, ...importJobs];
  return { item: clone(item), job: clone(job), chain_record: makeChainRecord("schedule", payload.owner_org) };
}
export function updateMockAsset(assetId, payload) {
  assets = assets.map((item) => item.asset_id === assetId ? { ...item, ...payload, updated_at: new Date().toISOString() } : item);
  const item = assets.find((entry) => entry.asset_id === assetId);
  return { item: clone(item), updated: true, chain_record: makeChainRecord("regulation", "数据治理中心") };
}
export function deleteMockAsset(assetId) {
  const item = assets.find((entry) => entry.asset_id === assetId);
  assets = assets.filter((entry) => entry.asset_id !== assetId);
  return { removed: clone(item), chain_record: makeChainRecord("regulation", "监管审计节点") };
}
export function getMockLedger() { return { items: clone(ledgerRecords) }; }
export function createMockLedger(payload) {
  const item = { ledger_id: `ledger-${Date.now()}`, ...payload, updated_at: new Date().toISOString() };
  ledgerRecords = [item, ...ledgerRecords];
  return { item: clone(item), chain_record: makeChainRecord("regulation", payload.owner_org) };
}
export function updateMockLedger(ledgerId, payload) {
  ledgerRecords = ledgerRecords.map((item) => item.ledger_id === ledgerId ? { ...item, ...payload, updated_at: new Date().toISOString() } : item);
  const item = ledgerRecords.find((entry) => entry.ledger_id === ledgerId);
  return { item: clone(item), updated: true, chain_record: makeChainRecord("regulation", "监管审计节点") };
}
export function deleteMockLedger(ledgerId) {
  const item = ledgerRecords.find((entry) => entry.ledger_id === ledgerId);
  ledgerRecords = ledgerRecords.filter((entry) => entry.ledger_id !== ledgerId);
  return { removed: clone(item), chain_record: makeChainRecord("regulation", "监管审计节点") };
}
export function createMockAccessRequest(payload) {
  const item = { request_id: `req-${Date.now()}`, ...payload, status: "待审批", reviewer: null, created_at: new Date().toISOString(), reviewed_at: null, note: null };
  accessRequests = [item, ...accessRequests];
  return { item: clone(item), chain_record: makeChainRecord("regulation", payload.requester_org) };
}
export function decideMockAccessRequest(requestId, decision, reviewer, note) {
  const status = decision === "approve" ? "已批准" : "已驳回";
  accessRequests = accessRequests.map((item) => item.request_id === requestId ? { ...item, status, reviewer, reviewed_at: new Date().toISOString(), note: note || "" } : item);
  const item = accessRequests.find((entry) => entry.request_id === requestId);
  return { item: clone(item), chain_record: makeChainRecord("regulation", reviewer) };
}
export function getMockDataset(dataset, role = "监管审计", viewMode = "masked") {
  const items = clone(previewRows[dataset] || previewRows.clean_main);
  const authorized = viewMode === "raw" && (role === "监管审计" || role === "机场运控");
  return { total: items.length, items, available: Object.keys(previewRows), authorized, view_mode: authorized ? "raw" : "masked" };
}
export function getMockContract(payload) {
  const violations = [];
  if (payload.speed > 3) violations.push({ rule: "max_speed", violation: `速度 ${payload.speed} km/h 超过阈值 3 km/h`, severity: "high" });
  if (payload.distance_to_aircraft < 5) violations.push({ rule: "min_distance", violation: `净距 ${payload.distance_to_aircraft} m 低于阈值 5 m`, severity: "critical" });
  if (payload.brake_test_count < 2) violations.push({ rule: "required_brake_tests", violation: `制动测试 ${payload.brake_test_count} 次未达标`, severity: "medium" });
  return { compliant: violations.length === 0, violations, scenario: "牵引规则联动演练", notified_departments: violations.length ? ["机场运控", "地服保障", "监管审计"] : ["机场运控"], response_sla_min: violations.length ? 2 : 0, chain_channel: "risk", chain_written: violations.length > 0, recommended_action: violations.length ? "已触发联动，请立即通知责任主体并补录证据。" : "当前场景满足规则要求。" };
}
export function getMockBlockchainStats() {
  return { total_blocks: overview.channel_stats.reduce((acc, item) => acc + item.blocks, 0), blocks_per_channel: Object.fromEntries(overview.channel_stats.map((item) => [item.channel, item.blocks])), total_violations: 3, violations_per_contract: { towing_safety: 3 }, alerts_cached: overview.alerts.length };
}
export function mockLogin(payload) {
  const user = DEMO_USERS.find((item) => item.username === (payload.username || payload.account)) || DEMO_USERS[0];
  return { session_id: `mock-session-${user.username}`, user: clone(user) };
}
export function mockRegister(payload) {
  return { session_id: `mock-session-${payload.username}`, user: { user_id: `mock-${Date.now()}`, username: payload.username, display_name: payload.display_name, role: payload.role, org_name: payload.org_name, permissions: ["view_masked_data"], home_path: "/workspace" } };
}
export function mockSession(sessionId) {
  const user = DEMO_USERS.find((item) => sessionId.includes(item.username)) || DEMO_USERS[0];
  return { session_id: sessionId, user: clone(user) };
}
export function mockLogout() { return { ok: true }; }