"""
数据探索工具 - 用于诊断匹配问题
使用方法: python explore_data.py
"""

import pandas as pd
from pathlib import Path
from datetime import datetime
from collections import Counter

def explore_flight_data(file_path):
    """探索航班数据"""
    print("\n" + "="*70)
    print("【航班数据探索】")
    print("="*70)

    df = pd.read_csv(file_path)
    print(f"\n总记录数: {len(df)}")
    print(f"\n列名: {list(df.columns)}")

    # 查看示例数据
    print("\n前5行数据:")
    print(df.head())

    # 统计航班号
    flight_ids = df['FLIGHTIDENTITY'].dropna().unique()
    print(f"\n唯一航班号数: {len(flight_ids)}")
    print(f"航班号示例: {flight_ids[:10]}")

    # 日期分布
    dates = df['FLIGHTSCHEDULEDDATE'].value_counts()
    print(f"\n日期分布:")
    print(dates.head())

    # 方向分布
    print(f"\n方向分布:")
    print(df['FLIGHTDIRECTION'].value_counts())

    # 时间字段填充情况
    print(f"\n时间字段填充率:")
    for col in ['SCHEDULEDONBLOCKDATETIME', 'ACTUALONBLOCKDATETIME',
                'SCHEDULEDOFFBLOCKDATETIME', 'ACTUALOFFBLOCKDATETIME']:
        fill_rate = df[col].notna().sum() / len(df) * 100
        print(f"  {col}: {fill_rate:.1f}%")

    return df

def explore_task_data(file_path):
    """探索任务数据"""
    print("\n" + "="*70)
    print("【任务数据探索】")
    print("="*70)

    df = pd.read_csv(file_path)
    print(f"\n总记录数: {len(df)}")

    # 查看示例数据
    print("\n前5行数据:")
    print(df.head())

    # 任务类型分布
    print(f"\n任务类型分布:")
    print(df['TASKTYPENAME'].value_counts())

    # FUUID分布
    fuuids = df['FUUID'].dropna().unique()
    print(f"\n唯一FUUID数: {len(fuuids)}")
    print(f"FUUID示例: {fuuids[:5]}")

    # 时间字段填充情况
    print(f"\n时间字段填充率:")
    for col in ['TASKACTUALENDDATETIME', 'TASKACTUALBEGINDATETIME']:
        if col in df.columns:
            fill_rate = df[col].notna().sum() / len(df) * 100
            print(f"  {col}: {fill_rate:.1f}%")

    return df

def explore_adsb_data(file_path):
    """探索ADS-B数据"""
    print("\n" + "="*70)
    print("【ADS-B数据探索】")
    print("="*70)

    df = pd.read_csv(file_path)
    print(f"\n总记录数: {len(df)}")

    # 查看示例数据
    print("\n前5行数据:")
    print(df[['FN', 'FN2', 'TE', 'OA', 'DA', 'LO', 'LA']].head(10))

    # 航班号统计
    fn_count = df['FN'].nunique()
    fn2_count = df['FN2'].nunique()
    print(f"\n唯一航班号数: FN={fn_count}, FN2={fn2_count}")

    # 显示所有唯一航班号
    unique_flights = set()
    for fn in df['FN'].dropna():
        unique_flights.add(str(fn))
    for fn2 in df['FN2'].dropna():
        unique_flights.add(str(fn2))

    print(f"\n所有唯一航班号 (前20个):")
    print(sorted(list(unique_flights))[:20])

    # 时间格式检查
    print(f"\n时间格式示例:")
    print(df['TE'].dropna().head(10).tolist())

    # 日期分布
    if 'TE' in df.columns:
        df['date'] = pd.to_datetime(df['TE'], errors='coerce').dt.date
        print(f"\n日期分布:")
        print(df['date'].value_counts().head())

    return df

