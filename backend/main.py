"""FastAPI backend for the blockchain-based towing operations platform."""

import threading
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
from uuid import uuid4

import pandas as pd
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from src.blockchain_platform import BlockchainPlatform
from src.data_loader import DataLoader
from src.data_matcher import DataMatcher
from src.platform_service import PlatformService


DATASET_KEYS = [
    "clean_main",
    "clean_task_info",
    "adsb_pvg_merged",
    "vehicle_gps_towing_merged",
]

SENSITIVE_COLUMNS = {
    "FUUID",
    "FLIGHTIDENTITY",
    "STANDID",
    "RESOURCEID",
    "TASKER",
    "VEHICLENO",
    "VEHICLELOCATION_PK",
    "ID",
}
COORDINATE_COLUMNS = {"LO", "LA", "LONGITUDE", "LATITUDE"}
PRIVILEGED_ROLES = {"监管审计", "机场运控"}

FRONTEND_DIST = Path("front-end/dist")
FRONTEND_INDEX = FRONTEND_DIST / "index.html"

ROLE_WORKSPACE_TEMPLATES = {
    "机场运控": {
        "lane": "计划放行",
        "home_path": "/workspace",
        "permissions": ["raw_data_request", "dispatch_alert", "view_trace", "approve_schedule"],
        "modules": ["计划编排", "机位放行", "联动升级", "原始字段申请"],
    },
    "地服公司": {
        "lane": "执行回传",
        "home_path": "/workspace",
        "permissions": ["submit_execution", "view_masked_data", "view_trace", "respond_alert"],
        "modules": ["拖行执行", "车辆回传", "异常签收", "证据补录"],
    },
    "航空公司": {
        "lane": "协同复核",
        "home_path": "/workspace",
        "permissions": ["view_masked_data", "review_case", "request_access"],
        "modules": ["协同复核", "责任确认", "授权申请", "影响评估"],
    },
    "监管审计": {
        "lane": "监管审计",
        "home_path": "/workspace",
        "permissions": ["approve_access", "view_raw_data", "view_trace", "close_case", "audit_chain"],
        "modules": ["授权审批", "原始调阅", "闭环审计", "合规复核"],
    },
}
class CompliancePayload(BaseModel):
    speed: float = Field(..., ge=0, description="Towing vehicle speed (km/h).")
    distance_to_aircraft: float = Field(..., ge=0, description="Distance between towing vehicle and aircraft (m).")
    brake_test_count: int = Field(..., ge=0, description="Brake test count performed before docking.")


class AssetImportPayload(BaseModel):
    dataset_key: str
    source_name: str
    owner_org: str
    rows_added: int = Field(..., ge=1, le=500000)
    privacy_level: str
    share_scope: str
    description: Optional[str] = None


class AssetUpdatePayload(BaseModel):
    owner_org: Optional[str] = None
    privacy_level: Optional[str] = None
    share_scope: Optional[str] = None
    status: Optional[str] = None
    description: Optional[str] = None


class LedgerRecordPayload(BaseModel):
    case_id: str
    flight_identity: str
    subject_type: str
    owner_org: str
    privacy_level: str
    status: str
    remark: Optional[str] = None


class LedgerRecordUpdatePayload(BaseModel):
    owner_org: Optional[str] = None
    privacy_level: Optional[str] = None
    status: Optional[str] = None
    remark: Optional[str] = None


class AccessRequestPayload(BaseModel):
    dataset_key: str
    role: str
    requester_org: str
    purpose: str
    scope: str = "脱敏摘要"


class AccessDecisionPayload(BaseModel):
    decision: str
    reviewer: str
    note: Optional[str] = None


class 注册Payload(BaseModel):
    username: str
    password: str
    display_name: str
    role: str
    org_name: str


class LoginPayload(BaseModel):
    username: Optional[str] = None
    account: Optional[str] = None
    password: str


class LogoutPayload(BaseModel):
    session_id: str


app = FastAPI(
    title="机场牵引作业区块链存证与追溯平台 API",
    version="3.0.0",
    description="Provides business orchestration, analytics, blockchain audit, privacy governance, and traceability endpoints.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="backend/static"), name="static")
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="frontend-assets")
templates = Jinja2Templates(directory="backend/templates")


def _serialize_records(records: List[object]) -> List[Dict]:
    return [dict(vars(record)) for record in records]


def _filter_keyword(df: pd.DataFrame, keyword: Optional[str]) -> pd.DataFrame:
    if not keyword:
        return df

    mask = pd.Series(False, index=df.index)
    lowered = keyword.lower()
    for column in df.columns:
        series = df[column]
        if pd.api.types.is_string_dtype(series) or series.dtype == object:
            mask |= series.astype(str).str.lower().str.contains(lowered, na=False)
    filtered = df[mask]
    return filtered if not filtered.empty else df


def _mask_string(value: object) -> object:
    if value in (None, ""):
        return value
    text = str(value)
    if len(text) <= 2:
        return "*" * len(text)
    if len(text) <= 6:
        return f"{text[0]}***{text[-1]}"
    return f"{text[:2]}***{text[-2:]}"


def _mask_record(record: Dict[str, object]) -> Dict[str, object]:
    masked: Dict[str, object] = {}
    for key, value in record.items():
        upper_key = key.upper()
        if upper_key in COORDINATE_COLUMNS:
            try:
                masked[key] = round(float(value), 2)
            except (TypeError, ValueError):
                masked[key] = value
        elif upper_key in SENSITIVE_COLUMNS:
            masked[key] = _mask_string(value)
        else:
            masked[key] = value
    return masked


def _write_admin_block(blockchain: BlockchainPlatform, channel: str, action: str, payload: Dict[str, object], actor: str) -> Dict[str, object]:
    block = blockchain.upload_data(channel, {"action": action, **payload})
    return {
        "channel": channel,
        "block_index": block.index,
        "hash": block.hash,
        "timestamp": block.timestamp,
        "actor": actor,
    }


