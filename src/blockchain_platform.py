
# =====================================================================
# src/blockchain_platform.py
# 完整版：区块链平台仿真与合约检测工具
# =====================================================================

from datetime import datetime
from typing import List, Dict, Optional, Any
import hashlib
import json
import pandas as pd
import math

# -----------------------------------------------------------------------------
# 基础数据结构：Block / DataChannel / SmartContract / Node
# -----------------------------------------------------------------------------

class Block:
    """区块类 - 区块链的基本单元（含序列化）"""
    def __init__(self, index: int, timestamp: str, data: Dict[str, Any], previous_hash: str):
        self.index = index
        self.timestamp = timestamp
        self.data = data
        self.previous_hash = previous_hash
        self.hash = self.calculate_hash()

    def calculate_hash(self) -> str:
        """计算区块哈希值（JSON 序列化后 SHA-256）"""
        # 使用 sort_keys 保证确定性
        block_string = json.dumps({
            "index": self.index,
            "timestamp": self.timestamp,
            "data": self.data,
            "previous_hash": self.previous_hash
        }, sort_keys=True, default=str)
        return hashlib.sha256(block_string.encode('utf-8')).hexdigest()

    def to_dict(self) -> Dict[str, Any]:
        """方便导出为 DataFrame / JSON"""
        return {
            "index": self.index,
            "timestamp": self.timestamp,
            "data": self.data,
            "previous_hash": self.previous_hash,
            "hash": self.hash
        }


class DataChannel:
    """数据通道类 - 存储区块，支持校验与导出"""
    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description
        self.blocks: List[Block] = []
        self._create_genesis_block()

    def _create_genesis_block(self):
        """创建创世区块"""
        genesis = Block(
            index=0,
            timestamp=datetime.now().isoformat(),
            data={"type": "genesis", "channel": self.name},
            previous_hash="0"
        )
        self.blocks.append(genesis)

    def add_data(self, data: Dict[str, Any]) -> Block:
        """添加数据到通道（生成新区块）"""
        index = len(self.blocks)
        timestamp = datetime.now().isoformat()
        previous_hash = self.blocks[-1].hash if self.blocks else "0"
        new_block = Block(index=index, timestamp=timestamp, data=data, previous_hash=previous_hash)
        self.blocks.append(new_block)
        return new_block

    def verify_integrity(self) -> bool:
        """验证通道中每个区块的哈希和前向链路"""
        for i in range(1, len(self.blocks)):
            current = self.blocks[i]
            prev = self.blocks[i - 1]
            # 哈希未被篡改
            if current.hash != current.calculate_hash():
                return False
            # 前向链接一致
            if current.previous_hash != prev.hash:
                return False
        return True

    def to_dataframe(self) -> pd.DataFrame:
        """导出通道区块为 DataFrame"""
        rows = [blk.to_dict() for blk in self.blocks]
        return pd.DataFrame(rows)


