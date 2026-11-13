"use client";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";

// Single-series line chart over time. Marks follow the data-viz specs: 2px round
// line, ~10% area wash, 8px end-dot with a 2px surface ring, hairline solid
// gridlines. One direct label (the latest value); everything else is reachable via
// the hover/keyboard tooltip and the table view, so nothing is gated on hovering.
// Colors come from the .viz-root tokens in globals.css; `color` is the series hue.

const HEIGHT = 240;
const M = { top: 20, right: 20, bottom: 28, left: 46 };
const DAY = 86400000;

const parseDay = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const fmtNum = (n) => Math.round(n).toLocaleString("en-US");
const fmtDay = (t, withYear) =>
  new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });

// Round, human-friendly tick values covering [min, max].
function niceTicks(min, max, count = 4) {
  if (min === max) { min -= 1; max += 1; }
  const rough = (max - min) / count;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const frac = rough / pow;
  const step = (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10) * pow;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(v);
  return ticks;
}

export default function RatingChart({ points, color, label, ariaLabel }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState(null); // index of hovered/focused point
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const xs = points.map((p) => parseDay(p.date));
    const vals = points.map((p) => p.value);
    const t0 = xs[0], t1 = xs[xs.length - 1];
    const ticks = niceTicks(Math.min(...vals), Math.max(...vals));
    const y0 = ticks[0], y1 = ticks[ticks.length - 1];
    const plotW = width - M.left - M.right;
    const plotH = HEIGHT - M.top - M.bottom;
    const sx = (t) => M.left + (t1 === t0 ? plotW / 2 : ((t - t0) / (t1 - t0)) * plotW);
    const sy = (v) => M.top + plotH - ((v - y0) / (y1 - y0)) * plotH;
    const px = xs.map(sx);
    const py = vals.map(sy);

    // x tick labels: evenly spaced in *time*, as many as comfortably fit
    const n = Math.min(5, Math.max(2, Math.floor(plotW / 100)));
    const withYear = t1 - t0 > 300 * DAY;
    const xTicks = Array.from({ length: n }, (_, i) => {
      const t = t0 + ((t1 - t0) * i) / (n - 1);
      return { x: sx(t), label: fmtDay(t, withYear) };
    });

    const line = px.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${py[i].toFixed(1)}`).join("");
    const baseY = M.top + plotH;
    const area = `${line}L${px[px.length - 1].toFixed(1)},${baseY}L${px[0].toFixed(1)},${baseY}Z`;
    return { px, py, ticks, sy, xTicks, line, area, plotW, plotH, baseY, withYear };
  }, [points, width]);

  const nearest = useCallback(
    (clientX, rect) => {
      const x = clientX - rect.left;
      let best = 0;
      for (let i = 1; i < geo.px.length; i++) if (Math.abs(geo.px[i] - x) < Math.abs(geo.px[best] - x)) best = i;
      return best;
    },
    [geo]
  );

  const onKeyDown = (e) => {
    const last = points.length - 1;
    const cur = active ?? last;
    const next = { ArrowLeft: Math.max(0, cur - 1), ArrowRight: Math.min(last, cur + 1), Home: 0, End: last }[e.key];
    if (next !== undefined) { e.preventDefault(); setActive(next); }
    else if (e.key === "Escape") setActive(null);
  };

  const lastI = points.length - 1;
  const a = active !== null ? active : null;
  const tipLeft = a !== null ? Math.min(Math.max(geo.px[a], 70), width - 70) : 0;

  return (
    <div className="viz-root">
      <div
        ref={wrapRef}
        className="relative w-full outline-none focus-visible:ring-1 focus-visible:ring-white/30 rounded-md"
        tabIndex={0}
        role="group"
        aria-label={`${ariaLabel}. Use the left and right arrow keys to read values.`}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((v) => v ?? lastI)}
        onBlur={() => setActive(null)}
      >
        <svg width={width} height={HEIGHT} role="img" aria-label={ariaLabel} style={{ display: "block", overflow: "visible" }}>
          {/* gridlines + y labels (recessive) */}
          {geo.ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={geo.sy(t)} y2={geo.sy(t)} strokeWidth="1" style={{ stroke: "var(--viz-grid)" }} />
              <text x={M.left - 8} y={geo.sy(t)} textAnchor="end" dominantBaseline="middle" fontSize="11" style={{ fill: "var(--viz-text-muted)", fontVariantNumeric: "tabular-nums" }}>
                {fmtNum(t)}
              </text>
            </g>
          ))}
          <line x1={M.left} x2={width - M.right} y1={geo.baseY} y2={geo.baseY} strokeWidth="1" style={{ stroke: "var(--viz-axis)" }} />
          {geo.xTicks.map((t, i) => (
            <text key={i} x={t.x} y={HEIGHT - 8} textAnchor={i === 0 ? "start" : i === geo.xTicks.length - 1 ? "end" : "middle"} fontSize="11" style={{ fill: "var(--viz-text-muted)" }}>
              {t.label}
            </text>
          ))}

          {/* series */}
          <path d={geo.area} fill={color} fillOpacity="0.1" />
          <path d={geo.line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {/* the one direct label: latest value, above the end-dot */}
          <text x={geo.px[lastI]} y={geo.py[lastI] - 12} textAnchor="end" fontSize="12" fontWeight="600" style={{ fill: "var(--viz-text-primary)", fontVariantNumeric: "tabular-nums" }}>
            {fmtNum(points[lastI].value)}
          </text>
          <circle cx={geo.px[lastI]} cy={geo.py[lastI]} r="4" fill={color} strokeWidth="2" style={{ stroke: "var(--viz-surface)" }} />

          {/* crosshair + active dot */}
          {a !== null && (
            <g pointerEvents="none">
              <line x1={geo.px[a]} x2={geo.px[a]} y1={M.top} y2={geo.baseY} strokeWidth="1" style={{ stroke: "var(--viz-text-muted)" }} />
              <circle cx={geo.px[a]} cy={geo.py[a]} r="4" fill={color} strokeWidth="2" style={{ stroke: "var(--viz-surface)" }} />
            </g>
          )}

          {/* hit layer: the whole plot, so the pointer only has to be near a date */}
          <rect
            x={M.left} y={M.top} width={geo.plotW} height={geo.plotH} fill="transparent"
            onPointerMove={(e) => setActive(nearest(e.clientX, e.currentTarget.ownerSVGElement.getBoundingClientRect()))}
            onPointerLeave={() => setActive(null)}
          />
        </svg>

        {a !== null && (
          <div
            className="absolute pointer-events-none rounded-md border px-3 py-2 text-xs shadow-lg"
            style={{ left: tipLeft, top: 0, transform: "translateX(-50%)", background: "#1c1c1b", borderColor: "rgba(255,255,255,0.10)" }}
            role="status"
          >
            <div className="flex items-center gap-2">
              <span aria-hidden style={{ width: 12, height: 2, background: color, display: "inline-block" }} />
              <span className="font-semibold text-sm" style={{ color: "var(--viz-text-primary)" }}>{fmtNum(points[a].value)}</span>
              <span style={{ color: "var(--viz-text-secondary)" }}>{label}</span>
            </div>
            <div className="mt-0.5" style={{ color: "var(--viz-text-secondary)" }}>{fmtDay(parseDay(points[a].date), true)}</div>
          </div>
        )}
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-pressed={showTable}
          className="text-[11px] underline underline-offset-2 hover:text-white transition-colors"
          style={{ color: "var(--viz-text-muted)" }}
        >
          {showTable ? "Hide table" : "View as table"}
        </button>
      </div>

      {showTable && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-white/10">
          <table className="w-full text-xs">
            <caption className="sr-only">{ariaLabel}</caption>
            <thead>
              <tr className="text-left" style={{ color: "var(--viz-text-muted)" }}>
                <th className="px-3 py-2 font-normal">Date</th>
                <th className="px-3 py-2 font-normal text-right">{label}</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.date} className="border-t border-white/5">
                  <td className="px-3 py-1.5" style={{ color: "var(--viz-text-secondary)" }}>{fmtDay(parseDay(p.date), true)}</td>
                  <td className="px-3 py-1.5 text-right" style={{ color: "var(--viz-text-primary)", fontVariantNumeric: "tabular-nums" }}>{fmtNum(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