def _workspace_for_role(role: str) -> Dict[str, object]:
    return ROLE_WORKSPACE_TEMPLATES.get(
        role,
        {
            "lane": "协同工作",
            "home_path": "/dashboard",
            "permissions": ["view_masked_data"],
            "modules": ["概览查看"],
        },
    )


def _serialize_user(account: Dict[str, object]) -> Dict[str, object]:
    workspace = _workspace_for_role(str(account["role"]))
    return {
        "user_id": account["user_id"],
        "username": account["username"],
        "display_name": account["display_name"],
        "role": account["role"],
        "org_name": account["org_name"],
        "permissions": workspace["permissions"],
        "home_path": workspace["home_path"],
    }


def _find_account(username: str) -> Optional[Dict[str, object]]:
    for account in app.state.user_accounts:
        if account["username"] == username:
            return account
    return None


def _create_session(account: Dict[str, object]) -> Dict[str, object]:
    session_id = f"sess-{uuid4().hex}"
    app.state.active_sessions[session_id] = {
        "session_id": session_id,
        "username": account["username"],
        "created_at": datetime.now().isoformat(),
    }
    return {"session_id": session_id, "user": _serialize_user(account)}


def _initialize_accounts(blockchain: Optional[BlockchainPlatform] = None) -> None:
    if hasattr(app.state, "user_accounts") and getattr(app.state, "user_accounts", None):
        if not hasattr(app.state, "active_sessions"):
            app.state.active_sessions = {}
        return
    now = datetime.now().isoformat()
    app.state.user_accounts = [
        {
            "user_id": "user-regulator",
            "username": "regulator",
            "password": "block123",
            "display_name": "监管席位",
            "role": "监管审计",
            "org_name": "监管审计节点",
            "created_at": now,
        },
        {
            "user_id": "user-airport",
            "username": "airport_ops",
            "password": "block123",
            "display_name": "运控席位",
            "role": "机场运控",
            "org_name": "机场运控中心",
            "created_at": now,
        },
        {
            "user_id": "user-ground",
            "username": "ground_ops",
            "password": "block123",
            "display_name": "地服席位",
            "role": "地服公司",
            "org_name": "地服保障中心",
            "created_at": now,
        },
        {
            "user_id": "user-airline",
            "username": "airline_ops",
            "password": "block123",
            "display_name": "航司席位",
            "role": "航空公司",
            "org_name": "航空公司协同席位",
            "created_at": now,
        },
    ]
    app.state.active_sessions = {}
    if blockchain is not None:
        blockchain.upload_data(
            "personnel",
            {
                "action": "account_bootstrap",
                "accounts": [
                    {
                        "username": item["username"],
                        "role": item["role"],
                        "org_name": item["org_name"],
                    }
                    for item in app.state.user_accounts
                ],
                "initialized_at": now,
            },
        )

def _initialize_registry(loader: DataLoader, blockchain: BlockchainPlatform, platform: PlatformService) -> None:
    overview = platform.build_overview()
    quality_map = {item["dataset"]: item for item in overview["dataset_quality"]}
    now = datetime.now().isoformat()

    app.state.data_assets = []
    for dataset_name in DATASET_KEYS:
        quality = quality_map.get(dataset_name, {"records": 0, "completeness": 0, "missing_fields": []})
        app.state.data_assets.append(
            {
                "asset_id": f"asset-{dataset_name}",
                "dataset_key": dataset_name,
                "dataset_name": dataset_name,
                "source_name": dataset_name,
                "owner_org": "机场运控中心" if dataset_name == "clean_main" else "数据治理中心",
                "rows": quality["records"],
                "privacy_level": "受限" if "merged" in dataset_name else "内部",
                "share_scope": "监管可见" if dataset_name != "clean_task_info" else "协同节点可见",
                "status": "已接入",
                "description": f"{dataset_name} 数据资产已登记并纳入链上审计。",
                "masked_fields": quality["missing_fields"],
                "last_sync_at": now,
                "updated_at": now,
            }
        )

    app.state.import_jobs = [
        {
            "job_id": f"job-{uuid4().hex[:8]}",
            "dataset_key": "vehicle_gps_towing_merged",
            "source_name": "机坪车辆网关批量同步",
            "status": "已完成",
            "rows_added": 12840,
            "operator": "数据治理中心",
            "created_at": now,
            "finished_at": now,
        },
        {
            "job_id": f"job-{uuid4().hex[:8]}",
            "dataset_key": "adsb_pvg_merged",
            "source_name": "空侧轨迹补采任务",
            "status": "待校验",
            "rows_added": 2860,
            "operator": "空管数据接口",
            "created_at": now,
            "finished_at": None,
        },
    ]

    app.state.ledger_records = []
    for case in list(platform.case_map.values())[:8]:
        app.state.ledger_records.append(
            {
                "ledger_id": f"ledger-{uuid4().hex[:8]}",
                "case_id": case["case_id"],
                "flight_identity": case["flight_identity"],
                "subject_type": "牵引监管案例",
                "owner_org": "机场运控中心",
                "privacy_level": "受限",
                "status": case["status"],
                "remark": case["summary"],
                "updated_at": now,
            }
        )

    app.state.access_requests = [
        {
            "request_id": f"req-{uuid4().hex[:8]}",
            "dataset_key": "vehicle_gps_towing_merged",
            "role": "地服公司",
            "requester_org": "上海吉祥航空地服",
            "purpose": "异常拖行复核",
            "scope": "脱敏摘要",
            "status": "已批准",
            "reviewer": "监管审计节点",
            "created_at": now,
            "reviewed_at": now,
            "note": "仅开放案例级摘要与脱敏轨迹。",
        },
        {
            "request_id": f"req-{uuid4().hex[:8]}",
            "dataset_key": "clean_task_info",
            "role": "航空公司",
            "requester_org": "中国东方航空",
            "purpose": "跨主体责任核验",
            "scope": "原始字段",
            "status": "待审批",
            "reviewer": None,
            "created_at": now,
            "reviewed_at": None,
            "note": None,
        },
    ]

    blockchain.upload_data(
        "regulation",
        {
            "action": "registry_bootstrap",
            "assets": len(app.state.data_assets),
            "ledger_records": len(app.state.ledger_records),
            "access_requests": len(app.state.access_requests),
            "initialized_at": now,
        },
    )


