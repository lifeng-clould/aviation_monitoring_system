# ============================================================================
# main.py - 机坪牵引作业“智慧眼”监管与仿真平台 · Streamlit 界面
# ============================================================================

import streamlit as st
import pandas as pd

from src.data_loader import DataLoader
from src.data_matcher import DataMatcher
from src.visualizer import Visualizer
from src.blockchain_platform import BlockchainPlatform


def filter_dataframe_for_keyword(df: pd.DataFrame, keyword: str) -> pd.DataFrame:
    """
    根据关键字过滤 DataFrame（仅在字符列上匹配，若无结果则返回原数据）。
    """
    if not keyword:
        return df

    keyword_lower = keyword.lower()
    mask = pd.Series(False, index=df.index)

    for col in df.columns:
        series = df[col]
        if pd.api.types.is_string_dtype(series) or series.dtype == object:
            mask = mask | series.astype(str).str.lower().str.contains(keyword_lower, na=False)

    filtered = df[mask]
    return filtered if not filtered.empty else df


# ----------------------------------------------------------------------------
# 页面配置 & 全局样式
# ----------------------------------------------------------------------------
st.set_page_config(
    page_title="机坪牵引作业“智慧眼”监管与仿真平台",
    page_icon="🛫",
    layout="wide",
    initial_sidebar_state="expanded"
)

CUSTOM_CSS = """
<style>
:root {
    --primary-color: #004a99;
    --accent-color: #ffc107;
    --bg-soft: #f6f9fc;
}
.stApp {
    background-color: var(--bg-soft);
}
.block-container {
    padding-top: 1.5rem;
    padding-bottom: 2rem;
}
.metric-label {
    font-size: 0.85rem;
    color: #5f6b7c;
}
</style>
"""
st.markdown(CUSTOM_CSS, unsafe_allow_html=True)

st.title("机坪牵引作业“智慧眼”监管与仿真平台")
st.caption("基于联盟链可信数据与数字孪生仿真，实现“预测-调度-监管”闭环的机坪牵引安全监管系统。")


# ----------------------------------------------------------------------------
# 初始化（缓存资源）
# ----------------------------------------------------------------------------
@st.cache_resource
def init_system():
    loader = DataLoader("data", date_filter="2025-09-15")
    loader.load_all()
    matcher = DataMatcher(loader)
    matcher.match_all()
    visualizer = Visualizer(matcher)
    blockchain = BlockchainPlatform()
    return loader, matcher, visualizer, blockchain


loader, matcher, visualizer, blockchain = init_system()


# ----------------------------------------------------------------------------
# 侧边栏 · 快速控制
# ----------------------------------------------------------------------------
with st.sidebar:
    st.header("⚙️ 快速控制面板")
    scenario = st.selectbox(
        "仿真场景",
        ["常规保障", "大面积延误", "恶劣天气", "设备故障演练"],
        help="不同场景用于向评委说明仿真假设。"
    )
    monitor_window = st.slider("关注时间窗（分钟）", 15, 240, 60, 15)
    focus_keyword = st.text_input("关键字过滤", placeholder="输入航班号 / FUUID / 车辆号")

    st.markdown("---")
    st.caption("数据快照")
    st.metric("航班记录", f"{len(loader.flights):,}", "clean_main.csv")
    st.metric("任务记录", f"{len(loader.tasks):,}", "clean_task_info.csv")
    st.metric("ADS-B 轨迹点", f"{len(loader.adsb_data):,}", "ADSB_PVG_merged.csv")
    st.metric("车辆 GPS 点位", f"{len(loader.vehicle_gps):,}", "vehicle_gps_towing_merged.csv")

    st.markdown("---")
    st.caption("提示")
    st.write(
        "可在主界面切换不同视图；若需要强调特定航班，可在上方输入关键字并刷新表格视图。"
    )


# ----------------------------------------------------------------------------
# 顶部 KPI
# ----------------------------------------------------------------------------
summary_metrics = [
    ("航班-任务关联", f"{len(matcher.flight_task_map):,}", "FUUID 映射"),
    ("航班-ADS-B 覆盖", f"{len(matcher.flight_adsb_map):,}", "轨迹可用航班"),
    ("牵引任务-车辆关联", f"{len(matcher.task_vehicle_map):,}", "GPS 匹配任务"),
    ("区块链通道", blockchain.get_statistics().get("channel_count", 6), "联盟链节点同步")
]

metric_cols = st.columns(len(summary_metrics))
for col, (title, value, desc) in zip(metric_cols, summary_metrics):
    col.metric(title, value, desc)

st.divider()


# ----------------------------------------------------------------------------
# 选项卡布局
# ----------------------------------------------------------------------------
tabs = st.tabs([
    "📁 数据资产总览",
    "🔗 多源关联穿透",
    "🗺️ 轨迹监控中心",
    "🔒 合约监管演练",
    "📊 指标与洞察"
])


