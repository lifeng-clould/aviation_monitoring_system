# ============================================================================
# src/models/task.py - 任务数据模型
# ============================================================================
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

@dataclass
class Task:
    """地面保障任务类 - 对应 clean_task_info.csv"""

    FUUID: str  # 关联航班ID
    TASKTYPECODE: str  # 任务类型代码
    TASKTYPENAME: str  # 任务类型名称
    TASKTYPEDESCRIPTION: Optional[str] = None  # 任务描述
    TASKCODE: Optional[str] = None  # 任务代码
    TASKNAME: Optional[str] = None  # 任务名称
    TASKACTION: Optional[str] = None  # 动作标记
    RESOURCEID: Optional[str] = None  # 资源ID
    TASKER: Optional[str] = None  # 执行人
    TASKNOTE: Optional[str] = None  # 备注
    TASKSCHEDULEDONPOSITIONDATETIME: Optional[str] = None  # 计划到位时间
    TASKACTUALONPOSITIONDATETIME: Optional[str] = None  # 实际到位时间
    TASKSCHEDULEDBEGINDATETIME: Optional[str] = None  # 计划开始时间
    TASKACTUALBEGINDATETIME: Optional[str] = None  # 实际开始时间
    TASKSCHEDULEDENDDATETIME: Optional[str] = None  # 计划结束时间
    TASKACTUALENDDATETIME: Optional[str] = None  # 实际结束时间
    INSERT_TIME: Optional[str] = None  # 插入时间
    UPDATE_TIME: Optional[str] = None  # 更新时间
    OPERATION: Optional[str] = None  # 操作类型
    STATION: Optional[str] = None  # 站点
    SOURCE: Optional[str] = None  # 数据来源
    MESSAGETYPE: Optional[str] = None  # 消息类型
    ID: Optional[str] = None  # 任务记录ID

    def is_towing_task(self) -> bool:
        """判断是否为牵引车任务"""
        return self.TASKTYPECODE == 'TRACT'

    def get_actual_end_time(self) -> Optional[datetime]:
        """获取实际结束时间"""
        if self.TASKACTUALENDDATETIME:
            try:
                return datetime.strptime(self.TASKACTUALENDDATETIME, '%Y/%m/%d %H:%M')
            except:
                return None
        return None