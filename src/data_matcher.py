from __future__ import annotations

from bisect import bisect_left, bisect_right
from collections import defaultdict
from datetime import datetime, timedelta
from statistics import mean
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from .data_loader import DataLoader
from .models.aircraft_adsb import AircraftADSB
from .models.flight import Flight
from .models.task import Task
from .models.vehicle_gps import VehicleGPS
from .utils.time_utils import parse_date, parse_datetime


class DataMatcher:
    """Link flights, tasks, ADS-B tracks, and towing vehicle GPS traces."""

    def __init__(self, loader: DataLoader):
        self.loader = loader
        self.flight_task_map: Dict[str, List[Task]] = {}
        self.flight_adsb_map: Dict[str, List[AircraftADSB]] = {}
        self.task_vehicle_map: Dict[str, List[VehicleGPS]] = {}
        self.task_vehicle_metrics: Dict[str, Dict[str, Any]] = {}
        self.airport_bounds: Optional[Dict[str, float]] = None

    def match_flight_tasks(self) -> Dict[str, List[Task]]:
        print("Matching flights to towing tasks...")
        task_dict = defaultdict(list)
        for task in self.loader.tasks:
            if task.is_towing_task():
                task_dict[task.FUUID].append(task)
        for key, tasks in task_dict.items():
            tasks.sort(key=lambda item: item.get_actual_begin_time() or item.get_actual_end_time() or datetime.min)
        self.flight_task_map = dict(task_dict)
        print(f"Matched {len(self.flight_task_map)}/{len(self.loader.flights)} flights with towing tasks")
        print(f"  Total towing tasks: {sum(len(v) for v in self.flight_task_map.values())}\n")
        return self.flight_task_map

    def match_flight_adsb(
        self,
        time_window: int = 60,
        ground_altitude_threshold: Optional[int] = 100,
    ) -> Dict[str, List[AircraftADSB]]:
        print(
            f"Matching flights to ADS-B (time window: +/-{time_window} min, ground altitude <= {ground_altitude_threshold})..."
        )
        self.airport_bounds = self._derive_airport_bounds()
        adsb_by_flight = defaultdict(list)
        for adsb in self.loader.adsb_data:
            fn = (adsb.FN or "").strip()
            fn2 = (adsb.FN2 or "").strip()
            if fn:
                adsb_by_flight[fn].append(adsb)
            if fn2 and fn2 != fn:
                adsb_by_flight[fn2].append(adsb)

        adsb_dict = defaultdict(list)
        for flight in self.loader.flights:
            flight_no = (flight.FLIGHTIDENTITY or "").strip()
            if not flight_no:
                continue
            candidates = adsb_by_flight.get(flight_no, [])
            if not candidates:
                continue
            window_start, window_end = self._time_window_for_flight(flight, time_window)
            flight_date = parse_date(flight.FLIGHTSCHEDULEDDATE)
            matched: List[AircraftADSB] = []
            for adsb in candidates:
                ts = adsb.get_timestamp()
                if window_start and window_end and ts and window_start <= ts <= window_end:
                    matched.append(adsb)
            if not matched and flight_date:
                for adsb in candidates:
                    ts = adsb.get_timestamp()
                    if ts and ts.date() == flight_date:
                        matched.append(adsb)
            if ground_altitude_threshold is not None and matched:
                ground_points = [
                    point
                    for point in matched
                    if self._coerce_float(point.HE) is not None and float(point.HE) <= ground_altitude_threshold
                ]
                if ground_points:
                    matched = ground_points
            if self.airport_bounds and matched:
                matched = [point for point in matched if self._in_airport_bounds(point)]
            if matched:
                adsb_dict[flight.FUUID] = matched

        self.flight_adsb_map = dict(adsb_dict)
        print(f"Matched {len(self.flight_adsb_map)} flights with ADS-B tracks")
        print(f"  Total ADS-B points: {sum(len(v) for v in self.flight_adsb_map.values())}\n")
        return self.flight_adsb_map

    def match_task_vehicle(self, distance_threshold: float = 0.01, time_window: int = 30) -> Dict[str, List[VehicleGPS]]:
        print(
            f"Matching tasks to vehicle GPS (distance <= {distance_threshold} deg, time window: +/-{time_window} min)..."
        )
        vehicles, vehicle_times = self._build_vehicle_time_index()
        stand_coords = self._derive_stand_coordinates(vehicles, vehicle_times, time_window=time_window)
        vehicle_dict: Dict[str, List[VehicleGPS]] = {}
        vehicle_metrics: Dict[str, Dict[str, Any]] = {}

        for index, task in enumerate(self.loader.tasks):
            if not task.is_towing_task():
                continue
            flight = self._get_flight_by_fuuid(task.FUUID)
            task_anchor = self._resolve_task_anchor(task, flight)
            if not task_anchor:
                continue
            stand_coord = stand_coords.get(flight.STANDID) if flight and flight.STANDID else None
            adsb_points = self.flight_adsb_map.get(task.FUUID, [])
            left, right = self._time_window_indices(vehicle_times, task_anchor, time_window)
            if right <= left:
                continue
            grouped: Dict[str, List[VehicleGPS]] = defaultdict(list)
            for vehicle in vehicles[left:right]:
                grouped[vehicle.VEHICLENO].append(vehicle)

            scored_candidates = []
            for vehicle_id, points in grouped.items():
                if len(points) < 3:
                    continue
                score_info = self._evaluate_vehicle_candidate(points, task_anchor, adsb_points, stand_coord)
                score_info["vehicle_id"] = vehicle_id
                scored_candidates.append(score_info)

            if not scored_candidates:
                continue

            scored_candidates.sort(key=lambda item: item["score"], reverse=True)
            best = scored_candidates[0]
            key = task.ID or f"{task.FUUID}-{index}"
            vehicle_dict[key] = best["episode_points"]
            vehicle_metrics[key] = {
                "vehicle_id": best["vehicle_id"],
                "confidence_score": round(best["score"], 1),
                "confidence_label": self._confidence_label(best["score"]),
                "candidate_vehicle_count": len(scored_candidates),
                "min_distance_m": round(best["min_distance_m"], 1) if best["min_distance_m"] is not None else None,
                "interaction_ratio": round(best["interaction_ratio"] * 100, 1),
                "paired_ratio": round(best["paired_ratio"] * 100, 1),
                "operation_start": best["operation_start"].isoformat() if best["operation_start"] else None,
                "operation_end": best["operation_end"].isoformat() if best["operation_end"] else None,
                "release_time": best["release_time"].isoformat() if best["release_time"] else None,
                "tow_duration_min": best["tow_duration_min"],
                "top_candidates": [
                    {
                        "vehicle_id": item["vehicle_id"],
                        "score": round(item["score"], 1),
                        "min_distance_m": round(item["min_distance_m"], 1) if item["min_distance_m"] is not None else None,
                        "interaction_ratio": round(item["interaction_ratio"] * 100, 1),
                        "point_count": len(item["episode_points"]),
                    }
                    for item in scored_candidates[:5]
                ],
            }

        self.task_vehicle_map = vehicle_dict
        self.task_vehicle_metrics = vehicle_metrics
        avg_conf = round(mean(metric["confidence_score"] for metric in self.task_vehicle_metrics.values()), 1) if self.task_vehicle_metrics else 0
        print(f"Matched {len(self.task_vehicle_map)} tasks with best-fit towing vehicles")
        print(f"  Total GPS points retained: {sum(len(v) for v in self.task_vehicle_map.values())}")
        print(f"  Average confidence: {avg_conf}\n")
        return self.task_vehicle_map
    def _get_flight_by_fuuid(self, fuuid: str) -> Optional[Flight]:
        for flight in self.loader.flights:
            if flight.FUUID == fuuid:
                return flight
        return None

    def _resolve_task_anchor(self, task: Task, flight: Optional[Flight]) -> Optional[datetime]:
        candidates = [task.get_actual_begin_time(), task.get_actual_end_time()]
        if flight:
            if flight.is_arrival():
                candidates.extend(
                    [
                        parse_datetime(flight.ACTUALONBLOCKDATETIME),
                        parse_datetime(flight.SCHEDULEDONBLOCKDATETIME),
                    ]
                )
            else:
                candidates.extend(
                    [
                        parse_datetime(flight.ACTUALOFFBLOCKDATETIME),
                        parse_datetime(flight.SCHEDULEDOFFBLOCKDATETIME),
                        parse_datetime(flight.ACTUALTAKEOFFDATETIME),
                    ]
                )
        candidates.append(parse_datetime(task.UPDATE_TIME))
        for candidate in candidates:
            if candidate:
                return candidate
        return None

    def _time_window_for_flight(self, flight: Flight, time_window: int) -> Tuple[Optional[datetime], Optional[datetime]]:
        if flight.is_arrival():
            anchor = parse_datetime(flight.ACTUALONBLOCKDATETIME or flight.SCHEDULEDONBLOCKDATETIME)
            return (anchor - timedelta(minutes=time_window), anchor + timedelta(minutes=time_window)) if anchor else (None, None)
        start_dt = parse_datetime(flight.ACTUALOFFBLOCKDATETIME or flight.SCHEDULEDOFFBLOCKDATETIME)
        end_dt = parse_datetime(flight.ACTUALTAKEOFFDATETIME or flight.SCHEDULEDTAKEOFFDATETIME)
        if start_dt and end_dt:
            return start_dt - timedelta(minutes=20), end_dt + timedelta(minutes=20)
        if start_dt:
            return start_dt - timedelta(minutes=time_window), start_dt + timedelta(minutes=time_window)
        if end_dt:
            return end_dt - timedelta(minutes=time_window), end_dt + timedelta(minutes=time_window)
        return None, None

    def _build_vehicle_time_index(self) -> Tuple[List[VehicleGPS], List[datetime]]:
        vehicles = []
        times = []
        for vehicle in self.loader.vehicle_gps:
            ts = vehicle.get_timestamp()
            if not vehicle.is_towing_vehicle() or not ts:
                continue
            vehicles.append(vehicle)
            times.append(ts)
        order = sorted(range(len(times)), key=times.__getitem__)
        return [vehicles[i] for i in order], [times[i] for i in order]

    def _time_window_indices(self, times: List[datetime], center: datetime, window_minutes: int) -> Tuple[int, int]:
        start = center - timedelta(minutes=window_minutes)
        end = center + timedelta(minutes=window_minutes)
        return bisect_left(times, start), bisect_right(times, end)

    def _derive_airport_bounds(self) -> Optional[Dict[str, float]]:
        lons: List[float] = []
        lats: List[float] = []
        for vehicle in self.loader.vehicle_gps:
            lon = self._coerce_float(vehicle.LONGITUDE)
            lat = self._coerce_float(vehicle.LATITUDE)
            if lon is None or lat is None or lon < 100 or lat < 10:
                continue
            lons.append(lon)
            lats.append(lat)
        if len(lons) < 100:
            return None
        lon_low, lon_high = np.quantile(lons, [0.005, 0.995])
        lat_low, lat_high = np.quantile(lats, [0.005, 0.995])
        return {
            "lon_min": float(lon_low - 0.006),
            "lon_max": float(lon_high + 0.006),
            "lat_min": float(lat_low - 0.006),
            "lat_max": float(lat_high + 0.006),
        }

    def _in_airport_bounds(self, adsb: AircraftADSB) -> bool:
        if not self.airport_bounds:
            return True
        lon = self._coerce_float(adsb.LO)
        lat = self._coerce_float(adsb.LA)
        if lon is None or lat is None:
            return False
        return (
            self.airport_bounds["lon_min"] <= lon <= self.airport_bounds["lon_max"]
            and self.airport_bounds["lat_min"] <= lat <= self.airport_bounds["lat_max"]
        )

    def _derive_stand_coordinates(
        self,
        vehicles: List[VehicleGPS],
        vehicle_times: List[datetime],
        time_window: int = 30,
    ) -> Dict[str, Tuple[float, float]]:
        stats: Dict[str, Tuple[float, float, int]] = {}
        for task in self.loader.tasks:
            if not task.is_towing_task():
                continue
            flight = self._get_flight_by_fuuid(task.FUUID)
            if not flight or not flight.STANDID:
                continue
            task_anchor = self._resolve_task_anchor(task, flight)
            if not task_anchor:
                continue
            left, right = self._time_window_indices(vehicle_times, task_anchor, time_window)
            sample_stride = max(1, max(1, right - left) // 150)
            for idx in range(left, right, sample_stride):
                lat, lon = vehicles[idx].get_position()
                if lat is None or lon is None:
                    continue
                total_lat, total_lon, count = stats.get(flight.STANDID, (0.0, 0.0, 0))
                stats[flight.STANDID] = (total_lat + lat, total_lon + lon, count + 1)
        return {
            stand_id: (total_lat / count, total_lon / count)
            for stand_id, (total_lat, total_lon, count) in stats.items()
            if count
        }

    def _evaluate_vehicle_candidate(
        self,
        points: List[VehicleGPS],
        task_anchor: datetime,
        adsb_points: List[AircraftADSB],
        stand_coord: Optional[Tuple[float, float]],
    ) -> Dict[str, Any]:
        aligned_pairs = self._align_aircraft_vehicle_points(points, adsb_points)
        episode = self._extract_towing_episode(points, aligned_pairs, task_anchor)
        episode_points = episode["points"]
        episode_pairs = episode["pairs"]
        distances = [pair["distance_m"] for pair in episode_pairs]
        min_distance = min(distances) if distances else None
        interaction_ratio = sum(1 for distance in distances if distance <= 120) / len(distances) if distances else 0.0
        paired_ratio = len(episode_pairs) / max(1, len(episode_points))
        speeds = [float(point.SPEED) for point in episode_points if point.SPEED not in ("", None)]
        movement_ratio = sum(1 for speed in speeds if speed > 0.5) / max(1, len(speeds))
        tow_duration_min = episode["tow_duration_min"]
        mid_time = episode["mid_time"] or task_anchor
        time_alignment = max(0.0, 1 - abs((task_anchor - mid_time).total_seconds()) / 1200)

        stand_score = 0.0
        if stand_coord and episode_points:
            point_distances = []
            for point in episode_points[:: max(1, len(episode_points) // 40)]:
                lat, lon = point.get_position()
                if lat is None or lon is None:
                    continue
                point_distances.append(self._calculate_distance(stand_coord, (lat, lon)))
            if point_distances:
                nearest_stand = min(point_distances)
                stand_score = 12 if nearest_stand <= 0.0012 else 7 if nearest_stand <= 0.0025 else 0

        proximity_score = 0.0
        if min_distance is not None:
            if min_distance <= 20:
                proximity_score = 42
            elif min_distance <= 40:
                proximity_score = 38
            elif min_distance <= 80:
                proximity_score = 32
            elif min_distance <= 150:
                proximity_score = 24
            elif min_distance <= 240:
                proximity_score = 14
            elif min_distance <= 400:
                proximity_score = 6

        duration_score = 0.0
        if tow_duration_min >= 3:
            duration_score = min(14, tow_duration_min)
        elif tow_duration_min > 0:
            duration_score = tow_duration_min * 3

        score = (
            proximity_score
            + interaction_ratio * 22
            + paired_ratio * 18
            + movement_ratio * 8
            + duration_score
            + stand_score
            + time_alignment * 12
        )
        return {
            "score": min(100, score),
            "min_distance_m": min_distance,
            "interaction_ratio": interaction_ratio,
            "paired_ratio": paired_ratio,
            "episode_points": episode_points,
            "operation_start": episode["start_time"],
            "operation_end": episode["end_time"],
            "release_time": episode["release_time"],
            "tow_duration_min": tow_duration_min,
        }
    def _extract_towing_episode(
        self,
        points: List[VehicleGPS],
        aligned_pairs: List[Dict[str, Any]],
        task_anchor: datetime,
    ) -> Dict[str, Any]:
        sorted_points = sorted(points, key=lambda item: item.get_timestamp() or datetime.min)
        interaction_pairs = [
            pair
            for pair in aligned_pairs
            if pair["distance_m"] <= 160 and pair["aircraft_speed"] <= 35 and pair["aircraft_altitude"] <= 80
        ]
        clusters = self._cluster_pairs(interaction_pairs)

        if clusters:
            best_cluster = max(clusters, key=lambda cluster: self._score_cluster(cluster, task_anchor))
            start_time = best_cluster[0]["vehicle_time"] - timedelta(minutes=2)
            release_time = self._estimate_release_time(best_cluster, aligned_pairs)
            end_time = max(release_time, best_cluster[-1]["vehicle_time"]) + timedelta(minutes=2)
        else:
            start_time = task_anchor - timedelta(minutes=6)
            release_time = task_anchor + timedelta(minutes=2)
            end_time = task_anchor + timedelta(minutes=6)

        episode_points = [
            point
            for point in sorted_points
            if point.get_timestamp() and start_time <= point.get_timestamp() <= end_time
        ]
        if len(episode_points) < 12:
            episode_points = [
                point
                for point in sorted_points
                if point.get_timestamp() and (task_anchor - timedelta(minutes=8)) <= point.get_timestamp() <= (task_anchor + timedelta(minutes=8))
            ]
            start_time = episode_points[0].get_timestamp() if episode_points else start_time
            end_time = episode_points[-1].get_timestamp() if episode_points else end_time
            release_time = end_time

        episode_pairs = [
            pair
            for pair in aligned_pairs
            if start_time <= pair["vehicle_time"] <= end_time
        ]
        mid_time = None
        if episode_points:
            mid_time = episode_points[len(episode_points) // 2].get_timestamp()
        tow_duration_min = 0.0
        if episode_points and episode_points[0].get_timestamp() and episode_points[-1].get_timestamp():
            tow_duration_min = round((episode_points[-1].get_timestamp() - episode_points[0].get_timestamp()).total_seconds() / 60, 1)

        return {
            "points": episode_points,
            "pairs": episode_pairs,
            "start_time": start_time,
            "end_time": end_time,
            "release_time": release_time,
            "mid_time": mid_time,
            "tow_duration_min": tow_duration_min,
        }

    def _align_aircraft_vehicle_points(
        self,
        vehicle_points: List[VehicleGPS],
        adsb_points: List[AircraftADSB],
        max_gap_seconds: int = 90,
    ) -> List[Dict[str, Any]]:
        aircraft = []
        for point in adsb_points:
            ts = point.get_timestamp()
            lat = self._coerce_float(point.LA)
            lon = self._coerce_float(point.LO)
            speed = self._coerce_float(point.GV) or 0.0
            altitude = self._coerce_float(point.HE) or 0.0
            if ts and lat is not None and lon is not None:
                aircraft.append((ts, lat, lon, speed, altitude))
        if not aircraft:
            return []
        aircraft.sort(key=lambda item: item[0])
        aircraft_times = [item[0] for item in aircraft]
        aligned: List[Dict[str, Any]] = []

        stride = max(1, len(vehicle_points) // 900)
        for point in vehicle_points[::stride]:
            ts = point.get_timestamp()
            lat = self._coerce_float(point.LATITUDE)
            lon = self._coerce_float(point.LONGITUDE)
            if not ts or lat is None or lon is None:
                continue
            idx = bisect_left(aircraft_times, ts)
            candidates = [pos for pos in (idx - 1, idx, idx + 1) if 0 <= pos < len(aircraft)]
            best = None
            for pos in candidates:
                aircraft_ts, a_lat, a_lon, aircraft_speed, aircraft_altitude = aircraft[pos]
                gap_seconds = abs((aircraft_ts - ts).total_seconds())
                if gap_seconds > max_gap_seconds:
                    continue
                distance = self._haversine(lat, lon, a_lat, a_lon)
                if best is None or distance < best["distance_m"]:
                    best = {
                        "vehicle_time": ts,
                        "vehicle_speed": self._coerce_float(point.SPEED) or 0.0,
                        "aircraft_time": aircraft_ts,
                        "aircraft_speed": aircraft_speed,
                        "aircraft_altitude": aircraft_altitude,
                        "distance_m": distance,
                        "time_gap_s": gap_seconds,
                    }
            if best is not None:
                aligned.append(best)
        return aligned

    def _cluster_pairs(self, pairs: List[Dict[str, Any]], gap_seconds: int = 150) -> List[List[Dict[str, Any]]]:
        if not pairs:
            return []
        ordered = sorted(pairs, key=lambda item: item["vehicle_time"])
        clusters: List[List[Dict[str, Any]]] = [[ordered[0]]]
        for pair in ordered[1:]:
            if (pair["vehicle_time"] - clusters[-1][-1]["vehicle_time"]).total_seconds() <= gap_seconds:
                clusters[-1].append(pair)
            else:
                clusters.append([pair])
        return [cluster for cluster in clusters if len(cluster) >= 3]

    def _score_cluster(self, cluster: List[Dict[str, Any]], task_anchor: datetime) -> float:
        duration_min = max(0.2, (cluster[-1]["vehicle_time"] - cluster[0]["vehicle_time"]).total_seconds() / 60)
        mean_distance = sum(item["distance_m"] for item in cluster) / len(cluster)
        anchor_gap = abs((cluster[len(cluster) // 2]["vehicle_time"] - task_anchor).total_seconds()) / 60
        return len(cluster) * 5 + duration_min * 4 - anchor_gap * 1.5 - mean_distance / 30

    def _estimate_release_time(
        self,
        cluster: List[Dict[str, Any]],
        aligned_pairs: List[Dict[str, Any]],
    ) -> datetime:
        base_time = cluster[-1]["vehicle_time"]
        future_pairs = [pair for pair in aligned_pairs if pair["vehicle_time"] > base_time]
        future_pairs.sort(key=lambda item: item["vehicle_time"])
        for index in range(max(0, len(future_pairs) - 2)):
            window = future_pairs[index : index + 3]
            if len(window) < 3:
                continue
            avg_distance = sum(item["distance_m"] for item in window) / len(window)
            avg_speed = sum(item["aircraft_speed"] for item in window) / len(window)
            avg_altitude = sum(item["aircraft_altitude"] for item in window) / len(window)
            if avg_distance >= 150 or avg_speed >= 35 or avg_altitude >= 80:
                return window[0]["vehicle_time"]
        return base_time + timedelta(minutes=1)

    def _calculate_distance(self, coord1: Tuple[float, float], coord2: Tuple[float, float]) -> float:
        lat1, lon1 = coord1
        lat2, lon2 = coord2
        return float(np.sqrt((lat1 - lat2) ** 2 + (lon1 - lon2) ** 2))

    def _haversine(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        radius = 6371000
        phi1 = np.radians(lat1)
        phi2 = np.radians(lat2)
        d_phi = np.radians(lat2 - lat1)
        d_lambda = np.radians(lon2 - lon1)
        a = np.sin(d_phi / 2) ** 2 + np.cos(phi1) * np.cos(phi2) * np.sin(d_lambda / 2) ** 2
        return float(2 * radius * np.arctan2(np.sqrt(a), np.sqrt(1 - a)))

    def _coerce_float(self, value: object) -> Optional[float]:
        try:
            if value in (None, ""):
                return None
            return float(value)
        except (TypeError, ValueError):
            return None

    def _confidence_label(self, score: float) -> str:
        if score >= 75:
            return "强关联"
        if score >= 55:
            return "中关联"
        return "弱关联"

    def match_all(self):
        print("=" * 60)
        print("Running all matching steps...")
        print("=" * 60 + "\n")
        self.match_flight_tasks()
        self.match_flight_adsb()
        self.match_task_vehicle()
        print("=" * 60)
        print("All matching steps finished")
        print("=" * 60 + "\n")

