"""One Stillwild plant species in five stages, drawn as pixel art in the island's own colour ramps.

Sprites are built on a logical pixel grid. One logical pixel is 3 px on the 1536-wide island
original (design-assets/island-original.png), close to the island's own ~3.2 px grid. The app
scales sprites with the island, so they keep that density at any size.
"""
import math
import numpy as np

def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

# Ramps sampled from island-original.png (k-means over opaque pixels; soil from the sprout mound).
SOIL = [hexrgb(c) for c in ("#20130c", "#3d2815", "#583a1a", "#764e1c", "#97651c", "#b77d18")]
FOLIAGE = [hexrgb(c) for c in ("#072b17", "#0b3d24", "#17562a", "#2e7a42", "#4f9c60", "#8ec187", "#abedd4")]
FRESH = [hexrgb(c) for c in ("#1b4218", "#335b20", "#487126", "#62872a", "#8a9f34", "#b9c95a")]
GOLD = [hexrgb(c) for c in ("#6c5b1b", "#9d7919", "#b77d18", "#dcb92e", "#eae189", "#f3f7d8")]
PETAL = [hexrgb(c) for c in ("#c9b878", "#e6dca0", "#f3f7d8")]
SHADOW = (8, 30, 14)

STAGES = ("mound", "sprout", "sapling", "shrub", "flowering")

