import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Empty, Select, Slider, Table, Tag, Typography } from "antd";
import { AimOutlined, CaretRightFilled, PauseOutlined, RedoOutlined } from "@ant-design/icons";
import Map, { Layer, Marker, NavigationControl, Source, type MapRef } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useSearchParams } from "react-router-dom";
import { fetchTrace, type TracePoint, type TraceResponse } from "../api/client";
import { HorizontalBarChart, TrajectoryRiskChart } from "../components/charts/LightCharts";
import LoadingView from "../components/common/LoadingView";
import PageQuickNav from "../components/layout/PageQuickNav";
import { useAuthStore } from "../store/useAuthStore";

const MAP_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "OpenStreetMap contributors"
    }
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }]
};

const aircraftTowLayer = { id: "aircraft-tow", type: "line", paint: { "line-color": "#0d5bd7", "line-width": 4.8, "line-opacity": 0.96 } } as const;
const aircraftDepartureLayer = { id: "aircraft-departure", type: "line", paint: { "line-color": "#79b1ff", "line-width": 3.4, "line-opacity": 0.94 } } as const;
const vehicleLayer = { id: "vehicle-path", type: "line", paint: { "line-color": "#f59a52", "line-width": 4.2, "line-opacity": 0.94 } } as const;
const PLAYBACK_OPTIONS = [
  { value: 0.5, label: "0.5x" },
  { value: 1, label: "1.0x" },
  { value: 2, label: "2.0x" },
  { value: 4, label: "4.0x" }
];

interface EventItem {
  key: string;
  label: string;
  time?: string | null;
  actor: string;
  note: string;
}

function toMillis(value?: string | null) {
  if (!value) return null;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const timestamp = new Date(normalized).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function formatClock(value?: string | null) {
  if (!value) return "--";
  return value.replace("T", " ").slice(11, 19);
}

function buildFrames(paths: TracePoint[][]) {
  const values = new Set<number>();
  paths.flat().forEach((point) => {
    const timestamp = toMillis(point.time);
    if (timestamp !== null) values.add(timestamp);
  });
  return [...values].sort((left, right) => left - right);
}

function pointsBefore(points: TracePoint[], currentMs: number | null) {
  if (currentMs === null) return [];
  return points.filter((point) => {
    const timestamp = toMillis(point.time);
    return timestamp !== null && timestamp <= currentMs;
  });
}

function currentPoint(points: TracePoint[], currentMs: number | null) {
  const values = pointsBefore(points, currentMs);
  return values.length ? values[values.length - 1] : undefined;
}

function toFeature(points: TracePoint[]) {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: points.map((point) => [point.lon, point.lat])
    }
  };
}

function nearestFrameIndex(frames: number[], targetMs: number) {
  if (!frames.length) return 0;
  let nearest = 0;
  let distance = Math.abs(frames[0] - targetMs);
  for (let index = 1; index < frames.length; index += 1) {
    const nextDistance = Math.abs(frames[index] - targetMs);
    if (nextDistance < distance) {
      nearest = index;
      distance = nextDistance;
    }
  }
  return nearest;
}

function nearestPoint(points: TracePoint[], targetMs: number) {
  if (!points.length) return undefined;
  let nearest = points[0];
  let distance = Math.abs((toMillis(points[0].time) ?? targetMs) - targetMs);
  for (let index = 1; index < points.length; index += 1) {
    const timestamp = toMillis(points[index].time);
    if (timestamp === null) continue;
    const nextDistance = Math.abs(timestamp - targetMs);
    if (nextDistance < distance) {
      nearest = points[index];
      distance = nextDistance;
    }
  }
  return nearest;
}

function findCurrentEvent(events: EventItem[], currentMs: number | null) {
  if (!events.length) return undefined;
  if (currentMs === null) return events[0];
  let active = events[0];
  for (const item of events) {
    const itemMs = toMillis(item.time);
    if (itemMs !== null && itemMs <= currentMs) {
      active = item;
    }
  }
  return active;
}

function getBounds(points: TracePoint[]) {
  if (!points.length) return null;
  let minLon = points[0].lon;
  let maxLon = points[0].lon;
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  points.forEach((point) => {
    minLon = Math.min(minLon, point.lon);
    maxLon = Math.max(maxLon, point.lon);
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
  });
  return [[minLon, minLat], [maxLon, maxLat]] as [[number, number], [number, number]];
}

function PlaneGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M22 2 11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 22 11 13 2 10l20-8-8 20Z" fill="currentColor" />
    </svg>
  );
}

function TugGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="8" width="10" height="7" rx="2" fill="currentColor" />
      <rect x="13" y="10" width="5" height="5" rx="1.4" fill="currentColor" opacity="0.82" />
      <circle cx="8" cy="18" r="2" fill="currentColor" />
      <circle cx="17" cy="18" r="2" fill="currentColor" />
    </svg>
  );
}

export default function TrajectoryPage() {
  const { currentUser } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedCase = searchParams.get("case") || undefined;
  const rawView = searchParams.get("view") || "workbench";
  const activeView = rawView === "map" || rawView === "event" ? "workbench" : rawView;
  const [trace, setTrace] = useState<TraceResponse>();
  const [caseId, setCaseId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [followView, setFollowView] = useState(true);
  const [selectedEventKey, setSelectedEventKey] = useState<string>();
  const mapRef = useRef<MapRef | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const response = await fetchTrace(requestedCase);
        setTrace(response);
        setCaseId(response.case.case_id);
        setFrameIndex(0);
        setSelectedEventKey(undefined);
        setPlaybackRate(1);
        setPlaying(true);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [requestedCase]);

  useEffect(() => {
    const loadCase = async () => {
      if (!caseId) return;
      setLoading(true);
      try {
        const response = await fetchTrace(caseId);
        setTrace(response);
        setFrameIndex(0);
        setPlaying(true);
        setSelectedEventKey(undefined);
        setPlaybackRate(1);
        setSearchParams((previous) => {
          const next = new URLSearchParams(previous);
          next.set("case", caseId);
          if (!next.get("view") || next.get("view") === "map" || next.get("view") === "event") {
            next.set("view", "workbench");
          }
          return next;
        }, { replace: true });
      } finally {
        setLoading(false);
      }
    };
    if (trace && caseId && caseId !== trace.case.case_id) {
      void loadCase();
    }
  }, [caseId, trace, setSearchParams]);

  const currentCase = trace?.case;
  const evidence = currentCase?.evidence;
  const association = currentCase?.association;
  const metrics = currentCase?.metrics;
  const phases = currentCase?.phases ?? {};
  const towPath = evidence?.aircraft_tow_path || evidence?.aircraft_path || [];
  const departurePath = evidence?.aircraft_departure_path || [];
  const vehiclePath = evidence?.vehicle_path || [];
  const interactionSamples = evidence?.interaction_samples || [];
  const frames = useMemo(() => buildFrames([towPath, departurePath, vehiclePath]), [towPath, departurePath, vehiclePath]);
  const frameLabelMap = useMemo(() => {
    const lookup = new globalThis.Map<number, string>();
    [...towPath, ...departurePath, ...vehiclePath].forEach((point) => {
      const timestamp = toMillis(point.time);
      if (timestamp !== null && !lookup.has(timestamp)) {
        lookup.set(timestamp, point.time);
      }
    });
    return lookup;
  }, [towPath, departurePath, vehiclePath]);
  const currentMs = frames.length ? frames[Math.min(frameIndex, frames.length - 1)] : null;
  const progress = frames.length > 1 ? Math.round((frameIndex / (frames.length - 1)) * 100) : 0;

  const towTrail = useMemo(() => pointsBefore(towPath, currentMs), [towPath, currentMs]);
  const departureTrail = useMemo(() => pointsBefore(departurePath, currentMs), [departurePath, currentMs]);
  const vehicleTrail = useMemo(() => pointsBefore(vehiclePath, currentMs), [vehiclePath, currentMs]);
  const aircraftMarker = currentPoint(departureTrail.length ? departureTrail : towTrail, currentMs);
  const vehicleMarker = currentPoint(vehicleTrail, currentMs);

  const events = useMemo<EventItem[]>(() => [
    { key: "tow-start", label: "开始牵引", time: phases.tow_start, actor: "地服公司", note: "推出指令下发后，牵引车与飞机建立作业关系。" },
    { key: "tow-release", label: "脱离牵引", time: phases.tow_release, actor: "地服公司", note: "拖行作业结束，飞机转入自主滑行阶段。" },
    { key: "runway-entry", label: "进入跑道", time: phases.runway_entry, actor: "机场运控", note: "飞机完成滑行并进入跑道等待起飞。" },
    { key: "takeoff", label: "起飞离场", time: phases.takeoff, actor: "航班执行", note: "飞机离地后，案例转入飞行阶段。" },
    { key: "track-end", label: "轨迹结束", time: phases.track_end, actor: "系统归档", note: "轨迹采样结束，证据包等待归档。" }
  ].filter((item) => item.time), [phases]);

  const riskSeries = useMemo(() => interactionSamples.map((item) => ({
    label: formatClock(item.time).slice(0, 5),
    distance: item.distance_m,
    speed: item.vehicle_speed,
    risk: item.distance_m < 5 && item.vehicle_speed > 3 ? ("combined" as const) : item.distance_m < 5 ? ("distance" as const) : item.vehicle_speed > 3 ? ("speed" as const) : undefined,
    note: item.distance_m < 5 && item.vehicle_speed > 3 ? "双重风险" : item.distance_m < 5 ? "净距不足" : item.vehicle_speed > 3 ? "超速" : undefined
  })), [interactionSamples]);
  const riskMoments = useMemo(() => riskSeries.filter((item) => item.risk), [riskSeries]);
  const activeEvent = useMemo(() => findCurrentEvent(events, currentMs), [events, currentMs]);
  const selectedEvent = events.find((item) => item.key === selectedEventKey) || activeEvent || events[0];

  useEffect(() => {
    if (!playing || frames.length <= 1) return;
    const timer = window.setInterval(() => {
      setFrameIndex((current) => {
        if (current >= frames.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, Math.max(110, Math.round(360 / playbackRate)));
    return () => window.clearInterval(timer);
  }, [playing, frames.length, playbackRate]);

  useEffect(() => {
    if (!events.length) return;
    setSelectedEventKey(activeEvent?.key);
  }, [activeEvent, events]);

  useEffect(() => {
    if (!followView || !mapRef.current) return;
    const focus = aircraftMarker || vehicleMarker;
    if (!focus) return;
    mapRef.current.easeTo({ center: [focus.lon, focus.lat], zoom: 16.6, duration: 420 });
  }, [followView, aircraftMarker, vehicleMarker, frameIndex]);

  useEffect(() => {
    const bounds = getBounds([...towPath, ...departurePath, ...vehiclePath]);
    if (!mapRef.current || !bounds || followView) return;
    mapRef.current.fitBounds(bounds, { padding: 78, duration: 0 });
  }, [towPath, departurePath, vehiclePath, followView]);

  const jumpToEvent = (item: EventItem) => {
    const targetMs = toMillis(item.time);
    if (targetMs === null) return;
    setSelectedEventKey(item.key);
    setPlaying(false);
    setFrameIndex(nearestFrameIndex(frames, targetMs));
    const point = nearestPoint([...towPath, ...departurePath, ...vehiclePath], targetMs);
    if (point && mapRef.current) {
      mapRef.current.easeTo({ center: [point.lon, point.lat], zoom: 16.8, duration: 500 });
    }
  };

  const replay = () => {
    setSelectedEventKey(undefined);
    setPlaying(false);
    setFrameIndex(0);
    window.setTimeout(() => setPlaying(true), 80);
  };

  if (!currentUser || loading) {
    return <LoadingView />;
  }

  if (!trace || !currentCase) {
    return <Empty description="当前没有可展示的轨迹案例" />;
  }

  const analysisCards = [
    { label: "关联可信度", value: `${association?.confidence_score ?? "--"} 分` },
    { label: "最小净距", value: association?.min_distance_m ? `${association.min_distance_m} m` : "--" },
    { label: "牵引峰值速度", value: metrics?.speed_peak ? `${metrics.speed_peak} km/h` : "--" },
    { label: "风险时刻", value: `${riskMoments.length} 个` }
  ];

  const candidateItems = (association?.top_candidates || []).map((item, index) => ({
    label: item.vehicle_id,
    value: item.score,
    secondaryValue: item.interaction_ratio,
    tone: index === 0 ? "linear-gradient(90deg, #0d5bd7, #58a7ff)" : index === 1 ? "linear-gradient(90deg, #f5b955, #ffd88f)" : "linear-gradient(90deg, #ef6b6b, #f59a52)",
    note: "交互覆盖率"
  }));

  return (
    <div className="page-shell trajectory-page">
      <PageQuickNav
        title="轨迹导航"
        items={[
          { key: "workbench", label: "追溯工作台", targetId: "trace-workbench-zone" },
          { key: "evidence", label: "链上证据", targetId: "trace-evidence-zone" }
        ]}
      />

      <section className="hero-card hero-card-plain">
        <div className="hero-surface hero-surface-dashboard hero-surface-dense">
          <div>
            <Typography.Text className="section-kicker">轨迹追溯 / 当前案例</Typography.Text>
            <Typography.Title level={1} style={{ margin: "10px 0 10px", color: "#0f3976", fontSize: 34 }}>
              {currentCase.flight_identity} 牵引轨迹追溯
            </Typography.Title>
            <Typography.Paragraph style={{ maxWidth: 760, margin: 0 }}>{currentCase.summary}</Typography.Paragraph>
            <div className="tag-ribbon" style={{ marginTop: 14 }}>
              <Tag color="blue" className="header-tag">机位 {currentCase.stand_id}</Tag>
              <Tag color="orange" className="header-tag">牵引车 {currentCase.vehicle_id}</Tag>
              <Tag color={currentCase.risk_level === "高" ? "red" : currentCase.risk_level === "中" ? "gold" : "blue"} className="header-tag">风险 {currentCase.risk_level}</Tag>
              <Tag color="purple" className="header-tag">链上记录 {currentCase.blockchain_records.length} 条</Tag>
            </div>
          </div>
          <div className="workspace-hero-actions trace-hero-actions">
            <Select
              value={caseId}
              onChange={setCaseId}
              style={{ width: 280 }}
              options={(trace.cases || []).map((item) => ({ value: item.case_id, label: `${item.flight_identity} / ${item.status} / ${item.confidence}分` }))}
            />
          </div>
        </div>
      </section>

      {activeView === "workbench" ? (
        <section id="trace-workbench-zone" className="trace-workbench-grid">
          <div className="board-panel board-panel-hard board-panel-wide trace-map-panel-shell">
            <div className="board-title-row">
              <Typography.Title level={4} style={{ margin: 0 }}>轨迹回放与事件定位</Typography.Title>
            </div>
            <div className="trace-map-toolbar trace-map-toolbar-tight">
              <div className="trace-toolbar-side">
                <Button icon={<AimOutlined />} onClick={() => setFollowView((value) => !value)}>{followView ? "取消跟随" : "自动跟随"}</Button>
                <Button icon={playing ? <PauseOutlined /> : <CaretRightFilled />} onClick={() => setPlaying((value) => !value)}>{playing ? "暂停" : "播放"}</Button>
                <Button icon={<RedoOutlined />} onClick={replay}>重播</Button>
                <Select value={playbackRate} onChange={setPlaybackRate} style={{ width: 108 }} options={PLAYBACK_OPTIONS} />
              </div>
              <div className="trace-toolbar-side">
                <span className="trace-phase-chip trace-phase-chip-clean">当前阶段 {activeEvent?.label || "轨迹准备"}</span>
                <span className="trace-phase-chip trace-phase-chip-risk">当前时间 {formatClock(currentMs !== null ? frameLabelMap.get(currentMs) : undefined)}</span>
              </div>
            </div>
            <div className="trace-workbench-stage">
              <div className="trace-map-shell trace-map-shell-pro">
                <Map
                  ref={mapRef}
                  mapLib={maplibregl}
                  initialViewState={{ longitude: towPath[0]?.lon || 121.8, latitude: towPath[0]?.lat || 31.15, zoom: 15.8 }}
                  mapStyle={MAP_STYLE as never}
                  attributionControl={false}
                >
                  <NavigationControl position="top-right" />
                  {towTrail.length ? <Source id="tow-aircraft" type="geojson" data={toFeature(towTrail) as never}><Layer {...aircraftTowLayer} /></Source> : null}
                  {departureTrail.length ? <Source id="departure-aircraft" type="geojson" data={toFeature(departureTrail) as never}><Layer {...aircraftDepartureLayer} /></Source> : null}
                  {vehicleTrail.length ? <Source id="vehicle-path" type="geojson" data={toFeature(vehicleTrail) as never}><Layer {...vehicleLayer} /></Source> : null}
                  {aircraftMarker ? <Marker longitude={aircraftMarker.lon} latitude={aircraftMarker.lat}><span className="legend-icon aircraft"><PlaneGlyph /></span></Marker> : null}
                  {vehicleMarker ? <Marker longitude={vehicleMarker.lon} latitude={vehicleMarker.lat}><span className="legend-icon vehicle"><TugGlyph /></span></Marker> : null}
                </Map>
                <div className="trace-map-overlay trace-map-overlay-compact">
                  <div className="map-inline-legend">
                    <span className="map-legend-chip"><i className="legend-icon aircraft"><PlaneGlyph /></i>飞机</span>
                    <span className="map-legend-chip"><i className="legend-icon vehicle"><TugGlyph /></i>牵引车</span>
                  </div>
                  <div className="overlay-metric"><span>牵引时长</span><strong>{metrics?.tow_duration_min ?? "--"} min</strong></div>
                  <div className="overlay-metric"><span>脱离后至起飞</span><strong>{metrics?.release_to_takeoff_min ?? "--"} min</strong></div>
                </div>
              </div>
              <aside className="trace-workbench-side">
                {selectedEvent ? (
                  <div className="trace-focus-note trace-focus-card">
                    <div className="trace-focus-head">
                      <Typography.Text strong>{selectedEvent.label}</Typography.Text>
                      <Tag color="blue">{formatClock(selectedEvent.time)}</Tag>
                    </div>
                    <Typography.Text type="secondary">{selectedEvent.actor}</Typography.Text>
                    <Typography.Text type="secondary">{selectedEvent.note}</Typography.Text>
                  </div>
                ) : null}
                <div className="event-jump-list trace-event-card-list">
                  {events.map((item) => (
                    <button key={item.key} type="button" className={`event-jump-item ${selectedEventKey === item.key ? "active" : ""}`} onClick={() => jumpToEvent(item)}>
                      <div className="event-jump-main">
                        <strong>{item.label}</strong>
                        <span>{item.actor}</span>
                      </div>
                      <div className="event-jump-meta">
                        <time>{formatClock(item.time)}</time>
                      </div>
                    </button>
                  ))}
                </div>
              </aside>
            </div>
            <div className="timeline-slider timeline-slider-tight">
              <Typography.Text type="secondary">回放进度</Typography.Text>
              <Slider
                value={progress}
                onChange={(value) => {
                  setPlaying(false);
                  if (frames.length > 1) {
                    setFrameIndex(Math.round((value / 100) * (frames.length - 1)));
                  }
                }}
                tooltip={{ formatter: (value) => `${value}%` }}
              />
            </div>
          </div>

          <div className="trace-bottom-grid">
            <div className="board-panel board-panel-hard trace-risk-board">
              <div className="board-title-row">
                <Typography.Title level={4} style={{ margin: 0 }}>牵引关联风险时间轴</Typography.Title>
              </div>
              <TrajectoryRiskChart items={riskSeries} />
            </div>
            <div className="board-panel board-panel-hard trace-summary-panel">
              <div className="board-title-row">
                <Typography.Title level={4} style={{ margin: 0 }}>当前案例摘要</Typography.Title>
              </div>
              <div className="trace-analysis-topline trace-analysis-topline-tight">
                {analysisCards.map((item) => (
                  <div className="trace-analysis-chip" key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>
                ))}
              </div>
              <div className="queue-list trace-task-list">
                {(evidence?.task_vehicle_groups || []).map((item) => (
                  <div className="queue-item" key={item.task_id}>
                    <div>
                      <Typography.Text strong>{item.task_name}</Typography.Text>
                      <Typography.Text type="secondary">{`${item.vehicle_id} / ${formatClock(item.begin_time)} - ${formatClock(item.end_time)}`}</Typography.Text>
                    </div>
                    <div className="queue-meta queue-meta-stack">
                      <Tag color="blue">{`${item.match.confidence_score ?? "--"} 分`}</Tag>
                      <Typography.Text type="secondary">{item.match.confidence_label || "待校验"}</Typography.Text>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section id="trace-evidence-zone" className="trace-evidence-grid">
          <div className="board-panel board-panel-hard">
            <div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>候选牵引车排序</Typography.Title></div>
            <HorizontalBarChart items={candidateItems} maxValue={100} valueFormatter={(value) => `${value} 分`} secondaryFormatter={(value) => `${value}%`} />
          </div>
          <div className="board-panel board-panel-hard">
            <div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>链上事件记录</Typography.Title></div>
            <Table
              rowKey="hash"
              pagination={false}
              columns={[
                { title: "通道", dataIndex: "channel", key: "channel", width: 110 },
                { title: "时间", dataIndex: "timestamp", key: "timestamp", width: 182 },
                { title: "写入主体", dataIndex: "actor", key: "actor", width: 140 },
                { title: "区块哈希", dataIndex: "hash", key: "hash" }
              ]}
              dataSource={currentCase.blockchain_records}
              scroll={{ x: 960 }}
            />
          </div>
          <div className="board-panel board-panel-hard board-panel-wide">
            <div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>全过程证据链</Typography.Title></div>
            <Table
              rowKey="time"
              pagination={false}
              columns={[
                { title: "阶段", dataIndex: "stage", key: "stage", width: 120 },
                { title: "通道", dataIndex: "channel", key: "channel", width: 110 },
                { title: "时间", dataIndex: "time", key: "time", width: 182 },
                { title: "责任主体", dataIndex: "actor", key: "actor", width: 140 },
                { title: "处置说明", dataIndex: "detail", key: "detail" },
                { title: "状态", dataIndex: "status", key: "status", width: 110 }
              ]}
              dataSource={currentCase.timeline}
              scroll={{ x: 1180 }}
            />
          </div>
        </section>
      )}
    </div>
  );
}
