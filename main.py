# ============================================================================
# main.py - 航空器牵引作业安全监管系统 可视化主程序
# ============================================================================
import streamlit as st
import pandas as pd
from src.data_loader import DataLoader
from src.data_matcher import DataMatcher
from src.visualizer import Visualizer
from src.blockchain_platform import BlockchainPlatform

# ----------------------------------------------------------------------------
# 页面配置
# ----------------------------------------------------------------------------
st.set_page_config(
    page_title="航空器牵引作业安全监管系统",
    page_icon="✈️",
    layout="wide"
)

st.title("✈️ 航空器牵引作业安全监管系统")

# ----------------------------------------------------------------------------
# 初始化模块（缓存）
# ----------------------------------------------------------------------------
@st.cache_resource
def init_system():
    loader = DataLoader("data")
    loader.load_all()
    matcher = DataMatcher(loader)
    matcher.match_all()
    visualizer = Visualizer(matcher)
    blockchain = BlockchainPlatform()
    return loader, matcher, visualizer, blockchain

loader, matcher, visualizer, blockchain = init_system()

# ----------------------------------------------------------------------------
# 选项卡布局
# ----------------------------------------------------------------------------
tabs = st.tabs([
    "📁 数据总览",
    "🔗 航班任务关联",
    "🗺️ 轨迹可视化",
    "🔒 区块链监管仿真",
    "📊 统计分析报告"
])

# ----------------------------------------------------------------------------
# 📁 数据总览
# ----------------------------------------------------------------------------
with tabs[0]:
    st.header("📊 数据总览")

    col1, col2 = st.columns(2)
    with col1:
        st.markdown("### 数据表概况")
        st.dataframe(pd.DataFrame({
            "数据集": ["航班信息", "任务信息", "ADS-B轨迹", "牵引车GPS"],
            "记录数": [
                len(loader.flights),
                len(loader.tasks),
                len(loader.adsb_data),
                len(loader.vehicle_gps)
            ]
        }))

    with col2:
        st.markdown("### 数据示例预览")
        dataset = st.selectbox(
            "选择要查看的数据集：",
            ["clean_main", "clean_task_info", "ADSB_PVG_merged", "vehicle_gps_towing_merged"]
        )
        df_map = {
            "clean_main": pd.DataFrame([f.__dict__ for f in loader.flights]),
            "clean_task_info": pd.DataFrame([t.__dict__ for t in loader.tasks]),
            "ADSB_PVG_merged": pd.DataFrame([a.__dict__ for a in loader.adsb_data]),
            "vehicle_gps_towing_merged": pd.DataFrame([v.__dict__ for v in loader.vehicle_gps])
        }
        st.dataframe(df_map[dataset].head(10))

# ----------------------------------------------------------------------------
# 🔗 航班任务关联
# ----------------------------------------------------------------------------
with tabs[1]:
    st.header("✈️ 航班与牵引任务匹配结果")

    st.markdown("系统基于 **FUUID** 自动匹配航班与地面拖车任务，结果如下：")

    flight_task_map = matcher.match_flight_tasks()
    data = []
    for fuuid, tasks in flight_task_map.items():
        for t in tasks:
            data.append({
                "FUUID": fuuid,
                "航班号": matcher._get_flight_by_fuuid(fuuid).FLIGHTIDENTITY if matcher._get_flight_by_fuuid(fuuid) else "",
                "任务类型": t.TASKTYPENAME,
                "任务开始": t.TASKACTUALBEGINDATETIME,
                "任务结束": t.TASKACTUALENDDATETIME
            })
    df = pd.DataFrame(data)
    st.dataframe(df.head(20))

