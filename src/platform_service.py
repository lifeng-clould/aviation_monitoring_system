from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import asdict
from datetime import datetime, timedelta
from statistics import mean, median
from typing import Any, Dict, List, Optional, Sequence, Tuple

import pandas as pd

from .blockchain_platform import BlockchainPlatform
from .data_loader import DataLoader
from .data_matcher import DataMatcher
from .models.aircraft_adsb import AircraftADSB
from .models.flight import Flight
from .models.task import Task
from .models.vehicle_gps import VehicleGPS
from .utils.time_utils import parse_datetime

SEVERITY_ORDER = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}


def _safe_float(value: Any) -> Optional[float]:
    try:
        if value in ("", None):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _serialize_record(record: Any) -> Dict[str, Any]:
    if hasattr(record, "__dataclass_fields__"):
        return asdict(record)
    if hasattr(record, "__dict__"):
        return dict(vars(record))
    return dict(record)


def _minutes_between(later: Optional[datetime], earlier: Optional[datetime]) -> Optional[int]:
    if not later or not earlier:
        return None
    return int((later - earlier).total_seconds() / 60)


def _sample_sequence(points: Sequence[Any], limit: int) -> List[Any]:
    if len(points) <= limit:
        return list(points)
    if limit <= 1:
        return [points[0]]
    indices = sorted({round(index * (len(points) - 1) / (limit - 1)) for index in range(limit)})
    return [points[index] for index in indices]


