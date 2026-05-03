# Market Organism

Market Organism is a visualization-first prototype for making dense market microstructure data easier to understand. It turns order-book activity into a replayable pressure landscape so a viewer can quickly see where activity is crowding, which side is supplying liquidity, and when the market surface starts to look stressed.

The project is intentionally lightweight: preprocessing happens offline, and the web app reads static replay data. There is no database and no backend server required for the main prototype.

## Quick Start

Run the React/Vite web prototype:

```bash
cd webapp
npm install
npm run dev
```

Open the local URL printed by Vite. In this repo, the app is configured with the base path `/orderbook-organism/`, so the local URL usually looks like:

```text
http://127.0.0.1:5173/orderbook-organism/
```

If that port is busy, Vite will choose the next available port.

## Current Prototype Status

The current web prototype is the primary deliverable. It includes:

- A branded **Market Organism** interface for presenting the replay.
- A plain-English frame diagnosis that changes with the selected moment.
- A reading guide that explains pressure, liquidity, and stress before the chart.
- Story mode for guided interpretation.
- Explore mode for scrubbing the replay and inspecting individual strike lanes.
- Responsive desktop, laptop, and mobile layouts.

## What The App Shows

The main screen is a replay of market state across strike lanes. It is built to be understandable even if the viewer has not worked directly with the raw data.

- **Pressure ridge:** the filled blue shape combines ask and bid flow. Taller peaks mean a strike lane is carrying more activity than nearby lanes.
- **Bid liquidity:** blue dots show bid-side support. Larger dots mean stronger bid concentration.
- **Ask liquidity:** gold dots show ask-side concentration. Larger dots mean stronger ask presence.
- **Stress signal:** the orange line rises when bid and ask flow split apart.
- **Mid/weighted price:** the vertical dashed line tracks the weighted center of the current frame.
- **Frame diagnosis:** the top card translates the current frame into a short plain-English reading.
- **Story mode:** walks through the visual grammar step by step.
- **Explore mode:** lets you scrub the replay and inspect individual lanes.

## Project Structure

```text
.
|-- app/
|   `-- dashboard.py                  # Streamlit exploratory dashboard
|-- analysis/
|   |-- relationships/                # Correlation outputs and plots
|   `-- replay/replay_frames.json     # Generated replay payload
|-- docs/
|   `-- schema_contract.md            # CSV contracts for generated artifacts
|-- parsed_scaled/                    # Source market data
|-- scripts/
|   |-- batch_parse_lob_urls.py       # Batch parsing utility
|   |-- export_replay_frames.py       # Exports replay JSON for the web app
|   `-- parse_lob_blob.py             # Raw LOB parsing utility
|-- webapp/
|   |-- public/data/replay_frames.json # Static data consumed by React
|   `-- src/                          # Market Organism UI
|-- DATA_DICTIONARY.md
|-- plan.md
`-- visualize_relationships.py
```

## Data Flow

The current prototype uses a static replay payload:

1. Raw market data lives under `parsed_scaled/`.
2. Python scripts transform or analyze that data.
3. `scripts/export_replay_frames.py` produces replay frames.
4. The web app reads `webapp/public/data/replay_frames.json`.
5. React renders the pressure landscape, summary cards, story guide, and replay controls.

The intended CSV contracts for later pipeline stages are documented in `docs/schema_contract.md`.

## Updating Replay Data

The React app reads from:

```text
webapp/public/data/replay_frames.json
```

The generated replay artifact also exists at:

```text
analysis/replay/replay_frames.json
```

When replay data is regenerated, make sure the web copy is updated before running the app:

```bash
cp analysis/replay/replay_frames.json webapp/public/data/replay_frames.json
```

## Web App Commands

```bash
cd webapp
npm run dev      # Start local development server
npm run build    # Build production static assets
npm run preview  # Preview the production build
```

## GitHub Pages Deployment

The project is deployed from the `gh-pages` branch. Before deploying, make sure `webapp/vite.config.js` uses the repo base path:

```js
base: '/orderbook-organism/'
```

Deployment flow:

```bash
cd webapp
npm run build
```

Then publish the contents of `webapp/dist/` to the repository's `gh-pages` branch. The public site should resolve at:

```text
https://justfady.github.io/orderbook-organism/
```

## Streamlit Dashboard

There is also a Streamlit dashboard for exploratory analysis:

```bash
pip install streamlit plotly pandas numpy
streamlit run app/dashboard.py
```

Dashboard features include side/time/strike filters, ES vs SPX timeline views, health and stress timelines, liquidity heatmaps, and manipulation-vs-gamma scatter plots.

## Design Goal

This project is not trying to show every raw field at once. The interface deliberately translates complicated market microstructure into a small set of readable signals:

- **Where is pressure concentrating?**
- **Which side is supporting or dominating the lane?**
- **Is the frame calm, thin, or stressed?**
- **How does the pressure surface change over time?**

That framing is what makes the prototype useful for review, presentation, and iteration.

## Notes

- The source data includes a known header typo that preprocessing should handle: `cans ll_delta` should be treated as `call_delta`.
- The web prototype is static by design. If replay data changes, regenerate/copy the JSON into `webapp/public/data/replay_frames.json`.
- Build output is generated in `webapp/dist/`.
- The app uses Vite's configured base path `/orderbook-organism/`, which matters for local URLs and deployment paths.
