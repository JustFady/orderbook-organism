import { useEffect, useMemo, useState } from 'react';

const EXPLAINERS = {
  pressure: {
    title: 'Pressure ridge',
    body: 'The filled ridge shows combined market pressure at each lane. Higher shape means stronger combined ask and bid activity there.',
  },
  volatility: {
    title: 'Stress line',
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

const READING_GUIDE = [
  {
    label: 'Pressure',
    title: 'Where the market crowds',
    body: 'The filled ridge combines ask and bid flow. Tall peaks mean one strike lane is carrying more activity than its neighbors.',
  },
  {
    label: 'Liquidity',
    title: 'Who is supporting the lane',
    body: 'Blue dots are bid support. Gold dots are ask concentration. Bigger dots mean stronger visible liquidity on that side.',
  },
  {
    label: 'Stress',
    title: 'When the surface gets unstable',
    body: 'The orange line rises when bid and ask flow split apart. That is the warning signal for rougher behavior.',
  },
];

const REPLAY_SOURCES = [
  {
    id: 'april-22',
    label: 'April 22 sample',
    detail: 'Original prototype replay',
    path: 'data/replay_frames.json',
  },
  {
    id: '0922',
    label: '09:22 slice',
    detail: 'Recovered real LOB minute',
    path: 'data/replay_0922.json',
  },
  {
    id: '0923',
    label: '09:23 slice',
    detail: 'Recovered real LOB minute',
    path: 'data/replay_0923.json',
  },
  {
    id: '0924',
    label: '09:24 slice',
    detail: 'Recovered real LOB minute',
    path: 'data/replay_0924.json',
  },
  {
    id: '0926',
    label: '09:26 slice',
    detail: 'Recovered real LOB minute',
    path: 'data/replay_0926.json',
  },
];

const GLOSSARY_TERMS = [
  {
    term: 'Strike lane',
    definition: 'A bucketed strike position. Read the chart left to right as nearby price/strike regions.',
  },
  {
    term: 'Pressure ridge',
    definition: 'Combined ask and bid flow at each lane. Peaks show where activity is concentrating.',
  },
  {
    term: 'Liquidity',
    definition: 'Visible support from the order book. Blue marks bid support; gold marks ask concentration.',
  },
  {
    term: 'Stress signal',
    definition: 'A warning line based on split behavior between the two sides of the book.',
  },
  {
    term: 'Flow lean',
    definition: 'Whether ask-side or bid-side activity dominates the current frame.',
  },
  {
    term: 'Weighted price',
    definition: 'A pressure-weighted center of the current frame, shown with the vertical dashed line.',
  },
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
    liquidity_density_factor: lerp(current.liquidity_density_factor || 0, next.liquidity_density_factor || 0, alpha),
    gamma_metabolism_factor: lerp(current.gamma_metabolism_factor || 0, next.gamma_metabolism_factor || 0, alpha),
    manipulation_factor: lerp(current.manipulation_factor || 0, next.manipulation_factor || 0, alpha),
    price_kinetic_factor: lerp(current.price_kinetic_factor || 0, next.price_kinetic_factor || 0, alpha),
    health_score: lerp(current.health_score || 0, next.health_score || 0, alpha),
    side_imbalance: lerp(current.side_imbalance || 0, next.side_imbalance || 0, alpha),
    order_density: lerp(current.order_density || 0, next.order_density || 0, alpha),
    ask_flow: lerpArray(current.ask_flow, next.ask_flow, alpha),
    bid_flow: lerpArray(current.bid_flow, next.bid_flow, alpha),
  };
}

function useReplayData(sourcePath) {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setPayload(null);
    setError('');
    setLoading(true);

    async function load() {
      try {
        const response = await fetch(sourcePath, { cache: 'no-store' });
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
  }, [sourcePath]);

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
      pressureY: 620 - pressureNorm * 320 - (frame.order_density || 0) * 36,
      volatilityY: 600 - volatilityNorm * 260 - (frame.manipulation_factor || 0) * 18,
      askY: 605 - askNorm * 190,
      bidY: 605 - bidNorm * 190,
      ask: entry.ask,
      bid: entry.bid,
      pressure: entry.pressure,
      volatility: entry.volatility,
    };
  });
}