def _runtime_ready() -> bool:
    return all(hasattr(app.state, key) for key in ("loader", "matcher", "blockchain", "platform"))


def _load_runtime_state() -> None:
    loader = DataLoader("data", date_filter="2025-09-15")
    loader.load_all()

    matcher = DataMatcher(loader)
    matcher.match_all()

    blockchain = BlockchainPlatform()
    platform = PlatformService(loader, matcher, blockchain)

    app.state.loader = loader
    app.state.matcher = matcher
    app.state.blockchain = blockchain
    app.state.platform = platform
    _initialize_accounts(blockchain)
    _initialize_registry(loader, blockchain, platform)
    app.state.runtime_status = "ready"
    app.state.runtime_error = None


def _start_runtime_loader() -> None:
    _initialize_accounts()
    if _runtime_ready() or getattr(app.state, "runtime_loading", False):
        return
    app.state.runtime_loading = True
    app.state.runtime_status = "initializing"
    app.state.runtime_error = None

    def runner() -> None:
        try:
            _load_runtime_state()
        except Exception as exc:
            app.state.runtime_status = "failed"
            app.state.runtime_error = str(exc)
        finally:
            app.state.runtime_loading = False

    threading.Thread(target=runner, name="platform-runtime-loader", daemon=True).start()


def _get_state():
    _start_runtime_loader()
    if not _runtime_ready():
        raise HTTPException(status_code=503, detail=getattr(app.state, "runtime_error", None) or "平台运行态初始化中")
    return app.state.loader, app.state.matcher, app.state.blockchain, app.state.platform


@app.on_event("startup")
def _bootstrap_runtime_loader() -> None:
    _start_runtime_loader()


def _build_privacy_snapshot() -> Dict[str, object]:
    requests = list(app.state.access_requests)
    approved = [item for item in requests if item["status"] == "已批准"]
    pending = [item for item in requests if item["status"] == "待审批"]
    assets = list(app.state.data_assets)
    restricted = [item for item in assets if item["privacy_level"] != "公开"]
    return {
        "stats": {
            "approved_requests": len(approved),
            "pending_requests": len(pending),
            "restricted_assets": len(restricted),
            "masked_datasets": len({item["dataset_key"] for item in approved if item["scope"] == "脱敏摘要"}),
        },
        "policies": [
            {"policy": "最小必要展示", "detail": "默认仅返回脱敏摘要与聚合指标。"},
            {"policy": "按角色授权", "detail": "仅监管审计和机场运控可直接申请原始字段访问。"},
            {"policy": "授权留痕上链", "detail": "所有审批与撤销动作同步写入监管审计通道。"},
        ],
        "requests": requests,
    }


