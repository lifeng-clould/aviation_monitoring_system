import pandas as pd
from typing import List, Dict
from pathlib import Path
from .models.flight import Flight
from .models.task import Task
from .models.aircraft_adsb import AircraftADSB
from .models.vehicle_gps import VehicleGPS


class DataLoader:
    """数据加载器类"""

    def __init__(self, data_dir: str = "data"):
        self.data_dir = Path(data_dir)
        self.flights: List[Flight] = []
        self.tasks: List[Task] = []
        self.adsb_data: List[AircraftADSB] = []
        self.vehicle_gps: List[VehicleGPS] = []

    def load_flights(self, filename: str = "clean_main.csv") -> List[Flight]:
        """加载航班数据"""
        df = pd.read_csv(self.data_dir / filename)
        df = df.fillna('')  # 处理NaN值

        self.flights = [
            Flight(**row.to_dict())
            for _, row in df.iterrows()
        ]
        print(f"✓ 加载航班数据: {len(self.flights)} 条记录")
        return self.flights

    def load_tasks(self, filename: str = "clean_task_info.csv") -> List[Task]:
        """加载任务数据"""
        df = pd.read_csv(self.data_dir / filename)
        df = df.fillna('')

        self.tasks = [
            Task(**row.to_dict())
            for _, row in df.iterrows()
        ]
        print(f"✓ 加载任务数据: {len(self.tasks)} 条记录")
        return self.tasks

    def load_adsb(self, filename: str = "ADSB_PVG_merged.csv") -> List[AircraftADSB]:
        """加载ADS-B数据"""
        df = pd.read_csv(self.data_dir / filename)
        df = df.fillna('')

        self.adsb_data = [
            AircraftADSB(**row.to_dict())
            for _, row in df.iterrows()
        ]
        print(f"✓ 加载ADS-B数据: {len(self.adsb_data)} 条记录")
        return self.adsb_data

    def load_vehicle_gps(self, filename: str = "vehicle_gps_towing_merged.csv") -> List[VehicleGPS]:
        """加载车辆GPS数据"""
        df = pd.read_csv(self.data_dir / filename)
        df = df.fillna('')

        self.vehicle_gps = [
            VehicleGPS(**row.to_dict())
            for _, row in df.iterrows()
        ]
        print(f"✓ 加载车辆GPS数据: {len(self.vehicle_gps)} 条记录")
        return self.vehicle_gps

    def load_all(self):
        """加载所有数据"""
        print("开始加载数据...")
        self.load_flights()
        self.load_tasks()
        self.load_adsb()
        self.load_vehicle_gps()
        print("所有数据加载完成！\n")