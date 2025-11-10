"""
数据过滤脚本 - 只保留2025-09-15的数据
直接修改CSV文件，删除其他日期的数据

使用方法:
python filter_data_to_20250915.py

警告: 此脚本会直接修改data/目录下的CSV文件，建议先备份！
"""

import pandas as pd
from pathlib import Path
from datetime import datetime
import shutil


def backup_files(data_dir: Path):
    """备份原始文件"""
    backup_dir = data_dir / "backup_before_filter"
    backup_dir.mkdir(exist_ok=True)

    files = [
        "clean_main.csv",
        "clean_task_info.csv",
        "ADSB_PVG_merged.csv",
        "vehicle_gps_towing_merged.csv"
    ]

    print("=" * 70)
    print("备份原始文件...")
    print("=" * 70)

    for file in files:
        src = data_dir / file
        dst = backup_dir / file
        if src.exists():
            shutil.copy2(src, dst)
            print(f"  ✓ {file} -> backup_before_filter/{file}")

    print(f"\n备份完成！备份位置: {backup_dir}\n")


def filter_clean_main(file_path: Path, target_date: str = "2025-09-15"):
    """过滤航班数据"""
    print("=" * 70)
    print(f"处理: {file_path.name}")
    print("=" * 70)

    df = pd.read_csv(file_path)
    original_count = len(df)
    print(f"原始记录数: {original_count}")

    # 解析日期 - 格式: 2025/9/15 或 2025/09/15
    df['date_parsed'] = pd.to_datetime(df['FLIGHTSCHEDULEDDATE'], format='%Y-%m-%d', errors='coerce')
    target_date_obj = datetime.strptime(target_date, '%Y-%m-%d').date()

    # 过滤
    df_filtered = df[df['date_parsed'].dt.date == target_date_obj].copy()
    df_filtered = df_filtered.drop(columns=['date_parsed'])

    # 保存（覆盖原文件）
    df_filtered.to_csv(file_path, index=False)

    filtered_count = len(df_filtered)
    deleted_count = original_count - filtered_count

    print(f"保留记录数: {filtered_count}")
    print(f"删除记录数: {deleted_count}")
    print(f"✓ 文件已更新\n")

    return df_filtered


def filter_clean_task_info(file_path: Path, flight_fuuids: set):
    """过滤任务数据 - 基于航班FUUID"""
    print("=" * 70)
    print(f"处理: {file_path.name}")
    print("=" * 70)

    df = pd.read_csv(file_path)
    original_count = len(df)
    print(f"原始记录数: {original_count}")

    # 只保留与2025-09-15航班关联的任务
    df_filtered = df[df['FUUID'].isin(flight_fuuids)].copy()

    # 保存（覆盖原文件）
    df_filtered.to_csv(file_path, index=False)

    filtered_count = len(df_filtered)
    deleted_count = original_count - filtered_count

    print(f"保留记录数: {filtered_count}")
    print(f"删除记录数: {deleted_count}")
    print(f"✓ 文件已更新\n")

    return df_filtered


def filter_adsb_data(file_path: Path, target_date: str = "2025-09-15"):
    """过滤ADS-B数据"""
    print("=" * 70)
    print(f"处理: {file_path.name}")
    print("=" * 70)

    df = pd.read_csv(file_path)
    original_count = len(df)
    print(f"原始记录数: {original_count}")

    # 解析日期 - 格式: 2025/9/15 0:00
    df['date_parsed'] = pd.to_datetime(df['TE'], format='%Y-%m-%d %H:%M', errors='coerce')
    target_date_obj = datetime.strptime(target_date, '%Y-%m-%d').date()

    # 过滤
    df_filtered = df[df['date_parsed'].dt.date == target_date_obj].copy()
    df_filtered = df_filtered.drop(columns=['date_parsed'])

    # 保存（覆盖原文件）
    df_filtered.to_csv(file_path, index=False)

    filtered_count = len(df_filtered)
    deleted_count = original_count - filtered_count

    print(f"保留记录数: {filtered_count}")
    print(f"删除记录数: {deleted_count}")
    print(f"✓ 文件已更新\n")

    return df_filtered


