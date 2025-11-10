# ============================================================================
# src/models/vehicle_gps.py - 车辆GPS数据模型
# ============================================================================
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

@dataclass
class VehicleGPS:
    """车辆GPS数据类 - 对应 vehicle_gps_towing_merged.csv"""

    VEHICLELOCATION_PK: str  # 主键
    LOCATIONTIME: str  # 定位时间
    VEHICLENO: str  # 车辆编号
    VEHICLETYPENAME: str  # 车辆类型
    DEPARTMENTNAME: str  # 所属部门
    TELEPHONE: str  # 联系电话
    ISONLINE: str  # 是否在线
    SIMCODE: str  # SIM卡编码
    LONGITUDE: float  # 经度
    LATITUDE: float  # 纬度
    SPEED: float  # 速度(km/h)
    DIRECTION: float  # 方向角
    LOCATIONSTATE: Optional[int] = None  # 定位状态
    XCOOR: Optional[float] = None  # X坐标
    YCOOR: Optional[float] = None  # Y坐标
    INSERT_TIME: Optional[str] = None  # 插入时间
    UPDATE_TIME: Optional[str] = None  # 更新时间
    AIRPORT: Optional[str] = None  # 机场代码
    SOURCE_FILE: Optional[str] = None  # 源文件

    def get_timestamp(self) -> Optional[datetime]:
        """获取时间戳"""
        if self.LOCATIONTIME:
            try:
                return datetime.strptime(self.LOCATIONTIME, '%Y/%m/%d %H:%M')
            except:
                return None
        return None

    def get_position(self) -> tuple:
        """获取位置坐标"""
        return (self.LATITUDE, self.LONGITUDE)

    def is_towing_vehicle(self) -> bool:
        """判断是否为牵引车"""
        return '牵引车' in self.VEHICLETYPENAME or 'TRACT' in self.VEHICLETYPENAME.upper()