class SmartContract:
    """智能合约：基于规则字典进行合规检查并记录违规"""
    def __init__(self, name: str, rules: Dict[str, Any]):
        self.name = name
        self.rules = rules
        self.violations: List[Dict[str, Any]] = []

    def check_compliance(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        对单条数据进行合规检查。
        返回结构包含：
            - compliant: bool
            - violations: list
            - checked_at: iso 时间
        """
        violations = []

        # 规则：速度上限（若提供 speed 字段）
        if 'speed' in data and isinstance(data['speed'], (int, float)):
            max_speed = self.rules.get('max_speed')
            if max_speed is not None and data['speed'] > max_speed:
                violations.append({
                    "rule": "max_speed",
                    "violation": f"速度 {data['speed']} km/h 超过上限 {max_speed} km/h",
                    "severity": "high",
                    "timestamp": datetime.now().isoformat()
                })

        # 规则：最小安全距离（若提供 distance_to_aircraft 字段，单位以 m 为准）
        if 'distance_to_aircraft' in data and isinstance(data['distance_to_aircraft'], (int, float)):
            min_distance = self.rules.get('min_distance')
            if min_distance is not None and data['distance_to_aircraft'] < min_distance:
                violations.append({
                    "rule": "min_distance",
                    "violation": f"距离 {data['distance_to_aircraft']} m 小于安全距离 {min_distance} m",
                    "severity": "critical",
                    "timestamp": datetime.now().isoformat()
                })

        # 规则：刹车测试次数（若提供 brake_test_count）
        if 'brake_test_count' in data and isinstance(data['brake_test_count'], int):
            required = self.rules.get('required_brake_tests')
            if required is not None and data['brake_test_count'] < required:
                violations.append({
                    "rule": "required_brake_tests",
                    "violation": f"刹车测试 {data['brake_test_count']} 次，少于要求 {required} 次",
                    "severity": "medium",
                    "timestamp": datetime.now().isoformat()
                })

        result = {
            "compliant": len(violations) == 0,
            "violations": violations,
            "checked_at": datetime.now().isoformat()
        }

        if violations:
            # 将违规追加到合约的违规记录中（便于统计）
            for v in violations:
                record = {
                    "contract": self.name,
                    "violation": v,
                    "original_data": data,
                    "recorded_at": datetime.now().isoformat()
                }
                self.violations.append(record)

        return result


class Node:
    """区块链节点（联盟链参与方）"""
    def __init__(self, node_id: str, node_type: str, organization: str):
        self.node_id = node_id
        self.node_type = node_type
        self.organization = organization
        self.data_permissions: List[str] = []

    def __repr__(self):
        return f"Node({self.organization}-{self.node_type})"


# -----------------------------------------------------------------------------
# 辅助函数
# -----------------------------------------------------------------------------

def haversine(lat1, lon1, lat2, lon2):
    """
    计算两点之间的大圆距离（单位：米）。
    使用 Haversine 公式。
    """
    R = 6371000  # 地球半径（m）
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


# -----------------------------------------------------------------------------
# 核心：BlockchainPlatform（扩展）
# -----------------------------------------------------------------------------

class BlockchainPlatform:
    """
    区块链监管平台仿真（支持数据上链、合约检测、违规上链与批量检测工具）
    """

    def __init__(self):
        # 初始化通道
        self.channels: Dict[str, DataChannel] = {
            "vehicle": DataChannel("vehicle", "车辆通道：存储车辆实时路线、出库/停车时间等"),
            "personnel": DataChannel("personnel", "人员通道：驾驶员/指挥员身份、资质等"),
            "schedule": DataChannel("schedule", "计划通道：地服排班、航班计划、路线规划等"),
            "regulation": DataChannel("regulation", "法规通道：民航局SID、企业手册等"),
            "flight_info": DataChannel("flight_info", "航班信息通道：实际进/离港时间、停机位等"),
            "risk": DataChannel("risk", "风险信息通道：违规报警、风险事件记录等")
        }

        # 节点（示例）
        self.nodes: List[Node] = [
            Node("node_1", "地服公司", "上海吉祥航空地服"),
            Node("node_2", "航空公司", "中国东方航空"),
            Node("node_3", "机场", "上海浦东国际机场"),
            Node("node_4", "监管局", "华东地区民航管理局")
        ]

        # 智能合约：默认合约（可扩展）
        self.contracts: Dict[str, SmartContract] = {
            "towing_safety": SmartContract("牵引作业安全合约", {
                "max_speed": 3,               # km/h
                "min_distance": 5,            # m
                "required_brake_tests": 2     # 次
            })
        }

        # 保存报警历史（便于快速读取）
        self.alerts: List[Dict[str, Any]] = []

        print("✓ 区块链平台初始化完成")

    # -------------------------------
    # 基本操作：上链 / 合规检测 / 导出
    # -------------------------------

    def upload_data(self, channel_name: str, data: Dict[str, Any], node: Optional[Node] = None) -> Optional[Block]:
        """
        节点上传数据到指定通道（上链）
        node 可选，若提供会写入上传者元信息
        """
        if channel_name not in self.channels:
            raise ValueError(f"通道 {channel_name} 不存在")

        data_with_meta = dict(data)  # shallow copy
        data_with_meta["_uploaded_at"] = datetime.now().isoformat()
        if node:
            data_with_meta["_uploaded_by"] = node.node_id
            data_with_meta["_organization"] = node.organization
        else:
            data_with_meta["_uploaded_by"] = "anonymous"

        block = self.channels[channel_name].add_data(data_with_meta)
        # 方便日志输出
        print(f"[上链] 通道={channel_name} Block#{block.index} 上传者={data_with_meta.get('_uploaded_by')}")
        return block

    def check_compliance(self, contract_name: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        使用指定合约检查单条数据合规性；
        若违规，会把违规记录（summary）上链到 risk 通道，并把违规详情加入 self.alerts。
        """
        if contract_name not in self.contracts:
            return {"error": f"合约 {contract_name} 不存在"}

        contract = self.contracts[contract_name]
        result = contract.check_compliance(data)

        if not result.get("compliant", True):
            # 构造风险数据并上链到 risk 通道（由监管节点上链）
            risk_payload = {
                "contract": contract_name,
                "violations": result["violations"],
                "sample_data": data,
                "reported_at": datetime.now().isoformat()
            }
            # 使用监管节点上链（存在时）
            regulator = self._get_regulator_node()
            self.upload_data("risk", risk_payload, node=regulator)

            # 记录到本地 alert 历史
            for v in result["violations"]:
                alert_record = {
                    "contract": contract_name,
                    "rule": v.get("rule"),
                    "violation": v.get("violation"),
                    "severity": v.get("severity"),
                    "violation_time": v.get("timestamp"),
                    "sample_data": data,
                    "reported_at": datetime.now().isoformat()
                }
                self.alerts.append(alert_record)

            # 打印告警（便于控制台查看）
            self._send_alert(result["violations"])

        return result

    def _get_regulator_node(self) -> Optional[Node]:
        """返回监管节点（优先查 node_type 包含 '监管' 或 organization 包含 '监管'）"""
        for n in self.nodes:
            if "监管" in n.node_type or "监管" in n.organization:
                return n
        # fallback 返回最后一个节点
        return self.nodes[-1] if self.nodes else None

    def _send_alert(self, violations: List[Dict[str, Any]]):
        """简单的告警打印（可以连接消息推送系统）"""
        print("\n" + "="*40)
        print("⚠️ 违规告警触发")
        for v in violations:
            print(f"- 规则: {v.get('rule')}; 违规: {v.get('violation')}; 严重性: {v.get('severity')}; 时间: {v.get('timestamp')}")
        print("="*40 + "\n")

    def verify_all_channels(self) -> Dict[str, bool]:
        """验证所有通道完整性"""
        return {name: ch.verify_integrity() for name, ch in self.channels.items()}

    def get_statistics(self) -> Dict[str, Any]:
        """获取平台统计信息（用于前端展示）"""
        stats = {
            "total_blocks": sum(len(ch.blocks) for ch in self.channels.values()),
            "blocks_per_channel": {name: len(ch.blocks) for name, ch in self.channels.items()},
            "total_violations": sum(len(c.violations) for c in self.contracts.values()),
            "violations_per_contract": {name: len(c.violations) for name, c in self.contracts.items()},
            "alerts_cached": len(self.alerts)
        }
        return stats

    def print_platform_status(self):
        """打印平台状态（友好显示）"""
        stats = self.get_statistics()
        print("\n" + "="*40)
        print("区块链平台状态")
        print(json.dumps(stats, ensure_ascii=False, indent=2))
        print("="*40 + "\n")

    # -------------------------------
    # 批量检测工具（针对车辆 GPS）
    # -------------------------------

    def run_compliance_check_on_gps(
        self,
        vehicle_gps_list: List[Any],
        contract_name: str = "towing_safety",
        distance_threshold_m: Optional[float] = None,
        speed_threshold_kmh: Optional[float] = None,
        max_records: Optional[int] = None
    ) -> pd.DataFrame:
        """
        对一组车辆 GPS 记录批量执行合约检测。
        每条记录应是一个类似对象（含 __dict__）或 dict，并尽可能包含以下字段：
            - SPEED (km/h)
            - LATITUDE, LONGITUDE (度)
            - optionally distance_to_aircraft (m)
            - optionally brake_test_count (int)

        如果没有 distance_to_aircraft，但同时传入了 plane_lat/plane_lon 字段（或 sample_plane_pos 参数），
        则可通过 haversine 计算距离（m）。

        返回值：pandas.DataFrame (每行代表一次违规记录或检测结果)
        """
        if contract_name not in self.contracts:
            raise ValueError(f"合约 {contract_name} 不存在")

        contract = self.contracts[contract_name]
        results = []

        # 控制检测条数（便于前端示例快速运行）
        iterable = vehicle_gps_list[:max_records] if max_records else vehicle_gps_list

        for rec in iterable:
            # 支持 dict 或 对象
            if isinstance(rec, dict):
                record = rec
            elif hasattr(rec, "__dict__"):
                record = rec.__dict__
            else:
                # 尝试转为 dict
                try:
                    record = dict(rec)
                except:
                    continue

            # 基础检测数据提取
            data_for_check = {}
            # speed
            if "SPEED" in record and record["SPEED"] != "":
                try:
                    data_for_check["speed"] = float(record["SPEED"])
                except:
                    pass
            elif "speed" in record:
                try:
                    data_for_check["speed"] = float(record["speed"])
                except:
                    pass

            # distance_to_aircraft 优先使用原字段
            if "distance_to_aircraft" in record:
                try:
                    data_for_check["distance_to_aircraft"] = float(record["distance_to_aircraft"])
                except:
                    pass
            # 若无 distance 字段，但有飞机位置（plane_lat, plane_lon）与车辆位置，则估算
            elif "plane_lat" in record and "plane_lon" in record and "LATITUDE" in record and "LONGITUDE" in record:
                try:
                    data_for_check["distance_to_aircraft"] = haversine(
                        float(record.get("LATITUDE")), float(record.get("LONGITUDE")),
                        float(record.get("plane_lat")), float(record.get("plane_lon"))
                    )
                except:
                    pass
            # brake_test_count
            if "brake_test_count" in record:
                try:
                    data_for_check["brake_test_count"] = int(record["brake_test_count"])
                except:
                    pass
            elif "BRAKE_TEST_COUNT" in record:
                try:
                    data_for_check["brake_test_count"] = int(record["BRAKE_TEST_COUNT"])
                except:
                    pass

            # 如果外部指定阈值覆盖合约参数（可选）
            if speed_threshold_kmh is not None:
                data_for_check["__override_speed_threshold"] = float(speed_threshold_kmh)
            if distance_threshold_m is not None:
                data_for_check["__override_distance_threshold"] = float(distance_threshold_m)

            # prepare payload for contract (合约使用 keys: speed, distance_to_aircraft, brake_test_count)
            payload = {}
            if "speed" in data_for_check:
                payload["speed"] = data_for_check["speed"]
            if "distance_to_aircraft" in data_for_check:
                # 合约预期单位为 m（本实现也是 m）
                payload["distance_to_aircraft"] = data_for_check["distance_to_aircraft"]
            if "brake_test_count" in data_for_check:
                payload["brake_test_count"] = data_for_check["brake_test_count"]

            # If we passed override thresholds, temporarily adjust the contract rules
            original_rules = dict(contract.rules)
            modified = False
            try:
                if "__override_speed_threshold" in data_for_check:
                    contract.rules["max_speed"] = data_for_check["__override_speed_threshold"]
                    modified = True
                if "__override_distance_threshold" in data_for_check:
                    contract.rules["min_distance"] = data_for_check["__override_distance_threshold"]
                    modified = True

                # 执行合规检测
                result = contract.check_compliance(payload)
            finally:
                # 恢复原有合约规则
                if modified:
                    contract.rules = original_rules

            # 若违规，把信息上链并记录
            if not result.get("compliant", True):
                # enrich sample meta
                sample_meta = {
                    "vehicle_record": record,
                    "checked_at": datetime.now().isoformat()
                }
                # 上链 risk 通道（监管节点）
                regulator = self._get_regulator_node()
                self.upload_data("risk", {"contract": contract_name, "violations": result["violations"], "sample_meta": sample_meta}, node=regulator)

                # 保存到 alerts
                for v in result["violations"]:
                    alert = {
                        "vehicle_id": record.get("VEHICLENO") or record.get("vehicleno") or record.get("vehicle_no"),
                        "rule": v.get("rule"),
                        "violation": v.get("violation"),
                        "severity": v.get("severity"),
                        "violation_time": v.get("timestamp"),
                        "sample": record,
                        "checked_at": datetime.now().isoformat()
                    }
                    self.alerts.append(alert)
                    results.append(alert)

        # 返回 DataFrame 方便在 Streamlit 中展示
        if results:
            return pd.DataFrame(results)
        else:
            # 若没有发现违规，则返回空 DataFrame（便于前端判断）
            return pd.DataFrame(columns=["vehicle_id", "rule", "violation", "severity", "violation_time", "sample", "checked_at"])

    # -------------------------------
    # 辅助导出 / 查询
    # -------------------------------

    def export_channel_df(self, channel_name: str) -> pd.DataFrame:
        """将指定通道的所有区块导出为 DataFrame（包含创世区块）"""
        if channel_name not in self.channels:
            raise ValueError(f"通道 {channel_name} 不存在")
        return self.channels[channel_name].to_dataframe()

    def list_alerts(self, limit: int = 100) -> List[Dict[str, Any]]:
        """返回历史告警（最近的 N 条）"""
        return self.alerts[-limit:]

# -----------------------------------------------------------------------------
# 文件末尾：若作为脚本直接运行，可作简单演示（可删除）
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    # 简单演示：初始化并模拟一次合约检测
    platform = BlockchainPlatform()
    sample_record = {
        "VEHICLENO": "民航沪2456",
        "LATITUDE": 31.145,
        "LONGITUDE": 121.805,
        "SPEED": 4.2,  # km/h，超过阈值
        "distance_to_aircraft": 3.5,  # m，小于阈值
        "LOCATIONTIME": "2025-09-15 00:12:00"
    }
    df_alerts = platform.run_compliance_check_on_gps([sample_record])
    print(df_alerts.to_json(orient="records", force_ascii=False, indent=2))


