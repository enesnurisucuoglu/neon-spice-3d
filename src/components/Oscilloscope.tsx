import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, Waves, Gauge, Zap } from 'lucide-react';
import {
  ACResult,
  DCOPResult,
  DCSweepResult,
  ProbeMarker,
  SimulationResult,
  TransientResult,
} from '../types/circuit';
import { formatSI } from '../utils/format';

export interface OscilloscopeProps {
  result: SimulationResult | null;
  probes: ProbeMarker[];
  error: string | null;
}

const FALLBACK_COLORS = ['#22d3ee', '#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#60a5fa'];

function niceRange(minVal: number, maxVal: number): { min: number; max: number; ticks: number[] } {
  if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) {
    return { min: -5, max: 5, ticks: [-5, -2.5, 0, 2.5, 5] };
  }
  let lo = minVal;
  let hi = maxVal;
  if (Math.abs(hi - lo) < 1e-9) {
    const pad = Math.abs(lo) > 1e-6 ? Math.abs(lo) * 0.25 : 1;
    lo -= pad;
    hi += pad;
  } else {
    const pad = (hi - lo) * 0.1;
    lo -= pad;
    hi += pad;
  }

  const span = hi - lo;
  const roughStep = span / 4;
  const pow10 = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const norm = roughStep / pow10;
  let step = pow10;
  if (norm <= 1.2) step = 1 * pow10;
  else if (norm <= 2.5) step = 2 * pow10;
  else if (norm <= 5.5) step = 5 * pow10;
  else step = 10 * pow10;

  const niceMin = Math.floor(lo / step) * step;
  const niceMax = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step * 0.01; v += step) {
    ticks.push(Math.abs(v) < step * 1e-6 ? 0 : v);
    if (ticks.length > 10) break;
  }
  return { min: niceMin, max: niceMax, ticks };
}

function buildPolylinePath(
  xs: number[],
  ys: number[],
  mapX: (x: number) => number,
  mapY: (y: number) => number,
  maxPoints = 900
): string {
  const n = Math.min(xs.length, ys.length);
  if (n === 0) return '';
  const stride = Math.max(1, Math.floor(n / maxPoints));
  let d = '';
  let started = false;
  for (let i = 0; i < n; i += stride) {
    const x = xs[i];
    const y = ys[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      started = false;
      continue;
    }
    const px = mapX(x);
    const py = mapY(y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    d += `${started ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`;
    started = true;
  }
  // Ensure last point is included
  if (n > 1 && (n - 1) % stride !== 0) {
    const x = xs[n - 1];
    const y = ys[n - 1];
    if (Number.isFinite(x) && Number.isFinite(y)) {
      d += `L${mapX(x).toFixed(1)},${mapY(y).toFixed(1)}`;
    }
  }
  return d;
}

function findNearestIndex(arr: number[], target: number): number {
  if (arr.length === 0) return -1;
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(arr[lo - 1] - target) < Math.abs(arr[lo] - target)) {
    return lo - 1;
  }
  return lo;
}

function useContainerSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 720, height: 240 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setSize({ width: Math.floor(r.width), height: Math.floor(r.height) });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export const Oscilloscope: React.FC<OscilloscopeProps> = ({ result, probes, error }) => {
  const plotRef = useRef<HTMLDivElement>(null);
  const { width, height } = useContainerSize(plotRef);

  const [hiddenChannels, setHiddenChannels] = useState<Record<string, boolean>>({});
  const [selectedChannel, setSelectedChannel] = useState<string>('');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Build channel list with colors
  const channels = useMemo(() => {
    const colorMap = new Map<string, string>();
    probes.forEach((p, idx) => {
      colorMap.set(p.label, p.color || FALLBACK_COLORS[idx % FALLBACK_COLORS.length]);
    });

    let labels: string[] = [];
    if (result?.type === 'transient') {
      labels = Object.keys(result.probeVoltages);
    } else if (result?.type === 'ac') {
      labels = Object.keys(result.magnitudeDb);
    } else if (result?.type === 'dc_sweep') {
      labels = Object.keys(result.probeVoltages);
    }

    return labels.map((label, idx) => ({
      label,
      color: colorMap.get(label) || FALLBACK_COLORS[idx % FALLBACK_COLORS.length],
    }));
  }, [result, probes]);

  // Keep selectedChannel valid
  useEffect(() => {
    if (channels.length === 0) {
      setSelectedChannel('');
      return;
    }
    if (!channels.some((c) => c.label === selectedChannel)) {
      // Prefer VOUT if available, else last channel (often output), else first
      const vout = channels.find((c) => c.label.toUpperCase().includes('OUT'));
      setSelectedChannel(vout ? vout.label : channels[channels.length - 1].label);
    }
  }, [channels, selectedChannel]);

  const activeChannels = useMemo(
    () => channels.filter((c) => !hiddenChannels[c.label]),
    [channels, hiddenChannels]
  );

  const toggleChannel = (label: string) => {
    setHiddenChannels((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  // --- Transient Measurements ---
  const transientMetrics = useMemo(() => {
    if (result?.type !== 'transient' || !selectedChannel) return null;
    const ys = result.probeVoltages[selectedChannel];
    if (!ys || ys.length === 0) return null;
    let vmin = Infinity;
    let vmax = -Infinity;
    let sum = 0;
    let sumSq = 0;
    let count = 0;
    for (const v of ys) {
      if (!Number.isFinite(v)) continue;
      if (v < vmin) vmin = v;
      if (v > vmax) vmax = v;
      sum += v;
      sumSq += v * v;
      count++;
    }
    if (count === 0) return null;
    const vavg = sum / count;
    const vrms = Math.sqrt(sumSq / count);
    const vpp = vmax - vmin;
    return { vpp, vrms, vmax, vmin, vavg };
  }, [result, selectedChannel]);

  // --- AC Metrics (Peak Gain, Peak Freq, -3dB Cutoff / Bandwidth) ---
  const acMetrics = useMemo(() => {
    if (result?.type !== 'ac' || !selectedChannel) return null;
    const freqs = result.frequencies;
    const mags = result.magnitudeDb[selectedChannel];
    if (!freqs || !mags || freqs.length === 0) return null;

    let peakDb = -Infinity;
    let peakIdx = 0;
    for (let i = 0; i < mags.length; i++) {
      if (Number.isFinite(mags[i]) && mags[i] > peakDb) {
        peakDb = mags[i];
        peakIdx = i;
      }
    }
    const peakFreq = freqs[peakIdx];
    const cutoffLevel = peakDb - 3.0;

    // Find -3 dB crossings relative to peakDb
    const crossings: number[] = [];
    for (let i = 1; i < mags.length; i++) {
      const prev = mags[i - 1] - cutoffLevel;
      const curr = mags[i] - cutoffLevel;
      if ((prev >= 0 && curr < 0) || (prev < 0 && curr >= 0)) {
        const frac = Math.abs(prev) / (Math.abs(prev) + Math.abs(curr) + 1e-12);
        const logF =
          Math.log10(freqs[i - 1]) + frac * (Math.log10(freqs[i]) - Math.log10(freqs[i - 1]));
        crossings.push(Math.pow(10, logF));
      }
    }

    let cutoffLabel = '—';
    if (crossings.length === 1) {
      cutoffLabel = formatSI(crossings[0], 'Hz', 2);
    } else if (crossings.length >= 2) {
      const fLow = crossings[0];
      const fHigh = crossings[crossings.length - 1];
      cutoffLabel = `BW ${formatSI(fHigh - fLow, 'Hz', 2)} (${formatSI(fLow, 'Hz', 1)}–${formatSI(fHigh, 'Hz', 1)})`;
    }

    return { peakDb, peakFreq, cutoffLevel, cutoffLabel };
  }, [result, selectedChannel]);

  // Header bar with mode badge, channel pills, and measurements
  const renderHeader = () => {
    const modeLabel =
      result?.type === 'transient'
        ? 'OSCILLOSCOPE · TRANSIENT'
        : result?.type === 'ac'
        ? 'BODE ANALYZER · AC SWEEP'
        : result?.type === 'dc_sweep'
        ? 'CURVE TRACER · DC SWEEP'
        : result?.type === 'dc_op'
        ? 'MULTIMETER · DC OPERATING POINT'
        : 'INSTRUMENT PANEL';

    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '8px 14px',
          background: 'linear-gradient(180deg, rgba(15,23,42,0.95), rgba(11,17,30,0.95))',
          borderBottom: '1px solid var(--border-subtle)',
          minHeight: 42,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.05em',
              color: 'var(--accent-cyan)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {result?.type === 'ac' ? (
              <Waves size={14} />
            ) : result?.type === 'dc_op' ? (
              <Gauge size={14} />
            ) : (
              <Activity size={14} />
            )}
            {modeLabel}
          </div>

          {/* Channel toggle pills */}
          {channels.length > 0 && result?.type !== 'dc_op' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {channels.map((ch) => {
                const enabled = !hiddenChannels[ch.label];
                const isSelected = selectedChannel === ch.label;
                return (
                  <button
                    key={ch.label}
                    onClick={() => {
                      if (!enabled) {
                        toggleChannel(ch.label);
                        setSelectedChannel(ch.label);
                      } else if (isSelected) {
                        toggleChannel(ch.label);
                      } else {
                        setSelectedChannel(ch.label);
                      }
                    }}
                    onDoubleClick={() => toggleChannel(ch.label)}
                    title="Click to select for measurements; click active pill again to toggle visibility"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '3px 9px',
                      borderRadius: 999,
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 600,
                      opacity: enabled ? 1 : 0.4,
                      background: isSelected && enabled ? `${ch.color}24` : 'var(--bg-app)',
                      border: `1px solid ${isSelected && enabled ? ch.color : 'var(--border-strong)'}`,
                      color: enabled ? ch.color : 'var(--text-muted)',
                      transition: 'all 0.12s ease',
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: enabled ? ch.color : 'transparent',
                        border: `1px solid ${ch.color}`,
                      }}
                    />
                    {ch.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Measurements Bar */}
        {result?.type === 'transient' && transientMetrics && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 13,
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>{selectedChannel}:</span>
            <MetricItem label="Vpp" value={formatSI(transientMetrics.vpp, 'V', 2)} />
            <MetricItem label="Vrms" value={formatSI(transientMetrics.vrms, 'V', 2)} />
            <MetricItem label="Vmax" value={formatSI(transientMetrics.vmax, 'V', 2)} />
            <MetricItem label="Vmin" value={formatSI(transientMetrics.vmin, 'V', 2)} />
            <MetricItem label="Vavg" value={formatSI(transientMetrics.vavg, 'V', 2)} />
          </div>
        )}

        {result?.type === 'ac' && acMetrics && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 13,
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>{selectedChannel}:</span>
            <MetricItem label="Peak" value={`${acMetrics.peakDb.toFixed(2)} dB`} />
            <MetricItem label="f_peak" value={formatSI(acMetrics.peakFreq, 'Hz', 2)} />
            <MetricItem label="-3 dB" value={acMetrics.cutoffLabel} highlight />
          </div>
        )}
      </div>
    );
  };

  // --- Render Transient Plot ---
  const renderTransient = (res: TransientResult) => {
    const pad = { left: 58, right: 18, top: 14, bottom: 26 };
    const plotW = Math.max(100, width - pad.left - pad.right);
    const plotH = Math.max(60, height - pad.top - pad.bottom);

    const times = res.times;
    if (times.length < 2 || activeChannels.length === 0) {
      return <EmptyState message="No active probe channels to plot. Place a voltage probe on the schematic." />;
    }

    const tMin = times[0];
    const tMax = times[times.length - 1];
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const ch of activeChannels) {
      const arr = res.probeVoltages[ch.label] || [];
      for (const v of arr) {
        if (!Number.isFinite(v)) continue;
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
    }
    const yRange = niceRange(yMin, yMax);
    const mapX = (t: number) => pad.left + ((t - tMin) / (tMax - tMin || 1)) * plotW;
    const mapY = (v: number) =>
      pad.top + plotH - ((v - yRange.min) / (yRange.max - yRange.min || 1)) * plotH;

    const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => tMin + f * (tMax - tMin));

    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      if (mx < pad.left || mx > pad.left + plotW) {
        setHoverIdx(null);
        return;
      }
      const frac = (mx - pad.left) / plotW;
      const tTarget = tMin + frac * (tMax - tMin);
      setHoverIdx(findNearestIndex(times, tTarget));
    };

    const clampedIdx = hoverIdx !== null && hoverIdx >= 0 && hoverIdx < times.length ? hoverIdx : null;
    const hoverX = clampedIdx !== null ? mapX(times[clampedIdx]) : 0;

    return (
      <svg
        width={width}
        height={height}
        style={{ display: 'block', background: '#070b12' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Graticule Frame */}
        <rect
          x={pad.left}
          y={pad.top}
          width={plotW}
          height={plotH}
          fill="#090e17"
          stroke="#1e293b"
          strokeWidth={1}
        />

        {/* Horizontal grid lines + Y labels */}
        {yRange.ticks.map((tick, i) => {
          const py = mapY(tick);
          if (py < pad.top - 1 || py > pad.top + plotH + 1) return null;
          const isZero = Math.abs(tick) < 1e-12;
          return (
            <g key={`yt-${i}`}>
              <line
                x1={pad.left}
                y1={py}
                x2={pad.left + plotW}
                y2={py}
                stroke={isZero ? '#334155' : '#162032'}
                strokeWidth={isZero ? 1.2 : 1}
                strokeDasharray={isZero ? undefined : '3 3'}
              />
              <text
                x={pad.left - 7}
                y={py + 3.5}
                textAnchor="end"
                fill="#94a3b8"
                fontSize={10}
                fontFamily="var(--font-mono)"
              >
                {formatSI(tick, 'V', 1)}
              </text>
            </g>
          );
        })}

        {/* Vertical grid lines + X labels */}
        {xTicks.map((t, i) => {
          const px = mapX(t);
          return (
            <g key={`xt-${i}`}>
              <line
                x1={px}
                y1={pad.top}
                x2={px}
                y2={pad.top + plotH}
                stroke="#162032"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <text
                x={px}
                y={pad.top + plotH + 16}
                textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
                fill="#94a3b8"
                fontSize={10}
                fontFamily="var(--font-mono)"
              >
                {formatSI(t, 's', 2)}
              </text>
            </g>
          );
        })}

        {/* Waveform traces */}
        {activeChannels.map((ch) => {
          const ys = res.probeVoltages[ch.label] || [];
          const d = buildPolylinePath(times, ys, mapX, mapY);
          const isSelected = ch.label === selectedChannel;
          return (
            <path
              key={ch.label}
              d={d}
              fill="none"
              stroke={ch.color}
              strokeWidth={isSelected ? 2.1 : 1.5}
              strokeLinejoin="round"
              style={{
                filter: isSelected ? `drop-shadow(0 0 4px ${ch.color}88)` : undefined,
              }}
            />
          );
        })}

        {/* Interactive Crosshair & Readout */}
        {clampedIdx !== null && (
          <g pointerEvents="none">
            <line
              x1={hoverX}
              y1={pad.top}
              x2={hoverX}
              y2={pad.top + plotH}
              stroke="#64748b"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            {activeChannels.map((ch) => {
              const v = res.probeVoltages[ch.label]?.[clampedIdx];
              if (v === undefined || !Number.isFinite(v)) return null;
              return (
                <circle
                  key={`dot-${ch.label}`}
                  cx={hoverX}
                  cy={mapY(v)}
                  r={3.8}
                  fill={ch.color}
                  stroke="#070b12"
                  strokeWidth={1.5}
                />
              );
            })}
            <CrosshairTooltip
              x={hoverX}
              plotLeft={pad.left}
              plotWidth={plotW}
              y={pad.top + 8}
              header={`t = ${formatSI(times[clampedIdx], 's', 3)}`}
              rows={activeChannels.map((ch) => ({
                label: ch.label,
                color: ch.color,
                value: formatSI(res.probeVoltages[ch.label]?.[clampedIdx] ?? NaN, 'V', 3),
              }))}
            />
          </g>
        )}
      </svg>
    );
  };

  // --- Render AC Bode Plot (Split Pane: Magnitude dB + Phase deg) ---
  const renderACBode = (res: ACResult) => {
    const freqs = res.frequencies;
    if (freqs.length < 2 || activeChannels.length === 0) {
      return <EmptyState message="No active probe channels for AC Bode plot." />;
    }

    const pad = { left: 58, right: 18, top: 10, bottom: 24, gap: 14 };
    const plotW = Math.max(100, width - pad.left - pad.right);
    const availH = Math.max(100, height - pad.top - pad.bottom - pad.gap);
    const magH = Math.floor(availH * 0.56);
    const phaseH = availH - magH;
    const magTop = pad.top;
    const phaseTop = pad.top + magH + pad.gap;

    const logFMin = Math.log10(Math.max(1e-6, freqs[0]));
    const logFMax = Math.log10(Math.max(freqs[0] * 10, freqs[freqs.length - 1]));
    const mapX = (f: number) =>
      pad.left + ((Math.log10(Math.max(1e-6, f)) - logFMin) / (logFMax - logFMin || 1)) * plotW;

    // Magnitude range
    let dbMin = Infinity;
    let dbMax = -Infinity;
    for (const ch of activeChannels) {
      for (const v of res.magnitudeDb[ch.label] || []) {
        if (!Number.isFinite(v)) continue;
        const clamped = Math.max(-120, Math.min(120, v));
        if (clamped < dbMin) dbMin = clamped;
        if (clamped > dbMax) dbMax = clamped;
      }
    }
    const dbRange = niceRange(dbMin, dbMax);
    const mapMagY = (db: number) =>
      magTop + magH - ((Math.max(-120, Math.min(120, db)) - dbRange.min) / (dbRange.max - dbRange.min || 1)) * magH;

    // Phase range (-180 to 180)
    const phaseTicks = [-180, -90, 0, 90, 180];
    const mapPhaseY = (deg: number) => phaseTop + phaseH - ((deg + 180) / 360) * phaseH;

    // Decade ticks
    const minDec = Math.ceil(logFMin);
    const maxDec = Math.floor(logFMax);
    const decTicks: number[] = [];
    for (let d = minDec; d <= maxDec; d++) {
      decTicks.push(Math.pow(10, d));
    }

    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      if (mx < pad.left || mx > pad.left + plotW) {
        setHoverIdx(null);
        return;
      }
      const frac = (mx - pad.left) / plotW;
      const targetFreq = Math.pow(10, logFMin + frac * (logFMax - logFMin));
      setHoverIdx(findNearestIndex(freqs, targetFreq));
    };

    const clampedIdx = hoverIdx !== null && hoverIdx >= 0 && hoverIdx < freqs.length ? hoverIdx : null;
    const hoverX = clampedIdx !== null ? mapX(freqs[clampedIdx]) : 0;

    return (
      <svg
        width={width}
        height={height}
        style={{ display: 'block', background: '#070b12' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Magnitude Pane */}
        <rect x={pad.left} y={magTop} width={plotW} height={magH} fill="#090e17" stroke="#1e293b" strokeWidth={1} />
        <text x={pad.left + 6} y={magTop + 12} fill="#64748b" fontSize={9.5} fontFamily="var(--font-mono)">
          MAGNITUDE (dB)
        </text>

        {/* Phase Pane */}
        <rect x={pad.left} y={phaseTop} width={plotW} height={phaseH} fill="#090e17" stroke="#1e293b" strokeWidth={1} />
        <text x={pad.left + 6} y={phaseTop + 12} fill="#64748b" fontSize={9.5} fontFamily="var(--font-mono)">
          PHASE (deg)
        </text>

        {/* Magnitude Y grid */}
        {dbRange.ticks.map((t, i) => {
          const py = mapMagY(t);
          if (py < magTop - 1 || py > magTop + magH + 1) return null;
          return (
            <g key={`db-${i}`}>
              <line
                x1={pad.left}
                y1={py}
                x2={pad.left + plotW}
                y2={py}
                stroke={t === 0 ? '#334155' : '#162032'}
                strokeDasharray={t === 0 ? undefined : '3 3'}
              />
              <text x={pad.left - 7} y={py + 3.5} textAnchor="end" fill="#94a3b8" fontSize={9.5} fontFamily="var(--font-mono)">
                {t.toFixed(0)} dB
              </text>
            </g>
          );
        })}

        {/* -3 dB Reference Indicator */}
        {acMetrics && acMetrics.cutoffLevel >= dbRange.min && acMetrics.cutoffLevel <= dbRange.max && (
          <g pointerEvents="none">
            <line
              x1={pad.left}
              y1={mapMagY(acMetrics.cutoffLevel)}
              x2={pad.left + plotW}
              y2={mapMagY(acMetrics.cutoffLevel)}
              stroke="#fb7185"
              strokeWidth={1}
              strokeDasharray="5 4"
              strokeOpacity={0.7}
            />
            <text
              x={pad.left + plotW - 4}
              y={mapMagY(acMetrics.cutoffLevel) - 3}
              textAnchor="end"
              fill="#fb7185"
              fontSize={9}
              fontFamily="var(--font-mono)"
            >
              -3 dB ({acMetrics.cutoffLevel.toFixed(1)} dB)
            </text>
          </g>
        )}

        {/* Phase Y grid */}
        {phaseTicks.map((deg) => {
          const py = mapPhaseY(deg);
          return (
            <g key={`ph-${deg}`}>
              <line
                x1={pad.left}
                y1={py}
                x2={pad.left + plotW}
                y2={py}
                stroke={deg === 0 ? '#334155' : '#162032'}
                strokeDasharray={deg === 0 ? undefined : '3 3'}
              />
              <text x={pad.left - 7} y={py + 3.5} textAnchor="end" fill="#94a3b8" fontSize={9.5} fontFamily="var(--font-mono)">
                {deg}°
              </text>
            </g>
          );
        })}

        {/* Logarithmic Frequency Decade Grid */}
        {decTicks.map((f) => {
          const px = mapX(f);
          return (
            <g key={`dec-${f}`}>
              <line x1={px} y1={magTop} x2={px} y2={magTop + magH} stroke="#162032" strokeDasharray="3 3" />
              <line x1={px} y1={phaseTop} x2={px} y2={phaseTop + phaseH} stroke="#162032" strokeDasharray="3 3" />
              <text
                x={px}
                y={phaseTop + phaseH + 15}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize={10}
                fontFamily="var(--font-mono)"
              >
                {formatSI(f, 'Hz', 0)}
              </text>
            </g>
          );
        })}

        {/* Magnitude & Phase Traces */}
        {activeChannels.map((ch) => {
          const magPath = buildPolylinePath(freqs, res.magnitudeDb[ch.label] || [], mapX, mapMagY);
          const phasePath = buildPolylinePath(freqs, res.phaseDeg[ch.label] || [], mapX, mapPhaseY);
          const isSelected = ch.label === selectedChannel;
          return (
            <g key={ch.label}>
              <path
                d={magPath}
                fill="none"
                stroke={ch.color}
                strokeWidth={isSelected ? 2.1 : 1.4}
                style={{ filter: isSelected ? `drop-shadow(0 0 4px ${ch.color}88)` : undefined }}
              />
              <path
                d={phasePath}
                fill="none"
                stroke={ch.color}
                strokeWidth={isSelected ? 1.7 : 1.2}
                strokeDasharray="4 2"
                strokeOpacity={0.9}
              />
            </g>
          );
        })}

        {/* Interactive Crosshair */}
        {clampedIdx !== null && (
          <g pointerEvents="none">
            <line x1={hoverX} y1={magTop} x2={hoverX} y2={phaseTop + phaseH} stroke="#64748b" strokeDasharray="4 3" />
            {activeChannels.map((ch) => {
              const db = res.magnitudeDb[ch.label]?.[clampedIdx];
              const ph = res.phaseDeg[ch.label]?.[clampedIdx];
              return (
                <React.Fragment key={`acdot-${ch.label}`}>
                  {db !== undefined && Number.isFinite(db) && (
                    <circle cx={hoverX} cy={mapMagY(db)} r={3.5} fill={ch.color} stroke="#070b12" strokeWidth={1.4} />
                  )}
                  {ph !== undefined && Number.isFinite(ph) && (
                    <circle cx={hoverX} cy={mapPhaseY(ph)} r={3.2} fill={ch.color} stroke="#070b12" strokeWidth={1.4} />
                  )}
                </React.Fragment>
              );
            })}
            <CrosshairTooltip
              x={hoverX}
              plotLeft={pad.left}
              plotWidth={plotW}
              y={magTop + 8}
              header={`f = ${formatSI(freqs[clampedIdx], 'Hz', 3)}`}
              rows={activeChannels.map((ch) => {
                const db = res.magnitudeDb[ch.label]?.[clampedIdx];
                const ph = res.phaseDeg[ch.label]?.[clampedIdx];
                return {
                  label: ch.label,
                  color: ch.color,
                  value: `${Number.isFinite(db) ? db.toFixed(1) : '—'} dB / ${Number.isFinite(ph) ? ph.toFixed(0) : '—'}°`,
                };
              })}
            />
          </g>
        )}
      </svg>
    );
  };

  // --- Render DC Sweep Transfer Curve ---
  const renderDCSweep = (res: DCSweepResult) => {
    const xs = res.sweepValues;
    if (xs.length < 2 || activeChannels.length === 0) {
      return <EmptyState message="No active probe channels for DC Sweep curve." />;
    }

    const pad = { left: 58, right: 18, top: 14, bottom: 26 };
    const plotW = Math.max(100, width - pad.left - pad.right);
    const plotH = Math.max(60, height - pad.top - pad.bottom);

    const xMin = Math.min(xs[0], xs[xs.length - 1]);
    const xMax = Math.max(xs[0], xs[xs.length - 1]);
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const ch of activeChannels) {
      for (const v of res.probeVoltages[ch.label] || []) {
        if (!Number.isFinite(v)) continue;
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
    }
    const yRange = niceRange(yMin, yMax);
    const mapX = (v: number) => pad.left + ((v - xMin) / (xMax - xMin || 1)) * plotW;
    const mapY = (v: number) =>
      pad.top + plotH - ((v - yRange.min) / (yRange.max - yRange.min || 1)) * plotH;
    const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => xMin + f * (xMax - xMin));

    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      if (mx < pad.left || mx > pad.left + plotW) {
        setHoverIdx(null);
        return;
      }
      const target = xMin + ((mx - pad.left) / plotW) * (xMax - xMin);
      setHoverIdx(findNearestIndex(xs, target));
    };

    const clampedIdx = hoverIdx !== null && hoverIdx >= 0 && hoverIdx < xs.length ? hoverIdx : null;
    const hoverX = clampedIdx !== null ? mapX(xs[clampedIdx]) : 0;

    return (
      <svg
        width={width}
        height={height}
        style={{ display: 'block', background: '#070b12' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <rect x={pad.left} y={pad.top} width={plotW} height={plotH} fill="#090e17" stroke="#1e293b" strokeWidth={1} />

        {yRange.ticks.map((tick, i) => {
          const py = mapY(tick);
          if (py < pad.top - 1 || py > pad.top + plotH + 1) return null;
          return (
            <g key={`dcy-${i}`}>
              <line
                x1={pad.left}
                y1={py}
                x2={pad.left + plotW}
                y2={py}
                stroke={tick === 0 ? '#334155' : '#162032'}
                strokeDasharray={tick === 0 ? undefined : '3 3'}
              />
              <text x={pad.left - 7} y={py + 3.5} textAnchor="end" fill="#94a3b8" fontSize={10} fontFamily="var(--font-mono)">
                {formatSI(tick, 'V', 1)}
              </text>
            </g>
          );
        })}

        {xTicks.map((v, i) => {
          const px = mapX(v);
          return (
            <g key={`dcx-${i}`}>
              <line x1={px} y1={pad.top} x2={px} y2={pad.top + plotH} stroke="#162032" strokeDasharray="3 3" />
              <text
                x={px}
                y={pad.top + plotH + 16}
                textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
                fill="#94a3b8"
                fontSize={10}
                fontFamily="var(--font-mono)"
              >
                {formatSI(v, 'V', 2)}
              </text>
            </g>
          );
        })}

        <text
          x={pad.left + plotW - 4}
          y={pad.top + plotH - 6}
          textAnchor="end"
          fill="#64748b"
          fontSize={9.5}
          fontFamily="var(--font-mono)"
        >
          Swept Source: {res.sourceName}
        </text>

        {activeChannels.map((ch) => {
          const d = buildPolylinePath(xs, res.probeVoltages[ch.label] || [], mapX, mapY);
          const isSelected = ch.label === selectedChannel;
          return (
            <path
              key={ch.label}
              d={d}
              fill="none"
              stroke={ch.color}
              strokeWidth={isSelected ? 2.2 : 1.5}
              style={{ filter: isSelected ? `drop-shadow(0 0 4px ${ch.color}88)` : undefined }}
            />
          );
        })}

        {clampedIdx !== null && (
          <g pointerEvents="none">
            <line x1={hoverX} y1={pad.top} x2={hoverX} y2={pad.top + plotH} stroke="#64748b" strokeDasharray="4 3" />
            {activeChannels.map((ch) => {
              const v = res.probeVoltages[ch.label]?.[clampedIdx];
              if (v === undefined || !Number.isFinite(v)) return null;
              return (
                <circle key={`dcdot-${ch.label}`} cx={hoverX} cy={mapY(v)} r={3.8} fill={ch.color} stroke="#070b12" strokeWidth={1.5} />
              );
            })}
            <CrosshairTooltip
              x={hoverX}
              plotLeft={pad.left}
              plotWidth={plotW}
              y={pad.top + 8}
              header={`${res.sourceName} = ${formatSI(xs[clampedIdx], 'V', 3)}`}
              rows={activeChannels.map((ch) => ({
                label: ch.label,
                color: ch.color,
                value: formatSI(res.probeVoltages[ch.label]?.[clampedIdx] ?? NaN, 'V', 3),
              }))}
            />
          </g>
        )}
      </svg>
    );
  };

  // --- Render DC Operating Point Table ---
  const renderDCOP = (res: DCOPResult) => {
    const nodeEntries = Object.entries(res.nodeVoltages)
      .map(([idStr, v]) => ({
        id: Number(idStr),
        name: res.nodeNames[Number(idStr)] || `N${idStr}`,
        voltage: v,
      }))
      .sort((a, b) => a.id - b.id);

    const compNames = Array.from(
      new Set([...Object.keys(res.branchCurrents), ...Object.keys(res.componentPower)])
    ).sort();

    let totalDissipated = 0;
    for (const name of compNames) {
      const p = res.componentPower[name];
      if (Number.isFinite(p) && p > 0) totalDissipated += p;
    }

    return (
      <div
        style={{
          height: '100%',
          overflow: 'auto',
          padding: '10px 14px',
          background: '#070b12',
          display: 'grid',
          gridTemplateColumns: 'minmax(200px, 1fr) minmax(280px, 1.5fr)',
          gap: 14,
          alignContent: 'start',
        }}
      >
        {/* Node Voltages Table */}
        <div
          style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 7,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '7px 10px',
              background: 'var(--bg-panel-alt)',
              borderBottom: '1px solid var(--border-subtle)',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--accent-cyan)',
              fontFamily: 'var(--font-mono)',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>NODE VOLTAGES</span>
            <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
              {res.converged ? `Converged (${res.iterations} iter)` : 'Did not converge'}
            </span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '5px 10px', fontWeight: 600 }}>Node</th>
                <th style={{ padding: '5px 10px', fontWeight: 600, textAlign: 'right' }}>Voltage</th>
              </tr>
            </thead>
            <tbody>
              {nodeEntries.map((n) => (
                <tr key={n.id} style={{ borderBottom: '1px solid rgba(31, 42, 61, 0.5)' }}>
                  <td style={{ padding: '5px 10px', color: 'var(--text-primary)' }}>{n.name}</td>
                  <td style={{ padding: '5px 10px', textAlign: 'right', color: '#34d399', fontWeight: 600 }}>
                    {formatSI(n.voltage, 'V', 3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Branch Currents & Power Table */}
        <div
          style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 7,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '7px 10px',
              background: 'var(--bg-panel-alt)',
              borderBottom: '1px solid var(--border-subtle)',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--accent-amber)',
              fontFamily: 'var(--font-mono)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>BRANCH CURRENTS & POWER</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-primary)' }}>
              <Zap size={11} color="#fbbf24" />
              Total P_diss: {formatSI(totalDissipated, 'W', 2)}
            </span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '5px 10px', fontWeight: 600 }}>Element</th>
                <th style={{ padding: '5px 10px', fontWeight: 600, textAlign: 'right' }}>Current</th>
                <th style={{ padding: '5px 10px', fontWeight: 600, textAlign: 'right' }}>Power</th>
              </tr>
            </thead>
            <tbody>
              {compNames.map((name) => {
                const curr = res.branchCurrents[name];
                const pwr = res.componentPower[name];
                return (
                  <tr key={name} style={{ borderBottom: '1px solid rgba(31, 42, 61, 0.5)' }}>
                    <td style={{ padding: '5px 10px', color: 'var(--text-primary)', fontWeight: 600 }}>{name}</td>
                    <td style={{ padding: '5px 10px', textAlign: 'right', color: '#60a5fa' }}>
                      {curr !== undefined ? formatSI(curr, 'A', 3) : '—'}
                    </td>
                    <td
                      style={{
                        padding: '5px 10px',
                        textAlign: 'right',
                        color: pwr !== undefined && pwr < 0 ? '#a78bfa' : '#fbbf24',
                      }}
                    >
                      {pwr !== undefined ? formatSI(pwr, 'W', 2) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: '#070b12',
        overflow: 'hidden',
      }}
    >
      {renderHeader()}
      <div ref={plotRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {error ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: 'var(--accent-rose)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              padding: 16,
            }}
          >
            <AlertTriangle size={16} />
            <span>Simulation Error: {error}</span>
          </div>
        ) : !result ? (
          <EmptyState message="Press Run or edit the schematic to simulate." />
        ) : result.type === 'transient' ? (
          renderTransient(result)
        ) : result.type === 'ac' ? (
          renderACBode(result)
        ) : result.type === 'dc_sweep' ? (
          renderDCSweep(result)
        ) : (
          renderDCOP(result)
        )}
      </div>
    </div>
  );
};

