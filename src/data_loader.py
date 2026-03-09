import pandas as pd
from typing import List, Dict, Iterable, Optional
from pathlib import Path

from .utils.time_utils import parse_date
from .models.flight import Flight
from .models.task import Task
from .models.aircraft_adsb import AircraftADSB
from .models.vehicle_gps import VehicleGPS


class DataLoader:
    """数据加载器类"""

    def __init__(self, data_dir: str = "data", date_filter: Optional[str] = "2025-09-15"):
        self.data_dir = Path(data_dir)
        self.date_filter = parse_date(date_filter) if date_filter else None
        self.flights: List[Flight] = []
        self.tasks: List[Task] = []
        self.adsb_data: List[AircraftADSB] = []
        self.vehicle_gps: List[VehicleGPS] = []

    def _filter_by_date(
        self,
        df: pd.DataFrame,
        columns: Iterable[str],
        fallback_fuuid: Optional[str] = None,
    ) -> pd.DataFrame:
        if not self.date_filter:
            return df

        target = self.date_filter.isoformat()
        mask = pd.Series(False, index=df.index)

        for col in columns:
            if col not in df.columns:
                continue
            series = df[col].astype(str).str.slice(0, 10).str.replace("/", "-", regex=False)
            mask |= series == target

        if fallback_fuuid and fallback_fuuid in df.columns:
            mask |= df[fallback_fuuid].astype(str).str.contains(target, na=False)

        return df[mask]

    def load_flights(self, filename: str = "clean_main.csv") -> List[Flight]:
        """加载航班数据"""
        df = pd.read_csv(self.data_dir / filename)
        df = self._filter_by_date(
            df,
            columns=[
                "FLIGHTSCHEDULEDDATE",
                "ACTUALONBLOCKDATETIME",
                "ACTUALOFFBLOCKDATETIME",
                "SCHEDULEDONBLOCKDATETIME",
                "SCHEDULEDOFFBLOCKDATETIME",
                "ACTUALTAKEOFFDATETIME",
                "SCHEDULEDTAKEOFFDATETIME",
            ],
            fallback_fuuid="FUUID",
        )
        df = df.fillna('')  # 处理NaN值

        self.flights = [
            Flight(**row.to_dict())
            for _, row in df.iterrows()
        ]
        print(f"Loaded flights: {len(self.flights)} records")
        return self.flights

    def load_tasks(self, filename: str = "clean_task_info.csv") -> List[Task]:
        """加载任务数据"""
        df = pd.read_csv(self.data_dir / filename)
        df = self._filter_by_date(
            df,
            columns=[
                "TASKACTUALENDDATETIME",
                "TASKACTUALBEGINDATETIME",
                "TASKSCHEDULEDENDDATETIME",
                "TASKSCHEDULEDBEGINDATETIME",
            ],
            fallback_fuuid="FUUID",
        )
        df = df.fillna('')

        self.tasks = [
            Task(**row.to_dict())
            for _, row in df.iterrows()
        ]
        print(f"Loaded tasks: {len(self.tasks)} records")
        return self.tasks

    def load_adsb(self, filename: str = "ADSB_PVG_merged.csv") -> List[AircraftADSB]:
        """加载ADS-B数据"""
        df = pd.read_csv(self.data_dir / filename)
        df = self._filter_by_date(df, columns=["TE", "ETA", "UPDATE_TIME"])
        df = df.fillna('')

        self.adsb_data = [
            AircraftADSB(**row.to_dict())
            for _, row in df.iterrows()
        ]
        print(f"Loaded ADS-B points: {len(self.adsb_data)} records")
        return self.adsb_data

    def load_vehicle_gps(self, filename: str = "vehicle_gps_towing_merged.csv") -> List[VehicleGPS]:
        """加载车辆GPS数据"""
        df = pd.read_csv(self.data_dir / filename)
        df = self._filter_by_date(df, columns=["LOCATIONTIME", "UPDATE_TIME", "INSERT_TIME"])
        df = df.fillna('')

        self.vehicle_gps = [
            VehicleGPS(**row.to_dict())
            for _, row in df.iterrows()
        ]
        print(f"Loaded vehicle GPS points: {len(self.vehicle_gps)} records")
        return self.vehicle_gps

    def load_all(self):
        """Load all datasets."""
        print("Loading datasets...")
        self.load_flights()
        self.load_tasks()
        self.load_adsb()
        self.load_vehicle_gps()
        print("All datasets loaded.")
