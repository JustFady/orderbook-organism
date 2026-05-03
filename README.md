# Orderbook Organism

Orderbook Organism is a lightweight web prototype that turns order-book activity into a replayable pressure landscape. It is designed to make dense market microstructure easier to read: where activity is crowding, which side is supplying liquidity, and when the market surface starts to look stressed.

## Live Site

https://justfady.github.io/orderbook-organism/

## What You Are Looking At

The app replays market state across strike lanes and translates raw flow into a few readable signals:

- **Pressure ridge:** the filled blue shape combines ask and bid flow. Taller peaks mean a strike lane is carrying more activity than nearby lanes.
- **Bid liquidity:** blue dots show bid-side support.
- **Ask liquidity:** gold dots show ask-side concentration.
- **Stress signal:** the orange line rises when bid and ask flow split apart.
- **Weighted price:** the vertical dashed line tracks the center of the current frame.
- **Frame diagnosis:** the top card summarizes the current moment in plain English.

Use **Story mode** for a guided walkthrough, or **Explore mode** to scrub the replay and inspect individual lanes.

## Run Locally

```bash
cd webapp
npm install
npm run dev
```

The app uses the Vite base path `/orderbook-organism/`, so the local URL usually looks like:

```text
http://127.0.0.1:5173/orderbook-organism/
```

If port `5173` is busy, Vite will print the correct replacement URL.

## Project Layout

```text
.
|-- webapp/                         # React/Vite app for the live prototype
|   |-- public/data/replay_frames.json
|   `-- src/
|-- analysis/replay/replay_frames.json
|-- scripts/                        # Parsing and replay export utilities
|-- app/dashboard.py                # Streamlit exploratory dashboard
|-- docs/schema_contract.md         # Data contract notes
|-- parsed_scaled/                  # Source market data
`-- DATA_DICTIONARY.md
```

## Data Flow

1. Source market data lives in `parsed_scaled/`.
2. Python utilities in `scripts/` parse and shape the data.
3. `analysis/replay/replay_frames.json` stores the generated replay payload.
4. `webapp/public/data/replay_frames.json` is the copy consumed by the React app.

When replay data changes, refresh the web copy:

```bash
cp analysis/replay/replay_frames.json webapp/public/data/replay_frames.json
```

## Useful Commands

```bash
cd webapp
npm run dev      # Start local dev server
npm run build    # Build production assets
npm run preview  # Preview production build
```

Optional Streamlit dashboard:

```bash
pip install streamlit plotly pandas numpy
streamlit run app/dashboard.py
```

## Deployment

The live site is served from the `gh-pages` branch. Before deploying, build the web app:

```bash
cd webapp
npm run build
```

Then publish the contents of `webapp/dist/` to `gh-pages`.