def _build_control_center(platform: PlatformService) -> Dict[str, object]:
    overview = platform.build_overview()
    privacy = _build_privacy_snapshot()
    assets = list(app.state.data_assets)
    imports = list(app.state.import_jobs)
    ledgers = list(app.state.ledger_records)
    pending_access = privacy["stats"]["pending_requests"]
    pending_jobs = sum(1 for item in imports if item["status"] != "已完成")
    open_ledgers = sum(1 for item in ledgers if item["status"] != "闭环完成")
    restricted_assets = privacy["stats"]["restricted_assets"]
    alert_pool = platform.list_alerts(limit=12)

    action_queue = []
    for job in imports[:3]:
        action_queue.append(
            {
                "id": job["job_id"],
                "title": f"导入任务 · {job['dataset_key']}",
                "subtitle": job["source_name"],
                "status": job["status"],
                "priority": "高" if job["status"] != "已完成" else "中",
                "time": job["created_at"],
                "category": "数据导入",
            }
        )
    for request in privacy["requests"][:3]:
        action_queue.append(
            {
                "id": request["request_id"],
                "title": f"访问申请 · {request['dataset_key']}",
                "subtitle": request["requester_org"],
                "status": request["status"],
                "priority": "高" if request["status"] == "待审批" else "中",
                "time": request["created_at"],
                "category": "隐私授权",
            }
        )

    subject_workspaces = []
    for role, config in ROLE_WORKSPACE_TEMPLATES.items():
        org_name = next((account["org_name"] for account in app.state.user_accounts if account["role"] == role), role)
        subject_workspaces.append(
            {
                "role": role,
                "org_name": org_name,
                "lane": config["lane"],
                "description": f"{role}席位围绕{config['lane']}开展链上协同与责任闭环。",
                "modules": config["modules"],
                "notifications": len(alert_pool) if role in {"监管审计", "机场运控"} else len([item for item in alert_pool if role[:2] in item["detail"]]) or max(1, len(alert_pool) // 3),
                "approvals": len([item for item in app.state.access_requests if item["status"] == "待审批" and (role in {"监管审计", "机场运控"} or item["role"] == role)]),
            }
        )

    return {
        "operations": [
            {"label": "待处置工单", "value": pending_access + pending_jobs + open_ledgers, "suffix": "项", "description": "导入、授权、闭环三类待办汇总"},
            {"label": "待审批访问", "value": pending_access, "suffix": "项", "description": "跨主体查看原始字段的授权申请"},
            {"label": "受限数据资产", "value": restricted_assets, "suffix": "个", "description": "需要按主体按范围受控共享的数据集"},
            {"label": "监管台账", "value": len(ledgers), "suffix": "条", "description": "纳入牵引监管与责任追溯的业务条目"},
        ],
        "chain_board": [
            {"lane": "计划上链", "value": overview["blockchain_value"][0]["value"], "unit": overview["blockchain_value"][0]["unit"], "detail": "计划、机位、航班基础约束已固化"},
            {"lane": "执行留痕", "value": overview["kpis"][2]["value"], "unit": "条", "detail": "执行、风控、审计证据形成统一底账"},
            {"lane": "隐私授权", "value": privacy["stats"]["approved_requests"], "unit": "项", "detail": "多主体访问申请审批与撤销链上留痕"},
            {"lane": "监管闭环", "value": len([item for item in ledgers if item["status"] == "闭环完成"]), "unit": "条", "detail": "案件处理结果回写监管台账"},
        ],
        "action_queue": sorted(action_queue, key=lambda item: (item["priority"] != "高", item["time"]))[:8],
        "privacy_board": {
            "stats": privacy["stats"],
            "policies": privacy["policies"],
        },
        "data_assets": assets[:6],
        "import_jobs": imports[:6],
        "ledger_records": ledgers[:6],
        "dataset_sync": [
            {"dataset": item["dataset_name"], "status": item["status"], "owner_org": item["owner_org"], "updated_at": item["updated_at"]}
            for item in assets[:6]
        ],
        "subject_workspaces": subject_workspaces,
        "authorization_chain": [
            {"stage": "申请发起", "actor": "业务主体", "count": len(app.state.access_requests), "status": "运行中"},
            {"stage": "授权审批", "actor": "监管审计节点", "count": len([item for item in app.state.access_requests if item["status"] == "待审批"]), "status": "待处理"},
            {"stage": "通道写入", "actor": "联盟链审计通道", "count": platform.blockchain.get_statistics()["blocks_per_channel"].get("regulation", 0), "status": "稳定"},
            {"stage": "案例调用", "actor": "责任主体", "count": len(app.state.ledger_records), "status": "闭环中"},
        ],
    }

def _is_raw_authorized(dataset_name: str, role: str) -> bool:
    if role in PRIVILEGED_ROLES:
        return True
    for request in app.state.access_requests:
        if request["dataset_key"] == dataset_name and request["role"] == role and request["status"] == "已批准" and request["scope"] == "原始字段":
            return True
    return False


@app.get("/auth", response_class=HTMLResponse)
def auth_portal():
    return HTMLResponse(
        """
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>机坪牵引作业监管平台</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #edf3fb;
        --panel: rgba(255, 255, 255, 0.96);
        --line: rgba(13, 91, 215, 0.12);
        --primary: #0d5bd7;
        --primary-2: #2b83ff;
        --text: #163a70;
        --subtle: #5c76a6;
        --danger: #b43a3a;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: Aptos, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(94, 152, 255, 0.24), transparent 32%),
          radial-gradient(circle at bottom right, rgba(13, 91, 215, 0.14), transparent 26%),
          linear-gradient(180deg, #f7fbff 0%, var(--bg) 100%);
        display: grid;
        place-items: center;
        padding: 32px;
      }
      .shell {
        width: min(1180px, 100%);
        display: grid;
        grid-template-columns: minmax(0, 1.08fr) minmax(420px, 0.92fr);
        gap: 28px;
        align-items: stretch;
      }
      .hero, .panel {
        border: 1px solid var(--line);
        background: var(--panel);
        box-shadow: 0 24px 60px rgba(28, 70, 139, 0.12);
      }
      .hero {
        padding: 38px;
        border-radius: 34px;
        display: grid;
        align-content: space-between;
        gap: 24px;
      }
      .kicker {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: #6b84ae;
        font-size: 12px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }
      .title {
        margin: 14px 0 16px;
        font-size: clamp(38px, 4.6vw, 58px);
        line-height: 1.04;
        color: #0f3976;
      }
      .subtitle {
        margin: 0;
        max-width: 720px;
        color: var(--subtle);
        font-size: 17px;
        line-height: 1.8;
      }
      .hero-strip {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
      }
      .hero-tile {
        padding: 16px 18px;
        border-radius: 22px;
        background: rgba(240, 246, 255, 0.92);
        border: 1px solid rgba(13, 91, 215, 0.1);
      }
      .hero-tile span {
        display: block;
        margin-bottom: 8px;
        color: #5f78a5;
        font-size: 12px;
        font-weight: 700;
      }
      .hero-tile strong {
        font-size: 24px;
        color: #0f3976;
      }
      .hero-columns {
        display: grid;
        grid-template-columns: minmax(0, 1.05fr) minmax(280px, 0.95fr);
        gap: 16px;
      }
      .hero-list, .hero-flow {
        display: grid;
        gap: 10px;
      }
      .hero-card {
        padding: 14px 16px;
        border-radius: 18px;
        border: 1px solid rgba(13, 91, 215, 0.1);
        background: rgba(255, 255, 255, 0.9);
      }
      .hero-card strong {
        display: block;
        margin-bottom: 6px;
        color: #0f3976;
      }
      .hero-card span {
        color: #5c76a6;
        line-height: 1.65;
      }
      .panel {
        padding: 30px;
        border-radius: 30px;
        display: grid;
        gap: 20px;
      }
      .panel-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
      }
      .panel-title {
        display: grid;
        gap: 6px;
      }
      .panel-title strong {
        font-size: 28px;
        color: #0f3976;
      }
      .panel-title span {
        color: var(--subtle);
        line-height: 1.7;
      }
      .segmented {
        display: inline-grid;
        grid-auto-flow: column;
        gap: 6px;
        padding: 6px;
        border-radius: 999px;
        background: rgba(13, 91, 215, 0.08);
      }
      .segmented button {
        border: 0;
        background: transparent;
        padding: 10px 18px;
        border-radius: 999px;
        font-size: 14px;
        font-weight: 700;
        color: #5f78a5;
        cursor: pointer;
      }
      .segmented button.active {
        background: linear-gradient(135deg, var(--primary) 0%, var(--primary-2) 100%);
        color: #fff;
        box-shadow: 0 10px 24px rgba(13, 91, 215, 0.22);
      }
      .chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .chip {
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(240, 246, 255, 0.95);
        border: 1px solid rgba(13, 91, 215, 0.1);
        color: var(--text);
        font-size: 13px;
        font-weight: 700;
      }
      form {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
      }
      label {
        display: grid;
        gap: 8px;
      }
      label span {
        color: #47689e;
        font-size: 13px;
        font-weight: 700;
      }
      input, select {
        width: 100%;
        min-height: 50px;
        border-radius: 14px;
        border: 1px solid rgba(13, 91, 215, 0.14);
        background: rgba(248, 251, 255, 0.96);
        padding: 0 14px;
        color: var(--text);
        font-size: 15px;
        outline: none;
      }
      input:focus, select:focus {
        border-color: rgba(13, 91, 215, 0.42);
        box-shadow: 0 0 0 4px rgba(13, 91, 215, 0.08);
      }
      .full { grid-column: 1 / -1; }
      .submit {
        min-height: 52px;
        border: 0;
        border-radius: 16px;
        background: linear-gradient(135deg, var(--primary) 0%, var(--primary-2) 100%);
        color: #fff;
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 16px 36px rgba(13, 91, 215, 0.22);
      }
      .submit:disabled { opacity: 0.7; cursor: wait; }
      .error {
        display: none;
        padding: 12px 14px;
        border-radius: 14px;
        border: 1px solid rgba(239, 107, 107, 0.2);
        background: rgba(255, 241, 241, 0.94);
        color: var(--danger);
        font-size: 14px;
        font-weight: 600;
      }
      .demo {
        display: grid;
        gap: 10px;
        padding: 16px 18px;
        border-radius: 18px;
        background: rgba(13, 91, 215, 0.05);
      }
      .demo-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .demo code {
        padding: 8px 10px;
        border-radius: 12px;
        background: rgba(240, 246, 255, 0.95);
        border: 1px solid rgba(13, 91, 215, 0.1);
        color: #0f3976;
        font-size: 13px;
      }
      @media (max-width: 1100px) {
        .shell, .hero-columns { grid-template-columns: 1fr; }
        .hero-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 720px) {
        body { padding: 16px; }
        .hero, .panel { padding: 22px; }
        .hero-strip, form { grid-template-columns: 1fr; }
        .panel-head { flex-direction: column; align-items: flex-start; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <section class="hero">
        <div>
          <span class="kicker">统一入口</span>
          <h1 class="title">机坪牵引作业监管平台</h1>
          <p class="subtitle">围绕机场运控、地服、航司与监管四类主体，统一管理计划释放、执行留痕、风险联动与链上审计闭环。</p>
        </div>
        <div class="hero-strip">
          <div class="hero-tile"><span>主体席位</span><strong>4 类</strong></div>
          <div class="hero-tile"><span>重点案例</span><strong>16 起</strong></div>
          <div class="hero-tile"><span>链上记录</span><strong>104 条</strong></div>
          <div class="hero-tile"><span>隐私策略</span><strong>最小共享</strong></div>
        </div>
        <div class="hero-columns">
          <div class="hero-list">
            <div class="hero-card"><strong>调度协同</strong><span>放行顺序、机位分配、拖行执行与跑道衔接在同一监管链路上完成。</span></div>
            <div class="hero-card"><strong>证据台账</strong><span>轨迹、告警、授权、处置与审计结果会统一回写至可追溯台账。</span></div>
          </div>
          <div class="hero-flow">
            <div class="hero-card"><strong>最小披露</strong><span>敏感坐标与原始字段只能在审批通过后、按范围和时限解锁。</span></div>
            <div class="hero-card"><strong>实时告警联动</strong><span>异常事件会自动推送至相关部门，并同步回写监管台账。</span></div>
          </div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-head">
          <div class="panel-title">
            <strong id="panelHeading">登录</strong>
            <span id="panelSubheading">使用已有账号登录，或新建主体账号。</span>
          </div>
          <div class="segmented">
            <button type="button" class="active" id="loginTab">登录</button>
            <button type="button" id="registerTab">注册</button>
          </div>
        </div>
        <div class="chip-row">
          <span class="chip">授权审批</span>
          <span class="chip">告警联动</span>
          <span class="chip">审计闭环</span>
        </div>
        <div class="error" id="errorBox"></div>
        <form id="authForm">
          <label class="full register-only" style="display:none;"><span>显示名称</span><input id="displayName" placeholder="输入姓名或岗位名称" /></label>
          <label class="full register-only" style="display:none;"><span>所属单位</span><input id="orgName" placeholder="输入单位名称" /></label>
          <label class="full register-only" style="display:none;"><span>账号角色</span><select id="roleSelect"><option value="监管审计">监管审计</option><option value="机场运控">机场运控</option><option value="地服公司">地服公司</option><option value="航空公司">航空公司</option></select></label>
          <label><span>账号</span><input id="username" autocomplete="username" placeholder="输入账号" required /></label>
          <label><span>密码</span><input id="password" type="password" autocomplete="current-password" placeholder="输入密码" required /></label>
          <button class="submit full" id="submitBtn" type="submit">进入平台</button>
        </form>
        <div class="demo">
          <strong>演示账号</strong>
          <div class="demo-row"><code>regulator / block123</code><code>airport_ops / block123</code></div>
          <div class="demo-row"><code>ground_ops / block123</code><code>airline_ops / block123</code></div>
        </div>
      </section>
    </div>
    <script>
      const SESSION_KEY = "apron-platform-session";
      const form = document.getElementById("authForm");
      const loginTab = document.getElementById("loginTab");
      const registerTab = document.getElementById("registerTab");
      const registerFields = Array.from(document.querySelectorAll(".register-only"));
      const errorBox = document.getElementById("errorBox");
      const submitBtn = document.getElementById("submitBtn");
      const panelHeading = document.getElementById("panelHeading");
      const panelSubheading = document.getElementById("panelSubheading");
      let mode = "login";
      function setMode(nextMode) {
        mode = nextMode;
        const registerMode = mode === "register";
        loginTab.classList.toggle("active", !registerMode);
        registerTab.classList.toggle("active", registerMode);
        registerFields.forEach((item) => { item.style.display = registerMode ? "grid" : "none"; });
        panelHeading.textContent = registerMode ? "注册 Subject Account" : "登录";
        panelSubheading.textContent = registerMode ? "新账号完成注册后会进入对应主体工作面。" : "使用已有账号登录，或新建主体账号。";
        submitBtn.textContent = registerMode ? "创建账号" : "进入平台";
        errorBox.style.display = "none";
      }
      function showError(message) {
        errorBox.textContent = message;
        errorBox.style.display = "block";
      }
      loginTab.addEventListener("click", () => setMode("login"));
      registerTab.addEventListener("click", () => setMode("register"));
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        submitBtn.disabled = true;
        submitBtn.textContent = mode === "register" ? "创建中..." : "登录中...";
        errorBox.style.display = "none";
        try {
          const username = document.getElementById("username").value.trim();
          const password = document.getElementById("password").value.trim();
          if (!username || !password) throw new Error("请输入账号和密码。");
          const url = mode === "register" ? "/api/auth/register" : "/api/auth/login";
          const payload = mode === "register"
            ? {
                username,
                password,
                display_name: document.getElementById("displayName").value.trim(),
                role: document.getElementById("roleSelect").value,
                org_name: document.getElementById("orgName").value.trim()
              }
            : { username, account: username, password };
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.detail || "登录失败，请稍后重试。");
          }
          const data = await response.json();
          window.localStorage.setItem(SESSION_KEY, data.session_id);
          window.location.href = data.user.home_path || "/workspace";
        } catch (error) {
          showError(error.message || "请求失败，请稍后重试。");
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = mode === "register" ? "创建账号" : "进入平台";
        }
      });
    </script>
  </body>
</html>
        """
    )

@app.get("/", response_class=HTMLResponse)
def landing_page(request: Request):
    if FRONTEND_INDEX.exists():
        return FileResponse(FRONTEND_INDEX, headers={"Cache-Control": "no-store"})

    _, _, _, platform = _get_state()
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "summary": platform.build_overview(),
        },
    )


