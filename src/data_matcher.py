# ============================================================================
# src/data_matcher.py - 数据匹配器
# ============================================================================
from .data_loader import DataLoader
from typing import Dict, List
from .models.task import Task
from .models.aircraft_adsb import AircraftADSB
from .models.vehicle_gps import VehicleGPS
from .models.flight import Flight
from datetime import datetime, timedelta
from collections import defaultdict
import numpy as np


class DataMatcher:
    """数据匹配器 - 负责关联不同数据源"""

    def __init__(self, loader: DataLoader):
        self.loader = loader
        self.flight_task_map: Dict[str, List[Task]] = {}
        self.flight_adsb_map: Dict[str, List[AircraftADSB]] = {}
        self.task_vehicle_map: Dict[str, List[VehicleGPS]] = {}

    def match_flight_tasks(self) -> Dict[str, List[Task]]:
        """
        任务1: 匹配航班和任务
        根据FUUID将航班和对应的保障任务关联起来
        """
        print("正在匹配航班与任务数据...")

        # 按FUUID分组
        task_dict = defaultdict(list)
        for task in self.loader.tasks:
            task_dict[task.FUUID].append(task)

        self.flight_task_map = dict(task_dict)

        # 统计
        matched_flights = len(self.flight_task_map)
        total_flights = len(self.loader.flights)
        print(f"✓ 匹配完成: {matched_flights}/{total_flights} 个航班有保障任务")
        print(
            f"  其中牵引车任务: {sum(1 for tasks in self.flight_task_map.values() for t in tasks if t.is_towing_task())} 个\n")

        return self.flight_task_map

    def match_flight_adsb(self, time_window: int = 120) -> Dict[str, List[AircraftADSB]]:
        """
        任务2: 匹配航班和ADS-B轨迹
        根据航班号和日期匹配飞机轨迹数据

        Args:
            time_window: 时间窗口(分钟)，用于匹配起降时间
        """
        print(f"正在匹配航班与ADS-B数据 (时间窗口: ±{time_window}分钟)...")

        adsb_dict = defaultdict(list)

        # 首先分析数据格式
        if self.loader.flights and self.loader.adsb_data:
            sample_flight = self.loader.flights[0]
            sample_adsb = self.loader.adsb_data[0]
            print(f"  调试信息:")
            print(f"    航班号示例: {sample_flight.FLIGHTIDENTITY}")
            print(f"    ADS-B航班号示例: {sample_adsb.FN}, {sample_adsb.FN2}")
            print(f"    航班日期示例: {sample_flight.FLIGHTSCHEDULEDDATE}")
            print(f"    ADS-B时间示例: {sample_adsb.TE}")

        # 按航班号和日期匹配
        for flight in self.loader.flights:
            flight_no = flight.FLIGHTIDENTITY.strip()
            flight_date = flight.FLIGHTSCHEDULEDDATE  # 格式: 2025/9/19

            if not flight_date:
                continue

            # 提取日期部分用于匹配
            try:
                flight_date_obj = datetime.strptime(flight_date, '%Y/%m/%d')
            except:
                continue

            # 在ADS-B数据中查找匹配的记录
            matched_count = 0
            for adsb in self.loader.adsb_data:
                # 匹配航班号（支持多种格式）
                if adsb.FN == flight_no or adsb.FN2 == flight_no:
                    # 匹配日期
                    if adsb.TE:
                        try:
                            adsb_date_obj = datetime.strptime(adsb.TE.split()[0], '%Y/%m/%d')
                            # 同一天的数据
                            if adsb_date_obj.date() == flight_date_obj.date():
                                adsb_dict[flight.FUUID].append(adsb)
                                matched_count += 1
                        except:
                            continue

            if matched_count > 0:
                print(f"    ✓ 航班 {flight_no} 找到 {matched_count} 个轨迹点")

        self.flight_adsb_map = dict(adsb_dict)

        matched_count = len(self.flight_adsb_map)
        total_points = sum(len(v) for v in self.flight_adsb_map.values())
        print(f"✓ 匹配完成: {matched_count} 个航班找到ADS-B轨迹")
        print(f"  总轨迹点数: {total_points}\n")

        return self.flight_adsb_map

    def match_task_vehicle(self, distance_threshold: float = 0.01) -> Dict[str, List[VehicleGPS]]:
        """
        任务3: 匹配任务和车辆轨迹
        根据停机位位置和时间窗口匹配车辆GPS轨迹

        Args:
            distance_threshold: 距离阈值(度)，约1km
        """
        print(f"正在匹配任务与车辆GPS数据 (距离阈值: {distance_threshold}度)...")

        # 预先构建停机位坐标字典（简化示例，实际需要真实停机位坐标）
        # 这里使用浦东机场T1/T2的大致坐标范围
        stand_coords = self._estimate_stand_coordinates()

        vehicle_dict = defaultdict(list)

        for task in self.loader.tasks:
            if not task.is_towing_task():
                continue

            # 获取对应航班的停机位
            flight = self._get_flight_by_fuuid(task.FUUID)
            if not flight or not flight.STANDID:
                continue

            # 获取停机位坐标（估算）
            stand_coord = stand_coords.get(flight.STANDID)
            if not stand_coord:
                continue

            # 获取任务时间窗口
            task_time = task.get_actual_end_time()
            if not task_time:
                continue

            # 查找时空范围内的车辆GPS记录
            for vehicle in self.loader.vehicle_gps:
                if not vehicle.is_towing_vehicle():
                    continue

                vehicle_time = vehicle.get_timestamp()
                if not vehicle_time:
                    continue

                # 时间匹配（前后30分钟）
                time_diff = abs((vehicle_time - task_time).total_seconds() / 60)
                if time_diff > 30:
                    continue

                # 位置匹配
                vehicle_coord = vehicle.get_position()
                distance = self._calculate_distance(stand_coord, vehicle_coord)

                if distance <= distance_threshold:
                    vehicle_dict[task.ID].append(vehicle)

        self.task_vehicle_map = dict(vehicle_dict)

        matched_count = len(self.task_vehicle_map)
        total_points = sum(len(v) for v in self.task_vehicle_map.values())
        print(f"✓ 匹配完成: {matched_count} 个任务找到车辆轨迹")
        print(f"  总GPS点数: {total_points}\n")

        return self.task_vehicle_map

    def _get_flight_by_fuuid(self, fuuid: str) -> Flight:
        """根据FUUID查找航班"""
        for flight in self.loader.flights:
            if flight.FUUID == fuuid:
                return flight
        return None

    def _estimate_stand_coordinates(self) -> Dict[str, tuple]:
        """估算停机位坐标（简化版）"""
        # 浦东机场坐标范围: 121.79-121.82°E, 31.13-31.16°N
        # 实际应用中需要真实的停机位坐标数据库
        coords = {}
        base_lat, base_lon = 31.145, 121.805

        for flight in self.loader.flights:
            if flight.STANDID and flight.STANDID not in coords:
                # 随机分布在机场范围内（仅作示例）
                offset_lat = np.random.uniform(-0.015, 0.015)
                offset_lon = np.random.uniform(-0.015, 0.015)
                coords[flight.STANDID] = (base_lat + offset_lat, base_lon + offset_lon)

        return coords

    def _calculate_distance(self, coord1: tuple, coord2: tuple) -> float:
        """计算两点间距离（简化版，使用经纬度差值）"""
        lat1, lon1 = coord1
        lat2, lon2 = coord2
        return np.sqrt((lat1 - lat2) ** 2 + (lon1 - lon2) ** 2)

    def match_all(self):
        """执行所有匹配任务"""
        print("=" * 60)
        print("开始执行数据匹配...")
        print("=" * 60 + "\n")

        self.match_flight_tasks()
        self.match_flight_adsb()
        self.match_task_vehicle()

        print("=" * 60)
        print("所有匹配任务完成！")
        print("=" * 60 + "\n")