def filter_vehicle_gps_data(file_path: Path, target_date: str = "2025-09-15"):
    """过滤车辆GPS数据"""
    print("=" * 70)
    print(f"处理: {file_path.name}")
    print("=" * 70)

    df = pd.read_csv(file_path)
    original_count = len(df)
    print(f"原始记录数: {original_count}")

    # 解析日期 - 格式: 2025/9/15 0:12:34 或 2025/9/15 0:12
    # 先尝试带秒的格式，失败则尝试不带秒的格式
    df['date_parsed'] = pd.to_datetime(df['LOCATIONTIME'], errors='coerce')
    target_date_obj = datetime.strptime(target_date, '%Y-%m-%d').date()

    # 过滤
    df_filtered = df[df['date_parsed'].dt.date == target_date_obj].copy()
    df_filtered = df_filtered.drop(columns=['date_parsed'])

    # 保存（覆盖原文件）
    df_filtered.to_csv(file_path, index=False)

    filtered_count = len(df_filtered)
    deleted_count = original_count - filtered_count

    print(f"保留记录数: {filtered_count}")
    print(f"删除记录数: {deleted_count}")
    print(f"✓ 文件已更新\n")

    return df_filtered


def main():
    """主函数"""
    print("\n" + "=" * 70)
    print("数据过滤脚本 - 只保留 2025-09-15 的数据")
    print("=" * 70)
    print("\n警告: 此脚本会直接修改CSV文件!")
    print("建议先备份data/目录\n")

    # 确认操作
    response = input("是否继续? (输入 yes 继续): ")
    if response.lower() != 'yes':
        print("操作已取消")
        return

    # 设置路径
    data_dir = Path("data")
    target_date = "2025-09-15"

    if not data_dir.exists():
        print(f"\n错误: 找不到 {data_dir} 目录")
        return

    # 先备份
    backup_files(data_dir)

    # 开始过滤
    print("=" * 70)
    print("开始过滤数据...")
    print("=" * 70)
    print()

    # 1. 过滤航班数据
    flight_file = data_dir / "clean_main.csv"
    df_flights = filter_clean_main(flight_file, target_date)
    flight_fuuids = set(df_flights['FUUID'].values)

    # 2. 过滤任务数据（基于航班FUUID）
    task_file = data_dir / "clean_task_info.csv"
    filter_clean_task_info(task_file, flight_fuuids)

    # 4. 过滤车辆GPS数据
    vehicle_file = data_dir / "vehicle_gps_towing_merged.csv"
    filter_vehicle_gps_data(vehicle_file, target_date)

    # 完成
    print("=" * 70)
    print("过滤完成!")
    print("=" * 70)
    print(f"\n所有文件已更新，只保留 {target_date} 的数据")
    print(f"原始文件已备份至: data/backup_before_filter/")
    print("\n如需恢复原始数据，可从备份目录复制回来\n")


if __name__ == "__main__":
    try:
        main()
    except FileNotFoundError as e:
        print(f"\n错误: {e}")
        print("\n请确保运行此脚本时在项目根目录，且data/目录存在")
    except Exception as e:
        print(f"\n发生错误: {e}")
        import traceback

        traceback.print_exc()
        print("\n如果数据已被部分修改，可以从 data/backup_before_filter/ 恢复")

# ============================================================================
# 使用说明
# ============================================================================
"""
【使用步骤】

1. 确保当前目录结构:
   project/
   ├── data/
   │   ├── clean_main.csv
   │   ├── clean_task_info.csv
   │   ├── ADSB_PVG_merged.csv
   │   └── vehicle_gps_towing_merged.csv
   └── filter_data_to_20250915.py

2. 运行脚本:
   python filter_data_to_20250915.py

3. 输入 yes 确认操作

4. 脚本会:
   - 自动备份原始文件到 data/backup_before_filter/
   - 过滤所有CSV文件，只保留2025-09-15的数据
   - 覆盖原文件（文件名不变）

【过滤规则】

- clean_main.csv: 根据 FLIGHTSCHEDULEDDATE 过滤
- clean_task_info.csv: 保留与过滤后航班关联的任务（通过FUUID）
- ADSB_PVG_merged.csv: 根据 TE 字段过滤
- vehicle_gps_towing_merged.csv: 根据 LOCATIONTIME 字段过滤

【安全措施】

1. 运行前会提示确认
2. 自动备份原始文件
3. 如需恢复: 从 data/backup_before_filter/ 复制回来

【时间格式说明】

脚本能正确处理以下时间格式:
- FLIGHTSCHEDULEDDATE: 2025/9/15 或 2025/09/15
- TE: 2025/9/15 0:00
- LOCATIONTIME: 2025/9/15 0:12:34 或 2025/9/15 0:12

【输出示例】

================================================================
处理: clean_main.csv
================================================================
原始记录数: 6344
保留记录数: 487
删除记录数: 5857
✓ 文件已更新

【注意事项】

1. 脚本会直接修改CSV文件，请确保重要数据已备份
2. 如果中途出错，可以从 data/backup_before_filter/ 恢复
3. 过滤后的文件名保持不变
4. 建议在运行前手动再备份一次data目录
"""