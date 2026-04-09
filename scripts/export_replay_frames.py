#!/usr/bin/env python3
"""Build replay frames for the React organism scene from parsed_scaled/levels.csv."""

from __future__ import annotations

import argparse
import ast
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd


REQUIRED_COLUMNS = [
    "timestamp",
    "side",
    "future_strike",
    "current_es_price_scaled",
    "mbo",
    "mbo_pulling_stacking",
    "call_gamma",
    "put_gamma",
]


def minmax(series: pd.Series) -> pd.Series:
    smin = series.min()
    smax = series.max()
    if pd.isna(smin) or pd.isna(smax) or smax == smin:
        return pd.Series(np.zeros(len(series)), index=series.index)
    return (series - smin) / (smax - smin)


def parse_mbo(value: object) -> tuple[float, int]:
    if pd.isna(value):
        return 0.0, 0

    try:
        parsed = ast.literal_eval(str(value))
    except (ValueError, SyntaxError):
        return 0.0, 0

    if not isinstance(parsed, list):
        return 0.0, 0

    numeric: list[float] = []
    for raw in parsed:
        try:
            numeric.append(float(raw))
        except (TypeError, ValueError):
            continue

    if not numeric:
        return 0.0, 0

    return float(sum(numeric)), int(len(numeric))


def health_state(score: float) -> str:
    if score >= 0.66:
        return "stable"
    if score >= 0.33:
        return "stressed"
    return "critical"


def build_replay_frames(df: pd.DataFrame, num_lanes: int) -> dict:
    grouped = (
        df.groupby("timestamp", as_index=True)
        .agg(
            es_price=("current_es_price_scaled", "mean"),
            liquidity=("mbo_total_size", "mean"),
            manipulation=("manip_abs", "mean"),
            gamma=("gamma_total", "mean"),
            order_count=("mbo_order_count", "mean"),
            rows=("future_strike", "count"),
        )
        .sort_index()
    )

    grouped["kinetic"] = grouped["es_price"].diff().abs().fillna(0.0)

    liquidity_n = minmax(grouped["liquidity"])
    manipulation_n = minmax(grouped["manipulation"])
    gamma_n = minmax(grouped["gamma"])
    kinetic_n = minmax(grouped["kinetic"])

    stress = (
        0.35 * manipulation_n
        + 0.30 * gamma_n
        + 0.20 * kinetic_n
        + 0.15 * (1.0 - liquidity_n)
    ).clip(0.0, 1.0)
    health = (1.0 - stress).clip(0.0, 1.0)

    side_liq = (
        df.pivot_table(
            index="timestamp",
            columns="side",
            values="mbo_total_size",
            aggfunc="sum",
            fill_value=0.0,
        )
        .reindex(grouped.index, fill_value=0.0)
        .sort_index()
    )

    ask_total = side_liq["Ask"] if "Ask" in side_liq.columns else pd.Series(0.0, index=grouped.index)
    bid_total = side_liq["Bid"] if "Bid" in side_liq.columns else pd.Series(0.0, index=grouped.index)
    imbalance = (ask_total - bid_total) / (ask_total + bid_total + 1e-9)

    strike_min = float(df["future_strike"].min())
    strike_max = float(df["future_strike"].max())
    if strike_max == strike_min:
        df["lane_idx"] = 0
    else:
        scaled = (df["future_strike"] - strike_min) / (strike_max - strike_min)
        df["lane_idx"] = np.floor(scaled * num_lanes).clip(0, num_lanes - 1).astype(int)

    ask_lanes = (
        df[df["side"] == "Ask"]
        .groupby(["timestamp", "lane_idx"]) ["mbo_total_size"]
        .sum()
        .unstack(fill_value=0.0)
        .reindex(index=grouped.index, columns=range(num_lanes), fill_value=0.0)
    )
    bid_lanes = (
        df[df["side"] == "Bid"]
        .groupby(["timestamp", "lane_idx"]) ["mbo_total_size"]
        .sum()
        .unstack(fill_value=0.0)
        .reindex(index=grouped.index, columns=range(num_lanes), fill_value=0.0)
    )

    lane_max = max(float(ask_lanes.to_numpy().max()), float(bid_lanes.to_numpy().max()), 1.0)
    ask_lanes = ask_lanes / lane_max
    bid_lanes = bid_lanes / lane_max

    frames: list[dict] = []
    for idx, ts in enumerate(grouped.index):
        life_progress = 0.0 if len(grouped) <= 1 else idx / (len(grouped) - 1)
        h = float(health.iloc[idx])

        frames.append(
            {
                "frame_index": idx,
                "timestamp": ts.isoformat(),
                "life_progress": round(life_progress, 6),
                "liquidity_density_factor": round(float(liquidity_n.iloc[idx]), 6),
                "gamma_metabolism_factor": round(float(gamma_n.iloc[idx]), 6),
                "manipulation_factor": round(float(manipulation_n.iloc[idx]), 6),
                "price_kinetic_factor": round(float(kinetic_n.iloc[idx]), 6),
                "health_score": round(h, 6),
                "health_state": health_state(h),
                "ask_flow": [round(float(v), 6) for v in ask_lanes.iloc[idx].tolist()],
                "bid_flow": [round(float(v), 6) for v in bid_lanes.iloc[idx].tolist()],
                "side_imbalance": round(float(imbalance.iloc[idx]), 6),
                "order_density": round(float(minmax(grouped["order_count"]).iloc[idx]), 6),
                "source_rows": int(grouped["rows"].iloc[idx]),
            }
        )

    return {
        "strike_min": strike_min,
        "strike_max": strike_max,
        "num_lanes": num_lanes,
        "frames": frames,
        "dataset_start": grouped.index.min().isoformat(),
        "dataset_end": grouped.index.max().isoformat(),
    }