def explore_vehicle_data(file_path):
    """探索车辆GPS数据"""
    print("\n" + "="*70)
    print("【车辆GPS数据探索】")
    print("="*70)

    df = pd.read_csv(file_path)
    print(f"\n总记录数: {len(df)}")

    # 查看示例数据
    print("\n前5行数据:")
    print(df[['VEHICLENO', 'LOCATIONTIME', 'VEHICLETYPENAME', 'SPEED', 'LONGITUDE', 'LATITUDE']].head())

    # 车辆统计
    vehicles = df['VEHICLENO'].unique()
    print(f"\n唯一车辆数: {len(vehicles)}")
    print(f"车辆编号列表: {vehicles[:10]}")

    # 车辆类型
    print(f"\n车辆类型分布:")
    print(df['VEHICLETYPENAME'].value_counts())

    # 时间格式检查
    print(f"\n时间格式示例:")
    print(df['LOCATIONTIME'].head(10).tolist())

    # 速度统计
    print(f"\n速度统计:")
    print(f"  最小值: {df['SPEED'].min():.2f} km/h")
    print(f"  最大值: {df['SPEED'].max():.2f} km/h")
    print(f"  平均值: {df['SPEED'].mean():.2f} km/h")
    print(f"  中位数: {df['SPEED'].median():.2f} km/h")

    # 坐标范围
    print(f"\n坐标范围:")
    print(f"  经度: {df['LONGITUDE'].min():.6f} ~ {df['LONGITUDE'].max():.6f}")
    print(f"  纬度: {df['LATITUDE'].min():.6f} ~ {df['LATITUDE'].max():.6f}")

    return df

def check_matching_potential(flight_df, task_df, adsb_df, vehicle_df):
    """检查匹配潜力"""
    print("\n" + "="*70)
    print("【匹配潜力分析】")
    print("="*70)

    # 1. 航班-任务匹配
    print("\n1. 航班-任务匹配 (FUUID):")
    flight_fuuids = set(flight_df['FUUID'].dropna())
    task_fuuids = set(task_df['FUUID'].dropna())
    common_fuuids = flight_fuuids & task_fuuids
    print(f"  航班FUUID数: {len(flight_fuuids)}")
    print(f"  任务FUUID数: {len(task_fuuids)}")
    print(f"  共同FUUID数: {len(common_fuuids)}")
    print(f"  匹配率: {len(common_fuuids)/len(flight_fuuids)*100:.1f}%")

    # 2. 航班-ADS-B匹配
    print("\n2. 航班-ADS-B匹配 (航班号):")
    flight_nos = set(flight_df['FLIGHTIDENTITY'].dropna().astype(str))
    adsb_fns = set(adsb_df['FN'].dropna().astype(str)) | set(adsb_df['FN2'].dropna().astype(str))
    common_flights = flight_nos & adsb_fns
    print(f"  航班号数: {len(flight_nos)}")
    print(f"  ADS-B航班号数: {len(adsb_fns)}")
    print(f"  共同航班号数: {len(common_flights)}")
    if common_flights:
        print(f"  共同航班号示例: {list(common_flights)[:10]}")
    print(f"  潜在匹配率: {len(common_flights)/len(flight_nos)*100:.1f}%")

    # 3. 时间重叠分析
    print("\n3. 时间范围分析:")

    # 航班时间范围
    flight_dates = pd.to_datetime(flight_df['FLIGHTSCHEDULEDDATE'], errors='coerce')
    print(f"  航班日期范围: {flight_dates.min()} 至 {flight_dates.max()}")

    # ADS-B时间范围
    adsb_times = pd.to_datetime(adsb_df['TE'], errors='coerce')
    print(f"  ADS-B时间范围: {adsb_times.min()} 至 {adsb_times.max()}")

    # 车辆GPS时间范围
    vehicle_times = pd.to_datetime(vehicle_df['LOCATIONTIME'], errors='coerce')
    print(f"  车辆GPS时间范围: {vehicle_times.min()} 至 {vehicle_times.max()}")

    # 任务时间范围
    if 'TASKACTUALENDDATETIME' in task_df.columns:
        task_times = pd.to_datetime(task_df['TASKACTUALENDDATETIME'], errors='coerce')
        print(f"  任务时间范围: {task_times.min()} 至 {task_times.max()}")

def main():
    data_dir = Path("data")

    # 探索各个数据集
    flight_df = explore_flight_data(data_dir / "clean_main.csv")
    task_df = explore_task_data(data_dir / "clean_task_info.csv")
    adsb_df = explore_adsb_data(data_dir / "ADSB_PVG_merged.csv")
    vehicle_df = explore_vehicle_data(data_dir / "vehicle_gps_towing_merged.csv")

    # 分析匹配潜力
    check_matching_potential(flight_df, task_df, adsb_df, vehicle_df)

    print("\n" + "="*70)
    print("数据探索完成！")
    print("="*70 + "\n")

if __name__ == "__main__":
    try:
        main()
    except FileNotFoundError as e:
        print(f"\n错误: {e}")
        print("请确保 data/ 目录下有所有CSV文件")
    except Exception as e:
        print(f"\n发生错误: {e}")
        import traceback
        traceback.print_exc()