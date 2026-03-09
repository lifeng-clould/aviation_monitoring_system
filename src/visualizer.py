# =====================================================================
# visualizer.py - 轨迹与指标可视化模块
# =====================================================================

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

class Visualizer:
    """
    用于可视化航班与牵引车的时空轨迹、速度分布与关键指标。
    """

    def __init__(self, matcher=None):
        """
        参数
        ----------
        matcher : DataMatcher
            若提供，将直接使用其匹配结果（flight_adsb_map、task_vehicle_map）。
        """
        self.matcher = matcher

    # -----------------------------------------------------------------
    # ✈️ 飞机轨迹可视化
    # -----------------------------------------------------------------
    def plot_flight_trajectory(self, adsb_records, flight_id=None):
        """
        绘制指定航班的滑行轨迹。
        adsb_records: list[AircraftAdsb] 或 DataFrame
        flight_id: str 可选
        """
        if not adsb_records:
            raise ValueError("ADS-B 数据为空，无法绘制轨迹。")

        # 支持两种输入类型
        if isinstance(adsb_records[0], dict):
            df = pd.DataFrame(adsb_records)
        elif hasattr(adsb_records[0], "__dict__"):
            df = pd.DataFrame([a.__dict__ for a in adsb_records])
        else:
            df = adsb_records.copy()

        # 字段校验
        expected_cols = {"LA", "LO", "TE"}
        if not expected_cols.issubset(df.columns):
            raise KeyError(f"缺少必要字段: {expected_cols - set(df.columns)}")

        df["TE_ts"] = pd.to_datetime(df["TE"], errors="coerce")
        df = df.sort_values(by="TE_ts")

        fig = px.scatter_mapbox(
            df,
            lat="LA",
            lon="LO",
            color="TE",
            color_continuous_scale="Turbo",
            hover_data=["FN", "TE"],
            title=f"航班 {flight_id or df['FN'].iloc[0]} 滑行轨迹",
            zoom=12,
            height=600
        )
        fig.update_layout(mapbox_style="carto-positron")
        fig.update_traces(marker=dict(size=8, opacity=0.8))
        return fig

    # -----------------------------------------------------------------
    # 🚗 牵引车轨迹可视化
    # -----------------------------------------------------------------
    def plot_vehicle_trajectory(self, gps_records, vehicle_id=None):
        """
        绘制牵引车行驶轨迹与速度分布。
        gps_records: list[VehicleGPS] 或 DataFrame
        """
        if not gps_records:
            raise ValueError("牵引车 GPS 数据为空。")

        if isinstance(gps_records[0], dict):
            df = pd.DataFrame(gps_records)
        elif hasattr(gps_records[0], "__dict__"):
            df = pd.DataFrame([v.__dict__ for v in gps_records])
        else:
            df = gps_records.copy()

        required = {"LATITUDE", "LONGITUDE", "SPEED", "LOCATIONTIME"}
        if not required.issubset(df.columns):
            raise KeyError(f"缺少必要字段: {required - set(df.columns)}")

        df["LOCATIONTIME_ts"] = pd.to_datetime(df["LOCATIONTIME"], errors="coerce")
        df = df.sort_values(by="LOCATIONTIME_ts")

        fig = px.scatter_mapbox(
            df,
            lat="LATITUDE",
            lon="LONGITUDE",
            color="SPEED",
            hover_data=["LOCATIONTIME", "SPEED"],
            color_continuous_scale="Viridis",
            title=f"牵引车 {vehicle_id or df['VEHICLENO'].iloc[0]} 行驶轨迹",
            zoom=14,
            height=600
        )
        fig.update_layout(mapbox_style="open-street-map")
        fig.update_traces(marker=dict(size=7, opacity=0.8))
        return fig

    # -----------------------------------------------------------------
    # ⏱️ 动态轨迹动画
    # -----------------------------------------------------------------
    def plot_flight_animation(self, adsb_records, flight_id=None):
        """
        动态显示航班滑行轨迹（时间序列动画）
        """
        if not adsb_records:
            raise ValueError("ADS-B 数据为空。")

        df = pd.DataFrame([a.__dict__ for a in adsb_records])
        if "TE" not in df.columns:
            raise KeyError("ADS-B 数据缺少时间字段 TE。")

        df["time_str"] = pd.to_datetime(df["TE"], errors="coerce").dt.strftime("%H:%M:%S")

        fig = px.scatter_mapbox(
            df,
            lat="LA",
            lon="LO",
            color="SPEED" if "SPEED" in df.columns else None,
            animation_frame="time_str",
            hover_data=["FN", "TE"],
            zoom=12,
            title=f"航班 {flight_id or df['FN'].iloc[0]} 滑行动态动画",
            height=650
        )
        fig.update_layout(mapbox_style="carto-darkmatter")
        return fig

    # -----------------------------------------------------------------
    # ⚙️ 综合指标图
    # -----------------------------------------------------------------
    def plot_speed_distribution(self, vehicle_gps):
        """
        绘制牵引车速度直方图。
        """
        df = pd.DataFrame([v.__dict__ for v in vehicle_gps])
        fig = px.histogram(
            df, x="SPEED", nbins=30, color_discrete_sequence=["#4C78A8"],
            title="牵引车速度分布"
        )
        fig.update_layout(xaxis_title="速度 (km/h)", yaxis_title="频次")
        return fig

    # -----------------------------------------------------------------
    # ⚡ 多航班对比图
    # -----------------------------------------------------------------
    def plot_multi_flight_paths(self, adsb_map, max_flights=5):
        """
        对比显示多架航班的滑行路线。
        adsb_map: dict[FUUID -> list[AircraftAdsb]]
        """
        fig = go.Figure()
        for i, (fuuid, records) in enumerate(list(adsb_map.items())[:max_flights]):
            df = pd.DataFrame([r.__dict__ for r in records])
            fig.add_trace(go.Scattermapbox(
                lat=df["LA"], lon=df["LO"],
                mode="lines+markers",
                name=f"航班 {fuuid}",
                line=dict(width=2),
                marker=dict(size=5)
            ))

        fig.update_layout(
            mapbox=dict(style="carto-positron", zoom=12),
            height=650,
            title=f"多航班滑行路线对比 (前 {max_flights} 架)"
        )
        return fig