def parse_datetime(value: str) -> datetime:
    parsed = pd.Timestamp(value)
    if parsed.tzinfo is None:
        parsed = parsed.tz_localize(timezone.utc)
    return parsed.to_pydatetime()


def attach_organism_clock(payload: dict, start_date: datetime, end_date: datetime) -> None:
    if end_date <= start_date:
        raise ValueError("end_date must be after start_date")

    total_seconds = (end_date - start_date).total_seconds()
    for frame in payload["frames"]:
        progress = frame["life_progress"]
        organism_time = start_date + timedelta(seconds=total_seconds * progress)
        frame["organism_clock"] = organism_time.isoformat()

    payload["organism_start_date"] = start_date.isoformat()
    payload["organism_end_date"] = end_date.isoformat()


def main() -> None:
    parser = argparse.ArgumentParser(description="Export replay frames JSON for the organism webapp")
    parser.add_argument("--input", default="parsed_scaled/levels.csv", help="Path to source levels.csv")
    parser.add_argument(
        "--output",
        default="analysis/replay/replay_frames.json",
        help="Path to write replay JSON for analysis artifacts",
    )
    parser.add_argument(
        "--webapp-output",
        default="webapp/public/data/replay_frames.json",
        help="Path to write replay JSON for React public assets",
    )
    parser.add_argument("--num-lanes", type=int, default=24, help="Number of vascular lanes")
    parser.add_argument(
        "--start-date",
        default=None,
        help="Organism timeline start date (ISO). Default: dataset start timestamp.",
    )
    parser.add_argument(
        "--end-date",
        default=None,
        help="Organism timeline end date (ISO). Default: dataset end timestamp.",
    )
    args = parser.parse_args()

    source_path = Path(args.input)
    if not source_path.exists():
        raise FileNotFoundError(f"Missing input file: {source_path}")

    df = pd.read_csv(source_path, usecols=lambda c: c in REQUIRED_COLUMNS, low_memory=False)

    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df = df.dropna(subset=["timestamp", "side", "future_strike"])

    mbo_parsed = df["mbo"].apply(parse_mbo)
    df["mbo_total_size"] = mbo_parsed.apply(lambda x: x[0])
    df["mbo_order_count"] = mbo_parsed.apply(lambda x: x[1])

    df["manip_abs"] = df["mbo_pulling_stacking"].abs()
    df["gamma_total"] = df["call_gamma"].abs() + df["put_gamma"].abs()

    payload = build_replay_frames(df, num_lanes=max(args.num_lanes, 4))

    dataset_start = parse_datetime(payload["dataset_start"])
    dataset_end = parse_datetime(payload["dataset_end"])

    start_date = parse_datetime(args.start_date) if args.start_date else dataset_start
    end_date = parse_datetime(args.end_date) if args.end_date else dataset_end

    attach_organism_clock(payload, start_date=start_date, end_date=end_date)

    payload["generated_at"] = datetime.now(timezone.utc).isoformat()
    payload["source_file"] = str(source_path)

    output_paths = [Path(args.output)]
    if args.webapp_output:
        output_paths.append(Path(args.webapp_output))

    for path in output_paths:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")

    print(f"frames={len(payload['frames'])}")
    print(f"dataset_start={payload['dataset_start']}")
    print(f"dataset_end={payload['dataset_end']}")
    print(f"organism_start={payload['organism_start_date']}")
    print(f"organism_end={payload['organism_end_date']}")
    for path in output_paths:
        print(f"wrote={path}")


if __name__ == "__main__":
    main()