@app.get("/api/health")
def healthcheck():
    _start_runtime_loader()
    if not _runtime_ready():
        return {
            "status": getattr(app.state, "runtime_status", "initializing"),
            "timestamp": datetime.utcnow().isoformat(),
            "message": "平台运行态正在初始化，前端将使用演示数据兜底。",
            "error": getattr(app.state, "runtime_error", None),
        }
    loader, matcher, blockchain, platform = _get_state()
    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "datasets": {
            "flights": len(loader.flights),
            "tasks": len(loader.tasks),
            "adsb": len(loader.adsb_data),
            "vehicle_gps": len(loader.vehicle_gps),
        },
        "matches": {
            "flight_task": len(matcher.flight_task_map),
            "flight_adsb": len(matcher.flight_adsb_map),
            "task_vehicle": len(matcher.task_vehicle_map),
        },
        "blockchain": blockchain.get_statistics(),
        "cases": len(platform.case_map),
        "data_assets": len(app.state.data_assets),
        "pending_access_requests": len([item for item in app.state.access_requests if item["status"] == "待审批"]),
    }


@app.get("/api/summary")
def summary():
    _, _, _, platform = _get_state()
    return platform.build_overview()


@app.post("/api/auth/register")
def register_account(payload: 注册Payload):
    _initialize_accounts()
    if _find_account(payload.username):
        raise HTTPException(status_code=409, detail="用户名已存在")
    now = datetime.now().isoformat()
    account = {
        "user_id": f"user-{uuid4().hex[:8]}",
        "username": payload.username,
        "password": payload.password,
        "display_name": payload.display_name,
        "role": payload.role,
        "org_name": payload.org_name,
        "created_at": now,
    }
    app.state.user_accounts.append(account)
    blockchain = getattr(app.state, "blockchain", None)
    if blockchain is not None:
        _write_admin_block(blockchain, "personnel", "account_register", {"username": payload.username, "role": payload.role, "org_name": payload.org_name}, payload.org_name)
    return _create_session(account)