# ----------------------------------------------------------------------------
# 📁 数据资产总览
# ----------------------------------------------------------------------------
with tabs[0]:
    st.subheader("数据资产体检")
    st.info(f"当前仿真场景：**{scenario}** · 关注时间窗：**{monitor_window} min**")

    dataset_health = pd.DataFrame([
        {"数据集": "航班主表", "记录数": len(loader.flights), "链路": "clean_main.csv"},
        {"数据集": "任务工单", "记录数": len(loader.tasks), "链路": "clean_task_info.csv"},
        {"数据集": "ADS-B 轨迹", "记录数": len(loader.adsb_data), "链路": "ADSB_PVG_merged.csv"},
        {"数据集": "车辆 GPS", "记录数": len(loader.vehicle_gps), "链路": "vehicle_gps_towing_merged.csv"}
    ])
    st.dataframe(dataset_health, use_container_width=True, hide_index=True)

    st.subheader("快速数据预览")
    df_map = {
        "clean_main": pd.DataFrame([f.__dict__ for f in loader.flights]),
        "clean_task_info": pd.DataFrame([t.__dict__ for t in loader.tasks]),
        "ADSB_PVG_merged": pd.DataFrame([a.__dict__ for a in loader.adsb_data]),
        "vehicle_gps_towing_merged": pd.DataFrame([v.__dict__ for v in loader.vehicle_gps])
    }

    col_preview, col_hint = st.columns((1.5, 1))
    with col_preview:
        dataset = st.selectbox(
            "选择要预览的数据集",
            list(df_map.keys()),
            help="结合侧边栏关键字过滤可快速定位异常记录。"
        )
        df_to_show = filter_dataframe_for_keyword(df_map[dataset], focus_keyword)
        st.dataframe(df_to_show.head(15), use_container_width=True)
        st.caption(f"共 {len(df_map[dataset]):,} 条记录 · 展示前 15 条")

    with col_hint:
        st.markdown("**字段提示**")
        st.markdown("""
        - `FUUID` / `FLIGHTIDENTITY`：航班唯一标识  
        - `TASKTYPENAME`：地面保障任务类型  
        - `LATITUDE / LONGITUDE`：车辆 GPS 点位  
        - `TE`：ADS-B 时间戳（UTC）
        """)
        st.markdown("**常见检查项**")
        st.write("- 航班号是否缺失\n- GPS 时间是否在关注窗口内\n- 任务起止是否完整")


# ----------------------------------------------------------------------------
# 🔗 多源关联穿透
# ----------------------------------------------------------------------------
with tabs[1]:
    st.subheader("FUUID 跨域关联概览")
    if not matcher.flight_task_map:
        st.info("暂无可展示的航班-任务映射，请确认数据是否加载成功。")
    else:
        available_flights = list(matcher.flight_task_map.keys())
        default_flight = available_flights[0] if available_flights else None
        selected_flight = st.selectbox(
            "聚焦航班（FUUID）",
            ["全部航班"] + available_flights[:200],
            index=0
        )

        data_rows = []
        for fuuid, tasks in matcher.flight_task_map.items():
            if selected_flight != "全部航班" and fuuid != selected_flight:
                continue
            flight_obj = matcher._get_flight_by_fuuid(fuuid)
            for task in tasks:
                data_rows.append({
                    "FUUID": fuuid,
                    "航班号": flight_obj.FLIGHTIDENTITY if flight_obj else "",
                    "任务类型": task.TASKTYPENAME,
                    "任务开始": task.TASKACTUALBEGINDATETIME,
                    "任务结束": task.TASKACTUALENDDATETIME
                })

        df_join = pd.DataFrame(data_rows)
        st.dataframe(df_join.head(30), use_container_width=True)
        st.caption(f"展示 {len(df_join)} 条匹配结果 · 前 30 条预览")

        st.markdown("**关联说明**")
        st.write(
            "以 `FUUID` 作为跨系统主键，串联航班计划、地面任务以及车辆定位。若航班缺少匹配任务，可在上方关键字过滤中输入航班号快速定位。"
        )