const MetricItem: React.FC<{ label: string; value: string; highlight?: boolean }> = ({
  label,
  value,
  highlight,
}) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '3px 9px',
      borderRadius: 8,
      background: highlight
        ? 'rgba(34, 211, 238, 0.14)'
        : 'rgba(7, 11, 20, 0.78)',
      border: `1px solid ${
        highlight ? 'rgba(34, 211, 238, 0.42)' : 'var(--border-subtle)'
      }`,
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
    }}
  >
    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{label}</span>
    <span
      style={{
        color: highlight ? '#67e8f9' : 'var(--text-primary)',
        fontWeight: 700,
        fontSize: 12,
      }}
    >
      {value}
    </span>
  </span>
);

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div
    style={{
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-muted)',
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      padding: 16,
      textAlign: 'center',
    }}
  >
    {message}
  </div>
);

const CrosshairTooltip: React.FC<{
  x: number;
  plotLeft: number;
  plotWidth: number;
  y: number;
  header: string;
  rows: { label: string; color: string; value: string }[];
}> = ({ x, plotLeft, plotWidth, y, header, rows }) => {
  const boxW = 162;
  const boxH = 22 + rows.length * 15;
  const placeLeft = x + 12 + boxW > plotLeft + plotWidth;
  const tx = placeLeft ? Math.max(plotLeft + 4, x - boxW - 10) : x + 10;

  return (
    <g transform={`translate(${tx}, ${y})`}>
      <rect
        x={0}
        y={0}
        width={boxW}
        height={boxH}
        rx={5}
        fill="rgba(11, 15, 23, 0.94)"
        stroke="#334155"
        strokeWidth={1}
      />
      <text x={8} y={14} fill="#e2e8f0" fontSize={10} fontWeight={700} fontFamily="var(--font-mono)">
        {header}
      </text>
      {rows.map((r, i) => (
        <g key={r.label} transform={`translate(8, ${28 + i * 15})`}>
          <circle cx={3} cy={-3} r={2.8} fill={r.color} />
          <text x={10} y={0} fill="#94a3b8" fontSize={9.5} fontFamily="var(--font-mono)">
            {r.label}
          </text>
          <text x={boxW - 16} y={0} textAnchor="end" fill={r.color} fontSize={9.5} fontWeight={600} fontFamily="var(--font-mono)">
            {r.value}
          </text>
        </g>
      ))}
    </g>
  );
};