class Sprite:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.rgb = np.zeros((h, w, 3), np.uint8)
        self.a = np.zeros((h, w), np.uint8)

    def put(self, x, y, c, a=255):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.rgb[y, x] = c
            self.a[y, x] = a

    def filled(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h and self.a[y, x] > 0

    def rgba(self):
        return np.dstack([self.rgb, self.a])

def _hash(*values):
    x = 2166136261
    for n in values:
        x = (x ^ (int(n) & 0xFFFFFFFF)) * 16777619 & 0xFFFFFFFF
    return x / 0xFFFFFFFF

# ---------------------------------------------------------------- primitives

def mound(sp, cx, base, width, glint=True):
    """Soft soil mound, wider than tall (the island is seen from above at an angle)."""
    half = width / 2
    height = max(2, round(width * 0.42))
    for y in range(base - height, base + 1):
        t = (base - y) / height
        span = half * math.sqrt(max(0.0, 1 - t ** 1.6))
        for x in range(int(round(cx - span)), int(round(cx + span)) + 1):
            dx = (x - cx) / max(half, 1)
            light = -0.6 * dx + 0.8 * t + (_hash(x, y, width) - 0.5) * 0.5
            k = 1 if light < -0.1 else 2 if light < 0.35 else 3 if light < 0.75 else 4
            if y == base:
                k = max(0, k - 1)
            sp.put(x, y, SOIL[k])
    for y in range(base - height, base + 1):
        for x in range(int(cx - half) - 1, int(cx + half) + 2):
            if sp.filled(x, y) and (not sp.filled(x + 1, y) or not sp.filled(x, y + 1)):
                sp.put(x, y, SOIL[0])
    if glint:
        sp.put(int(round(cx)), base - height + 1, GOLD[4])
        sp.put(int(round(cx)) + 1, base - height + 1, GOLD[3])
        sp.put(int(round(cx)) - 2, base - 1, GOLD[2])

def trunk(sp, x, base, height):
    for y in range(base - height, base + 1):
        sp.put(x, y, SOIL[3])
        sp.put(x + 1, y, SOIL[1])

def outline(sp, dark, rim=None, skip=()):
    """Selective outline: dark on lower/right silhouette edges, optional rim light on upper/left edges."""
    h, w = sp.a.shape
    filled = sp.a > 0
    out = []
    for y in range(h):
        for x in range(w):
            if not filled[y, x] or tuple(sp.rgb[y, x]) in skip:
                continue
            down = y + 1 >= h or not filled[y + 1, x]
            right = x + 1 >= w or not filled[y, x + 1]
            up = y - 1 < 0 or not filled[y - 1, x]
            left = x - 1 < 0 or not filled[y, x - 1]
            if down or right:
                out.append((x, y, dark))
            elif rim is not None and (up or left):
                out.append((x, y, rim))
    for x, y, c in out:
        sp.rgb[y, x] = c

def bud(sp, x, y):
    sp.put(x, y, GOLD[4]); sp.put(x + 1, y, GOLD[3]); sp.put(x, y + 1, GOLD[3]); sp.put(x + 1, y + 1, GOLD[1])

def flower(sp, x, y):
    """4x4 blossom: cream petals around a gold centre, matching the island's ground flowers."""
    pattern = [".pp.",
               "pccP",
               "pCcP",
               ".PP."]
    cols = {"p": PETAL[2], "P": PETAL[1], "c": GOLD[3], "C": GOLD[2]}
    for j, row in enumerate(pattern):
        for i, ch in enumerate(row):
            if ch != ".":
                sp.put(x + i, y + j, cols[ch])

def blob(sp, cx, cy, r, depth, key, ids, blob_id):
    """A rounded leaf cluster lit from the upper left; depth 0 = front, 1 = back (darker)."""
    for y in range(int(cy - r) - 1, int(cy + r) + 2):
        for x in range(int(cx - r) - 1, int(cx + r) + 2):
            dx, dy = (x - cx) / r, (y - cy) / r
            d = dx * dx + dy * dy
            if d > 1 + (_hash(x, y, key) - 0.5) * 0.45:
                continue
            light = (-0.62 * dx - 0.78 * dy) * 0.9 + (1 - d) * 0.2
            tone = 1 if light < -0.2 else 2 if light < 0.25 else 3 if light < 0.62 else 4
            if _hash(x, y, key + 7) > 0.86:
                tone += 1 if light > 0.35 else -1
            tone -= depth
            sp.put(x, y, FOLIAGE[max(1, min(len(FOLIAGE) - 2, tone))])
            if 0 <= x < sp.w and 0 <= y < sp.h:
                ids[y, x] = blob_id

def ground_shadow(sp, cx, base, half):
    for x in range(int(cx - half), int(cx + half) + 1):
        if not sp.filled(x, base):
            sp.put(x, base, SHADOW, 150)
    for x in range(int(cx - half * 0.6), int(cx + half * 0.6) + 1):
        if not sp.filled(x, base + 1):
            sp.put(x, base + 1, SHADOW, 90)

# ---------------------------------------------------------------- the five stages

def make_mound(seed):
    rnd = np.random.default_rng(seed)
    sp = Sprite(15, 8); cx, base = 7, 6
    mound(sp, cx, base, 10)
    ground_shadow(sp, cx, base, 5)
    if rnd.random() < 0.7:
        sp.put(cx + 3, base - 4, GOLD[3], 200)            # a sowing sparkle above the soil
    return sp.rgba(), cx, base + 1

SPROUT = [".hl...lh.",
          "hllm.mllO",
          ".mmdsdmO.",
          "..OOsOO..",
          "....s...."]

def make_sprout(seed):
    """Two-leaf sprout echoing the island's golden first sprout, in fresh green."""
    rnd = np.random.default_rng(seed)
    keys = {"h": FRESH[5], "l": FRESH[4], "m": FRESH[3], "d": FRESH[2], "O": FRESH[0], "s": FRESH[2]}
    sp = Sprite(15, 13); cx, base = 7, 11
    lean = int(rnd.integers(-1, 2))                       # tiny variation in where the sprout sits
    top = base - 3 - len(SPROUT) + 1
    for j, row in enumerate(SPROUT):
        for i, ch in enumerate(row):
            if ch in keys:
                sp.put(cx - 4 + i + (lean if j < 3 else 0), top + j, keys[ch])
    mound(sp, cx, base, 7, glint=False)
    sp.put(cx + 3, top - 1, GOLD[4], 210)                 # a faint glint of the first seed's light
    ground_shadow(sp, cx, base, 4)
    return sp.rgba(), cx, base + 1

def make_sapling(art, mirror):
    """Steven's original sapling art, reduced to the island's pixel grid."""
    if mirror:
        art = art[:, ::-1]
    h, w = art.shape[:2]
    sp = Sprite(w + 6, h + 3); cx, base = (w + 6) // 2, h + 1
    sp.rgb[1:h + 1, 3:w + 3] = art[..., :3]
    sp.a[1:h + 1, 3:w + 3] = art[..., 3]
    ground_shadow(sp, cx, base, 4)
    return sp.rgba(), cx, base + 1

def make_shrub(seed, size, flowering):
    rnd = np.random.default_rng(seed)
    r0, width, height = 3.9 * size, 8.4 * size, 11.5 * size
    sp = Sprite(48, 44); cx, base = 24, 40
    trunk(sp, cx, base, 5)
    clusters = []
    for i in range(9):
        ang = math.pi * (0.08 + 0.84 * i / 8)
        clusters.append((cx + math.cos(ang) * width * rnd.uniform(0.75, 1.0),
                         base - 6 - math.sin(ang) * height * rnd.uniform(0.55, 0.8),
                         r0 * rnd.uniform(0.8, 1.1), 1))
    clusters.append((cx + rnd.uniform(-1.5, 1.5), base - 6 - height * 0.62, r0 * 1.1, 0))
    clusters.append((cx - width * 0.45, base - 6 - height * 0.25, r0 * 0.95, 0))
    clusters.append((cx + width * 0.45, base - 6 - height * 0.3, r0 * 0.9, 0))
    clusters.append((cx + rnd.uniform(-1, 1), base - 5 - height * 0.15, r0 * 1.0, 0))
    clusters.sort(key=lambda c: (-c[3], c[1]))
    ids = np.full((sp.h, sp.w), -1, int)
    for k, (x, y, r, depth) in enumerate(clusters):
        blob(sp, x, y, r, depth, seed * 31 + k, ids, k)
    # a dark seam where a nearer cluster overlaps the one behind it gives the bush its lumps
    seam = []
    for yy in range(1, sp.h - 1):
        for xx in range(1, sp.w - 1):
            if ids[yy, xx] < 0:
                continue
            for ox, oy in ((0, -1), (-1, 0)):
                j = ids[yy + oy, xx + ox]
                if 0 <= j < ids[yy, xx] and _hash(xx, yy, seed) > 0.15:
                    seam.append((xx + ox, yy + oy))
    for xx, yy in seam:
        sp.rgb[yy, xx] = FOLIAGE[1]
    outline(sp, FOLIAGE[0], rim=FOLIAGE[4], skip={SOIL[3], SOIL[1]})
    tips = 0
    for _ in range(40):                                   # leaf tips breaking the silhouette
        ang = rnd.uniform(0.05, 0.95) * math.pi
        tx = int(round(cx + math.cos(ang) * (width + r0 * 0.7)))
        ty = int(round(base - 6 - math.sin(ang) * (height * 0.68 + r0 * 0.6)))
        if not sp.filled(tx, ty) and (sp.filled(tx, ty + 1) or sp.filled(tx - 1, ty) or sp.filled(tx + 1, ty)):
            sp.put(tx, ty, FOLIAGE[3] if ang > math.pi / 2 else FOLIAGE[2])
            tips += 1
        if tips >= 7:
            break
    if flowering:
        spots = []
        for _ in range(40):
            fx = int(round(cx + rnd.uniform(-width, width) * 0.85))
            fy = int(round(base - 6 - rnd.uniform(0.25, 1.0) * height * 0.95))
            if all(abs(fx - a) >= 4 or abs(fy - b) >= 4 for a, b in spots) \
                    and sp.filled(fx + 1, fy + 2) and sp.filled(fx + 2, fy + 1):
                spots.append((fx, fy))
            if len(spots) >= 5:
                break
        for fx, fy in spots:
            flower(sp, fx - 1, fy - 1)
    else:
        for _ in range(2):
            bx = int(round(cx + rnd.uniform(-width, width) * 0.7))
            by = int(round(base - 6 - rnd.uniform(0.5, 0.95) * height))
            if sp.filled(bx, by + 2):
                bud(sp, bx, by)
    ground_shadow(sp, cx, base + 1, width * 0.95)
    return sp.rgba(), cx, base + 2