@app.post("/api/auth/login")
def login_account(payload: LoginPayload):
    _initialize_accounts()
    login_name = payload.username or payload.account
    if not login_name:
        raise HTTPException(status_code=422, detail="缺少账号字段")
    account = _find_account(login_name)
    if not account or account["password"] != payload.password:
        raise HTTPException(status_code=401, detail="账号或密码错误")
    return _create_session(account)


@app.get("/api/auth/session/{session_id}")
def get_auth_session(session_id: str):
    _initialize_accounts()
    session = app.state.active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    account = _find_account(session["username"])
    if not account:
        raise HTTPException(status_code=404, detail="账号不存在")
    return {"session_id": session_id, "user": _serialize_user(account)}


@app.post("/api/auth/logout")
def logout_account(payload: LogoutPayload):
    _initialize_accounts()
    app.state.active_sessions.pop(payload.session_id, None)
    return {"ok": True}

@app.get("/api/platform/overview")
def platform_overview():
    _, _, _, platform = _get_state()
    return platform.build_overview()


@app.get("/api/platform/control-center")
def control_center():
    _, _, _, platform = _get_state()
    return _build_control_center(platform)


@app.get("/api/platform/privacy")
def privacy_center():
    _get_state()
    return _build_privacy_snapshot()


@app.get("/api/platform/assets")
def platform_assets():
    _get_state()
    return {"items": app.state.data_assets, "jobs": app.state.import_jobs}


