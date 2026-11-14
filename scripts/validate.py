#!/usr/bin/env python3
"""Check features.json files (and index.json) against docs/data-contract.md.

Usage:
  python3 scripts/validate.py                       # everything under public/data/
  python3 scripts/validate.py path/to/features.json  # specific files

Exit code 0 = all valid, 1 = at least one problem.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"

TOP_KEYS = {"dataset", "title", "fps", "frameCount", "grid", "frames"}
FRAME_KEYS = {"t", "brightness", "warmth", "density", "pan", "motion", "flashes", "value", "grid"}
UNIT_FEATURES = ["brightness", "warmth", "density", "motion", "value"]
EXPECTED_ROWS, EXPECTED_COLS = 16, 32
INDEX_KEYS = {"id", "title", "description", "colorMeaning", "source", "credit",
              "features", "video", "mock"}


def is_num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def is_int(x):
    return isinstance(x, int) and not isinstance(x, bool)


def decimals_ok(x, places):
    return abs(round(x, places) - x) < 1e-12


def validate_features(path):
    errors = []
    err = errors.append
    try:
        doc = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        return [f"cannot read JSON: {e}"]

    if not isinstance(doc, dict):
        return ["top level must be an object"]
    if set(doc) != TOP_KEYS:
        err(f"top-level keys {sorted(doc)} != {sorted(TOP_KEYS)}")

    if not isinstance(doc.get("dataset"), str) or not doc.get("dataset"):
        err("dataset must be a non-empty string")
    elif Path(path).parent.name != doc["dataset"]:
        err(f"dataset '{doc['dataset']}' does not match folder '{Path(path).parent.name}'")
    if not isinstance(doc.get("title"), str) or not doc.get("title"):
        err("title must be a non-empty string")
    if not is_num(doc.get("fps")) or doc["fps"] <= 0:
        err("fps must be a positive number")

    g = doc.get("grid")
    rows = cols = None
    if not isinstance(g, dict) or set(g) != {"cols", "rows"}:
        err("grid must be {cols, rows}")
    else:
        rows, cols = g["rows"], g["cols"]
        if (rows, cols) != (EXPECTED_ROWS, EXPECTED_COLS):
            err(f"grid is {rows}x{cols}, expected {EXPECTED_ROWS}x{EXPECTED_COLS} (rows x cols)")

    frames = doc.get("frames")
    if not isinstance(frames, list) or not frames:
        return errors + ["frames must be a non-empty list"]
    if doc.get("frameCount") != len(frames):
        err(f"frameCount {doc.get('frameCount')} != len(frames) {len(frames)}")

    for i, f in enumerate(frames):
        where = f"frame {i}"
        if not isinstance(f, dict):
            err(f"{where}: not an object")
            continue
        if set(f) != FRAME_KEYS:
            missing, extra = FRAME_KEYS - set(f), set(f) - FRAME_KEYS
            err(f"{where}: missing {sorted(missing)} extra {sorted(extra)}")
        if f.get("t") != i or not is_int(f.get("t")):
            err(f"{where}: t should be {i}, got {f.get('t')!r}")
        for k in UNIT_FEATURES:
            v = f.get(k)
            if not is_num(v) or not 0 <= v <= 1:
                err(f"{where}: {k}={v!r} not in 0-1")
            elif not decimals_ok(v, 3):
                err(f"{where}: {k}={v} has more than 3 decimals")
        p = f.get("pan")
        if not is_num(p) or not -1 <= p <= 1:
            err(f"{where}: pan={p!r} not in -1..1")
        elif not decimals_ok(p, 3):
            err(f"{where}: pan={p} has more than 3 decimals")
        fl = f.get("flashes")
        if not is_int(fl) or not 0 <= fl <= 16:
            err(f"{where}: flashes={fl!r} must be an integer 0-16")

        cells = f.get("grid")
        if not isinstance(cells, list) or (rows is not None and len(cells) != rows):
            err(f"{where}: grid must have {rows} rows")
            continue
        for r, row in enumerate(cells):
            if not isinstance(row, list) or (cols is not None and len(row) != cols):
                err(f"{where}: grid row {r} must have {cols} cells")
                continue
            for c, v in enumerate(row):
                if not is_num(v) or not 0 <= v <= 1:
                    err(f"{where}: grid[{r}][{c}]={v!r} not in 0-1")
                elif not decimals_ok(v, 2):
                    err(f"{where}: grid[{r}][{c}]={v} has more than 2 decimals")

        if len(errors) > 50:
            err("... too many errors, stopping")
            break
    return errors


def validate_index(path):
    errors = []
    try:
        doc = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        return [f"cannot read JSON: {e}"]
    items = doc.get("datasets") if isinstance(doc, dict) else None
    if not isinstance(items, list) or not items:
        return ["index.json needs a non-empty 'datasets' list"]
    seen = set()
    for d in items:
        did = d.get("id", "?")
        if set(d) != INDEX_KEYS:
            errors.append(f"{did}: keys {sorted(d)} != {sorted(INDEX_KEYS)}")
        if did in seen:
            errors.append(f"{did}: duplicate id")
        seen.add(did)
        for k in INDEX_KEYS - {"mock"}:
            if not isinstance(d.get(k), str) or not d.get(k):
                errors.append(f"{did}: {k} must be a non-empty string")
        if not isinstance(d.get("mock"), bool):
            errors.append(f"{did}: mock must be true/false")
        feat = d.get("features")
        if isinstance(feat, str) and not (Path(path).parent / feat).is_file():
            errors.append(f"{did}: features file '{feat}' not found")
    return errors


def main(argv):
    targets = [Path(a) for a in argv] or sorted(DATA.glob("*/features.json"))
    if not argv and (DATA / "index.json").is_file():
        targets.append(DATA / "index.json")
    if not targets:
        print("nothing to validate")
        return 1

    failed = 0
    for path in targets:
        errs = validate_index(path) if path.name == "index.json" else validate_features(path)
        name = path.resolve().relative_to(ROOT) if path.resolve().is_relative_to(ROOT) else path
        if errs:
            failed += 1
            print(f"FAIL  {name}")
            for e in errs:
                print(f"      - {e}")
        else:
            print(f"OK    {name}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