function deriveFrameStats(series) {
  const strongest = series.reduce((best, point) => (point.pressure > best.pressure ? point : best), series[0]);

  const totalAsk = series.reduce((sum, point) => sum + point.ask, 0);
  const totalBid = series.reduce((sum, point) => sum + point.bid, 0);
  const totalWeight = Math.max(totalAsk + totalBid, 0.001);
  const weightedStrike = series.reduce(
    (sum, point) => sum + point.strike * (point.ask + point.bid),
    0,
  ) / totalWeight;

  const strongestAsk = series.reduce((best, point) => (point.ask > best.ask ? point : best), series[0]);
  const strongestBid = series.reduce((best, point) => (point.bid > best.bid ? point : best), series[0]);

  return {
    strongest,
    strongestAsk,
    strongestBid,
    currentPrice: weightedStrike,
    spread: Math.abs(strongestAsk.strike - strongestBid.strike),
  };
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

function formatPercent(value) {
  return `${Math.round(Number(value ?? 0) * 100)}%`;
}

function formatSigned(value) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
}

function buildFrameDiagnosis(frame, stats, priceChange) {
  const health = Number(frame.health_score ?? 0);
  const liquidity = Number(frame.liquidity_density_factor ?? 0);
  const stress = Number(frame.manipulation_factor ?? 0);
  const density = Number(frame.order_density ?? 0);
  const direction = frame.side_imbalance >= 0 ? 'ask-side' : 'bid-side';

  if (stress >= 0.62 && liquidity <= 0.2) {
    return {
      title: 'Thin and jumpy',
      body: `Liquidity is light while stress is elevated, so the strongest lane near ${stats.strongest.strike} deserves attention.`,
      tone: 'warning',
    };
  }

  if (health >= 0.68 && stress < 0.4) {
    return {
      title: 'Orderly pressure',
      body: `The surface is relatively healthy. Pressure leans ${direction}, with the main cluster around strike ${stats.strongest.strike}.`,
      tone: 'steady',
    };
  }

  if (Math.abs(priceChange) >= 0.3 || density >= 0.35) {
    return {
      title: 'Pressure is moving',
      body: `The weighted price shifted ${formatSigned(priceChange)} while visible order density is ${formatPercent(density)}.`,
      tone: 'motion',
    };
  }

  return {
    title: 'Watch the cluster',
    body: `The clearest signal is the pressure peak at strike ${stats.strongest.strike}. The rest of the frame is comparatively muted.`,
    tone: 'steady',
  };
}

function buildEventMarkers(frame, previousFrame, stats, strikeMin, strikeMax) {
  if (!frame || !previousFrame) {
    return [];
  }

  const markers = [];
  const addMarker = (id, label, detail, laneX, anchorY, tone, score) => {
    markers.push({
      id,
      label,
      detail,
      laneX,
      anchorY,
      tone,
      score,
    });
  };

  const gammaDelta = Number(frame.gamma_metabolism_factor ?? 0) - Number(previousFrame.gamma_metabolism_factor ?? 0);
  const liquidityDelta = Number(frame.liquidity_density_factor ?? 0) - Number(previousFrame.liquidity_density_factor ?? 0);
  const manipulationDelta = Number(frame.manipulation_factor ?? 0) - Number(previousFrame.manipulation_factor ?? 0);

  const strongestX = stats?.strongest?.x ?? 535;
  const priceX = 110 + ((stats.currentPrice - strikeMin) / Math.max(strikeMax - strikeMin, 1)) * 850;

  if (Number(frame.gamma_metabolism_factor ?? 0) >= 0.72 || gammaDelta >= 0.12) {
    addMarker(
      'gamma-spike',
      'Gamma spike',
      `Metabolism ${formatPercent(frame.gamma_metabolism_factor)}`,
      strongestX,
      Math.max((stats?.strongest?.pressureY ?? 220) - 22, 190),
      'gamma',
      Math.max(Number(frame.gamma_metabolism_factor ?? 0), gammaDelta + 0.5),
    );
  }

  if (Number(frame.liquidity_density_factor ?? 0) <= 0.34 || liquidityDelta <= -0.12) {
    addMarker(
      'liquidity-drop',
      'Liquidity drop',
      `Coverage ${formatPercent(frame.liquidity_density_factor)}`,
      priceX,
      132,
      'liquidity',
      Math.max(1 - Number(frame.liquidity_density_factor ?? 0), Math.abs(liquidityDelta)),
    );
  }

  if (Number(frame.manipulation_factor ?? 0) >= 0.62 || manipulationDelta >= 0.14) {
    addMarker(
      'manipulation-burst',
      'Stress spike',
      `Stress ${formatPercent(frame.manipulation_factor)}`,
      strongestX + 28,
      Math.max((stats?.strongest?.pressureY ?? 220) - 70, 156),
      'manipulation',
      Math.max(Number(frame.manipulation_factor ?? 0), manipulationDelta + 0.5),
    );
  }

  const visibleMarkers = markers
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return visibleMarkers.map((marker, index) => ({
      ...marker,
      laneX: clamp(marker.laneX + (index - (visibleMarkers.length - 1) / 2) * 92, 162, 908),
      anchorY: clamp(marker.anchorY + index * 24, 128, 544),
    }));
}