@app.post("/api/platform/assets/import")
def import_asset(payload: AssetImportPayload):
    _, _, blockchain, _ = _get_state()
    asset_id = f"asset-{uuid4().hex[:8]}"
    now = datetime.now().isoformat()
    asset = {
        "asset_id": asset_id,
        "dataset_key": payload.dataset_key,
        "dataset_name": payload.dataset_key,
        "source_name": payload.source_name,
        "owner_org": payload.owner_org,
        "rows": payload.rows_added,
        "privacy_level": payload.privacy_level,
        "share_scope": payload.share_scope,
        "status": "待校验",
        "description": payload.description or "新增导入资产，等待质量校验与隐私分级。",
        "masked_fields": ["自动判定中"],
        "last_sync_at": now,
        "updated_at": now,
    }
    job = {
        "job_id": f"job-{uuid4().hex[:8]}",
        "dataset_key": payload.dataset_key,
        "source_name": payload.source_name,
        "status": "待校验",
        "rows_added": payload.rows_added,
        "operator": payload.owner_org,
        "created_at": now,
        "finished_at": None,
    }
    app.state.data_assets.insert(0, asset)
    app.state.import_jobs.insert(0, job)
    chain_record = _write_admin_block(
        blockchain,
        "schedule",
        "asset_import",
        {"asset_id": asset_id, "dataset_key": payload.dataset_key, "rows_added": payload.rows_added, "privacy_level": payload.privacy_level},
        payload.owner_org,
    )
    return {"item": asset, "job": job, "chain_record": chain_record}


@app.patch("/api/platform/assets/{asset_id}")
def update_asset(asset_id: str, payload: AssetUpdatePayload):
    _, _, blockchain, _ = _get_state()
    for asset in app.state.data_assets:
        if asset["asset_id"] != asset_id:
            continue
        updates = payload.model_dump(exclude_none=True)
        if not updates:
            return {"item": asset, "updated": False}
        asset.update(updates)
        asset["updated_at"] = datetime.now().isoformat()
        chain_record = _write_admin_block(blockchain, "personnel", "asset_update", {"asset_id": asset_id, **updates}, "数据治理中心")
        return {"item": asset, "updated": True, "chain_record": chain_record}
    raise HTTPException(status_code=404, detail=f"Unknown asset: {asset_id}")


@app.delete("/api/platform/assets/{asset_id}")
def delete_asset(asset_id: str):
    _, _, blockchain, _ = _get_state()
    for index, asset in enumerate(app.state.data_assets):
        if asset["asset_id"] != asset_id:
            continue
        removed = app.state.data_assets.pop(index)
        chain_record = _write_admin_block(blockchain, "regulation", "asset_delete", {"asset_id": asset_id, "dataset_key": removed["dataset_key"]}, "监管审计节点")
        return {"removed": removed, "chain_record": chain_record}
    raise HTTPException(status_code=404, detail=f"Unknown asset: {asset_id}")


@app.get("/api/platform/ledger")
def platform_ledger():
    _get_state()
    return {"items": app.state.ledger_records}


@app.post("/api/platform/ledger")
def create_ledger_record(payload: LedgerRecordPayload):
    _, _, blockchain, _ = _get_state()
    now = datetime.now().isoformat()
    record = {
        "ledger_id": f"ledger-{uuid4().hex[:8]}",
        "case_id": payload.case_id,
        "flight_identity": payload.flight_identity,
        "subject_type": payload.subject_type,
        "owner_org": payload.owner_org,
        "privacy_level": payload.privacy_level,
        "status": payload.status,
        "remark": payload.remark or "",
        "updated_at": now,
    }
    app.state.ledger_records.insert(0, record)
    chain_record = _write_admin_block(blockchain, "regulation", "ledger_create", record, payload.owner_org)
    return {"item": record, "chain_record": chain_record}


@app.patch("/api/platform/ledger/{ledger_id}")
def update_ledger_record(ledger_id: str, payload: LedgerRecordUpdatePayload):
    _, _, blockchain, _ = _get_state()
    for record in app.state.ledger_records:
        if record["ledger_id"] != ledger_id:
            continue
        updates = payload.model_dump(exclude_none=True)
        if not updates:
            return {"item": record, "updated": False}
        record.update(updates)
        record["updated_at"] = datetime.now().isoformat()
        chain_record = _write_admin_block(blockchain, "regulation", "ledger_update", {"ledger_id": ledger_id, **updates}, "监管审计节点")
        return {"item": record, "updated": True, "chain_record": chain_record}
    raise HTTPException(status_code=404, detail=f"Unknown ledger record: {ledger_id}")


@app.delete("/api/platform/ledger/{ledger_id}")
def delete_ledger_record(ledger_id: str):
    _, _, blockchain, _ = _get_state()
    for index, record in enumerate(app.state.ledger_records):
        if record["ledger_id"] != ledger_id:
            continue
        removed = app.state.ledger_records.pop(index)
        chain_record = _write_admin_block(blockchain, "regulation", "ledger_delete", {"ledger_id": ledger_id, "case_id": removed["case_id"]}, "监管审计节点")
        return {"removed": removed, "chain_record": chain_record}
    raise HTTPException(status_code=404, detail=f"Unknown ledger record: {ledger_id}")


@app.post("/api/platform/privacy/access-requests")
def create_access_request(payload: AccessRequestPayload):
    _, _, blockchain, _ = _get_state()
    now = datetime.now().isoformat()
    request_record = {
        "request_id": f"req-{uuid4().hex[:8]}",
        "dataset_key": payload.dataset_key,
        "role": payload.role,
        "requester_org": payload.requester_org,
        "purpose": payload.purpose,
        "scope": payload.scope,
        "status": "待审批",
        "reviewer": None,
        "created_at": now,
        "reviewed_at": None,
        "note": None,
    }
    app.state.access_requests.insert(0, request_record)
    chain_record = _write_admin_block(blockchain, "regulation", "access_request", request_record, payload.requester_org)
    return {"item": request_record, "chain_record": chain_record}


@app.patch("/api/platform/privacy/access-requests/{request_id}")
def decide_access_request(request_id: str, payload: AccessDecisionPayload):
    _, _, blockchain, _ = _get_state()
    decision_map = {"approve": "已批准", "reject": "已驳回"}
    if payload.decision not in decision_map:
        raise HTTPException(status_code=400, detail="decision must be approve or reject")
    for request_record in app.state.access_requests:
        if request_record["request_id"] != request_id:
            continue
        request_record["status"] = decision_map[payload.decision]
        request_record["reviewer"] = payload.reviewer
        request_record["reviewed_at"] = datetime.now().isoformat()
        request_record["note"] = payload.note or ""
        chain_record = _write_admin_block(
            blockchain,
            "regulation",
            "access_decision",
            {"request_id": request_id, "decision": request_record["status"], "dataset_key": request_record["dataset_key"], "scope": request_record["scope"]},
            payload.reviewer,
        )
        return {"item": request_record, "chain_record": chain_record}
    raise HTTPException(status_code=404, detail=f"Unknown access request: {request_id}")


