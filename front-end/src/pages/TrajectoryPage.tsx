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
const connectLayer = { id: "interaction-path", type: "line", paint: { "line-color": "#1f8f6f", "line-width": 2.3, "line-dasharray": [2, 2] as number[], "line-opacity": 0.85 } } as const;

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
  const interactionLine = aircraftMarker && vehicleMarker ? toFeature([aircraftMarker, vehicleMarker]) : undefined;

  const events = useMemo<EventItem[]>(() => [
    { key: "tow-start", label: "\u5f00\u59cb\u7275\u5f15", time: phases.tow_start, actor: "\u5730\u670d\u516c\u53f8", note: "\u63a8\u51fa\u6307\u4ee4\u4e0b\u53d1\uff0c\u7275\u5f15\u8f66\u4e0e\u98de\u673a\u5efa\u7acb\u4f5c\u4e1a\u5173\u7cfb\u3002" },
    { key: "tow-release", label: "\u8131\u79bb\u7275\u5f15", time: phases.tow_release, actor: "\u5730\u670d\u516c\u53f8", note: "\u62d6\u884c\u7ed3\u675f\uff0c\u98de\u673a\u8f6c\u5165\u81ea\u4e3b\u6ed1\u884c\u3002" },
    { key: "runway-entry", label: "\u8fdb\u5165\u8dd1\u9053", time: phases.runway_entry, actor: "\u673a\u573a\u8fd0\u63a7", note: "\u98de\u673a\u5b8c\u6210\u6ed1\u884c\u5e76\u8fdb\u5165\u8dd1\u9053\u7b49\u5f85\u8d77\u98de\u3002" },
    { key: "takeoff", label: "\u8d77\u98de\u79bb\u573a", time: phases.takeoff, actor: "\u822a\u73ed\u6267\u884c", note: "\u98de\u673a\u79bb\u5730\uff0c\u6848\u4f8b\u8fdb\u5165\u98de\u884c\u9636\u6bb5\u3002" },
    { key: "track-end", label: "\u8f68\u8ff9\u7ed3\u675f", time: phases.track_end, actor: "\u7cfb\u7edf\u5f52\u6863", note: "\u5f53\u6b21\u8f68\u8ff9\u91c7\u6837\u7ed3\u675f\uff0c\u8bc1\u636e\u5305\u7b49\u5f85\u5f52\u6863\u3002" }
  ].filter((item) => item.time), [phases]);

  const riskSeries = useMemo(() => interactionSamples.map((item) => ({
    label: formatClock(item.time).slice(0, 5),
    distance: item.distance_m,
    speed: item.vehicle_speed,
    risk: item.distance_m < 5 && item.vehicle_speed > 3 ? ("combined" as const) : item.distance_m < 5 ? ("distance" as const) : item.vehicle_speed > 3 ? ("speed" as const) : undefined,
    note: item.distance_m < 5 && item.vehicle_speed > 3 ? "\u53cc\u91cd\u98ce\u9669" : item.distance_m < 5 ? "\u51c0\u8ddd\u4e0d\u8db3" : item.vehicle_speed > 3 ? "\u8d85\u901f" : undefined
  })), [interactionSamples]);
  const riskMoments = useMemo(() => riskSeries.filter((item) => item.risk), [riskSeries]);
  const selectedEvent = events.find((item) => item.key === selectedEventKey) || events[0];

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
    }, 360);
    return () => window.clearInterval(timer);
  }, [playing, frames.length]);

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
    return <Empty description="\u5f53\u524d\u6ca1\u6709\u53ef\u5c55\u793a\u7684\u8f68\u8ff9\u6848\u4f8b" />;
  }

  const analysisCards = [
    { label: "\u5173\u8054\u53ef\u4fe1\u5ea6", value: `${association?.confidence_score ?? "--"} \u5206` },
    { label: "\u6700\u5c0f\u51c0\u8ddd", value: association?.min_distance_m ? `${association.min_distance_m} m` : "--" },
    { label: "\u7275\u5f15\u5cf0\u503c\u901f\u5ea6", value: metrics?.speed_peak ? `${metrics.speed_peak} km/h` : "--" },
    { label: "\u98ce\u9669\u65f6\u523b", value: `${riskMoments.length} \u4e2a` }
  ];

  const candidateItems = (association?.top_candidates || []).map((item, index) => ({
    label: item.vehicle_id,
    value: item.score,
    secondaryValue: item.interaction_ratio,
    tone: index === 0 ? "linear-gradient(90deg, #0d5bd7, #58a7ff)" : index === 1 ? "linear-gradient(90deg, #f5b955, #ffd88f)" : "linear-gradient(90deg, #ef6b6b, #f59a52)",
    note: "\u4ea4\u4e92\u8986\u76d6\u7387"
  }));

  return (
    <div className="page-shell trajectory-page">
      <PageQuickNav
        title={"\u8f68\u8ff9\u5bfc\u822a"}
        items={[
          { key: "workbench", label: "\u8ffd\u6eaf\u5de5\u4f5c\u53f0", targetId: "trace-workbench-zone" },
          { key: "evidence", label: "\u94fe\u4e0a\u8bc1\u636e", targetId: "trace-evidence-zone" }
        ]}
      />

      <section className="hero-card hero-card-plain">
        <div className="hero-surface hero-surface-dashboard hero-surface-dense">
          <div>
            <Typography.Text className="section-kicker">{`\u8f68\u8ff9\u8ffd\u6eaf / \u5f53\u524d\u6848\u4f8b`}</Typography.Text>
            <Typography.Title level={1} style={{ margin: "10px 0 10px", color: "#0f3976", fontSize: 34 }}>
              {currentCase.flight_identity} {"\u7275\u5f15\u8f68\u8ff9\u8ffd\u6eaf"}
            </Typography.Title>
            <Typography.Paragraph style={{ maxWidth: 760, margin: 0 }}>{currentCase.summary}</Typography.Paragraph>
            <div className="tag-ribbon" style={{ marginTop: 14 }}>
              <Tag color="blue" className="header-tag">{`\u673a\u4f4d ${currentCase.stand_id}`}</Tag>
              <Tag color="orange" className="header-tag">{`\u7275\u5f15\u8f66 ${currentCase.vehicle_id}`}</Tag>
              <Tag color={currentCase.risk_level === "\u9ad8" ? "red" : currentCase.risk_level === "\u4e2d" ? "gold" : "blue"} className="header-tag">{`\u98ce\u9669 ${currentCase.risk_level}`}</Tag>
              <Tag color="purple" className="header-tag">{`\u94fe\u4e0a\u8bb0\u5f55 ${currentCase.blockchain_records.length} \u6761`}</Tag>
            </div>
          </div>
          <div className="workspace-hero-actions trace-hero-actions">
            <Select
              value={caseId}
              onChange={setCaseId}
              style={{ width: 280 }}
              options={(trace.cases || []).map((item) => ({ value: item.case_id, label: `${item.flight_identity} / ${item.status} / ${item.confidence}\u5206` }))}
            />
          </div>
        </div>
      </section>

      {activeView === "workbench" ? (
        <section id="trace-workbench-zone" className="trace-workbench-grid">
          <div className="board-panel board-panel-hard board-panel-wide trace-map-panel-shell">
            <div className="board-title-row">
              <Typography.Title level={4} style={{ margin: 0 }}>{"\u8f68\u8ff9\u56de\u653e\u4e0e\u4e8b\u4ef6\u5b9a\u4f4d"}</Typography.Title>
            </div>
            <div className="trace-map-toolbar trace-map-toolbar-tight">
              <div className="trace-toolbar-side">
                <Button icon={<AimOutlined />} onClick={() => setFollowView((value) => !value)}>{followView ? "\u53d6\u6d88\u8ddf\u968f" : "\u81ea\u52a8\u8ddf\u968f"}</Button>
                <Button icon={playing ? <PauseOutlined /> : <CaretRightFilled />} onClick={() => setPlaying((value) => !value)}>{playing ? "\u6682\u505c" : "\u64ad\u653e"}</Button>
                <Button icon={<RedoOutlined />} onClick={replay}>{"\u91cd\u64ad"}</Button>
              </div>
              <div className="trace-toolbar-side">
                <span className="trace-phase-chip trace-phase-chip-clean">{`\u5f53\u524d\u65f6\u95f4 ${formatClock(currentMs !== null ? frameLabelMap.get(currentMs) : undefined)}`}</span>
                <span className="trace-phase-chip trace-phase-chip-risk">{`\u98ce\u9669\u65f6\u523b ${riskMoments.length} \u4e2a`}</span>
              </div>
            </div>
            <div className="trace-workbench-stage">
              <div className="trace-map-shell trace-map-shell-pro">
                <Map
                  ref={mapRef}
                  mapLib={maplibregl}
                  initialViewState={{ longitude: towPath[0]?.lon || 121.80, latitude: towPath[0]?.lat || 31.15, zoom: 15.8 }}
                  mapStyle={MAP_STYLE as never}
                  attributionControl={false}
                >
                  <NavigationControl position="top-right" />
                  {towTrail.length ? <Source id="tow-aircraft" type="geojson" data={toFeature(towTrail) as never}><Layer {...aircraftTowLayer} /></Source> : null}
                  {departureTrail.length ? <Source id="departure-aircraft" type="geojson" data={toFeature(departureTrail) as never}><Layer {...aircraftDepartureLayer} /></Source> : null}
                  {vehicleTrail.length ? <Source id="vehicle-path" type="geojson" data={toFeature(vehicleTrail) as never}><Layer {...vehicleLayer} /></Source> : null}
                  {interactionLine ? <Source id="interaction-line" type="geojson" data={interactionLine as never}><Layer {...connectLayer} /></Source> : null}
                  {aircraftMarker ? <Marker longitude={aircraftMarker.lon} latitude={aircraftMarker.lat}><span className="legend-icon aircraft"><PlaneGlyph /></span></Marker> : null}
                  {vehicleMarker ? <Marker longitude={vehicleMarker.lon} latitude={vehicleMarker.lat}><span className="legend-icon vehicle"><TugGlyph /></span></Marker> : null}
                </Map>
                <div className="trace-map-overlay trace-map-overlay-compact">
                  <div className="map-inline-legend">
                    <span className="map-legend-chip"><i className="legend-icon aircraft"><PlaneGlyph /></i>{"\u98de\u673a"}</span>
                    <span className="map-legend-chip"><i className="legend-icon vehicle"><TugGlyph /></i>{"\u7275\u5f15\u8f66"}</span>
                  </div>
                  <div className="overlay-metric"><span>{"\u7275\u5f15\u65f6\u957f"}</span><strong>{metrics?.tow_duration_min ?? "--"} min</strong></div>
                  <div className="overlay-metric"><span>{"\u8131\u79bb\u540e\u81f3\u8d77\u98de"}</span><strong>{metrics?.release_to_takeoff_min ?? "--"} min</strong></div>
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
              <Typography.Text type="secondary">{"\u56de\u653e\u8fdb\u5ea6"}</Typography.Text>
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
                <Typography.Title level={4} style={{ margin: 0 }}>{"\u7275\u5f15\u5173\u8054\u98ce\u9669\u65f6\u95f4\u8f74"}</Typography.Title>
              </div>
              <TrajectoryRiskChart items={riskSeries} />
            </div>
            <div className="board-panel board-panel-hard trace-summary-panel">
              <div className="board-title-row">
                <Typography.Title level={4} style={{ margin: 0 }}>{"\u5f53\u524d\u6848\u4f8b\u6458\u8981"}</Typography.Title>
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
                      <Tag color="blue">{`${item.match.confidence_score ?? "--"} \u5206`}</Tag>
                      <Typography.Text type="secondary">{item.match.confidence_label || "\u5f85\u6821\u9a8c"}</Typography.Text>
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
            <div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>{"\u5019\u9009\u7275\u5f15\u8f66\u6392\u5e8f"}</Typography.Title></div>
            <HorizontalBarChart items={candidateItems} maxValue={100} valueFormatter={(value) => `${value} \u5206`} secondaryFormatter={(value) => `${value}%`} />
          </div>
          <div className="board-panel board-panel-hard">
            <div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>{"\u94fe\u4e0a\u4e8b\u4ef6\u8bb0\u5f55"}</Typography.Title></div>
            <Table
              rowKey="hash"
              pagination={false}
              columns={[
                { title: "\u901a\u9053", dataIndex: "channel", key: "channel", width: 110 },
                { title: "\u65f6\u95f4", dataIndex: "timestamp", key: "timestamp", width: 182 },
                { title: "\u5199\u5165\u4e3b\u4f53", dataIndex: "actor", key: "actor", width: 140 },
                { title: "\u533a\u5757\u54c8\u5e0c", dataIndex: "hash", key: "hash" }
              ]}
              dataSource={currentCase.blockchain_records}
              scroll={{ x: 960 }}
            />
          </div>
          <div className="board-panel board-panel-hard board-panel-wide">
            <div className="board-title-row"><Typography.Title level={4} style={{ margin: 0 }}>{"\u5168\u8fc7\u7a0b\u8bc1\u636e\u94fe"}</Typography.Title></div>
            <Table
              rowKey="time"
              pagination={false}
              columns={[
                { title: "\u9636\u6bb5", dataIndex: "stage", key: "stage", width: 120 },
                { title: "\u901a\u9053", dataIndex: "channel", key: "channel", width: 110 },
                { title: "\u65f6\u95f4", dataIndex: "time", key: "time", width: 182 },
                { title: "\u8d23\u4efb\u4e3b\u4f53", dataIndex: "actor", key: "actor", width: 140 },
                { title: "\u5904\u7f6e\u8bf4\u660e", dataIndex: "detail", key: "detail" },
                { title: "\u72b6\u6001", dataIndex: "status", key: "status", width: 110 }
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