# ----------------------------------------------------------------------------
# 🗺️ 轨迹可视化
# ----------------------------------------------------------------------------
with tabs[2]:
    st.header("🗺️ 航空器与牵引车轨迹可视化")

    vis_type = st.radio("选择可视化类型：", ["飞机滑行轨迹", "牵引车行驶轨迹", "航班动态动画"])

    if vis_type == "飞机滑行轨迹":
        fuuid = st.selectbox("选择航班：", list(matcher.flight_adsb_map.keys())[:20])
        adsb_points = matcher.flight_adsb_map.get(fuuid, [])
        if adsb_points:
            fig = visualizer.plot_flight_trajectory(adsb_points, flight_id=fuuid)
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.warning("未找到该航班的ADS-B轨迹数据。")

    elif vis_type == "航班动态动画":
        fuuid = st.selectbox("选择航班进行动画播放：", list(matcher.flight_adsb_map.keys())[:20])
        adsb_points = matcher.flight_adsb_map.get(fuuid, [])
        if adsb_points:
            fig = visualizer.plot_flight_animation(adsb_points, flight_id=fuuid)
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.warning("未找到该航班的ADS-B轨迹数据。")

    else:  # 牵引车轨迹
        vehicle_list = list(set(v.VEHICLENO for v in loader.vehicle_gps))
        vehicle_id = st.selectbox("选择牵引车编号：", vehicle_list[:20])
        gps_points = [v for v in loader.vehicle_gps if v.VEHICLENO == vehicle_id]
        if gps_points:
            fig = visualizer.plot_vehicle_trajectory(gps_points, vehicle_id=vehicle_id)
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.warning("未找到该车辆的GPS轨迹数据。")

# ----------------------------------------------------------------------------
# 🔒 区块链监管仿真
# ----------------------------------------------------------------------------
with tabs[3]:
    st.header("🔒 区块链智能合约监管模拟")

    st.markdown("""
    **合约规则示例：**  
    - 牵引车距机身 < 5m 且速度 > 3km/h 触发报警  
    - 试刹车次数 < 2 触发中风险警告  
    """)

    col1, col2 = st.columns(2)
    with col1:
        speed = st.slider("模拟牵引车速度 (km/h)", 0.0, 10.0, 2.5, 0.1)
        distance = st.slider("距机身距离 (m)", 0.0, 10.0, 6.0, 0.1)
        brake_tests = st.number_input("试刹车次数", 0, 5, 2)
        simulate_btn = st.button("执行检测")

    with col2:
        if simulate_btn:
            data = {
                "speed": speed,
                "distance_to_aircraft": distance,
                "brake_test_count": brake_tests
            }
            result = blockchain.check_compliance("towing_safety", data)
            if result.get("compliant"):
                st.success("✅ 合规：未检测到违规行为。")
            else:
                st.error(f"⚠️ 检测到 {len(result['violations'])} 项违规：")
                for v in result["violations"]:
                    st.markdown(f"- **{v['rule']}**：{v['violation']}（严重性：{v['severity']}）")

    st.markdown("### 区块链平台状态")
    stats = blockchain.get_statistics()
    st.json(stats)

# ----------------------------------------------------------------------------
# 📊 统计分析报告
# ----------------------------------------------------------------------------
with tabs[4]:
    st.header("📈 系统统计分析与绩效指标")

    col1, col2 = st.columns(2)

    with col1:
        st.subheader("匹配成功率 (%)")
        total_flights = len(loader.flights)
        success_rates = {
            "航班-任务匹配": len(matcher.flight_task_map) / total_flights * 100 if total_flights else 0,
            "航班-ADS-B匹配": len(matcher.flight_adsb_map) / total_flights * 100 if total_flights else 0,
            "任务-车辆匹配": len(matcher.task_vehicle_map) / len(loader.tasks) * 100 if loader.tasks else 0
        }
        df_success = pd.DataFrame(list(success_rates.items()), columns=["匹配类型", "成功率"])
        st.bar_chart(df_success.set_index("匹配类型"))

    with col2:
        st.subheader("牵引车速度分布")
        fig = visualizer.plot_speed_distribution(loader.vehicle_gps)
        st.plotly_chart(fig, use_container_width=True)

    st.markdown("### 平台运行状态")
    blockchain.print_platform_status()
