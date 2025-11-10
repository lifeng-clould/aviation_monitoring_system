# ============================================================================
# src/models/aircraft_adsb.py - 飞机ADS-B数据模型
# ============================================================================
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

@dataclass
class AircraftADSB:
    """飞机ADS-B数据类 - 对应 ADSB_PVG_merged.csv"""

    ID: str  # 记录ID
    HX: str  # 十六进制代码
    LO: float  # 经度
    LA: float  # 纬度
    HE: int  # 高度
    GV: int  # 地速
    CO: int  # 航向
    FN: str  # 航班号1
    FN2: Optional[str] = None  # 航班号2
    RE: Optional[str] = None  # 注册号
    FT: Optional[str] = None  # 机型
    OA: Optional[str] = None  # 起飞机场
    DA: Optional[str] = None  # 目的机场
    TE: Optional[str] = None  # 时间戳
    ETA: Optional[str] = None  # 预计到达时间
    UPDATE_TIME: Optional[str] = None  # 更新时间
    SR: Optional[str] = None  # 数据源
    SOURCE_FILE: Optional[str] = None  # 源文件

    def get_timestamp(self) -> Optional[datetime]:
        """获取时间戳"""
        if self.TE:
            try:
                return datetime.strptime(self.TE, '%Y/%m/%d %H:%M')
            except:
                return None
        return None

    def get_position(self) -> tuple:
        """获取位置坐标"""
        return (self.LA, self.LO)
