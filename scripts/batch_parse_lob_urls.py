#!/usr/bin/env python3
"""Batch download + parse LOB blob URLs into one combined parsed dataset.

This script:
1) Reads URLs from a text file (one URL per line)
2) Downloads each `.csv.gz` file (or reuses an existing local copy)
3) Calls `parse_lob_blob.py` per file
4) Merges all per-file `levels.csv` + `ticks.csv` into one combined output

Combined output schema matches `project1/parsed/levels.csv` and `ticks.csv`.
"""

from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, Iterable, List, Tuple
from urllib.parse import urlsplit
from urllib.request import urlopen

EXPECTED_LEVEL_COLUMNS = [
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

TICKS_COLUMNS = ["tick_id", "timestamp", "second_bucket", "records_in_tick"]


def read_urls(path: Path) -> List[str]:
    lines = [line.strip() for line in path.read_text(encoding="utf-8").splitlines()]
    return [line for line in lines if line and not line.startswith("#")]


def pick_urls(urls: List[str], start_index: int, max_files: int | None) -> List[Tuple[int, str]]:
    if start_index < 1:
        raise ValueError("--start-index must be >= 1")
    sliced = list(enumerate(urls, start=1))[start_index - 1 :]
    if max_files is not None:
        sliced = sliced[:max_files]
    return sliced


def filename_from_url(url: str) -> str:
    name = Path(urlsplit(url).path).name
    if not name:
        raise ValueError(f"Could not infer file name from URL: {url}")
    return name


def download_url(url: str, dst: Path, chunk_size: int = 1 << 20) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(dst.suffix + ".part")
    with urlopen(url) as response, tmp.open("wb") as out:
        while True:
            chunk = response.read(chunk_size)
            if not chunk:
                break
            out.write(chunk)
    tmp.replace(dst)


def run_parser(parser_path: Path, input_path: Path, outdir: Path) -> None:
    outdir.mkdir(parents=True, exist_ok=True)
    cmd = [sys.executable, str(parser_path), "--input", str(input_path), "--outdir", str(outdir)]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        stderr = proc.stderr.strip() or "(no stderr)"
        stdout = proc.stdout.strip() or "(no stdout)"
        raise RuntimeError(f"Parser failed for {input_path}\nstdout: {stdout}\nstderr: {stderr}")


def validate_levels_header(path: Path) -> None:
    with path.open("r", encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        if reader.fieldnames != EXPECTED_LEVEL_COLUMNS:
            raise ValueError(f"Unexpected levels header in {path}: {reader.fieldnames}")


def merge_one_part(
    part_outdir: Path,
    levels_writer: csv.DictWriter,
    ticks_writer: csv.DictWriter,
    next_tick_id: int,
) -> tuple[int, int, int, Dict[str, int], str | None, str | None]:
    levels_path = part_outdir / "levels.csv"
    ticks_path = part_outdir / "ticks.csv"
    validate_levels_header(levels_path)

    tick_id_map: Dict[int, int] = {}
    added_ticks = 0
    added_levels = 0
    side_counts = {"Ask": 0, "Bid": 0}
    ts_min: str | None = None
    ts_max: str | None = None

    with ticks_path.open("r", encoding="utf-8", newline="") as tf:
        tick_reader = csv.DictReader(tf)
        if tick_reader.fieldnames != TICKS_COLUMNS:
            raise ValueError(f"Unexpected ticks header in {ticks_path}: {tick_reader.fieldnames}")
        for row in tick_reader:
            old_id = int(row["tick_id"])
            new_id = next_tick_id
            next_tick_id += 1
            tick_id_map[old_id] = new_id
            row["tick_id"] = str(new_id)
            ticks_writer.writerow(row)
            added_ticks += 1

    with levels_path.open("r", encoding="utf-8", newline="") as lf:
        level_reader = csv.DictReader(lf)
        for row in level_reader:
            old_id = int(row["tick_id"])
            if old_id not in tick_id_map:
                raise ValueError(f"Missing tick mapping for tick_id={old_id} in {levels_path}")
            row["tick_id"] = str(tick_id_map[old_id])
            levels_writer.writerow(row)
            added_levels += 1

            side = row.get("side")
            if side in side_counts:
                side_counts[side] += 1

            ts = row.get("timestamp")
            if ts:
                if ts_min is None or ts < ts_min:
                    ts_min = ts
                if ts_max is None or ts > ts_max:
                    ts_max = ts

    return next_tick_id, added_ticks, added_levels, side_counts, ts_min, ts_max


def main() -> None:
    parser = argparse.ArgumentParser(description="Batch parse LOB URLs from a list into combined CSV outputs.")
    parser.add_argument("--file-list", type=Path, default=Path("data/file_names.txt"), help="Path to URL list text file")
    parser.add_argument("--download-dir", type=Path, default=Path("data/raw_blobs"), help="Where downloaded .gz files are stored")
    parser.add_argument("--parts-dir", type=Path, default=Path("data/parsed_parts"), help="Per-file parser outputs")
    parser.add_argument("--outdir", type=Path, default=Path("data/parsed_combined"), help="Combined output dir")
    parser.add_argument(
        "--parser-path",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "parse_lob_blob.py",
        help="Path to parse_lob_blob.py",
    )
    parser.add_argument("--start-index", type=int, default=1, help="1-based line index to start from")
    parser.add_argument("--max-files", type=int, default=None, help="Limit number of files processed")
    parser.add_argument("--force-download", action="store_true", help="Re-download files even if present locally")
    parser.add_argument("--force-reparse", action="store_true", help="Re-run parser even if per-file outputs already exist")
    parser.add_argument("--stop-on-error", action="store_true", help="Abort immediately on first failure")
    args = parser.parse_args()

    if not args.file_list.exists():
        raise SystemExit(f"file list not found: {args.file_list}")
    if not args.parser_path.exists():
        raise SystemExit(f"parser not found: {args.parser_path}")

    urls = read_urls(args.file_list)
    selected = pick_urls(urls, args.start_index, args.max_files)
    if not selected:
        raise SystemExit("no URLs selected")

    args.download_dir.mkdir(parents=True, exist_ok=True)
    args.parts_dir.mkdir(parents=True, exist_ok=True)
    args.outdir.mkdir(parents=True, exist_ok=True)

    levels_out = args.outdir / "levels.csv"
    ticks_out = args.outdir / "ticks.csv"
    summary_out = args.outdir / "summary.json"

    processed = 0
    failed = 0
    total_levels = 0
    total_ticks = 0
    side_totals = {"Ask": 0, "Bid": 0}
    global_ts_min: str | None = None
    global_ts_max: str | None = None
    failures: List[dict] = []
    started_at = time.time()
    next_tick_id = 1

    with levels_out.open("w", encoding="utf-8", newline="") as lf, ticks_out.open("w", encoding="utf-8", newline="") as tf:
        levels_writer = csv.DictWriter(lf, fieldnames=EXPECTED_LEVEL_COLUMNS)
        ticks_writer = csv.DictWriter(tf, fieldnames=TICKS_COLUMNS)
        levels_writer.writeheader()
        ticks_writer.writeheader()

        for idx, url in selected:
            try:
                name = filename_from_url(url)
                local_file = args.download_dir / name
                base_name = name[:-3] if name.endswith(".gz") else Path(name).stem
                part_outdir = args.parts_dir / base_name

                if args.force_download or not local_file.exists():
                    print(f"[{idx}] downloading {name}")
                    download_url(url, local_file)
                else:
                    print(f"[{idx}] using cached download {name}")

                parsed_levels = part_outdir / "levels.csv"
                parsed_ticks = part_outdir / "ticks.csv"
                if args.force_reparse or not (parsed_levels.exists() and parsed_ticks.exists()):
                    print(f"[{idx}] parsing {name}")
                    run_parser(args.parser_path, local_file, part_outdir)
                else:
                    print(f"[{idx}] using cached parse {part_outdir}")

                next_tick_id, add_ticks, add_levels, add_sides, ts_min, ts_max = merge_one_part(
                    part_outdir=part_outdir,
                    levels_writer=levels_writer,
                    ticks_writer=ticks_writer,
                    next_tick_id=next_tick_id,
                )

                processed += 1
                total_ticks += add_ticks
                total_levels += add_levels
                side_totals["Ask"] += add_sides["Ask"]
                side_totals["Bid"] += add_sides["Bid"]

                if ts_min is not None and (global_ts_min is None or ts_min < global_ts_min):
                    global_ts_min = ts_min
                if ts_max is not None and (global_ts_max is None or ts_max > global_ts_max):
                    global_ts_max = ts_max

            except Exception as exc:
                failed += 1
                failures.append({"index": idx, "url": url, "error": str(exc)})
                print(f"[{idx}] FAILED: {exc}", file=sys.stderr)
                if args.stop_on_error:
                    break

    elapsed = time.time() - started_at
    summary = {
        "file_list": str(args.file_list),
        "parser_path": str(args.parser_path),
        "selected_count": len(selected),
        "processed_files": processed,
        "failed_files": failed,
        "total_level_rows": total_levels,
        "total_ticks": total_ticks,
        "sides": side_totals,
        "timestamp_min": global_ts_min,
        "timestamp_max": global_ts_max,
        "elapsed_seconds": elapsed,
        "failures": failures[:100],
    }
    summary_out.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"Combined levels: {levels_out}")
    print(f"Combined ticks:  {ticks_out}")
    print(f"Summary:         {summary_out}")
    print(f"Processed={processed} Failed={failed} Rows={total_levels} Ticks={total_ticks}")

    if failed > 0 and args.stop_on_error:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