@app.get("/api/platform/trace/{case_id}")
def platform_trace(case_id: str):
    _, _, _, platform = _get_state()
    try:
        return platform.get_trace(case_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown case: {case_id}") from exc


@app.get("/api/platform/trace")
def default_trace():
    _, _, _, platform = _get_state()
    try:
        return platform.get_trace()
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="No trace case available") from exc


def _route_departments_for_violations(violations: List[Dict[str, object]]) -> List[str]:
    departments = ["机场运控中心", "监管审计节点"]
    severity_pool = {str(item.get("severity", "")) for item in violations}
    if "critical" in severity_pool or "high" in severity_pool:
        departments.extend(["地服保障中心", "塔台协同席位"])
    if any(str(item.get("rule", "")) == "min_distance" for item in violations):
        departments.append("机坪安全监察")
    if any(str(item.get("rule", "")) == "max_speed" for item in violations):
        departments.append("车辆运行管理")
    return sorted(set(departments))

@app.get("/api/platform/alerts")
def platform_alerts(limit: int = Query(8, ge=1, le=50)):
    _, _, blockchain, platform = _get_state()
    case_alerts = platform.list_alerts(limit=limit * 2)
    live_alerts = []
    for index, alert in enumerate(blockchain.list_alerts(limit=limit)):
        live_alerts.append(
            {
                "case_id": f"contract-live-{index}",
                "flight_identity": "实时合约流",
                "vehicle_id": "合约监测",
                "time": alert.get("timestamp") or alert.get("reported_at") or datetime.now().isoformat(),
                "severity": alert.get("severity", "high"),
                "title": alert.get("violation") or alert.get("rule") or "智能合约触发告警",
                "detail": alert.get("violation") or "实时策略命中，已推送责任部门。",
            }
        )
    merged = sorted(case_alerts + live_alerts, key=lambda item: item["time"], reverse=True)
    return {"items": merged[:limit]}


@app.get("/api/platform/governance")
def platform_governance():
    _, _, _, platform = _get_state()
    governance = platform.build_governance()
    governance["privacy"] = _build_privacy_snapshot()
    governance["data_assets"] = app.state.data_assets
    governance["import_jobs"] = app.state.import_jobs
    governance["ledger_records"] = app.state.ledger_records
    return governance


@app.get("/api/datasets/{dataset_name}")
def dataset_preview(
    dataset_name: str,
    limit: int = Query(50, ge=5, le=500),
    offset: int = Query(0, ge=0),
    keyword: Optional[str] = Query(None),
    role: str = Query("访客"),
    view_mode: str = Query("masked"),
):
    loader, _, _, _ = _get_state()
    datasets = {
        "clean_main": loader.flights,
        "clean_task_info": loader.tasks,
        "adsb_pvg_merged": loader.adsb_data,
        "vehicle_gps_towing_merged": loader.vehicle_gps,
    }
    normalized_name = dataset_name.lower()
    if normalized_name not in datasets:
        raise HTTPException(status_code=404, detail=f"Unknown dataset: {dataset_name}")

    records = datasets[normalized_name]
    df = pd.DataFrame(_serialize_records(records))
    df = _filter_keyword(df, keyword)
    subset = df.iloc[offset : offset + limit]
    authorized = view_mode == "raw" and _is_raw_authorized(normalized_name, role)
    items = subset.to_dict(orient="records")
    if not authorized:
        items = [_mask_record(item) for item in items]
    return {
        "total": len(df),
        "items": items,
        "available": DATASET_KEYS,
        "authorized": authorized,
        "view_mode": "raw" if authorized else "masked",
    }


@app.get("/api/trajectories/flight/{fuuid}")
def get_flight_trajectory(fuuid: str):
    _, matcher, _, _ = _get_state()
    records = matcher.flight_adsb_map.get(fuuid)
    if not records:
        raise HTTPException(status_code=404, detail="No ADS-B points found for this flight.")
    return {"flight": fuuid, "points": _serialize_records(records)}


@app.get("/api/trajectories/vehicle/{vehicle_id}")
def get_vehicle_trajectory(vehicle_id: str):
    loader, _, _, _ = _get_state()
    points = [item for item in loader.vehicle_gps if item.VEHICLENO == vehicle_id]
    if not points:
        raise HTTPException(status_code=404, detail="No GPS points found for this vehicle.")
    return {"vehicle": vehicle_id, "points": _serialize_records(points)}


@app.post("/api/contracts/check")
def check_contract(payload: CompliancePayload):
    _, _, blockchain, _ = _get_state()
    result = blockchain.check_compliance("towing_safety", payload.model_dump())
    violations = result.get("violations", []) if isinstance(result, dict) else []
    notified_departments = _route_departments_for_violations(violations)
    return {
        **result,
        "scenario": "牵引作业实时联动演练",
        "notified_departments": notified_departments,
        "response_sla_min": 2 if violations else 0,
        "chain_channel": "risk",
        "chain_written": bool(violations),
        "recommended_action": "立即通知责任主体并冻结异常案例" if violations else "维持监测并继续写入执行留痕",
    }


@app.get("/api/blockchain/stats")
def blockchain_stats():
    _, _, blockchain, _ = _get_state()
    return blockchain.get_statistics()












@app.get("/{full_path:path}", response_class=HTMLResponse)
def frontend_fallback(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    if FRONTEND_INDEX.exists():
        return FileResponse(FRONTEND_INDEX, headers={"Cache-Control": "no-store"})
    raise HTTPException(status_code=404, detail="Frontend bundle not found")