class PlatformService:
    """Aggregate raw datasets into business cases, risk insights, and audit trails."""

    def __init__(self, loader: DataLoader, matcher: DataMatcher, blockchain: BlockchainPlatform, case_limit: int = 16):
        self.loader = loader
        self.matcher = matcher
        self.blockchain = blockchain
        self.case_limit = case_limit
        self.dataset_frames = self._build_dataset_frames()
        self.case_map: Dict[str, Dict[str, Any]] = {}
        self.case_ids: List[str] = []
        self.alert_feed: List[Dict[str, Any]] = []
        self.default_case_id: Optional[str] = None
        self._build_cases()

    def _build_dataset_frames(self) -> Dict[str, pd.DataFrame]:
        return {
            "clean_main": pd.DataFrame(_serialize_record(item) for item in self.loader.flights),
            "clean_task_info": pd.DataFrame(_serialize_record(item) for item in self.loader.tasks),
            "adsb_pvg_merged": pd.DataFrame(_serialize_record(item) for item in self.loader.adsb_data),
            "vehicle_gps_towing_merged": pd.DataFrame(_serialize_record(item) for item in self.loader.vehicle_gps),
        }

    def _build_cases(self) -> None:
        candidate_flights = [flight for flight in self.loader.flights if flight.FUUID in self.matcher.flight_task_map]
        candidate_flights.sort(key=self._flight_priority, reverse=True)
        for flight in candidate_flights[: self.case_limit]:
            case = self._build_case(flight)
            if case:
                self.case_ids.append(flight.FUUID)
                self.case_map[flight.FUUID] = case
        self.alert_feed.sort(key=lambda item: (SEVERITY_ORDER.get(item["severity"], 0), item["time"]), reverse=True)
        self.default_case_id = self.case_ids[0] if self.case_ids else None

    def _flight_priority(self, flight: Flight) -> Tuple[float, int, float]:
        tasks = self.matcher.flight_task_map.get(flight.FUUID, [])
        confidences = []
        for index, task in enumerate(tasks):
            task_key = task.ID or f"{task.FUUID}-{index}"
            metric = self.matcher.task_vehicle_metrics.get(task_key)
            if metric:
                confidences.append(metric.get("confidence_score", 0))
        confidence_score = mean(confidences) if confidences else 0.0
        adsb_points = len(self.matcher.flight_adsb_map.get(flight.FUUID, []))
        anchor = parse_datetime(
            flight.ACTUALOFFBLOCKDATETIME
            or flight.ACTUALONBLOCKDATETIME
            or flight.SCHEDULEDOFFBLOCKDATETIME
            or flight.SCHEDULEDONBLOCKDATETIME
        )
        return (round(confidence_score, 2), adsb_points, anchor.timestamp() if anchor else 0.0)

    def _build_case(self, flight: Flight) -> Optional[Dict[str, Any]]:
        tasks = self.matcher.flight_task_map.get(flight.FUUID, [])
        if not tasks:
            return None

        adsb_points = self.matcher.flight_adsb_map.get(flight.FUUID, [])
        task_vehicle_groups = self._collect_task_vehicle_groups(tasks)
        vehicle_points = self._collect_case_vehicle_points(tasks)
        vehicle_id = self._pick_vehicle_id(vehicle_points)
        association = self._summarize_case_association(task_vehicle_groups, vehicle_points)
        phase_window = self._build_phase_window(flight, adsb_points, vehicle_points, association)
        interaction_samples = self._build_interaction_samples(phase_window["tow_points"], vehicle_points)
        metrics = self._compute_case_metrics(
            flight,
            tasks,
            phase_window["all_points"],
            vehicle_points,
            association,
            interaction_samples,
            phase_window,
        )
        alerts = self._build_case_alerts(flight, metrics, association)
        timeline, block_records = self._write_case_to_chain(flight, tasks, metrics, alerts, vehicle_id, association)

        aircraft_tow_path = self._serialize_aircraft_path(phase_window["tow_points"], limit=140)
        aircraft_departure_path = self._serialize_aircraft_path(phase_window["departure_points"], limit=180)
        aircraft_path = aircraft_tow_path + [point for point in aircraft_departure_path if point not in aircraft_tow_path]
        vehicle_path = self._serialize_vehicle_path(vehicle_points, limit=180)

        summary_parts = [
            f"{flight.FLIGHTIDENTITY} \u5df2\u5b8c\u6210\u62d6\u884c\u7247\u6bb5\u91cd\u5efa",
            "\u7275\u5f15\u8f66\u4ec5\u4fdd\u7559\u4e0e\u98de\u673a\u7a33\u5b9a\u4ea4\u4e92\u7684\u62d6\u884c\u9636\u6bb5",
            "\u98de\u673a\u5728\u91ca\u653e\u540e\u7ee7\u7eed\u6cbf\u6ed1\u884c\u8def\u7ebf\u8fdb\u5165\u8dd1\u9053\u5e76\u5b8c\u6210\u8d77\u98de\u8ddf\u8e2a",
            f"\u94fe\u4e0a\u5171\u5f52\u6863 {len(block_records)} \u6761\u5173\u952e\u8bc1\u636e",
        ]

        case = {
            "case_id": flight.FUUID,
            "flight_identity": flight.FLIGHTIDENTITY,
            "direction": "\u8fdb\u6e2f" if flight.is_arrival() else "\u79bb\u6e2f",
            "stand_id": flight.STANDID or "\u5f85\u8865\u5f55",
            "vehicle_id": vehicle_id or "\u5f85\u8865\u5f55",
            "task_count": len(tasks),
            "status": metrics["status"],
            "risk_level": metrics["risk_level"],
            "risk_score": metrics["risk_score"],
            "summary": "\u3002".join(summary_parts) + "\u3002",
            "metrics": metrics,
            "timeline": timeline,
            "blockchain_records": block_records,
            "alerts": alerts,
            "association": association,
            "legend": {
                "aircraft": {"label": "\u98de\u673a", "color": "#0d5bd7"},
                "vehicle": {"label": "\u7275\u5f15\u8f66", "color": "#f59a52"},
            },
            "phases": {
                "tow_start": association.get("operation_start"),
                "tow_release": association.get("release_time") or association.get("operation_end"),
                "runway_entry": phase_window["runway_entry"],
                "takeoff": phase_window["takeoff"],
                "track_end": phase_window["track_end"],
            },
            "evidence": {
                "adsb_points": len(phase_window["all_points"]),
                "vehicle_points": len(vehicle_points),
                "task_vehicle_groups": task_vehicle_groups,
                "aircraft_path": aircraft_path,
                "aircraft_tow_path": aircraft_tow_path,
                "aircraft_departure_path": aircraft_departure_path,
                "vehicle_path": vehicle_path,
                "interaction_samples": interaction_samples,
            },
        }

        for alert in alerts:
            self.alert_feed.append(
                {
                    "case_id": flight.FUUID,
                    "flight_identity": flight.FLIGHTIDENTITY,
                    "vehicle_id": vehicle_id or "\u5f85\u8865\u5f55",
                    "time": alert["time"],
                    "severity": alert["severity"],
                    "title": alert["title"],
                    "detail": alert["detail"],
                }
            )
        return case

    def _collect_case_vehicle_points(self, tasks: List[Task]) -> List[VehicleGPS]:
        points: List[VehicleGPS] = []
        for index, task in enumerate(tasks):
            task_key = task.ID or f"{task.FUUID}-{index}"
            points.extend(self.matcher.task_vehicle_map.get(task_key, []))
        ordered = [point for point in points if point.get_timestamp()]
        ordered.sort(key=lambda item: item.get_timestamp() or datetime.min)
        return ordered

    def _collect_task_vehicle_groups(self, tasks: List[Task]) -> List[Dict[str, Any]]:
        groups: List[Dict[str, Any]] = []
        for index, task in enumerate(tasks):
            task_key = task.ID or f"{task.FUUID}-{index}"
            points = self.matcher.task_vehicle_map.get(task_key, [])
            match = self.matcher.task_vehicle_metrics.get(task_key, {})
            groups.append(
                {
                    "task_id": task_key,
                    "task_name": task.TASKTYPENAME or "\u62d6\u8f66\u4efb\u52a1",
                    "begin_time": match.get("operation_start") or task.TASKACTUALBEGINDATETIME or task.TASKSCHEDULEDBEGINDATETIME or "\u5f85\u8865\u5f55",
                    "end_time": match.get("operation_end") or task.TASKACTUALENDDATETIME or task.TASKSCHEDULEDENDDATETIME or "\u5f85\u8865\u5f55",
                    "vehicle_id": match.get("vehicle_id", "\u5f85\u8865\u5f55"),
                    "point_count": len(points),
                    "match": match,
                }
            )
        return groups

    def _summarize_case_association(self, groups: List[Dict[str, Any]], vehicle_points: List[VehicleGPS]) -> Dict[str, Any]:
        matches = [group.get("match", {}) for group in groups if group.get("match")]
        confidence_values = [match.get("confidence_score", 0) for match in matches]
        distance_values = [match.get("min_distance_m") for match in matches if match.get("min_distance_m") is not None]
        interaction_values = [match.get("interaction_ratio", 0) for match in matches]
        candidate_counts = [match.get("candidate_vehicle_count", 0) for match in matches]
        operation_starts = [value for value in (parse_datetime(match.get("operation_start")) for match in matches if match.get("operation_start")) if value]
        operation_ends = [value for value in (parse_datetime(match.get("operation_end")) for match in matches if match.get("operation_end")) if value]
        release_times = [value for value in (parse_datetime(match.get("release_time")) for match in matches if match.get("release_time")) if value]

        confidence_score = round(mean(confidence_values), 1) if confidence_values else 0.0
        confidence_label = "\u5f3a\u5173\u8054" if confidence_score >= 75 else "\u4e2d\u5173\u8054" if confidence_score >= 55 else "\u5f31\u5173\u8054"
        min_distance = round(min(distance_values), 1) if distance_values else None
        interaction_ratio = round(mean(interaction_values), 1) if interaction_values else 0.0
        if min_distance is not None and min_distance <= 120 and interaction_ratio >= 8:
            validation_label = "\u7a7a\u95f4\u4ea4\u4e92\u5df2\u6821\u9a8c"
        elif min_distance is not None and min_distance <= 220:
            validation_label = "\u9700\u8981\u4eba\u5de5\u590d\u6838"
        else:
            validation_label = "\u5173\u8054\u8bc1\u636e\u504f\u5f31"

        deduped: Dict[str, Dict[str, Any]] = {}
        for match in matches:
            for item in match.get("top_candidates", []):
                current = deduped.get(item["vehicle_id"])
                if current is None or item["score"] > current["score"]:
                    deduped[item["vehicle_id"]] = item

        return {
            "vehicle_id": self._pick_vehicle_id(vehicle_points) or "\u5f85\u8865\u5f55",
            "confidence_score": confidence_score,
            "confidence_label": confidence_label,
            "candidate_vehicle_count": max(candidate_counts, default=0),
            "interaction_ratio": interaction_ratio,
            "min_distance_m": min_distance,
            "median_distance_m": round(median(distance_values), 1) if distance_values else None,
            "validation_label": validation_label,
            "operation_start": min(operation_starts).isoformat() if operation_starts else None,
            "operation_end": max(operation_ends).isoformat() if operation_ends else None,
            "release_time": max(release_times).isoformat() if release_times else None,
            "top_candidates": sorted(deduped.values(), key=lambda item: item["score"], reverse=True)[:5],
        }

    def _pick_vehicle_id(self, vehicle_points: List[VehicleGPS]) -> Optional[str]:
        pool = [point.VEHICLENO for point in vehicle_points if point.VEHICLENO]
        if not pool:
            return None
        return Counter(pool).most_common(1)[0][0]

    def _build_phase_window(
        self,
        flight: Flight,
        adsb_points: List[AircraftADSB],
        vehicle_points: List[VehicleGPS],
        association: Dict[str, Any],
    ) -> Dict[str, Any]:
        ordered_adsb = [point for point in adsb_points if point.get_timestamp()]
        ordered_adsb.sort(key=lambda item: item.get_timestamp() or datetime.min)
        tow_start = parse_datetime(association.get("operation_start"))
        tow_release = parse_datetime(association.get("release_time") or association.get("operation_end"))
        if not tow_start and vehicle_points:
            tow_start = vehicle_points[0].get_timestamp()
        if not tow_release and vehicle_points:
            tow_release = vehicle_points[-1].get_timestamp()

        tow_points: List[AircraftADSB] = []
        departure_points: List[AircraftADSB] = []
        if ordered_adsb:
            if tow_start and tow_release:
                tow_points = [
                    point
                    for point in ordered_adsb
                    if (tow_start - timedelta(minutes=1)) <= point.get_timestamp() <= (tow_release + timedelta(minutes=1))
                ]
                departure_points = [point for point in ordered_adsb if point.get_timestamp() and point.get_timestamp() >= tow_release]
            else:
                tow_points = ordered_adsb[:100]
                departure_points = ordered_adsb[100:]

        phase_marks = self._detect_departure_phases(flight, departure_points, tow_release)
        return {
            "tow_points": tow_points,
            "departure_points": departure_points,
            "all_points": ordered_adsb,
            "runway_entry": phase_marks["runway_entry"],
            "takeoff": phase_marks["takeoff"],
            "track_end": ordered_adsb[-1].get_timestamp().isoformat() if ordered_adsb else None,
        }

    def _detect_departure_phases(
        self,
        flight: Flight,
        departure_points: List[AircraftADSB],
        tow_release: Optional[datetime],
    ) -> Dict[str, Optional[str]]:
        runway_entry: Optional[datetime] = None
        takeoff_time = parse_datetime(flight.ACTUALTAKEOFFDATETIME or flight.SCHEDULEDTAKEOFFDATETIME)
        ordered = [point for point in departure_points if point.get_timestamp()]
        ordered.sort(key=lambda item: item.get_timestamp() or datetime.min)
        for point in ordered:
            ts = point.get_timestamp()
            if not ts:
                continue
            if tow_release and ts < tow_release:
                continue
            speed = _safe_float(point.GV) or 0.0
            altitude = _safe_float(point.HE) or 0.0
            if runway_entry is None and (speed >= 45 or altitude >= 8):
                runway_entry = ts
            if takeoff_time is None and (speed >= 140 or altitude >= 30):
                takeoff_time = ts
                break
        return {
            "runway_entry": runway_entry.isoformat() if runway_entry else None,
            "takeoff": takeoff_time.isoformat() if takeoff_time else None,
        }

    def _serialize_aircraft_path(self, points: List[AircraftADSB], limit: int) -> List[Dict[str, Any]]:
        sampled = _sample_sequence(points, limit)
        return [
            {"lon": _safe_float(point.LO), "lat": _safe_float(point.LA), "time": point.TE, "speed": _safe_float(point.GV) or 0}
            for point in sampled
            if _safe_float(point.LO) is not None and _safe_float(point.LA) is not None
        ]

    def _serialize_vehicle_path(self, points: List[VehicleGPS], limit: int) -> List[Dict[str, Any]]:
        sampled = _sample_sequence(points, limit)
        return [
            {
                "lon": _safe_float(point.LONGITUDE),
                "lat": _safe_float(point.LATITUDE),
                "time": point.LOCATIONTIME,
                "speed": _safe_float(point.SPEED) or 0,
                "vehicle_id": point.VEHICLENO,
            }
            for point in sampled
            if _safe_float(point.LONGITUDE) is not None and _safe_float(point.LATITUDE) is not None
        ]

    def _compute_case_metrics(
        self,
        flight: Flight,
        tasks: List[Task],
        adsb_points: List[AircraftADSB],
        vehicle_points: List[VehicleGPS],
        association: Dict[str, Any],
        interaction_samples: List[Dict[str, Any]],
        phase_window: Dict[str, Any],
    ) -> Dict[str, Any]:
        task_end_times = [task.get_actual_end_time() or task.get_actual_begin_time() for task in tasks if task.get_actual_end_time() or task.get_actual_begin_time()]
        task_begin_times = [task.get_actual_begin_time() or task.get_actual_end_time() for task in tasks if task.get_actual_begin_time() or task.get_actual_end_time()]
        actual_anchor = parse_datetime(flight.ACTUALOFFBLOCKDATETIME or flight.ACTUALONBLOCKDATETIME or flight.ACTUALTAKEOFFDATETIME)
        scheduled_anchor = parse_datetime(flight.SCHEDULEDOFFBLOCKDATETIME or flight.SCHEDULEDONBLOCKDATETIME or flight.SCHEDULEDTAKEOFFDATETIME)
        delay_minutes = _minutes_between(actual_anchor, scheduled_anchor)

        speeds = [speed for speed in (_safe_float(item.SPEED) for item in vehicle_points) if speed is not None]
        speed_peak = round(max(speeds), 2) if speeds else 0.0
        speed_mean = round(mean(speeds), 2) if speeds else 0.0
        overspeed_points = sum(1 for speed in speeds if speed > 3)
        distances = [item["distance_m"] for item in interaction_samples if item.get("distance_m") is not None]

        critical_missing = 0
        for task in tasks:
            for value in (task.TASKACTUALBEGINDATETIME, task.TASKACTUALENDDATETIME, task.RESOURCEID, task.TASKER):
                if value in (None, ""):
                    critical_missing += 1

        adsb_coverage = len(adsb_points)
        vehicle_coverage = len(vehicle_points)
        tow_start = parse_datetime(association.get("operation_start"))
        tow_release = parse_datetime(association.get("release_time") or association.get("operation_end"))
        takeoff_time = parse_datetime(phase_window.get("takeoff"))
        tow_duration = round((tow_release - tow_start).total_seconds() / 60, 1) if tow_start and tow_release else 0.0

        taxi_after_release = 0.0
        if tow_release and phase_window["all_points"]:
            track_end = phase_window["all_points"][-1].get_timestamp()
            if track_end:
                taxi_after_release = round((track_end - tow_release).total_seconds() / 60, 1)

        release_to_takeoff = 0.0
        if tow_release and takeoff_time and takeoff_time >= tow_release:
            release_to_takeoff = round((takeoff_time - tow_release).total_seconds() / 60, 1)

        evidence_score = max(
            0,
            min(
                100,
                22 + adsb_coverage // 4 + vehicle_coverage // 4 + len(interaction_samples) // 2 + association["confidence_score"] * 0.35 - critical_missing,
            ),
        )

        risk_score = 14
        if delay_minutes and delay_minutes > 20:
            risk_score += 18
        if speed_peak > 20:
            risk_score += 28
        elif speed_peak > 8:
            risk_score += 16
        if critical_missing >= len(tasks) * 2:
            risk_score += 16
        if adsb_coverage < 10:
            risk_score += 12
        if vehicle_coverage < 20:
            risk_score += 12
        if association["confidence_score"] < 55:
            risk_score += 18
        if association["min_distance_m"] and association["min_distance_m"] > 180:
            risk_score += 12
        risk_score = min(risk_score, 95)

        risk_level = "\u9ad8" if risk_score >= 70 else "\u4e2d" if risk_score >= 45 else "\u4f4e"
        status = "\u9ad8\u98ce\u9669\u5f85\u590d\u6838" if risk_level == "\u9ad8" else "\u94fe\u4e0a\u590d\u6838\u4e2d" if risk_level == "\u4e2d" else "\u95ed\u73af\u5b8c\u6210"
        return {
            "delay_minutes": delay_minutes if delay_minutes is not None else 0,
            "speed_peak": speed_peak,
            "speed_mean": speed_mean,
            "overspeed_points": overspeed_points,
            "adsb_coverage": adsb_coverage,
            "vehicle_coverage": vehicle_coverage,
            "evidence_score": round(evidence_score, 1),
            "association_confidence": association["confidence_score"],
            "interaction_ratio": association["interaction_ratio"],
            "min_distance_m": association["min_distance_m"],
            "median_distance_m": round(median(distances), 1) if distances else None,
            "paired_samples": len(interaction_samples),
            "tow_duration_min": tow_duration,
            "taxi_after_release_min": taxi_after_release,
            "release_to_takeoff_min": release_to_takeoff,
            "missing_fields": critical_missing,
            "task_begin": task_begin_times[0].isoformat() if task_begin_times else association.get("operation_start"),
            "task_end": task_end_times[-1].isoformat() if task_end_times else association.get("operation_end"),
            "risk_score": risk_score,
            "risk_level": risk_level,
            "status": status,
        }

    def _build_case_alerts(self, flight: Flight, metrics: Dict[str, Any], association: Dict[str, Any]) -> List[Dict[str, Any]]:
        alerts: List[Dict[str, Any]] = []
        reference_time = metrics["task_end"] or metrics["task_begin"] or datetime.now().isoformat()
        if association["confidence_score"] < 55:
            alerts.append({
                "severity": "critical",
                "title": "\u4efb\u52a1\u4e0e\u8f66\u8f86\u5173\u8054\u504f\u5f31",
                "detail": f"\u5f53\u524d\u6848\u4f8b\u5173\u8054\u53ef\u4fe1\u5ea6\u4ec5 {association['confidence_score']} \u5206\uff0c\u5efa\u8bae\u4eba\u5de5\u6838\u5bf9\u4efb\u52a1\u3001\u8f66\u8f86\u548c\u89c6\u9891\u8bc1\u636e\u3002",
                "time": reference_time,
            })
        if association["min_distance_m"] and association["min_distance_m"] > 180:
            alerts.append({
                "severity": "high",
                "title": "\u7275\u5f15\u8f66\u4e0e\u98de\u673a\u4ea4\u4e92\u4e0d\u8db3",
                "detail": f"\u6700\u8fd1\u7a7a\u95f4\u8ddd\u79bb\u4e3a {association['min_distance_m']} m\uff0c\u672a\u5f62\u6210\u7a33\u5b9a\u7684\u62d6\u884c\u5173\u7cfb\u3002",
                "time": reference_time,
            })
        if metrics["speed_peak"] > 20:
            alerts.append({
                "severity": "critical",
                "title": "\u7275\u5f15\u901f\u5ea6\u5f02\u5e38",
                "detail": f"\u4efb\u52a1\u5173\u8054\u8f66\u8f86\u5cf0\u503c\u901f\u5ea6 {metrics['speed_peak']} km/h\uff0c\u8d85\u51fa\u7275\u5f15\u5b89\u5168\u9608\u503c\u3002",
                "time": reference_time,
            })
        elif metrics["speed_peak"] > 8:
            alerts.append({
                "severity": "high",
                "title": "\u7275\u5f15\u901f\u5ea6\u504f\u9ad8",
                "detail": f"\u62d6\u884c\u9636\u6bb5\u51fa\u73b0 {metrics['speed_peak']} km/h \u7684\u5f02\u5e38\u901f\u5ea6\uff0c\u9700\u7ed3\u5408\u89c6\u9891\u6216\u8bbe\u5907\u65e5\u5fd7\u590d\u6838\u3002",
                "time": reference_time,
            })
        if metrics["missing_fields"] >= 2:
            alerts.append({
                "severity": "medium",
                "title": "\u4f5c\u4e1a\u8981\u7d20\u7f3a\u5931",
                "detail": "\u4efb\u52a1\u6267\u884c\u4eba\u3001\u8d44\u6e90\u7f16\u53f7\u6216\u8d77\u6b62\u65f6\u95f4\u5b58\u5728\u7f3a\u5931\uff0c\u5f71\u54cd\u8d23\u4efb\u95ed\u73af\u4e0e\u8bc1\u636e\u5b8c\u5907\u5ea6\u3002",
                "time": reference_time,
            })
        if metrics["delay_minutes"] > 20:
            alerts.append({
                "severity": "medium",
                "title": "\u4fdd\u969c\u8fc7\u7a0b\u5ef6\u8fdf",
                "detail": f"{flight.FLIGHTIDENTITY} \u7684\u5173\u952e\u8282\u70b9\u8f83\u8ba1\u5212\u504f\u79fb {metrics['delay_minutes']} \u5206\u949f\u3002",
                "time": reference_time,
            })
        if not alerts:
            alerts.append({
                "severity": "info",
                "title": "\u4f5c\u4e1a\u95ed\u73af\u6b63\u5e38",
                "detail": "\u5f53\u524d\u6848\u4f8b\u672a\u53d1\u73b0\u660e\u663e\u5f02\u5e38\uff0c\u94fe\u4e0a\u8bc1\u636e\u5b8c\u6574\u6027\u53ef\u652f\u6301\u4e8b\u540e\u8ffd\u6eaf\u3002",
                "time": reference_time,
            })
        return alerts

    def _write_case_to_chain(self, flight: Flight, tasks: List[Task], metrics: Dict[str, Any], alerts: List[Dict[str, Any]], vehicle_id: Optional[str], association: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        timeline: List[Dict[str, Any]] = []
        blocks: List[Dict[str, Any]] = []
        schedule_payload = {
            "case_id": flight.FUUID,
            "flight_identity": flight.FLIGHTIDENTITY,
            "stand_id": flight.STANDID,
            "scheduled_time": flight.SCHEDULEDOFFBLOCKDATETIME or flight.SCHEDULEDONBLOCKDATETIME or flight.SCHEDULEDTAKEOFFDATETIME,
            "direction": flight.FLIGHTDIRECTION,
        }
        self._append_chain_event(timeline, blocks, "schedule", "\u4efb\u52a1\u7f16\u6392", "A-CDM \u8ba1\u5212\u3001\u673a\u4f4d\u7ea6\u675f\u548c\u6848\u4f8b\u7f16\u53f7\u5199\u5165\u8054\u76df\u94fe\uff0c\u4f5c\u4e3a\u5168\u6d41\u7a0b\u7edf\u4e00\u5e95\u8d26\u3002", schedule_payload, "\u8fd0\u884c\u63a7\u5236\u4e2d\u5fc3", schedule_payload["scheduled_time"])
        self._append_chain_event(timeline, blocks, "flight_info", "\u822a\u73ed\u5c31\u7eea", "\u822a\u73ed\u57fa\u7840\u4fe1\u606f\u3001\u8fdb\u51fa\u6e2f\u72b6\u6001\u4e0e\u673a\u4f4d\u4fe1\u606f\u5b8c\u6210\u56fa\u5316\u3002", {"case_id": flight.FUUID, "flight_identity": flight.FLIGHTIDENTITY, "actual_time": flight.ACTUALOFFBLOCKDATETIME or flight.ACTUALONBLOCKDATETIME, "stand_id": flight.STANDID}, "\u673a\u573a\u8fd0\u63a7\u8282\u70b9", flight.ACTUALOFFBLOCKDATETIME or flight.ACTUALONBLOCKDATETIME)
        self._append_chain_event(timeline, blocks, "personnel", "\u8d44\u6e90\u6d3e\u53d1", "\u7275\u5f15\u8d44\u6e90\u3001\u4f5c\u4e1a\u73ed\u7ec4\u548c\u8d23\u4efb\u5c97\u4f4d\u7ed1\u5b9a\u5230\u540c\u4e00\u6848\u4f8b\u7f16\u53f7\u3002", {"case_id": flight.FUUID, "task_count": len(tasks), "vehicle_id": vehicle_id or "\u5f85\u8865\u5f55", "resource_ids": [task.RESOURCEID or "\u5f85\u8865\u5f55" for task in tasks[:4]]}, "\u5730\u670d\u4fdd\u969c\u8282\u70b9", association.get("operation_start"))
        self._append_chain_event(timeline, blocks, "vehicle", "\u62d6\u884c\u6267\u884c", "\u62d6\u884c\u7247\u6bb5\u3001\u7275\u5f15\u8f66\u901f\u5ea6\u6458\u8981\u548c\u98de\u673a-\u7275\u5f15\u8f66\u4ea4\u4e92\u6307\u6807\u540c\u6b65\u4e0a\u94fe\u3002", {"case_id": flight.FUUID, "vehicle_id": vehicle_id or "\u5f85\u8865\u5f55", "speed_peak": metrics["speed_peak"], "vehicle_coverage": metrics["vehicle_coverage"], "association_confidence": association["confidence_score"], "min_distance_m": association["min_distance_m"], "release_time": association.get("release_time")}, "\u8f66\u8f7d\u7ec8\u7aef\u8282\u70b9", association.get("operation_end"))
        highest_alert = sorted(alerts, key=lambda item: SEVERITY_ORDER.get(item["severity"], 0), reverse=True)[0]
        self._append_chain_event(timeline, blocks, "risk", "\u89c4\u5219\u6821\u9a8c", f"{highest_alert['title']}\uff0c\u98ce\u9669\u7b49\u7ea7 {metrics['risk_level']}\uff0c\u89e6\u53d1\u667a\u80fd\u5408\u7ea6\u590d\u6838\u6d41\u7a0b\u3002", {"case_id": flight.FUUID, "risk_level": metrics["risk_level"], "risk_score": metrics["risk_score"], "alerts": alerts}, "\u667a\u80fd\u5408\u7ea6\u8282\u70b9", highest_alert["time"])
        self._append_chain_event(timeline, blocks, "regulation", "\u5ba1\u8ba1\u5f52\u6863", "\u76d1\u7ba1\u8282\u70b9\u5bf9\u6848\u4f8b\u54c8\u5e0c\u3001\u8bc1\u636e\u8bc4\u5206\u548c\u5904\u7f6e\u72b6\u6001\u8fdb\u884c\u5f52\u6863\uff0c\u652f\u6491\u8d23\u4efb\u8ffd\u8e2a\u4e0e\u7533\u8bc9\u590d\u76d8\u3002", {"case_id": flight.FUUID, "evidence_score": metrics["evidence_score"], "status": metrics["status"], "validation_label": association["validation_label"]}, "\u76d1\u7ba1\u5ba1\u8ba1\u8282\u70b9", datetime.now().isoformat())
        return timeline, blocks

    def _append_chain_event(self, timeline: List[Dict[str, Any]], blocks: List[Dict[str, Any]], channel: str, stage: str, detail: str, payload: Dict[str, Any], actor: str, at_time: Optional[str]) -> None:
        block = self.blockchain.upload_data(channel, payload)
        time_text = at_time or block.timestamp
        timeline.append({"stage": stage, "channel": channel, "time": time_text, "actor": actor, "detail": detail, "hash": block.hash[:16], "status": "\u5df2\u4e0a\u94fe"})
        blocks.append({"channel": channel, "block_index": block.index, "timestamp": block.timestamp, "hash": block.hash, "previous_hash": block.previous_hash, "actor": actor, "payload": payload})

    def _build_interaction_samples(self, tow_points: List[AircraftADSB], vehicle_points: List[VehicleGPS], limit: int = 48, max_gap_seconds: int = 120) -> List[Dict[str, Any]]:
        aircraft_series = []
        for point in tow_points:
            ts = point.get_timestamp()
            lat = _safe_float(point.LA)
            lon = _safe_float(point.LO)
            if ts and lat is not None and lon is not None:
                aircraft_series.append((ts, lat, lon))
        if not aircraft_series:
            return []

        vehicle_series = []
        for point in vehicle_points:
            ts = point.get_timestamp()
            lat = _safe_float(point.LATITUDE)
            lon = _safe_float(point.LONGITUDE)
            if ts and lat is not None and lon is not None:
                vehicle_series.append((ts, lat, lon, _safe_float(point.SPEED) or 0))
        if not vehicle_series:
            return []

        aircraft_series.sort(key=lambda item: item[0])
        aircraft_times = [item[0] for item in aircraft_series]
        stride = max(1, len(vehicle_series) // limit)
        samples: List[Dict[str, Any]] = []
        for ts, lat, lon, speed in vehicle_series[::stride]:
            nearest = self._nearest_aircraft_sample(aircraft_series, aircraft_times, ts)
            if not nearest:
                continue
            aircraft_time, a_lat, a_lon = nearest
            gap_seconds = abs((aircraft_time - ts).total_seconds())
            if gap_seconds > max_gap_seconds:
                continue
            samples.append({"time": ts.isoformat(), "distance_m": round(self._haversine(lat, lon, a_lat, a_lon), 1), "vehicle_speed": round(speed, 2), "time_gap_s": int(gap_seconds)})
        return samples[:limit]

    def _nearest_aircraft_sample(self, aircraft_series: List[Tuple[datetime, float, float]], aircraft_times: List[datetime], target_time: datetime) -> Optional[Tuple[datetime, float, float]]:
        if not aircraft_series:
            return None
        low = 0
        high = len(aircraft_times)
        while low < high:
            mid = (low + high) // 2
            if aircraft_times[mid] < target_time:
                low = mid + 1
            else:
                high = mid
        candidates = [aircraft_series[pos] for pos in (low - 1, low, low + 1) if 0 <= pos < len(aircraft_series)]
        if not candidates:
            return None
        return min(candidates, key=lambda item: abs((item[0] - target_time).total_seconds()))

    def _haversine(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        from math import atan2, cos, radians, sin, sqrt

        radius = 6371000
        phi1 = radians(lat1)
        phi2 = radians(lat2)
        d_phi = radians(lat2 - lat1)
        d_lambda = radians(lon2 - lon1)
        a = sin(d_phi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(d_lambda / 2) ** 2
        return 2 * radius * atan2(sqrt(a), sqrt(1 - a))

    def build_overview(self) -> Dict[str, Any]:
        case_list = list(self.case_map.values())
        high_risk = sum(1 for item in case_list if item["risk_level"] == "\u9ad8")
        medium_risk = sum(1 for item in case_list if item["risk_level"] == "\u4e2d")
        low_risk = sum(1 for item in case_list if item["risk_level"] == "\u4f4e")
        integrity = self.blockchain.verify_all_channels()
        integrity_score = round(sum(1 for ok in integrity.values() if ok) / len(integrity) * 100, 1)
        task_type_counts = self.dataset_frames["clean_task_info"].replace("", pd.NA).fillna({"TASKTYPENAME": "\u672a\u6807\u6ce8"}).groupby("TASKTYPENAME").size().sort_values(ascending=False).head(6)

        hourly_cases = defaultdict(int)
        for case in case_list:
            timeline_head = case["timeline"][0]["time"] if case["timeline"] else None
            timestamp = parse_datetime(timeline_head)
            if timestamp:
                hourly_cases[f"{timestamp.hour:02d}:00"] += 1

        top_vehicles = Counter(case["vehicle_id"] for case in case_list if case["vehicle_id"] and case["vehicle_id"] != "\u5f85\u8865\u5f55").most_common(6)
        confidence_values = [case["association"]["confidence_score"] for case in case_list]
        min_distances = [case["association"]["min_distance_m"] for case in case_list if case["association"]["min_distance_m"] is not None]
        interaction_values = [case["association"]["interaction_ratio"] for case in case_list]
        strong_cases = sum(1 for case in case_list if case["association"]["confidence_label"] == "\u5f3a\u5173\u8054")
        medium_cases = sum(1 for case in case_list if case["association"]["confidence_label"] == "\u4e2d\u5173\u8054")
        weak_cases = sum(1 for case in case_list if case["association"]["confidence_label"] == "\u5f31\u5173\u8054")
        closed_cases = sum(1 for case in case_list if case["status"] == "\u95ed\u73af\u5b8c\u6210")

        return {
            "generated_at": datetime.now().isoformat(),
            "kpis": [
                {"label": "\u822a\u73ed\u6837\u672c", "value": len(self.loader.flights), "suffix": "\u67b6\u6b21"},
                {"label": "\u62d6\u8f66\u6848\u4f8b", "value": len(case_list), "suffix": "\u6761"},
                {"label": "\u94fe\u4e0a\u8bc1\u636e", "value": self.blockchain.get_statistics()["total_blocks"], "suffix": "\u6761"},
                {"label": "\u9ad8\u98ce\u9669\u4e8b\u4ef6", "value": high_risk, "suffix": "\u9879"},
                {"label": "\u5b8c\u6574\u6027\u6821\u9a8c", "value": integrity_score, "suffix": "%"},
            ],
            "architecture": [
                {"title": "\u4e8b\u4ef6\u91cd\u6784", "detail": "\u56f4\u7ed5\u62d6\u8f66\u4efb\u52a1\u805a\u5408\u822a\u73ed\u3001\u62d6\u884c\u7247\u6bb5\u3001\u8131\u79bb\u8282\u70b9\u548c\u8d23\u4efb\u5bf9\u8c61\u3002"},
                {"title": "\u89c4\u5219\u6821\u9a8c", "detail": "\u4f9d\u636e\u901f\u5ea6\u3001\u8ddd\u79bb\u3001\u5236\u52a8\u6d4b\u8bd5\u7b49\u89c4\u5219\u8bc6\u522b\u62d6\u884c\u9636\u6bb5\u5f02\u5e38\u3002"},
                {"title": "\u8054\u76df\u94fe\u5b58\u8bc1", "detail": "\u8ba1\u5212\u3001\u6267\u884c\u3001\u544a\u8b66\u3001\u5ba1\u8ba1\u5206\u522b\u843d\u94fe\uff0c\u907f\u514d\u4e8b\u540e\u53e3\u5f84\u4e0d\u4e00\u81f4\u3002"},
                {"title": "\u8d23\u4efb\u8ffd\u6eaf", "detail": "\u901a\u8fc7\u533a\u5757\u54c8\u5e0c\u548c\u9636\u6bb5\u65f6\u95f4\u7ebf\u5feb\u901f\u5b9a\u4f4d\u8bc1\u636e\u7f3a\u53e3\u3001\u8d23\u4efb\u8282\u70b9\u4e0e\u590d\u6838\u8bb0\u5f55\u3002"},
            ],
            "risk_distribution": [{"name": "\u9ad8\u98ce\u9669", "value": high_risk}, {"name": "\u4e2d\u98ce\u9669", "value": medium_risk}, {"name": "\u4f4e\u98ce\u9669", "value": low_risk}],
            "task_composition": [{"name": str(name), "value": int(value)} for name, value in task_type_counts.items()],
            "hourly_cases": [{"hour": hour, "value": value} for hour, value in sorted(hourly_cases.items(), key=lambda item: item[0])],
            "dataset_quality": self._build_dataset_quality(),
            "channel_stats": self._build_channel_stats(),
            "network": self._build_network(),
            "top_vehicles": [{"name": name, "value": value} for name, value in top_vehicles],
            "verification_metrics": [
                {"label": "\u5e73\u5747\u5173\u8054\u53ef\u4fe1\u5ea6", "value": round(mean(confidence_values), 1) if confidence_values else 0, "suffix": "\u5206", "description": "\u4efb\u52a1-\u8f66\u8f86\u5173\u8054\u7efc\u5408\u65f6\u95f4\u3001\u673a\u4f4d\u90bb\u8fd1\u4e0e\u62d6\u884c\u9636\u6bb5\u4ea4\u4e92\u7ed3\u679c\u3002"},
                {"label": "\u4e2d\u4f4d\u6700\u8fd1\u8ddd\u79bb", "value": round(median(min_distances), 1) if min_distances else 0, "suffix": "m", "description": "\u62d6\u884c\u9636\u6bb5\u98de\u673a\u4e0e\u7275\u5f15\u8f66\u7684\u6700\u8fd1\u7a7a\u95f4\u8ddd\u79bb\u4e2d\u4f4d\u6570\u3002"},
                {"label": "\u5e73\u5747\u4ea4\u4e92\u8986\u76d6", "value": round(mean(interaction_values), 1) if interaction_values else 0, "suffix": "%", "description": "\u62d6\u884c\u9636\u6bb5\u6ee1\u8db3\u534f\u540c\u63a5\u8fd1\u7684\u7a7a\u95f4\u4ea4\u4e92\u5360\u6bd4\u3002"},
                {"label": "\u5f3a\u5173\u8054\u6848\u4f8b\u5360\u6bd4", "value": round(strong_cases / max(1, len(case_list)) * 100, 1), "suffix": "%", "description": "\u53ef\u76f4\u63a5\u7528\u4e8e\u56de\u653e\u4e0e\u8ffd\u6eaf\u6f14\u793a\u7684\u9ad8\u53ef\u4fe1\u6848\u4f8b\u6bd4\u4f8b\u3002"},
            ],
            "association_distribution": [{"name": "\u5f3a\u5173\u8054", "value": strong_cases}, {"name": "\u4e2d\u5173\u8054", "value": medium_cases}, {"name": "\u5f31\u5173\u8054", "value": weak_cases}],
            "blockchain_value": [
                {"name": "\u8ba1\u5212\u4e0a\u94fe\u8986\u76d6", "value": round(len(case_list) / max(1, len(self.matcher.flight_task_map)) * 100, 1), "unit": "%", "description": "\u7eb3\u5165\u5c55\u793a\u7684\u7275\u5f15\u6848\u4f8b\u5747\u5177\u5907\u8ba1\u5212\u5e95\u8d26\u548c\u6848\u4f8b\u7f16\u53f7\u3002"},
                {"name": "\u89c4\u5219\u6821\u9a8c\u89e6\u8fbe", "value": round((high_risk + medium_risk + low_risk) / max(1, len(case_list)) * 100, 1), "unit": "%", "description": "\u6bcf\u4e2a\u6848\u4f8b\u90fd\u4f1a\u7ecf\u8fc7\u667a\u80fd\u5408\u7ea6\u6821\u9a8c\u5e76\u751f\u6210\u98ce\u9669\u7ed3\u8bba\u3002"},
                {"name": "\u901a\u9053\u5b8c\u6574\u6027", "value": integrity_score, "unit": "%", "description": "\u8ba1\u5212\u3001\u6267\u884c\u3001\u98ce\u9669\u3001\u76d1\u7ba1\u901a\u9053\u54c8\u5e0c\u6821\u9a8c\u901a\u8fc7\u7387\u3002"},
                {"name": "\u95ed\u73af\u5b8c\u6210\u7387", "value": round(closed_cases / max(1, len(case_list)) * 100, 1), "unit": "%", "description": "\u94fe\u4e0a\u5df2\u5b8c\u6210\u8ffd\u6eaf\u548c\u5904\u7f6e\u95ed\u73af\u7684\u6848\u4f8b\u5360\u6bd4\u3002"},
            ],
            "case_options": [{"case_id": case["case_id"], "flight_identity": case["flight_identity"], "risk_level": case["risk_level"], "status": case["status"], "vehicle_id": case["vehicle_id"], "stand_id": case["stand_id"], "blockchain_records": len(case["blockchain_records"]), "association_confidence": case["association"]["confidence_score"], "validation_label": case["association"]["validation_label"], "evidence_score": case["metrics"]["evidence_score"]} for case in case_list],
            "alerts": self.list_alerts(limit=10),
            "default_case_id": self.default_case_id,
        }

    def _build_dataset_quality(self) -> List[Dict[str, Any]]:
        specs = {
            "clean_main": ["FUUID", "FLIGHTIDENTITY", "STANDID", "ACTUALONBLOCKDATETIME", "ACTUALOFFBLOCKDATETIME"],
            "clean_task_info": ["FUUID", "TASKTYPECODE", "TASKTYPENAME", "TASKACTUALBEGINDATETIME", "TASKACTUALENDDATETIME", "RESOURCEID"],
            "adsb_pvg_merged": ["ID", "FN", "LO", "LA", "TE"],
            "vehicle_gps_towing_merged": ["VEHICLELOCATION_PK", "VEHICLENO", "LONGITUDE", "LATITUDE", "SPEED", "LOCATIONTIME"],
        }
        rows = []
        for name, columns in specs.items():
            df = self.dataset_frames[name].copy()
            if df.empty:
                rows.append({"dataset": name, "records": 0, "completeness": 0, "missing_fields": ["\u65e0\u6570\u636e"]})
                continue
            subset = df[columns].replace("", pd.NA)
            missing_ratio = subset.isna().mean().sort_values(ascending=False)
            completeness = round((1 - subset.isna().sum().sum() / max(1, subset.size)) * 100, 1)
            rows.append({"dataset": name, "records": int(len(df)), "completeness": completeness, "missing_fields": [f"{field} {(ratio * 100):.1f}%" for field, ratio in missing_ratio.head(3).items() if ratio > 0] or ["\u5173\u952e\u5b57\u6bb5\u5b8c\u6574"]})
        return rows

    def _build_channel_stats(self) -> List[Dict[str, Any]]:
        stats = self.blockchain.get_statistics()["blocks_per_channel"]
        descriptions = {
            "schedule": "\u8ba1\u5212\u7f16\u6392\u5e95\u8d26",
            "flight_info": "\u822a\u73ed\u72b6\u6001\u5b58\u8bc1",
            "personnel": "\u8d23\u4efb\u8d44\u6e90\u7ed1\u5b9a",
            "vehicle": "\u62d6\u884c\u6267\u884c\u8bc1\u636e",
            "risk": "\u98ce\u63a7\u544a\u8b66\u901a\u9053",
            "regulation": "\u76d1\u7ba1\u5ba1\u8ba1\u5f52\u6863",
        }
        return [{"channel": channel, "blocks": int(count), "description": descriptions.get(channel, channel)} for channel, count in stats.items()]

    def _build_network(self) -> Dict[str, Any]:
        nodes = [{"id": node.node_id, "name": node.organization, "role": node.node_type} for node in self.blockchain.nodes]
        channels = [{"name": name, "description": channel.description, "blocks": len(channel.blocks)} for name, channel in self.blockchain.channels.items()]
        return {"nodes": nodes, "channels": channels}

    def get_trace(self, case_id: Optional[str] = None) -> Dict[str, Any]:
        target_id = case_id or self.default_case_id
        if not target_id or target_id not in self.case_map:
            raise KeyError(target_id or "")
        case = self.case_map[target_id]
        return {"case": case, "cases": [{"case_id": item["case_id"], "flight_identity": item["flight_identity"], "risk_level": item["risk_level"], "status": item["status"], "confidence": item["association"]["confidence_score"]} for item in self.case_map.values()]}

    def build_governance(self) -> Dict[str, Any]:
        overview = self.build_overview()
        case_list = list(self.case_map.values())
        return {
            "dataset_quality": self._build_dataset_quality(),
            "channel_stats": self._build_channel_stats(),
            "network": self._build_network(),
            "integrity": self.blockchain.verify_all_channels(),
            "validation_summary": {
                "association_distribution": overview["association_distribution"],
                "verification_metrics": overview["verification_metrics"],
                "blockchain_value": overview["blockchain_value"],
                "case_integrity": [{"case_id": case["case_id"], "flight_identity": case["flight_identity"], "confidence": case["association"]["confidence_score"], "validation_label": case["association"]["validation_label"], "evidence_score": case["metrics"]["evidence_score"]} for case in case_list],
            },
        }

    def list_alerts(self, limit: int = 8) -> List[Dict[str, Any]]:
        return self.alert_feed[:limit]
