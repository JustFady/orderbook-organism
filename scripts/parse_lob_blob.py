#!/usr/bin/env python3
"""Parse a quoted-JSON LOB blob file into normalized tick/level CSV outputs.

Input format expected from this dataset:
- One giant outer-quoted string that contains a JSON array of objects
- Inner quotes escaped like: \"timestamp\":\"...\"

Outputs:
- levels.csv      : event-level rows (one row per timestamp/side/future_strike)
- ticks.csv       : one row per unique timestamp
- summary.json    : parse counts + validation stats

Notes:
- Supports uncompressed input plus single/double-gzip compressed input.
- Uses the same 26-column `levels.csv` schema as `project1/parsed/levels.csv`.

Usage:
  python3 scripts/parse_lob_blob.py \
      --input "loaded_lob_20250414__20250414_0921.csv.gz" \
      --outdir ./parsed
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import gzip
import json
import shutil
import tempfile
from json import JSONDecodeError
from pathlib import Path
from typing import Dict, Iterator, List

LEVEL_COLUMNS = [
    "tick_id",
    "timestamp",
    "side",
    "future_strike",
    "spx_strike",
    "current_es_price",
    "spx_price",
    "t",
    "mbo",
    "mbo_pulling_stacking",
    "call_charm",
    "call_delta",
    "call_gamma",
    "call_rho",
    "call_theta",
    "call_vanna",
    "call_vega",
    "call_vomma",
    "put_charm",
    "put_delta",
    "put_gamma",
    "put_rho",
    "put_theta",
    "put_vanna",
    "put_vega",
    "put_vomma",
]

REQUIRED_FIELDS = {
    "timestamp",
    "Side",
    "future_strike",
    "MBO",
    "MBO_pulling_stacking",
    "current_es_price",
    "spx_strike",
    "t",
    "spx_price",
    "call_charm",
    "call_delta",
    "call_gamma",
    "call_rho",
    "call_theta",
    "call_vanna",
    "call_vega",
    "call_vomma",
    "put_charm",
    "put_delta",
    "put_gamma",
    "put_rho",
    "put_theta",
    "put_vanna",
    "put_vega",
    "put_vomma",
}

FLOAT_FIELDS = [
    "future_strike",
    "spx_strike",
    "current_es_price",
    "spx_price",
    "t",
    "MBO_pulling_stacking",
    "call_charm",
    "call_delta",
    "call_gamma",
    "call_rho",
    "call_theta",
    "call_vanna",
    "call_vega",
    "call_vomma",
    "put_charm",
    "put_delta",
    "put_gamma",
    "put_rho",
    "put_theta",
    "put_vanna",
    "put_vega",
    "put_vomma",
]

ESCAPE_MAP = {
    '"': '"',
    "\\": "\\",
    "/": "/",
    "b": "\b",
    "f": "\f",
    "n": "\n",
    "r": "\r",
    "t": "\t",
}

GZIP_MAGIC = b"\x1f\x8b"


def is_gzip_file(path: Path) -> bool:
    with path.open("rb") as fh:
        return fh.read(2) == GZIP_MAGIC


def decompress_gzip_once(src: Path, dst: Path) -> None:
    with gzip.open(src, "rb") as inp, dst.open("wb") as out:
        shutil.copyfileobj(inp, out, length=1 << 20)


def prepare_input_for_parsing(input_path: Path) -> tuple[Path, tempfile.TemporaryDirectory[str] | None, int]:
    """Return a parse-ready file path, optional temp dir, and removed gzip layer count."""
    if not is_gzip_file(input_path):
        return input_path, None, 0

    tmp = tempfile.TemporaryDirectory(prefix="lob_parse_")
    tmp_dir = Path(tmp.name)

    stage1 = tmp_dir / f"{input_path.name}.stage1"
    decompress_gzip_once(input_path, stage1)

    if is_gzip_file(stage1):
        stage2 = tmp_dir / f"{input_path.name}.stage2"
        decompress_gzip_once(stage1, stage2)
        return stage2, tmp, 2

    return stage1, tmp, 1


def iter_unescaped_json_payload(path: Path, read_size: int = 1 << 20) -> Iterator[str]:
    """Yield decoded text chunks from an outer-quoted escaped JSON payload."""
    with path.open("r", encoding="utf-8", newline="") as fh:
        started = False
        ended = False
        esc = False
        unicode_hex: List[str] | None = None
        out: List[str] = []

        while True:
            chunk = fh.read(read_size)
            if not chunk:
                break

            i = 0
            while i < len(chunk):
                ch = chunk[i]
                i += 1

                if not started:
                    if ch == '"':
                        started = True
                    continue

                if ended:
                    # Ignore trailing whitespace/newlines after closing quote.
                    continue

                if unicode_hex is not None:
                    unicode_hex.append(ch)
                    if len(unicode_hex) == 4:
                        code = "".join(unicode_hex)
                        out.append(chr(int(code, 16)))
                        unicode_hex = None
                    continue

                if esc:
                    if ch == "u":
                        unicode_hex = []
                    else:
                        out.append(ESCAPE_MAP.get(ch, ch))
                    esc = False
                    continue

                if ch == "\\":
                    esc = True
                    continue

                if ch == '"':
                    ended = True
                    continue

                out.append(ch)

            if out:
                yield "".join(out)
                out = []

        if not started:
            raise ValueError("Input does not start with an outer quote.")
        if esc or unicode_hex is not None:
            raise ValueError("Input ended in the middle of an escape sequence.")
        if not ended:
            raise ValueError("Input outer-quoted payload never terminated.")


def iter_objects_from_quoted_json_array(path: Path) -> Iterator[dict]:
    """Stream JSON objects from a decoded JSON array payload."""
    decoder = json.JSONDecoder()
    buf = ""
    started_array = False
    ended_array = False

    for text in iter_unescaped_json_payload(path):
        buf += text
        pos = 0

        while True:
            n = len(buf)
            while pos < n and buf[pos].isspace():
                pos += 1

            if not started_array:
                if pos >= n:
                    break
                if buf[pos] != "[":
                    raise ValueError("Decoded payload does not begin with '['.")
                started_array = True
                pos += 1
                continue

            while pos < n and buf[pos].isspace():
                pos += 1
            if pos >= n:
                break

            if buf[pos] == "]":
                ended_array = True
                pos += 1
                break

            try:
                obj, next_pos = decoder.raw_decode(buf, pos)
            except JSONDecodeError:
                break

            if not isinstance(obj, dict):
                raise ValueError("Expected object entries inside the JSON array.")

            yield obj
            pos = next_pos

            while pos < len(buf) and buf[pos].isspace():
                pos += 1
            if pos < len(buf) and buf[pos] == ",":
                pos += 1

        if pos:
            buf = buf[pos:]

    if not started_array:
        raise ValueError("No JSON array detected in payload.")

    if not ended_array:
        tail = buf.strip()
        if tail != "]":
            raise ValueError("JSON array did not terminate cleanly.")


def to_float(row: dict, key: str) -> float:
    val = row.get(key)
    if val is None:
        raise ValueError(f"Missing value: {key}")
    try:
        return float(val)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid float for {key}: {val!r}") from exc


def normalize_row(row: dict, tick_id: int) -> dict:
    missing = REQUIRED_FIELDS.difference(row.keys())
    if missing:
        raise ValueError(f"Missing required fields: {sorted(missing)}")

    ts = row["timestamp"]
    if not isinstance(ts, str):
        raise ValueError("timestamp must be a string")

    try:
        dt.datetime.fromisoformat(ts)
    except ValueError as exc:
        raise ValueError(f"Invalid ISO timestamp: {ts!r}") from exc

    side = row["Side"]
    if side not in {"Ask", "Bid"}:
        raise ValueError(f"Unexpected Side: {side!r}")

    mbo = row["MBO"]
    if not isinstance(mbo, list):
        raise ValueError("MBO must be a list")
    # Keep list fidelity while storing as CSV string.
    mbo_json = json.dumps(mbo, separators=(",", ":"))

    out = {
        "tick_id": tick_id,
        "timestamp": ts,
        "side": side,
        "mbo": mbo_json,
    }

    for key in FLOAT_FIELDS:
        out_key = key.lower() if key != "MBO_pulling_stacking" else "mbo_pulling_stacking"
        out[out_key] = to_float(row, key)

    return out


def parse_file(input_path: Path, outdir: Path) -> None:
    outdir.mkdir(parents=True, exist_ok=True)
    parse_path, temp_dir, compression_layers_removed = prepare_input_for_parsing(input_path)

    levels_path = outdir / "levels.csv"
    ticks_path = outdir / "ticks.csv"
    summary_path = outdir / "summary.json"

    tick_map: Dict[str, int] = {}
    tick_rows: List[dict] = []

    summary = {
        "input_file": str(input_path),
        "parsed_input_file": str(parse_path),
        "compression_layers_removed": compression_layers_removed,
        "records_total": 0,
        "records_ok": 0,
        "records_bad": 0,
        "sides": {"Ask": 0, "Bid": 0},
        "unique_timestamps": 0,
        "mbo_empty": 0,
        "mbo_nonempty": 0,
        "mbo_pulling_stacking_nonzero": 0,
        "timestamp_min": None,
        "timestamp_max": None,
        "ranges": {},
        "bad_examples": [],
    }

    min_max = {k.lower() if k != "MBO_pulling_stacking" else "mbo_pulling_stacking": [None, None] for k in FLOAT_FIELDS}

    try:
        with levels_path.open("w", encoding="utf-8", newline="") as lf:
            writer = csv.DictWriter(lf, fieldnames=LEVEL_COLUMNS)
            writer.writeheader()

            for idx, obj in enumerate(iter_objects_from_quoted_json_array(parse_path), start=1):
                summary["records_total"] += 1
                try:
                    ts = obj.get("timestamp")
                    if not isinstance(ts, str):
                        raise ValueError("timestamp must be a string")
                    dt.datetime.fromisoformat(ts)

                    if ts not in tick_map:
                        tick_id = len(tick_map) + 1
                        tick_map[ts] = tick_id
                        tick_rows.append(
                            {
                                "tick_id": tick_id,
                                "timestamp": ts,
                                "second_bucket": ts[:19] if len(ts) >= 19 else "",
                            }
                        )
                    tick_id = tick_map[ts]

                    row = normalize_row(obj, tick_id)

                    writer.writerow(row)
                    summary["records_ok"] += 1
                    summary["sides"][row["side"]] += 1

                    if row["mbo"] == "[]":
                        summary["mbo_empty"] += 1
                    else:
                        summary["mbo_nonempty"] += 1

                    if row["mbo_pulling_stacking"] != 0.0:
                        summary["mbo_pulling_stacking_nonzero"] += 1

                    ts_val = row["timestamp"]
                    if summary["timestamp_min"] is None or ts_val < summary["timestamp_min"]:
                        summary["timestamp_min"] = ts_val
                    if summary["timestamp_max"] is None or ts_val > summary["timestamp_max"]:
                        summary["timestamp_max"] = ts_val

                    for key, (mn, mx) in min_max.items():
                        val = row[key]
                        if mn is None or val < mn:
                            mn = val
                        if mx is None or val > mx:
                            mx = val
                        min_max[key] = [mn, mx]

                except Exception as exc:
                    summary["records_bad"] += 1
                    if len(summary["bad_examples"]) < 10:
                        summary["bad_examples"].append(
                            {
                                "record_index": idx,
                                "error": str(exc),
                            }
                        )
    finally:
        if temp_dir is not None:
            temp_dir.cleanup()

    # Build tick aggregates.
    counts: Dict[int, int] = {}
    for ts, tick_id in tick_map.items():
        counts[tick_id] = 0

    with levels_path.open("r", encoding="utf-8", newline="") as lf:
        reader = csv.DictReader(lf)
        for row in reader:
            tid = int(row["tick_id"])
            counts[tid] = counts.get(tid, 0) + 1

    with ticks_path.open("w", encoding="utf-8", newline="") as tf:
        tw = csv.DictWriter(tf, fieldnames=["tick_id", "timestamp", "second_bucket", "records_in_tick"])
        tw.writeheader()
        for row in tick_rows:
            out = dict(row)
            out["records_in_tick"] = counts.get(row["tick_id"], 0)
            tw.writerow(out)

    summary["unique_timestamps"] = len(tick_map)
    summary["ranges"] = {k: {"min": v[0], "max": v[1]} for k, v in min_max.items()}

    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse LOB quoted JSON blob into normalized CSV outputs.")
    parser.add_argument("--input", required=True, type=Path, help="Path to input blob file")
    parser.add_argument("--outdir", required=True, type=Path, help="Output directory")
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"Input not found: {args.input}")

    parse_file(args.input, args.outdir)
    print(f"Wrote parsed outputs to: {args.outdir}")


if __name__ == "__main__":
    main()
