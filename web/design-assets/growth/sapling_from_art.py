"""Reduce the original sapling art (design-assets/sapling-original.png) to the island's pixel grid.

Each target cell takes the majority palette colour of the source pixels it covers, so the design
survives the reduction without blurred in-between colours.
"""
from pathlib import Path
import numpy as np
from PIL import Image
import plants

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent / "sapling-original.png"
PAL = np.array(plants.FOLIAGE[:6] + plants.SOIL[:5] + plants.GOLD[1:5] + plants.FRESH[3:6], float)

def reduce(target_h, cover=0.42, path=SOURCE):
    a = np.asarray(Image.open(path).convert("RGBA")).astype(float)
    al = a[..., 3]
    ys, xs = np.nonzero(al > 128)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    a = a[y0:y1, x0:x1]
    al = al[y0:y1, x0:x1]
    q = ((a[..., None, :3] - PAL[None, None]) ** 2).sum(-1).argmin(-1)
    H = target_h
    W = max(1, round((x1 - x0) * H / (y1 - y0)))
    out = np.zeros((H, W, 4), np.uint8)
    ey = np.linspace(0, y1 - y0, H + 1).astype(int)
    ex = np.linspace(0, x1 - x0, W + 1).astype(int)
    for j in range(H):
        for i in range(W):
            cq = q[ey[j]:ey[j + 1], ex[i]:ex[i + 1]]
            solid = al[ey[j]:ey[j + 1], ex[i]:ex[i + 1]] > 128
            if solid.mean() < cover:
                continue
            vals, counts = np.unique(cq[solid], return_counts=True)
            out[j, i, :3] = PAL[vals[counts.argmax()]]
            out[j, i, 3] = 255
    return out