function buildEventBookmarks(frames, strikeMin, strikeMax) {
  if (!frames.length) {
    return [];
  }

  const scored = frames.map((frame, index) => {
    const previous = frames[Math.max(index - 1, 0)];
    const series = buildSeries(frame, strikeMin, strikeMax);
    const stats = deriveFrameStats(series);
    const events = buildEventMarkers(frame, previous, stats, strikeMin, strikeMax);
    return {
      index,
      frame,
      stats,
      events,
      stress: Number(frame.manipulation_factor ?? 0),
      health: Number(frame.health_score ?? 0),
      liquidity: Number(frame.liquidity_density_factor ?? 0),
      pressure: Number(stats.strongest?.pressure ?? 0),
    };
  });

  const findBest = (id, label, detail, pick, tone) => {
    const match = pick(scored);
    if (!match) {
      return null;
    }
    return {
      id,
      label,
      detail,
      tone,
      index: match.index,
      timestamp: match.frame.timestamp,
    };
  };

  return [
    findBest(
      'liquidity',
      'Liquidity drop',
      'Jump to the thinnest visible support.',
      (items) => items.reduce((best, item) => (item.liquidity < best.liquidity ? item : best), items[0]),
      'liquidity',
    ),
    findBest(
      'stress',
      'Stress spike',
      'Jump to the roughest book behavior.',
      (items) => items.reduce((best, item) => (item.stress > best.stress ? item : best), items[0]),
      'manipulation',
    ),
    findBest(
      'pressure',
      'Pressure cluster',
      'Jump to the strongest lane cluster.',
      (items) => items.reduce((best, item) => (item.pressure > best.pressure ? item : best), items[0]),
      'gamma',
    ),
    findBest(
      'stable',
      'Stable frame',
      'Jump to the calmest readable frame.',
      (items) => items.reduce((best, item) => (item.health > best.health ? item : best), items[0]),
      'steady',
    ),
  ].filter(Boolean);
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
      <p className="tooltip-line">Stress: <strong>{point.volatility.toFixed(2)}</strong></p>
    </div>
  );
}

function ReplayContextPanel({ diagnosis, events, onOpenTour }) {
  const primaryEvent = events[0];

  return (
    <aside className="replay-context-panel" aria-label="Replay context">
      <div className={`diagnosis-card diagnosis-card-${diagnosis.tone}`}>
        <p className="panel-kicker">Frame diagnosis</p>
        <h2 className="diagnosis-title">{diagnosis.title}</h2>
        <p className="diagnosis-copy">{diagnosis.body}</p>
      </div>

      <section className="context-card" aria-label="Current event">
        <div className="panel-head">
          <p className="panel-kicker">Current event</p>
          <span className="timeline-caption">{events.length ? 'alert' : 'quiet'}</span>
        </div>
        {primaryEvent ? (
          <div className={`event-chip event-chip-${primaryEvent.tone}`}>
            <p className="event-chip-label">{primaryEvent.label}</p>
            <p className="event-chip-detail">{primaryEvent.detail}</p>
          </div>
        ) : (
          <div className="event-chip event-chip-muted">
            <p className="event-chip-label">No major event</p>
            <p className="event-chip-detail">Below alert thresholds.</p>
          </div>
        )}
      </section>

      <button type="button" className="context-tour-button" onClick={onOpenTour}>
        View guide and bookmarks
      </button>
    </aside>
  );
}

