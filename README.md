# Orderbook Organism

**Live demo:** https://justfady.github.io/orderbook-organism/

Orderbook Organism is a React/Vite prototype that turns order-book activity into a replayable pressure landscape. It is built to make complicated market microstructure easier to explain in a presentation: where pressure is clustering, where liquidity is thinning, and when the book starts to look stressed.

## What To Open

Use this URL for the deployed project:

```text
https://justfady.github.io/orderbook-organism/
```

Use this URL when running locally:

```text
http://127.0.0.1:5173/orderbook-organism/
```

Do not use `/cpsc481_project/`. That was the old folder/project name, not the app route.

If `http://127.0.0.1:5173/...` opens a different site, another dev server is already using port `5173`. Stop that server, then start this project again.

## Run Locally

```bash
cd webapp
npm install
npm run dev
```

The app is intentionally configured to use port `5173`. If that port is busy, `npm run dev` will fail instead of quietly switching ports.

For a temporary fallback port:

```bash
cd webapp
npm run dev:auto
```

Then open the URL Vite prints, using the `/orderbook-organism/` path.

## How To Read The App

- **Pressure ridge:** the blue filled shape shows where combined bid and ask activity is concentrated.
- **Bid liquidity:** blue dots show bid-side support.
- **Ask liquidity:** gold dots show ask-side concentration.
- **Stress line:** the orange line rises when the two sides of the book split apart.
- **Guided tour:** walks through the visualization in a presentation-friendly order.
- **Event bookmarks:** jump to moments like liquidity drops, stress spikes, and pressure clusters.

## Project Structure

```text
webapp/              React/Vite app
webapp/public/data/  Replay JSON files used by the app
analysis/replay/     Generated replay payloads
scripts/             Data parsing and replay export scripts
app/                 Optional Streamlit exploration dashboard
docs/                Data contract notes
```

## Data Notes

The app currently includes the original replay plus recovered LOB slices for `09:22`, `09:23`, `09:24`, and `09:26`.

To regenerate a replay from a parsed `levels.csv` file:

```bash
.venv/bin/python scripts/export_replay_frames.py \
  --input data/parsed_parts/example/levels.csv \
  --output analysis/replay/replay_example.json \
  --webapp-output webapp/public/data/replay_example.json
```

## Deployment

The live site is served from the `gh-pages` branch. Build the app, then publish `webapp/dist/` to `gh-pages`.

```bash
cd webapp
npm run build
```
