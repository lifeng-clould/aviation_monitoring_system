import { useMemo } from "react";

interface ValuePoint {
  label: string;
  value: number;
  tone?: string;
  secondaryValue?: number;
  note?: string;
}

interface AreaTrendChartProps {
  points: ValuePoint[];
  height?: number;
  stroke?: string;
  fill?: string;
  valueFormatter?: (value: number) => string;
}

interface HorizontalBarChartProps {
  items: ValuePoint[];
  maxValue?: number;
  valueFormatter?: (value: number) => string;
  secondaryFormatter?: (value: number) => string;
}

interface SignalTimelineProps {
  items: ValuePoint[];
  valueFormatter?: (value: number) => string;
}

interface TrajectoryRiskChartItem {
  label: string;
  distance: number;
  speed: number;
  risk?: "distance" | "speed" | "combined";
  note?: string;
}

interface TrajectoryRiskChartProps {
  items: TrajectoryRiskChartItem[];
  distanceThreshold?: number;
  speedThreshold?: number;
}

function buildPath(points: { x: number; y: number }[]) {
  if (!points.length) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
}

export function AreaTrendChart({ points, height = 220, stroke = "#0d5bd7", fill = "rgba(13,91,215,0.16)", valueFormatter }: AreaTrendChartProps) {
  const maxValue = Math.max(...points.map((item) => item.value), 1);
  const width = 640;
  const chartHeight = height - 44;

  const coordinates = useMemo(
    () =>
      points.map((item, index) => ({
        x: points.length === 1 ? width / 2 : (index / Math.max(points.length - 1, 1)) * (width - 36) + 18,
        y: chartHeight - (item.value / maxValue) * Math.max(chartHeight - 16, 1) + 8
      })),
    [points, chartHeight, maxValue]
  );

  const linePath = buildPath(coordinates);
  const areaPath = coordinates.length
    ? `${linePath} L ${coordinates[coordinates.length - 1].x} ${chartHeight + 8} L ${coordinates[0].x} ${chartHeight + 8} Z`
    : "";

  return (
    <div className="light-chart-panel">
      <svg viewBox={`0 0 ${width} ${height}`} className="area-trend-chart" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="areaTrendFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={fill.replace("0.16", "0.34")} />
            <stop offset="100%" stopColor="rgba(13,91,215,0.02)" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line key={ratio} x1="18" y1={chartHeight * ratio + 8} x2={width - 18} y2={chartHeight * ratio + 8} className="chart-grid-line" />
        ))}
        <path d={areaPath} fill="url(#areaTrendFill)" />
        <path d={linePath} fill="none" stroke={stroke} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        {coordinates.map((point, index) => (
          <g key={points[index].label}>
            <circle cx={point.x} cy={point.y} r="5" fill={stroke} stroke="#ffffff" strokeWidth="3" />
            <text x={point.x} y={height - 8} className="chart-axis-label" textAnchor="middle">{points[index].label}</text>
          </g>
        ))}
      </svg>
      <div className="chart-summary-row">
        {points.slice(-4).map((item) => (
          <div className="chart-summary-chip" key={item.label}>
            <span>{item.label}</span>
            <strong>{valueFormatter ? valueFormatter(item.value) : item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HorizontalBarChart({ items, maxValue, valueFormatter, secondaryFormatter }: HorizontalBarChartProps) {
  const ceiling = maxValue ?? Math.max(...items.map((item) => Math.max(item.value, item.secondaryValue ?? 0)), 1);

  return (
    <div className="light-bar-list">
      {items.map((item) => {
        const width = `${Math.max((item.value / ceiling) * 100, 6)}%`;
        const marker = item.secondaryValue !== undefined ? `${Math.max((item.secondaryValue / ceiling) * 100, 6)}%` : undefined;
        return (
          <div className="light-bar-row" key={item.label}>
            <div className="light-bar-head">
              <strong>{item.label}</strong>
              <span>{valueFormatter ? valueFormatter(item.value) : item.value}</span>
            </div>
            <div className="light-bar-track">
              <div className="light-bar-fill" style={{ width, background: item.tone || "linear-gradient(90deg, #0d5bd7, #58a7ff)" }} />
              {marker ? <div className="light-bar-marker" style={{ left: marker }} /> : null}
            </div>
            {item.secondaryValue !== undefined ? (
              <div className="light-bar-meta">
                <span>{item.note || "次指标"}</span>
                <strong>{secondaryFormatter ? secondaryFormatter(item.secondaryValue) : item.secondaryValue}</strong>
              </div>
            ) : item.note ? (
              <div className="light-bar-note">{item.note}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function SignalTimeline({ items, valueFormatter }: SignalTimelineProps) {
  const ceiling = Math.max(...items.map((item) => item.value), 100);

  return (
    <div className="signal-timeline">
      {items.map((item) => (
        <div className="signal-column" key={`${item.label}-${item.note || ""}`}>
          <div className="signal-column-bar-shell">
            <div className="signal-column-bar" style={{ height: `${Math.max((item.value / ceiling) * 100, 8)}%`, background: item.tone || "linear-gradient(180deg, #0d5bd7, #58a7ff)" }} />
          </div>
          <div className="signal-column-value">{valueFormatter ? valueFormatter(item.value) : item.value}</div>
          <div className="signal-column-label">{item.label}</div>
          {item.note ? <div className="signal-column-note">{item.note}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function TrajectoryRiskChart({ items, distanceThreshold = 5, speedThreshold = 3 }: TrajectoryRiskChartProps) {
  const width = 760;
  const height = 280;
  const chartTop = 18;
  const chartBottom = 218;
  const chartLeft = 48;
  const chartRight = width - 34;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;
  const distanceMax = Math.max(...items.map((item) => item.distance), distanceThreshold, 1);
  const speedMax = Math.max(...items.map((item) => item.speed), speedThreshold, 1);
  const labelStep = Math.max(Math.ceil(items.length / 6), 1);

  const coordinates = items.map((item, index) => {
    const x = items.length === 1 ? chartLeft + chartWidth / 2 : chartLeft + (index / Math.max(items.length - 1, 1)) * chartWidth;
    const distanceY = chartBottom - (item.distance / distanceMax) * chartHeight;
    const speedY = chartBottom - (item.speed / speedMax) * chartHeight;
    return { x, distanceY, speedY };
  });

  const distancePath = buildPath(coordinates.map((item) => ({ x: item.x, y: item.distanceY })));
  const speedPath = buildPath(coordinates.map((item) => ({ x: item.x, y: item.speedY })));
  const distanceThresholdY = chartBottom - (distanceThreshold / distanceMax) * chartHeight;
  const speedThresholdY = chartBottom - (speedThreshold / speedMax) * chartHeight;

  return (
    <div className="trajectory-risk-chart">
      <div className="trajectory-risk-chart-head">
        <div className="chart-legend-pill">
          <span className="chart-dot is-distance" />
          <strong>净距</strong>
          <em>低于 {distanceThreshold} 米即进入风险区</em>
        </div>
        <div className="chart-legend-pill">
          <span className="chart-dot is-speed" />
          <strong>车速</strong>
          <em>高于 {speedThreshold} km/h 即触发超速</em>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = chartTop + chartHeight * ratio;
          return <line key={ratio} x1={chartLeft} y1={y} x2={chartRight} y2={y} className="chart-grid-line" />;
        })}
        <line x1={chartLeft} y1={distanceThresholdY} x2={chartRight} y2={distanceThresholdY} className="chart-threshold-line is-distance" />
        <line x1={chartLeft} y1={speedThresholdY} x2={chartRight} y2={speedThresholdY} className="chart-threshold-line is-speed" />
        <path d={distancePath} className="trajectory-risk-line is-distance" />
        <path d={speedPath} className="trajectory-risk-line is-speed" />
        {coordinates.map((point, index) => {
          const item = items[index];
          return (
            <g key={`${item.label}-${index}`}>
              <circle cx={point.x} cy={point.distanceY} r={item.risk === "distance" || item.risk === "combined" ? 5.5 : 4} className={`trajectory-risk-node ${item.risk === "distance" || item.risk === "combined" ? "is-alert" : "is-distance"}`} />
              <circle cx={point.x} cy={point.speedY} r={item.risk === "speed" || item.risk === "combined" ? 5.5 : 4} className={`trajectory-risk-node ${item.risk === "speed" || item.risk === "combined" ? "is-alert-speed" : "is-speed"}`} />
              {index % labelStep === 0 || index === items.length - 1 ? (
                <text x={point.x} y={250} textAnchor="middle" className="trajectory-axis-label">{item.label}</text>
              ) : null}
              {item.note && item.risk && (index % Math.max(labelStep * 2, 2) === 0 || index === items.length - 1) ? (
                <g>
                  <line x1={point.x} y1={Math.min(point.distanceY, point.speedY) - 8} x2={point.x} y2={Math.min(point.distanceY, point.speedY) - 28} className="trajectory-risk-stem" />
                  <rect x={point.x - 38} y={Math.min(point.distanceY, point.speedY) - 52} width="76" height="20" rx="10" className="trajectory-risk-label-bg" />
                  <text x={point.x} y={Math.min(point.distanceY, point.speedY) - 38} textAnchor="middle" className="trajectory-risk-label">{item.note}</text>
                </g>
              ) : null}
            </g>
          );
        })}
        <text x="10" y={chartTop + 8} className="trajectory-axis-caption">风险强度</text>
      </svg>
      <div className="trajectory-risk-chart-foot">
        <span>左轴按净距归一化，右轴按速度归一化；红点表示双重风险时刻。</span>
      </div>
    </div>
  );
}