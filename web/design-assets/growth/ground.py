"""Ground mask and planting spots on the existing island bitmap (1536x1024 original).

Spots must sit on open grass on the island's top surface: not rock, water, soil, the baked
flowers or the glowing first sprout, which keeps a clear ring around it.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = Path(__file__).resolve().parent
ISLAND = HERE.parent / "island-original.png"
SIZE = (1536, 1024)
# Hand-traced outline of the island's top surface, in island-original.png pixels.
PLATEAU = [(120, 485), (170, 450), (240, 445), (300, 420), (380, 395), (460, 370), (540, 350), (620, 330),
           (700, 318), (780, 312), (860, 318), (930, 330), (1000, 335), (1080, 345), (1150, 360), (1230, 380),
           (1300, 405), (1380, 430), (1420, 470), (1400, 520), (1330, 540), (1250, 560), (1180, 575), (1100, 595),
           (1020, 610), (940, 620), (860, 625), (780, 622), (700, 615), (620, 600), (560, 580), (480, 570),
           (400, 560), (320, 545), (240, 530), (170, 515)]
FIRST_SPROUT = (775, 440)      # the baked glowing sprout and its mound
CLEAR_RING = 95                # foreshortened distance kept clear around it
SPACING = 30                   # Poisson-disk spacing; vertical distance counts 1.9x (ground is foreshortened)

def _hls(rgb):
    r, g, b = [rgb[..., i] / 255.0 for i in range(3)]
    mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b)
    l = (mx + mn) / 2; d = mx - mn
    s = np.where(d == 0, 0, d / (1 - np.abs(2 * l - 1) + 1e-9))
    rc = np.where(d > 0, (mx - r) / (d + 1e-9), 0)
    gc = np.where(d > 0, (mx - g) / (d + 1e-9), 0)
    bc = np.where(d > 0, (mx - b) / (d + 1e-9), 0)
    h = np.where(r == mx, bc - gc, np.where(g == mx, 2 + rc - bc, 4 + gc - rc))
    return (h / 6.0 % 1.0) * 360, l, s

def ground_mask():
    a = np.asarray(Image.open(ISLAND).convert("RGBA")).astype(float)
    h, l, s = _hls(a[..., :3])
    poly = Image.new("L", SIZE, 0)
    ImageDraw.Draw(poly).polygon(PLATEAU, fill=255)
    inside = np.asarray(poly) > 0
    grass = (a[..., 3] > 235) & (h > 60) & (h < 160) & (l > 0.10) & (l < 0.55) & (s > 0.25)
    water = (h >= 160) & (h <= 200) & (s > 0.35) & (l > 0.18)
    rock = (s < 0.20) | (l < 0.09)
    soil = ((h < 45) | (h > 330)) & (l < 0.5)
    bright = l > 0.66
    avoid = (ndimage.binary_dilation(water, iterations=9) | ndimage.binary_dilation(rock, iterations=4)
             | ndimage.binary_dilation(soil, iterations=5) | ndimage.binary_dilation(bright, iterations=7))
    return ndimage.binary_opening(inside & grass & ~avoid, iterations=2)

def plant_spots(mask, seed=7):
    """Poisson-disk spots whose base footprint sits on open ground; returned sorted by (y, x)."""
    rng = np.random.default_rng(seed)
    foot = ndimage.binary_erosion(mask, structure=np.ones((5, 13)))
    ys, xs = np.nonzero(foot)
    cell = SPACING / np.sqrt(2)
    grid, chosen = {}, []
    for i in rng.permutation(len(xs)):
        x, y = int(xs[i]), int(ys[i])
        gx, gy = int(x // cell), int(y // cell)
        near = (p for nx in range(gx - 2, gx + 3) for ny in range(gy - 2, gy + 3) for p in grid.get((nx, ny), ()))
        if all((px - x) ** 2 + ((py - y) * 1.9) ** 2 >= SPACING ** 2 for px, py in near):
            chosen.append((x, y))
            grid.setdefault((gx, gy), []).append((x, y))
    mx, my = FIRST_SPROUT
    chosen = [p for p in chosen if np.hypot(p[0] - mx, (p[1] - my) * 1.9) > CLEAR_RING]
    return sorted(chosen, key=lambda p: (p[1], p[0]))
