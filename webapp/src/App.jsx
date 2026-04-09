import { useEffect, useMemo, useState } from 'react';

const EXPLAINERS = {
  pressure: {
    title: 'Pressure ridge',
    body: 'The filled ridge shows combined market pressure at each lane. Higher shape means stronger combined ask and bid activity there.',
  },
  volatility: {
    title: 'Volatility line',
    body: 'The orange line shows instability. When it rises, the market is behaving less smoothly and the frame is more stressed.',
  },
  bid: {
    title: 'Bid liquidity',
    body: 'Blue points mark bid-side liquidity. Larger points mean stronger bid support at that lane.',
  },
  ask: {
    title: 'Ask liquidity',
    body: 'Gold points mark ask-side liquidity. Larger points mean stronger ask-side concentration at that lane.',
  },
  axes: {
    title: 'Axes',
    body: 'X is strike or lane position. Y is normalized intensity from 0 to 100, used to compare pressure and liquidity across the scene.',
  },
};

const DEMO_BEATS = [
  { start: 0, end: 0.2, title: 'Read the axes', focus: 'axes', body: 'Start by reading left to right as lane position. Higher vertical placement means stronger normalized intensity.' },
  { start: 0.2, end: 0.45, title: 'Pressure concentrates', focus: 'pressure', body: 'Watch where the main ridge rises. These peaks show where total pressure is strongest across the lane range.' },
  { start: 0.45, end: 0.7, title: 'Liquidity splits by side', focus: 'bid', body: 'Blue points show bid liquidity and gold points show ask liquidity. Larger dots mean stronger concentration.' },
  { start: 0.7, end: 1, title: 'Stress and direction', focus: 'volatility', body: 'The orange line tracks instability while the summary cards show whether the frame leans bid-led or ask-led.' },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpArray(a = [], b = [], t = 0) {
  const maxLen = Math.max(a.length, b.length);
  const out = new Array(maxLen);
  for (let i = 0; i < maxLen; i += 1) {
    out[i] = lerp(Number(a[i] ?? 0), Number(b[i] ?? 0), t);
  }
  return out;
}

function interpolateFrame(current, next, alpha) {
  if (!current) {
    return null;
  }
  if (!next) {
    return current;
  }

  return {
    ...current,
    liquidity_density_factor: lerp(current.liquidity_density_factor, next.liquidity_density_factor, alpha),
    gamma_metabolism_factor: lerp(current.gamma_metabolism_factor, next.gamma_metabolism_factor, alpha),
    manipulation_factor: lerp(current.manipulation_factor, next.manipulation_factor, alpha),
    price_kinetic_factor: lerp(current.price_kinetic_factor, next.price_kinetic_factor, alpha),
    health_score: lerp(current.health_score, next.health_score, alpha),
    side_imbalance: lerp(current.side_imbalance, next.side_imbalance, alpha),
    order_density: lerp(current.order_density, next.order_density, alpha),
    ask_flow: lerpArray(current.ask_flow, next.ask_flow, alpha),
    bid_flow: lerpArray(current.bid_flow, next.bid_flow, alpha),
  };
}

function useReplayData() {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const response = await fetch('/data/replay_frames.json', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Failed to load replay data: ${response.status}`);
        }
        const data = await response.json();
        if (mounted) {
          setPayload(data);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  return { payload, error, loading };
}

function formatTimestamp(value) {
  if (!value) {
    return 'n/a';
  }
  return new Date(value).toLocaleString();
}

function getDemoBeat(playhead, maxPlayhead) {
  const progress = maxPlayhead <= 0 ? 0 : playhead / maxPlayhead;
  return DEMO_BEATS.find((beat) => progress >= beat.start && progress < beat.end) ?? DEMO_BEATS[DEMO_BEATS.length - 1];
}

function buildAxisTicks(min, max) {
  return Array.from({ length: 6 }, (_, index) => {
    const t = index / 5;
    return {
      id: `x-${index}`,
      x: 110 + t * 850,
      value: Math.round(lerp(min, max, t)),
    };
  });
}

function buildYAxisTicks() {
  return [0, 20, 40, 60, 80, 100].map((value) => ({
    id: `y-${value}`,
    y: 620 - (value / 100) * 460,
    value,
  }));
}

function buildSeries(frame, strikeMin, strikeMax) {
  const laneCount = Math.max(frame.ask_flow.length, frame.bid_flow.length, 1);
  const raw = [];

  for (let i = 0; i < laneCount; i += 1) {
    const ask = Number(frame.ask_flow[i] ?? 0);
    const bid = Number(frame.bid_flow[i] ?? 0);
    const pressure = (ask + bid) / 2;
    const volatility = Math.abs(ask - bid);
    raw.push({ ask, bid, pressure, volatility });
  }

  const maxPressure = Math.max(...raw.map((entry) => entry.pressure), 0.001);
  const maxLiquidity = Math.max(...raw.flatMap((entry) => [entry.ask, entry.bid]), 0.001);
  const maxVolatility = Math.max(...raw.map((entry) => entry.volatility), 0.001);

  return raw.map((entry, index) => {
    const t = index / Math.max(laneCount - 1, 1);
    const x = 110 + t * 850;
    const pressureNorm = entry.pressure / maxPressure;
    const askNorm = entry.ask / maxLiquidity;
    const bidNorm = entry.bid / maxLiquidity;
    const volatilityNorm = entry.volatility / maxVolatility;

    return {
      id: `lane-${index}`,
      index,
      strike: Math.round(lerp(strikeMin, strikeMax, t)),
      x,
      pressureNorm,
      askNorm,
      bidNorm,
      volatilityNorm,
      pressureY: 620 - pressureNorm * 320 - frame.order_density * 36,
      volatilityY: 600 - volatilityNorm * 260 - frame.manipulation_factor * 18,
      askY: 605 - askNorm * 190,
      bidY: 605 - bidNorm * 190,
      ask: entry.ask,
      bid: entry.bid,
      pressure: entry.pressure,
      volatility: entry.volatility,
    };
  });
}

function buildSmoothLine(points) {
  if (!points.length) {
    return '';
  }

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const point = points[i];
    const controlX = (prev.x + point.x) / 2;
    path += ` C ${controlX} ${prev.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }
  return path;
}

function buildArea(points, floorY) {
  if (!points.length) {
    return '';
  }

  const first = points[0];
  const last = points[points.length - 1];
  let path = `M ${first.x} ${floorY} L ${first.x} ${first.y}`;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const point = points[i];
    const controlX = (prev.x + point.x) / 2;
    path += ` C ${controlX} ${prev.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }
  path += ` L ${last.x} ${floorY} Z`;
  return path;
}

function Tooltip({ point }) {
  if (!point) {
    return null;
  }

  return (
    <div className="tooltip-panel">
      <p className="tooltip-title">Lane {point.index + 1}</p>
      <p className="tooltip-line">Strike: <strong>{point.strike}</strong></p>
      <p className="tooltip-line">Pressure: <strong>{point.pressure.toFixed(2)}</strong></p>
      <p className="tooltip-line">Bid liquidity: <strong>{point.bid.toFixed(2)}</strong></p>
      <p className="tooltip-line">Ask liquidity: <strong>{point.ask.toFixed(2)}</strong></p>
      <p className="tooltip-line">Volatility: <strong>{point.volatility.toFixed(2)}</strong></p>
    </div>
  );
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="metric-card">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      <p className="metric-hint">{hint}</p>
    </div>
  );
}

function DataLandscape({
  frame,
  strikeMin,
  strikeMax,
  focusedKey,
  demoBeat,
  onFocusKey,
  activePoint,
  onHoverPoint,
  onLeavePoint,
}) {
  const series = useMemo(() => buildSeries(frame, strikeMin, strikeMax), [frame, strikeMin, strikeMax]);
  const xTicks = useMemo(() => buildAxisTicks(strikeMin, strikeMax), [strikeMin, strikeMax]);
  const yTicks = useMemo(() => buildYAxisTicks(), []);
  const pressureArea = useMemo(() => buildArea(series.map((entry) => ({ x: entry.x, y: entry.pressureY })), 620), [series]);
  const pressureLine = useMemo(() => buildSmoothLine(series.map((entry) => ({ x: entry.x, y: entry.pressureY }))), [series]);
  const volatilityLine = useMemo(() => buildSmoothLine(series.map((entry) => ({ x: entry.x, y: entry.volatilityY }))), [series]);
  const effectiveFocus = focusedKey || demoBeat?.focus || 'pressure';

  return (
    <div className="viz-shell">
      <svg className="landscape-svg" viewBox="0 0 1080 760" role="img" aria-label="Market pressure visualization">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0b1421" />
            <stop offset="100%" stopColor="#13283b" />
          </linearGradient>
          <linearGradient id="pressureFill" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(110, 194, 226, 0.78)" />
            <stop offset="100%" stopColor="rgba(37, 113, 143, 0.58)" />
          </linearGradient>
        </defs>

        <rect width="1080" height="760" fill="url(#bg)" />
        <rect x="72" y="52" width="954" height="654" className="plot-frame" />

        {yTicks.map((tick) => (
          <g key={tick.id}>
            <line x1="110" y1={tick.y} x2="960" y2={tick.y} className="grid-line" />
            <text x="86" y={tick.y + 4} className="axis-text axis-left">{tick.value}</text>
          </g>
        ))}

        {xTicks.map((tick) => (
          <g key={tick.id}>
            <line x1={tick.x} y1="620" x2={tick.x} y2="634" className="axis-tick" />
            <text x={tick.x} y="664" textAnchor="middle" className="axis-text">{tick.value}</text>
          </g>
        ))}

        <line x1="110" y1="620" x2="960" y2="620" className="axis-line" />
        <line x1="110" y1="160" x2="110" y2="620" className="axis-line" />
        <text x="128" y="136" className="axis-caption">Signal Level (0-100)</text>
        <text x="535" y="694" textAnchor="middle" className="axis-label">Strike / Lane Position</text>

        <g opacity={effectiveFocus === 'pressure' ? 1 : 0.92}>
          <path d={pressureArea} fill="url(#pressureFill)" />
          <path d={pressureLine} className="pressure-line" />
        </g>

        <g opacity={effectiveFocus === 'volatility' ? 1 : 0.88}>
          <path d={volatilityLine} className="volatility-line" />
        </g>

        <g opacity={effectiveFocus === 'bid' ? 1 : 0.9}>
          {series.map((point) => (
            <circle
              key={`bid-${point.id}`}
              cx={point.x}
              cy={point.bidY}
              r={4 + point.bidNorm * 10}
              className={`liquidity-dot bid-dot ${activePoint?.id === point.id ? 'dot-active' : ''}`}
              onMouseEnter={() => {
                onFocusKey('bid');
                onHoverPoint(point);
              }}
              onFocus={() => {
                onFocusKey('bid');
                onHoverPoint(point);
              }}
              onMouseLeave={onLeavePoint}
              onBlur={onLeavePoint}
            />
          ))}
        </g>

        <g opacity={effectiveFocus === 'ask' ? 1 : 0.9}>
          {series.map((point) => (
            <circle
              key={`ask-${point.id}`}
              cx={point.x}
              cy={point.askY}
              r={4 + point.askNorm * 10}
              className={`liquidity-dot ask-dot ${activePoint?.id === point.id ? 'dot-active' : ''}`}
              onMouseEnter={() => {
                onFocusKey('ask');
                onHoverPoint(point);
              }}
              onFocus={() => {
                onFocusKey('ask');
                onHoverPoint(point);
              }}
              onMouseLeave={onLeavePoint}
              onBlur={onLeavePoint}
            />
          ))}
        </g>

        {activePoint ? (
          <g>
            <line x1={activePoint.x} y1="160" x2={activePoint.x} y2="620" className="hover-guide" />
            <circle cx={activePoint.x} cy={activePoint.pressureY} r="6" className="focus-ring" />
          </g>
        ) : null}

        <rect
          x="110"
          y="160"
          width="850"
          height="460"
          className={`hotspot ${effectiveFocus === 'axes' ? 'hotspot-active' : ''}`}
          onMouseEnter={() => onFocusKey('axes')}
          onMouseLeave={onLeavePoint}
        />
        <path
          d={pressureArea}
          className={`hotspot ${effectiveFocus === 'pressure' ? 'hotspot-active' : ''}`}
          onMouseEnter={() => onFocusKey('pressure')}
          onMouseLeave={onLeavePoint}
        />
        <path
          d={volatilityLine}
          className={`hotspot-line ${effectiveFocus === 'volatility' ? 'hotspot-line-active' : ''}`}
          onMouseEnter={() => onFocusKey('volatility')}
          onMouseLeave={onLeavePoint}
        />
      </svg>
      <Tooltip point={activePoint} />
    </div>
  );
}

function App() {
  const { payload, error, loading } = useReplayData();
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [demoMode, setDemoMode] = useState(true);
  const [focusedKey, setFocusedKey] = useState('');
  const [activePoint, setActivePoint] = useState(null);

  const frames = payload?.frames ?? [];
  const frameCount = frames.length;
  const maxPlayhead = Math.max(frameCount - 1, 0);

  useEffect(() => {
    if (playhead > maxPlayhead) {
      setPlayhead(maxPlayhead);
    }
  }, [playhead, maxPlayhead]);

  useEffect(() => {
    if (!isPlaying || frameCount <= 1) {
      return undefined;
    }

    let previous = performance.now();
    let rafId = 0;

    const tick = (now) => {
      const deltaSeconds = (now - previous) / 1000;
      previous = now;

      setPlayhead((prev) => {
        const rate = demoMode ? 6 : 10;
        const next = prev + deltaSeconds * speed * rate;
        return next >= maxPlayhead ? maxPlayhead : next;
      });

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [demoMode, frameCount, isPlaying, maxPlayhead, speed]);

  useEffect(() => {
    if (playhead >= maxPlayhead && frameCount > 0) {
      setIsPlaying(false);
    }
  }, [playhead, maxPlayhead, frameCount]);

  const frame = useMemo(() => {
    if (frameCount === 0) {
      return null;
    }
    const baseIndex = clamp(Math.floor(playhead), 0, maxPlayhead);
    const nextIndex = clamp(baseIndex + 1, 0, maxPlayhead);
    const alpha = clamp(playhead - baseIndex, 0, 1);
    return interpolateFrame(frames[baseIndex], frames[nextIndex], alpha);
  }, [frameCount, frames, maxPlayhead, playhead]);

  const demoBeat = useMemo(() => getDemoBeat(playhead, maxPlayhead), [playhead, maxPlayhead]);

  useEffect(() => {
    if (demoMode) {
      setFocusedKey(demoBeat.focus);
    }
  }, [demoBeat, demoMode]);

  if (loading) {
    return (
      <main className="app-shell app-shell-center">
        <p className="status">Loading visualization...</p>
      </main>
    );
  }

  if (error || !payload || !frame) {
    return (
      <main className="app-shell app-shell-center">
        <h1 className="hero-title">Market Pressure Map</h1>
        <p className="status">{error || 'No replay frames found at /public/data/replay_frames.json'}</p>
      </main>
    );
  }

  const strikeMin = Number(payload.strike_min ?? 0);
  const strikeMax = Number(payload.strike_max ?? frame.ask_flow.length - 1);
  const activeKey = focusedKey || (demoMode ? demoBeat.focus : 'pressure');
  const explainer = EXPLAINERS[activeKey] ?? EXPLAINERS.pressure;
  const balance = frame.side_imbalance >= 0 ? 'Ask-led' : 'Bid-led';

  return (
    <main className="app-shell">
      <section className="hero-copy">
        <div className="hero-topline">
          <p className="eyebrow">Readable Data Visualization</p>
          <span className={`demo-pill ${demoMode ? 'demo-pill-live' : ''}`}>{demoMode ? 'Story mode' : 'Explore mode'}</span>
        </div>
        <h1 className="hero-title">Pressure, liquidity, and volatility shown without the extra metaphor.</h1>
        <p className="hero-text">
          The blue shape is total pressure, the orange line is volatility, blue dots are bid liquidity,
          and gold dots are ask liquidity. Hover a point to see exact values for that lane.
        </p>
      </section>

      <section className="stage-panel">
        <div className="stage-header">
          <div>
            <p className="panel-kicker">{demoMode ? 'Story step' : 'Current explanation'}</p>
            <p className="stage-title">{demoMode ? demoBeat.title : explainer.title}</p>
          </div>
          <p className="stage-progress">frame {Math.round(playhead) + 1} / {frameCount}</p>
        </div>

        <div className="plot-legend">
          <div className="plot-legend-item">
            <span className="legend-swatch legend-swatch-pressure-line" />
            Pressure ridge
          </div>
          <div className="plot-legend-item">
            <span className="legend-swatch legend-swatch-volatility-line" />
            Volatility
          </div>
          <div className="plot-legend-item">
            <span className="legend-swatch legend-swatch-bid" />
            Bid liquidity
          </div>
          <div className="plot-legend-item">
            <span className="legend-swatch legend-swatch-ask" />
            Ask liquidity
          </div>
        </div>

        <DataLandscape
          frame={frame}
          strikeMin={strikeMin}
          strikeMax={strikeMax}
          focusedKey={focusedKey}
          demoBeat={demoMode ? demoBeat : null}
          onFocusKey={setFocusedKey}
          activePoint={activePoint}
          onHoverPoint={setActivePoint}
          onLeavePoint={() => {
            setActivePoint(null);
            setFocusedKey(demoMode ? demoBeat.focus : '');
          }}
        />

        <div className="story-overlay">
          <p className="story-kicker">{demoMode ? 'Narration' : 'What this means'}</p>
          <h2 className="story-title">{demoMode ? demoBeat.title : explainer.title}</h2>
          <p className="story-body">{demoMode ? demoBeat.body : explainer.body}</p>
        </div>
      </section>

      <section className="control-panel" aria-label="Visualization Controls">
        <div className="metric-grid">
          <MetricCard label="Health" value={frame.health_score.toFixed(2)} hint="overall condition" />
          <MetricCard label="Order Density" value={`${Math.round(frame.order_density * 100)}%`} hint="lifts the pressure ridge" />
          <MetricCard label="Liquidity" value={`${Math.round(frame.liquidity_density_factor * 100)}%`} hint="changes dot intensity" />
          <MetricCard label="Market Bias" value={balance} hint="which side is stronger" />
        </div>

        <div className="panel-section">
          <div className="panel-head">
            <label className="timeline-label" htmlFor="timeline">Replay timeline</label>
            <span className="timeline-caption">{formatTimestamp(frame.timestamp)}</span>
          </div>
          <input
            id="timeline"
            type="range"
            min={0}
            max={maxPlayhead}
            step={0.001}
            value={playhead}
            onChange={(event) => {
              setPlayhead(Number(event.target.value));
              setIsPlaying(false);
              setDemoMode(false);
              setFocusedKey('');
              setActivePoint(null);
            }}
          />
        </div>

        <div className="button-row">
          <button
            type="button"
            className="action-button"
            onClick={() => {
              if (playhead >= maxPlayhead) {
                setPlayhead(0);
              }
              setDemoMode(false);
              setFocusedKey('');
              setIsPlaying((value) => !value);
            }}
          >
            {isPlaying && !demoMode ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            className="action-button action-button-emphasis"
            onClick={() => {
              setPlayhead(0);
              setSpeed(1);
              setDemoMode(true);
              setFocusedKey(DEMO_BEATS[0].focus);
              setActivePoint(null);
              setIsPlaying(true);
            }}
          >
            Start story mode
          </button>
          <button
            type="button"
            className="action-button action-button-muted"
            onClick={() => {
              setPlayhead(0);
              setIsPlaying(false);
              setDemoMode(false);
              setFocusedKey('');
              setActivePoint(null);
            }}
          >
            Reset
          </button>
          <label className="speed-control" htmlFor="speed">
            Speed
            <select id="speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
              <option value={0.5}>0.5x</option>
              <option value={1}>1x</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2x</option>
            </select>
          </label>
        </div>

        <div className="panel-section">
          <p className="panel-kicker">Explanation</p>
          <h2 className="detail-title">{explainer.title}</h2>
          <p className="detail-copy">{explainer.body}</p>
        </div>

        <div className="legend-grid">
          <button type="button" className={`legend-item ${activeKey === 'pressure' ? 'legend-item-active' : ''}`} onMouseEnter={() => setFocusedKey('pressure')}>
            <span className="legend-swatch legend-swatch-pressure" />
            Pressure ridge
          </button>
          <button type="button" className={`legend-item ${activeKey === 'volatility' ? 'legend-item-active' : ''}`} onMouseEnter={() => setFocusedKey('volatility')}>
            <span className="legend-swatch legend-swatch-volatility" />
            Volatility line
          </button>
          <button type="button" className={`legend-item ${activeKey === 'bid' ? 'legend-item-active' : ''}`} onMouseEnter={() => setFocusedKey('bid')}>
            <span className="legend-swatch legend-swatch-bid" />
            Bid liquidity
          </button>
          <button type="button" className={`legend-item ${activeKey === 'ask' ? 'legend-item-active' : ''}`} onMouseEnter={() => setFocusedKey('ask')}>
            <span className="legend-swatch legend-swatch-ask" />
            Ask liquidity
          </button>
          <button type="button" className={`legend-item ${activeKey === 'axes' ? 'legend-item-active' : ''}`} onMouseEnter={() => setFocusedKey('axes')}>
            <span className="legend-swatch legend-swatch-axes" />
            Axes
          </button>
        </div>

        <div className="summary-grid">
          <div className="summary-card">
            <p className="summary-label">Strike range</p>
            <p className="summary-value">{strikeMin} to {strikeMax}</p>
          </div>
          <div className="summary-card">
            <p className="summary-label">Volatility</p>
            <p className="summary-value">{Math.round(frame.manipulation_factor * 100)}%</p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