function PageNav({ activePage, onChange }) {
  const pages = [
    { id: 'replay', label: 'Replay' },
    { id: 'tour', label: 'Guided tour' },
    { id: 'glossary', label: 'Glossary' },
  ];

  return (
    <nav className="page-nav" aria-label="App sections">
      {pages.map((page) => (
        <button
          key={page.id}
          type="button"
          className={`page-nav-button ${activePage === page.id ? 'page-nav-button-active' : ''}`}
          onClick={() => onChange(page.id)}
        >
          {page.label}
        </button>
      ))}
    </nav>
  );
}

function ReplaySourcePicker({ selectedSource, onChange }) {
  return (
    <label className="source-picker" htmlFor="replay-source">
      <span>Replay source</span>
      <select id="replay-source" value={selectedSource} onChange={(event) => onChange(event.target.value)}>
        {REPLAY_SOURCES.map((source) => (
          <option key={source.id} value={source.id}>
            {source.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function GuidedTourPage({ bookmarks, activeIndex, onJump }) {
  return (
    <section className="content-page" aria-label="Guided tour">
      <div className="content-page-head">
        <p className="panel-kicker">Presentation path</p>
        <h2 className="content-title">A clean way to explain the organism</h2>
        <p className="content-copy">
          Use this page as the talk track: introduce the visual grammar first, then use bookmarks in the replay to show real moments.
        </p>
      </div>
      <div className="tour-grid">
        {DEMO_BEATS.map((beat, index) => (
          <article className="tour-card" key={beat.title}>
            <span className="tour-step">{index + 1}</span>
            <h3 className="tour-title">{beat.title}</h3>
            <p className="tour-copy">{beat.body}</p>
          </article>
        ))}
      </div>
      <section className="tour-section" aria-label="How to read the visualization">
        <div className="content-page-head">
          <p className="panel-kicker">Visual grammar</p>
          <h2 className="content-title">What each layer means</h2>
        </div>
        <div className="guide-grid">
          {READING_GUIDE.map((item) => (
            <article className="guide-card" key={item.label}>
              <span className="quick-guide-label">{item.label}</span>
              <h3 className="guide-title">{item.title}</h3>
              <p className="guide-copy">{item.body}</p>
            </article>
          ))}
        </div>
      </section>
      <EventBookmarks bookmarks={bookmarks} activeIndex={activeIndex} onJump={onJump} />
    </section>
  );
}

function GlossaryPage() {
  return (
    <section className="content-page" aria-label="Glossary">
      <div className="content-page-head">
        <p className="panel-kicker">Plain-language reference</p>
        <h2 className="content-title">Glossary</h2>
        <p className="content-copy">
          Short definitions for the terms that appear in the visualization.
        </p>
      </div>
      <div className="glossary-grid">
        {GLOSSARY_TERMS.map((item) => (
          <article className="glossary-card" key={item.term}>
            <h3 className="glossary-term">{item.term}</h3>
            <p className="glossary-definition">{item.definition}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function EventBookmarks({ bookmarks, activeIndex, onJump }) {
  return (
    <section className="bookmark-panel" aria-label="Event bookmarks">
      <div className="panel-head">
        <div>
          <p className="panel-kicker">Event bookmarks</p>
          <h2 className="bookmark-title">Jump to useful demo moments</h2>
        </div>
        <span className="timeline-caption">{bookmarks.length} bookmarks</span>
      </div>
      <div className="bookmark-grid">
        {bookmarks.map((bookmark) => (
          <button
            type="button"
            key={bookmark.id}
            className={`bookmark-card bookmark-card-${bookmark.tone} ${Math.round(activeIndex) === bookmark.index ? 'bookmark-card-active' : ''}`}
            onClick={() => onJump(bookmark.index)}
          >
            <span className="bookmark-label">{bookmark.label}</span>
            <span className="bookmark-detail">{bookmark.detail}</span>
            <span className="bookmark-time">{formatTimestamp(bookmark.timestamp)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function MiniTimeline({ frames, playhead, onJump }) {
  const points = useMemo(() => {
    if (!frames.length) {
      return { healthPath: '', volatilityPath: '', currentX: 0 };
    }

    const health = frames.map((frame, index) => ({
      x: 18 + (index / Math.max(frames.length - 1, 1)) * 304,
      y: 68 - Number(frame.health_score ?? 0) * 42,
    }));

    const volatility = frames.map((frame, index) => ({
      x: 18 + (index / Math.max(frames.length - 1, 1)) * 304,
      y: 68 - Number(frame.manipulation_factor ?? 0) * 42,
    }));

    const currentX = 18 + (playhead / Math.max(frames.length - 1, 1)) * 304;

    return {
      healthPath: buildSmoothLine(health),
      volatilityPath: buildSmoothLine(volatility),
      currentX,
    };
  }, [frames, playhead]);

  return (
    <div className="mini-timeline">
      <svg viewBox="0 0 340 92" className="mini-timeline-svg" role="img" aria-label="Health and volatility over time">
        <rect x="8" y="10" width="324" height="64" rx="12" className="mini-frame" />
        <path d={points.healthPath} className="mini-line mini-line-health" />
        <path d={points.volatilityPath} className="mini-line mini-line-volatility" />
        <line x1={points.currentX} y1="12" x2={points.currentX} y2="74" className="mini-cursor" />
      </svg>
      <input
        className="mini-timeline-input"
        type="range"
        min={0}
        max={Math.max(frames.length - 1, 0)}
        step={0.001}
        value={playhead}
        onChange={(event) => onJump(Number(event.target.value))}
      />
      <div className="mini-legend">
        <span><i className="mini-dot mini-dot-health" />Health</span>
        <span><i className="mini-dot mini-dot-volatility" />Stress</span>
      </div>
    </div>
  );
}

function DataLandscape({
  frame,
  previousFrame,
  strikeMin,
  strikeMax,
  focusedKey,
  demoBeat,
  onFocusKey,
  pinnedInfo,
  onPinInfo,
  activePoint,
  onHoverPoint,
  onLeavePoint,
  followPrice,
}) {
  const series = useMemo(() => buildSeries(frame, strikeMin, strikeMax), [frame, strikeMin, strikeMax]);
  const stats = useMemo(() => deriveFrameStats(series), [series]);
  const xTicks = useMemo(() => buildAxisTicks(strikeMin, strikeMax), [strikeMin, strikeMax]);
  const yTicks = useMemo(() => buildYAxisTicks(), []);
  const pressureArea = useMemo(() => buildArea(series.map((entry) => ({ x: entry.x, y: entry.pressureY })), 620), [series]);
  const pressureLine = useMemo(() => buildSmoothLine(series.map((entry) => ({ x: entry.x, y: entry.pressureY }))), [series]);
  const volatilityLine = useMemo(() => buildSmoothLine(series.map((entry) => ({ x: entry.x, y: entry.volatilityY }))), [series]);
  const eventMarkers = useMemo(
    () => buildEventMarkers(frame, previousFrame, stats, strikeMin, strikeMax),
    [frame, previousFrame, stats, strikeMin, strikeMax],
  );
  const effectiveFocus = focusedKey || demoBeat?.focus || 'pressure';
  const priceX = 110 + ((stats.currentPrice - strikeMin) / Math.max(strikeMax - strikeMin, 1)) * 850;
  const infoKey = pinnedInfo || effectiveFocus;
  const info = EXPLAINERS[infoKey] ?? EXPLAINERS.pressure;

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

        {eventMarkers.map((marker) => (
          <g key={marker.id} transform={`translate(${marker.laneX}, ${marker.anchorY})`} className={`event-marker event-marker-${marker.tone}`}>
            <line x1="0" y1="-40" x2="0" y2="4" className="event-stem" />
            <circle cx="0" cy="0" r="9" className="event-halo" />
            <circle cx="0" cy="0" r="5" className="event-anchor" />
            <rect x="-82" y="-78" width="164" height="34" rx="12" className="event-pill" />
            <text x="0" y="-58" textAnchor="middle" className="event-label">{marker.label}</text>
            <text x="0" y="-43" textAnchor="middle" className="event-detail">{marker.detail}</text>
          </g>
        ))}

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

        <g>
          <line x1={priceX} y1="160" x2={priceX} y2="620" className={`price-line ${followPrice ? 'price-line-follow' : ''}`} />
          <text x={priceX + 8} y="180" className="price-label">Mid {stats.currentPrice.toFixed(1)}</text>
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
              onClick={() => onPinInfo('bid')}
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
              onClick={() => onPinInfo('ask')}
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

        <g>
          <circle cx={stats.strongest.x} cy={stats.strongest.pressureY} r="9" className="strongest-ring" />
          <text x={Math.min(stats.strongest.x + 12, 860)} y={stats.strongest.pressureY - 10} className="strongest-label">
            Strongest lane
          </text>
        </g>

        <rect
          x="110"
          y="160"
          width="850"
          height="460"
          className={`hotspot ${effectiveFocus === 'axes' ? 'hotspot-active' : ''}`}
          onMouseEnter={() => onFocusKey('axes')}
          onClick={() => onPinInfo('axes')}
          onMouseLeave={onLeavePoint}
        />
        <path
          d={pressureArea}
          className={`hotspot ${effectiveFocus === 'pressure' ? 'hotspot-active' : ''}`}
          onMouseEnter={() => onFocusKey('pressure')}
          onClick={() => onPinInfo('pressure')}
          onMouseLeave={onLeavePoint}
        />
        <path
          d={volatilityLine}
          className={`hotspot-line ${effectiveFocus === 'volatility' ? 'hotspot-line-active' : ''}`}
          onMouseEnter={() => onFocusKey('volatility')}
          onClick={() => onPinInfo('volatility')}
          onMouseLeave={onLeavePoint}
        />
      </svg>
      <div className="viz-help">Hover to inspect. Click a layer to pin what it means.</div>
      {pinnedInfo ? (
        <div className="info-card">
          <div className="info-card-head">
            <p className="panel-kicker">Pinned explanation</p>
            <button type="button" className="info-close" onClick={() => onPinInfo('')}>Close</button>
          </div>
          <h3 className="info-title">{info.title}</h3>
          <p className="info-copy">{info.body}</p>
        </div>
      ) : null}
      <Tooltip point={activePoint} />
    </div>
  );
}

function App() {
  const [activePage, setActivePage] = useState('replay');
  const [selectedSource, setSelectedSource] = useState(REPLAY_SOURCES[0].id);
  const selectedReplaySource = REPLAY_SOURCES.find((source) => source.id === selectedSource) ?? REPLAY_SOURCES[0];
  const { payload, error, loading } = useReplayData(selectedReplaySource.path);
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [demoMode, setDemoMode] = useState(true);
  const [focusedKey, setFocusedKey] = useState('');
  const [pinnedInfo, setPinnedInfo] = useState('');
  const [activePoint, setActivePoint] = useState(null);
  const [followPrice, setFollowPrice] = useState(true);

  const frames = payload?.frames ?? [];
  const frameCount = frames.length;
  const maxPlayhead = Math.max(frameCount - 1, 0);

  useEffect(() => {
    setPlayhead(0);
    setIsPlaying(false);
    setFocusedKey('');
    setPinnedInfo('');
    setActivePoint(null);
  }, [selectedSource]);

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
        <h1 className="hero-title">Orderbook Organism</h1>
        <p className="status">{error || 'No replay frames found at /public/data/replay_frames.json'}</p>
      </main>
    );
  }

  const strikeMin = Number(payload.strike_min ?? 0);
  const strikeMax = Number(payload.strike_max ?? frame.ask_flow.length - 1);
  const balance = frame.side_imbalance >= 0 ? 'Ask-led' : 'Bid-led';
  const frameSeries = buildSeries(frame, strikeMin, strikeMax);
  const frameStats = deriveFrameStats(frameSeries);
  const previousIndex = Math.max(Math.floor(playhead) - 1, 0);
  const previousFrame = frames[previousIndex] ?? frames[0];
  const previousStats = deriveFrameStats(buildSeries(previousFrame, strikeMin, strikeMax));
  const priceChange = frameStats.currentPrice - previousStats.currentPrice;
  const events = buildEventMarkers(frame, previousFrame, frameStats, strikeMin, strikeMax);
  const diagnosis = buildFrameDiagnosis(frame, frameStats, priceChange);
  const eventBookmarks = buildEventBookmarks(frames, strikeMin, strikeMax);

  const jumpToFrame = (index) => {
    setPlayhead(clamp(index, 0, maxPlayhead));
    setIsPlaying(false);
    setFocusedKey('');
    setPinnedInfo('');
    setActivePoint(null);
    setActivePage('replay');
  };

  return (
    <main className="app-shell">
      {/* Slim header bar */}
      <header className="hero-bar">
        <div className="hero-bar-left">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <div>
            <p className="hero-bar-kicker">Biomimetic market replay</p>
            <h1 className="hero-bar-title">Orderbook Organism</h1>
          </div>
          <span className={`demo-pill ${demoMode ? 'demo-pill-live' : ''}`}>
            {demoMode ? 'Guided tour' : 'Explore replay'}
          </span>
        </div>
        <p className="hero-bar-sub">Turns order-book flow into a readable pressure landscape.</p>
      </header>

      <div className="top-controls">
        <PageNav activePage={activePage} onChange={setActivePage} />
        <ReplaySourcePicker selectedSource={selectedSource} onChange={setSelectedSource} />
      </div>

      <section className="stage-panel">
        {activePage === 'tour' ? (
          <GuidedTourPage bookmarks={eventBookmarks} activeIndex={playhead} onJump={jumpToFrame} />
        ) : null}

        {activePage === 'glossary' ? (
          <GlossaryPage />
        ) : null}

        {activePage === 'replay' ? (
        <>
        <div className="stage-workspace">
          <div className="replay-layout">
            <div className="replay-main">
              <div className="chart-column">
                <div className="stage-header stage-header-inline">
                  <div>
                    <p className="panel-kicker">{demoMode ? 'Guided step' : 'Current frame'}</p>
                    <p className="stage-title">{demoMode ? demoBeat.title : formatTimestamp(frame.timestamp)}</p>
                  </div>
                  <p className="stage-progress">frame {Math.round(playhead) + 1} / {frameCount}</p>
                </div>

                <div className="plot-legend plot-legend-inline">
                  <div className="plot-legend-item">
                    <span className="legend-swatch legend-swatch-pressure-line" />
                    Pressure ridge
                  </div>
                  <div className="plot-legend-item">
                    <span className="legend-swatch legend-swatch-volatility-line" />
                    Stress line
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
                  previousFrame={previousFrame}
                  strikeMin={strikeMin}
                  strikeMax={strikeMax}
                  focusedKey={focusedKey}
                  demoBeat={demoMode ? demoBeat : null}
                  onFocusKey={setFocusedKey}
                  pinnedInfo={pinnedInfo}
                  onPinInfo={setPinnedInfo}
                  activePoint={activePoint}
                  onHoverPoint={setActivePoint}
                  onLeavePoint={() => {
                    setActivePoint(null);
                    setFocusedKey(demoMode ? demoBeat.focus : '');
                  }}
                  followPrice={followPrice}
                />
              </div>
            </div>

            <ReplayContextPanel
              diagnosis={diagnosis}
              events={events}
              onOpenTour={() => setActivePage('tour')}
            />
          </div>

          <aside className="insight-rail" aria-label="Current frame insights">

            {/* Card 1: Current frame + timestamp */}
            <div className="rail-section rail-section-highlight">
              <p className="panel-kicker">Current frame</p>
              <h2 className="rail-title">{formatTimestamp(frame.timestamp)}</h2>
              <div className="rail-mini-stats">
                <div className="rail-stat">
                  <p className="panel-kicker">Market health</p>
                  <p className="rail-stat-value">{frame.health_score.toFixed(2)}</p>
                  <p className="rail-stat-hint">Higher means calmer structure.</p>
                </div>
                <div className="rail-stat">
                  <p className="panel-kicker">Flow lean</p>
                  <p className="rail-stat-value">{balance}</p>
                  <p className="rail-stat-hint">Which side dominates this frame.</p>
                </div>
              </div>
            </div>

            {/* Card 2: Metrics + Price */}
            <div className="rail-section">
              <p className="panel-kicker">Current signals</p>
              <div className="metric-grid-rail">
                <div className="metric-card">
                  <p className="metric-label">Liquidity coverage</p>
                  <p className="metric-value">{formatPercent(frame.liquidity_density_factor)}</p>
                  <p className="metric-hint">Visible support across lanes.</p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">Stress signal</p>
                  <p className="metric-value">{formatPercent(frame.manipulation_factor)}</p>
                  <p className="metric-hint">Separation between sides.</p>
                </div>
              </div>
              <div className="price-strip-rail">
                <div className="price-box">
                  <p className="panel-kicker">Weighted price</p>
                  <p className="price-value">{frameStats.currentPrice.toFixed(1)}</p>
                </div>
                <div className="price-box">
                  <p className="panel-kicker">Frame change</p>
                  <p className={`price-value ${priceChange >= 0 ? 'price-up' : 'price-down'}`}>{formatSigned(priceChange)}</p>
                </div>
                <div className="price-box">
                  <p className="panel-kicker">Lane spread</p>
                  <p className="price-value">{frameStats.spread.toFixed(1)}</p>
                </div>
              </div>
            </div>

            {/* Card 3: Strongest lane */}
            <div className="rail-section">
              <p className="panel-kicker">Pressure focus</p>
              <h2 className="detail-title">Lane {frameStats.strongest.index + 1}</h2>
              <p className="detail-copy">Strike {frameStats.strongest.strike}</p>
              <p className="detail-copy detail-copy-spaced">
                This lane has the highest combined ask and bid pressure. It is marked on the chart with a gold ring.
              </p>
            </div>

          </aside>
        </div>

        <div className="dock-panel" aria-label="Replay controls">
          <div className="dock-primary">
            <div className="panel-head">
              <label className="timeline-label" htmlFor="timeline">Replay timeline</label>
              <span className="timeline-caption">{formatTimestamp(frame.timestamp)}</span>
            </div>
            <MiniTimeline
              frames={frames}
              playhead={playhead}
              onJump={(value) => {
                setPlayhead(value);
                setIsPlaying(false);
                setDemoMode(false);
                setFocusedKey('');
                setPinnedInfo('');
                setActivePoint(null);
              }}
            />
          </div>

          <div className="dock-side">
            <div className="dock-actions">
              <button
                type="button"
                className="action-button"
                onClick={() => {
                  if (playhead >= maxPlayhead) {
                    setPlayhead(0);
                  }
                  setDemoMode(false);
                  setFocusedKey('');
                  setPinnedInfo('');
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
                  setPinnedInfo('');
                  setActivePoint(null);
                  setIsPlaying(true);
                }}
              >
                Guided tour
              </button>
              <button
                type="button"
                className="action-button action-button-muted"
                onClick={() => {
                  setPlayhead(0);
                  setIsPlaying(false);
                  setDemoMode(false);
                  setFocusedKey('');
                  setPinnedInfo('');
                  setActivePoint(null);
                }}
              >
                Reset
              </button>
              <label className="speed-control" htmlFor="speed">
                <span>Speed</span>
                <select id="speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
                  <option value={0.5}>0.5x</option>
                  <option value={1}>1x</option>
                  <option value={1.5}>1.5x</option>
                  <option value={2}>2x</option>
                </select>
              </label>
              <button
                type="button"
                className={`action-button ${followPrice ? 'action-button-emphasis' : ''}`}
                onClick={() => setFollowPrice((value) => !value)}
              >
                {followPrice ? 'Follow price' : 'Unlock price'}
              </button>
            </div>

            <div className="summary-grid summary-grid-dock">
              <div className="summary-card">
                <p className="summary-label">Strike range</p>
                <p className="summary-value">{strikeMin} to {strikeMax}</p>
              </div>
              <div className="summary-card">
                <p className="summary-label">Visible order coverage</p>
                <p className="summary-value">{formatPercent(frame.order_density)}</p>
              </div>
            </div>
          </div>
        </div>
        </>
        ) : null}
      </section>
    </main>
  );
}

export default App;
