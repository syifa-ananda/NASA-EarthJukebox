"""Shared feature definitions used by scripts/make_mock.py and src/analysis/analyze.py.

Keeping them in one place means mock data and real data mean the same thing.
See docs/data-contract.md for what each feature is for.
"""

import numpy as np


def _xpos(grid):
    """Horizontal position of each column centre: -1 = left/west ... +1 = right/east."""
    cols = grid.shape[1]
    return np.broadcast_to(2.0 * (np.arange(cols) + 0.5) / cols - 1.0, grid.shape)


def pan_of(grid, mask=None):
    """Horizontal centre of activity: weighted by how far cells sit above the median.

    mask (optional, bool array like grid): only these cells count, e.g. ocean cells.
    """
    if mask is None:
        mask = np.ones(grid.shape, dtype=bool)
    if not mask.any():
        return 0.0
    w = np.clip(grid - np.median(grid[mask]), 0.0, None) * mask
    if w.sum() < 1e-9:
        return 0.0
    return float((w * _xpos(grid)).sum() / w.sum())


def motion_of(grid, prev, mask=None):
    """Mean absolute change from the previous frame, scaled into 0-1."""
    if prev is None:
        return 0.0
    diff = np.abs(grid - prev)
    if mask is not None:
        if not mask.any():
            return 0.0
        diff = diff[mask]
    return float(np.clip(diff.mean() * 8.0, 0.0, 1.0))


def flashes_of(grid, prev, threshold=0.6):
    """Number of cells that just became bright (capped at 16)."""
    if prev is None:
        new = grid >= threshold
    else:
        new = (grid >= threshold) & (prev < threshold)
    return int(min(16, new.sum()))


def r3(x):
    return round(float(x), 3) + 0.0   # + 0.0 turns -0.0 into 0.0


def frame_record(t, grid, brightness, warmth, density, pan, motion, flashes, value=None):
    """One frame in data-contract format. value defaults to the grid mean."""
    grid = np.clip(grid, 0.0, 1.0)
    return {
        "t": t,
        "brightness": r3(np.clip(brightness, 0, 1)),
        "warmth": r3(np.clip(warmth, 0, 1)),
        "density": r3(np.clip(density, 0, 1)),
        "pan": r3(np.clip(pan, -1, 1)),
        "motion": r3(np.clip(motion, 0, 1)),
        "flashes": int(flashes),
        "value": r3(np.clip(grid.mean() if value is None else value, 0, 1)),
        "grid": [[round(float(v), 2) + 0.0 for v in row] for row in grid],
    }
