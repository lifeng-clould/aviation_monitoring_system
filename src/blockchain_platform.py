from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from hashlib import sha256
from typing import Any, Dict, List, Optional

import pandas as pd


@dataclass
class Block:
    index: int
    timestamp: str
    data: Dict[str, Any]
    previous_hash: str
    hash: str


class DataChannel:
    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description
        self.blocks: List[Block] = []
        self._create_genesis_block()

    def _create_genesis_block(self) -> None:
        self.blocks.append(
            Block(
                index=0,
                timestamp=datetime.now().isoformat(),
                data={"type": "genesis", "channel": self.name},
                previous_hash="0",
                hash="",
            )
        )
        self.blocks[0].hash = self._calculate_hash(self.blocks[0])

    def _calculate_hash(self, block: Block) -> str:
        payload = f"{block.index}|{block.timestamp}|{block.data}|{block.previous_hash}"
        return sha256(payload.encode("utf-8")).hexdigest()

    def add_data(self, data: Dict[str, Any]) -> Block:
        block = Block(
            index=len(self.blocks),
            timestamp=datetime.now().isoformat(),
            data=data,
            previous_hash=self.blocks[-1].hash,
            hash="",
        )
        block.hash = self._calculate_hash(block)
        self.blocks.append(block)
        return block

    def verify_integrity(self) -> bool:
        for index in range(1, len(self.blocks)):
            current = self.blocks[index]
            previous = self.blocks[index - 1]
            if current.previous_hash != previous.hash:
                return False
            if self._calculate_hash(current) != current.hash:
                return False
        return True

    def to_dataframe(self) -> pd.DataFrame:
        return pd.DataFrame(
            {
                "index": block.index,
                "timestamp": block.timestamp,
                "data": block.data,
                "previous_hash": block.previous_hash,
                "hash": block.hash,
            }
            for block in self.blocks
        )


class SmartContract:
    def __init__(self, name: str, rules: Dict[str, Any]):
        self.name = name
        self.rules = rules
        self.violations: List[Dict[str, Any]] = []

    def check_compliance(self, data: Dict[str, Any]) -> Dict[str, Any]:
        violations: List[Dict[str, Any]] = []

        speed = data.get("speed")
        if isinstance(speed, (int, float)) and speed > self.rules.get("max_speed", float("inf")):
            violations.append(
                {
                    "rule": "max_speed",
                    "violation": f"速度 {speed} km/h 超过阈值 {self.rules['max_speed']} km/h",
                    "severity": "high",
                    "timestamp": datetime.now().isoformat(),
                }
            )

        distance = data.get("distance_to_aircraft")
        if isinstance(distance, (int, float)) and distance < self.rules.get("min_distance", 0):
            violations.append(
                {
                    "rule": "min_distance",
                    "violation": f"机身距离 {distance} m 低于阈值 {self.rules['min_distance']} m",
                    "severity": "critical",
                    "timestamp": datetime.now().isoformat(),
                }
            )

        brake_tests = data.get("brake_test_count")
        if isinstance(brake_tests, int) and brake_tests < self.rules.get("required_brake_tests", 0):
            violations.append(
                {
                    "rule": "required_brake_tests",
                    "violation": f"制动测试 {brake_tests} 次，低于要求 {self.rules['required_brake_tests']} 次",
                    "severity": "medium",
                    "timestamp": datetime.now().isoformat(),
                }
            )

        result = {
            "compliant": not violations,
            "violations": violations,
            "checked_at": datetime.now().isoformat(),
        }
        if violations:
            self.violations.append({"data": data, "violations": violations, "checked_at": result["checked_at"]})
        return result


@dataclass
class Node:
    node_id: str
    node_type: str
    organization: str


class BlockchainPlatform:
    def __init__(self):
        self.channels: Dict[str, DataChannel] = {
            "vehicle": DataChannel("vehicle", "车辆执行证据通道"),
            "personnel": DataChannel("personnel", "责任人员与资源通道"),
            "schedule": DataChannel("schedule", "计划编排通道"),
            "regulation": DataChannel("regulation", "监管审计归档通道"),
            "flight_info": DataChannel("flight_info", "航班状态存证通道"),
            "risk": DataChannel("risk", "智能风控告警通道"),
        }
        self.nodes: List[Node] = [
            Node("node_1", "地服公司", "上海吉祥航空地服"),
            Node("node_2", "航空公司", "中国东方航空"),
            Node("node_3", "机场运控", "上海浦东国际机场"),
            Node("node_4", "监管审计", "民航监管节点"),
        ]
        self.contracts: Dict[str, SmartContract] = {
            "towing_safety": SmartContract(
                "牵引作业安全合约",
                {"max_speed": 3, "min_distance": 5, "required_brake_tests": 2},
            )
        }
        self.alerts: List[Dict[str, Any]] = []
        print("Blockchain platform initialized")

    def upload_data(self, channel_name: str, data: Dict[str, Any], node: Optional[Node] = None) -> Block:
        if channel_name not in self.channels:
            raise ValueError(f"Unknown channel: {channel_name}")

        payload = dict(data)
        payload["_uploaded_at"] = datetime.now().isoformat()
        if node:
            payload["_uploaded_by"] = node.node_id
            payload["_organization"] = node.organization
        block = self.channels[channel_name].add_data(payload)
        return block

    def _get_regulator_node(self) -> Optional[Node]:
        for node in self.nodes:
            if "监管" in node.node_type or "监管" in node.organization or "审计" in node.node_type:
                return node
        return self.nodes[-1] if self.nodes else None

    def check_compliance(self, contract_name: str, data: Dict[str, Any]) -> Dict[str, Any]:
        if contract_name not in self.contracts:
            return {"error": f"Unknown contract: {contract_name}"}

        contract = self.contracts[contract_name]
        result = contract.check_compliance(data)
        if not result["compliant"]:
            payload = {
                "contract": contract_name,
                "violations": result["violations"],
                "sample_data": data,
                "reported_at": datetime.now().isoformat(),
            }
            self.upload_data("risk", payload, self._get_regulator_node())
            self.alerts.extend(result["violations"])
        return result

    def verify_all_channels(self) -> Dict[str, bool]:
        return {name: channel.verify_integrity() for name, channel in self.channels.items()}

    def get_statistics(self) -> Dict[str, Any]:
        return {
            "total_blocks": sum(len(channel.blocks) for channel in self.channels.values()),
            "blocks_per_channel": {name: len(channel.blocks) for name, channel in self.channels.items()},
            "total_violations": sum(len(contract.violations) for contract in self.contracts.values()),
            "violations_per_contract": {name: len(contract.violations) for name, contract in self.contracts.items()},
            "alerts_cached": len(self.alerts),
        }

    def export_channel_df(self, channel_name: str) -> pd.DataFrame:
        if channel_name not in self.channels:
            raise ValueError(f"Unknown channel: {channel_name}")
        return self.channels[channel_name].to_dataframe()

    def list_alerts(self, limit: int = 100) -> List[Dict[str, Any]]:
        return self.alerts[-limit:]
