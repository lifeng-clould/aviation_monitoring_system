# ============================================================================
# src/models/flight.py - 航班数据模型
# ============================================================================
from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class Flight:
    """航班信息类 - 对应 clean_main.csv"""

    FUUID: str  # 航班唯一标识
    FLIGHTIDENTITY: str  # 航班号
    FLIGHTSCHEDULEDDATE: str  # 计划执行日期
    FLIGHTDIRECTION: str  # 航班方向(A/D)
    BASEAIRPORTIATACODE: str  # 机场三字码
    BASEAIRPORTICAOCODE: str  # 机场四字码
    STANDID: Optional[str] = None  # 停机位号
    SCHEDULEDONBLOCKDATETIME: Optional[str] = None  # 计划进位时间
    ACTUALONBLOCKDATETIME: Optional[str] = None  # 实际进位时间
    SCHEDULEDOFFBLOCKDATETIME: Optional[str] = None  # 计划离位时间
    ACTUALOFFBLOCKDATETIME: Optional[str] = None  # 实际离位时间
    SCHEDULEDTAKEOFFDATETIME: Optional[str] = None  # 计划起飞时间
    ACTUALTAKEOFFDATETIME: Optional[str] = None  # 实际起飞时间
    INSERT_TIME: Optional[str] = None  # 插入时间
    UPDATE_TIME: Optional[str] = None  # 更新时间
    OPERATION: Optional[str] = None  # 操作类型

    def is_arrival(self) -> bool:
        """判断是否为进港航班"""
        return self.FLIGHTDIRECTION == 'A'

    def is_departure(self) -> bool:
        """判断是否为离港航班"""
        return self.FLIGHTDIRECTION == 'D'

    def get_actual_time(self) -> Optional[datetime]:
        """获取实际运行时间（进港用on-block，离港用off-block）"""
        time_str = self.ACTUALONBLOCKDATETIME if self.is_arrival() else self.ACTUALOFFBLOCKDATETIME
        if time_str:
            try:
                return datetime.strptime(time_str, '%Y/%m/%d %H:%M')
            except:
                return None
        return None