# ----------------------------------------------------------------------------
# 🗺️ 轨迹监控中心
# ----------------------------------------------------------------------------
with tabs[2]:
    st.subheader("实时轨迹与回放")
    if not matcher.flight_adsb_map:
        st.warning("ADS-B 轨迹映射为空，请检查原始数据。")
    else:
        vis_type = st.radio(
            "选择可视化模式",
            ["航班 ADS-B 轨迹", "牵引车运行轨迹", "航班动态回放"],
            horizontal=True
        )

        if vis_type == "航班 ADS-B 轨迹":
            fuuid = st.selectbox("选择航班", list(matcher.flight_adsb_map.keys())[:50])
            adsb_points = matcher.flight_adsb_map.get(fuuid, [])
            if adsb_points:
                fig = visualizer.plot_flight_trajectory(adsb_points, flight_id=fuuid)
                st.plotly_chart(fig, use_container_width=True)
                st.caption("基于 Mapbox 的航迹图，可用于展示滑行路线与热点。")
            else:
                st.warning("未找到该航班的 ADS-B 数据。")

        elif vis_type == "航班动态回放":
            fuuid = st.selectbox("选择航班进行动画播放", list(matcher.flight_adsb_map.keys())[:50])
            adsb_points = matcher.flight_adsb_map.get(fuuid, [])
            if adsb_points:
                fig = visualizer.plot_flight_animation(adsb_points, flight_id=fuuid)
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.warning("未找到该航班的 ADS-B 数据。")

        else:
            vehicle_ids = sorted({v.VEHICLENO for v in loader.vehicle_gps})
            vehicle_id = st.selectbox("选择牵引车编号", vehicle_ids[:50])
            gps_points = [v for v in loader.vehicle_gps if v.VEHICLENO == vehicle_id]
            if gps_points:
                fig = visualizer.plot_vehicle_trajectory(gps_points, vehicle_id=vehicle_id)
                st.plotly_chart(fig, use_container_width=True)
                st.caption("可用于展示牵引车运行范围、速度热点、滞留风险等。")
            else:
                st.warning("未找到该车辆的 GPS 数据。")


# ----------------------------------------------------------------------------
# 🔒 合约监管演练
# ----------------------------------------------------------------------------
with tabs[3]:
    st.subheader("智能合约合规检测")
    st.markdown(
        "通过输入不同的运行参数，快速演示联盟链合约如何在“事中”发现违规并回写证据。"
    )

    with st.form("compliance_form"):
        col_left, col_right, col_extra = st.columns(3)
        with col_left:
            speed = st.slider("牵引车速度 (km/h)", 0.0, 10.0, 2.5, 0.1)
        with col_right:
            distance = st.slider("距机身距离 (m)", 0.0, 10.0, 6.0, 0.1)
        with col_extra:
            brake_tests = st.number_input("试刹车次数", 0, 5, 2)

        submitted = st.form_submit_button("执行检测")

    if submitted:
        payload = {
            "speed": speed,
            "distance_to_aircraft": distance,
            "brake_test_count": brake_tests
        }
        result = blockchain.check_compliance("towing_safety", payload)
        if result.get("compliant"):
            st.success("✅ 合规：未检测到违规行为。")
        else:
            st.error(f"⚠️ 检测到 {len(result['violations'])} 项违规：")
            for violation in result["violations"]:
                st.markdown(
                    f"- **{violation['rule']}** · {violation['violation']} · 严重性：{violation['severity']}"
                )

    stats = blockchain.get_statistics()
    stat_cols = st.columns(3)
    stat_cols[0].metric("通道数量", stats.get("channel_count", 0))
    stat_cols[1].metric("已记录区块", stats.get("total_blocks", 0))
    stat_cols[2].metric("累计违规事件", stats.get("violation_events", 0))

    with st.expander("链上存证详情"):
        st.json(stats)


# ----------------------------------------------------------------------------
# 📊 指标与洞察
# ----------------------------------------------------------------------------
with tabs[4]:
    st.subheader("匹配成效与运行洞察")
    insight_tabs = st.tabs(["匹配成效", "速度分布", "多航班对比"])

    with insight_tabs[0]:
        total_flights = len(loader.flights)
        success_rates = {
            "航班-任务匹配": len(matcher.flight_task_map) / total_flights * 100 if total_flights else 0,
            "航班-ADS-B 匹配": len(matcher.flight_adsb_map) / total_flights * 100 if total_flights else 0,
            "任务-车辆匹配": len(matcher.task_vehicle_map) / len(loader.tasks) * 100 if loader.tasks else 0
        }
        df_success = pd.DataFrame(list(success_rates.items()), columns=["匹配类型", "成功率"])
        st.bar_chart(df_success.set_index("匹配类型"))
        st.caption("越接近 100% 越说明底层数据打通完善。")

    with insight_tabs[1]:
        fig = visualizer.plot_speed_distribution(loader.vehicle_gps)
        st.plotly_chart(fig, use_container_width=True)
        st.caption("可用来强调速度合规监控能力，支持再叠加合约阈值。")

    with insight_tabs[2]:
        if matcher.flight_adsb_map:
            fig_multi = visualizer.plot_multi_flight_paths(matcher.flight_adsb_map, max_flights=5)
            st.plotly_chart(fig_multi, use_container_width=True)
            st.caption("多航班轨迹叠加，展示热点与冲突区域。")
        else:
            st.info("暂未找到可叠加的航班轨迹数据。")

    st.markdown("**说明**")
    st.write(
        "上述指标可直接用于答辩：① 匹配率体现数据治理；② 速度分布突出安全监测；③ 轨迹对比展示仿真能力。"
    )
