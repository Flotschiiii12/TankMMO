#!/usr/bin/env python3
"""Phase 2: cut vehicle hulls/turrets for ALL 5 classes (tiers 1-6) into vehicles/{tier}_{class}_body|turret.png.
Re-uses the helpers of process.py (everything above its `manifest = []` line)."""
import os, sys, json
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'process.py')).read().split('manifest = []')[0]
exec(compile(src, 'process_helpers', 'exec'))
def looks_like_text(img):
    """the generator sometimes prints captions: bright, nearly colourless pixels"""
    a = np.asarray(img.convert('RGBA')); m = a[..., 3] > 40
    if m.sum() == 0: return True
    px = a[..., :3][m].astype(int); bright = (px.min(axis=1) > 190).mean(); sat = (px.max(axis=1) - px.min(axis=1)).mean()
    return bright > 0.45 and sat < 40

def turret_canvas(img, scale_to_body):
    """pivot = centre of the round base: centre of the widest part (the barrel is thin)"""
    a = np.asarray(img)[..., 3] > 40; h = a.sum(axis=0)
    body_cols = np.where(h >= 0.55 * h.max())[0]
    px = (body_cols.min() + body_cols.max()) / 2; ys = np.where(a[:, int(px)])[0]; py = (ys.min() + ys.max()) / 2
    return px, py

CLASSES = ['scout', 'medium', 'heavy', 'artillery', 'support']
PREVIEW = os.path.join(HERE, 'out', 'preview2'); os.makedirs(PREVIEW, exist_ok=True)
manifest2 = []

def front_is_narrow_top(img):
    """vertical vehicle: True when the top third is narrower than the bottom third (the pointed end is the front)"""
    a = np.asarray(img)[..., 3] > 40; H = a.shape[0]
    top = a[: H // 3].sum(axis=1).mean()
    bot = a[-H // 3:].sum(axis=1).mean()
    return top < bot

def orient_right(img):
    """rotate so the barrel (thin end) points right: pick the rotation whose left end is much taller than its right end"""
    best, bs = img, 0.05  # the original orientation wins unless another one is clearly better
    for k, im in enumerate([img, img.rotate(90, expand=True), img.rotate(180, expand=True), img.rotate(270, expand=True)]):
        a = np.asarray(im)[..., 3] > 40; cols = a.sum(axis=0).astype(float); xs = np.nonzero(cols)[0]
        if len(xs) < 20: continue
        c = cols[xs.min(): xs.max() + 1]; n = max(3, int(len(c) * 0.15))
        score = (c[:n].mean() - c[-n:].mean()) / max(1.0, c.max())
        if k == 0: score += 0.05
        if score > bs: best, bs = im, score
    return best

def blobs_filtered(im, merge, min_area):
    out = []
    for sl in blobs(im, merge=merge, min_area=min_area):
        c = cut(im, sl)
        if looks_like_text(c) and c.height < 120: continue
        out.append(sl)
    return out

def grid(im, rows_expected, merge=10, min_area=1500):
    rs = rows_of(blobs_filtered(im, merge, min_area), tol=0.6)
    assert len(rs) == rows_expected and all(len(r) == 5 for r in rs), [len(r) for r in rs]
    return rs

# hull orientation is decided by shape (the pointed end is the front); override per cell with True (front was at the bottom) / False
HULL_FLIP = {}
# turrets the generator drew as complete tanks (with tracks): not usable, the game falls back to its vector turret
SKIP_TURRET = {(6, 'heavy'), (6, 'artillery')}

def build(hulls, turrets, tiers, tag, hull_flip=HULL_FLIP):
    """hulls[(tier,class)] vertical raw cut, turrets[(tier,class)] raw cut."""
    for (ti, cl), hull in hulls.items():
        if ti not in tiers: continue
        flip = (hull_flip or {}).get((ti, cl))
        if flip is None: flip = not front_is_narrow_top(hull)  # front at the bottom -> rotate the other way
        h = hull.rotate(90 if flip else -90, expand=True)
        cw, ch = 600, 500
        body = fit_canvas(h, cw, ch, fill=0.97)
        tur = orient_right(turrets[(ti, cl)])
        px, py = turret_canvas(tur, 1)
        # fit_canvas centres the hull: how tall is the hull in the canvas?
        r = min(cw * 0.97 / h.width, ch * 0.97 / h.height); hull_h = h.height * r
        base_h = (np.asarray(tur)[..., 3][:, int(px)] > 40).sum()
        s = (0.62 * hull_h) / max(1, base_h)
        tur2 = tur.resize((max(1, round(tur.width * s)), max(1, round(tur.height * s))), Image.LANCZOS)
        TW, TH = 660, 420
        canvas = Image.new('RGBA', (TW, TH), (0, 0, 0, 0))
        canvas.paste(tur2, (round(TW * 0.25 - px * s), round(TH * 0.5 - py * s)), tur2)
        manifest2.append(save(body, f'vehicles/{ti}_{cl}_body.png'))
        if (ti, cl) not in SKIP_TURRET: manifest2.append(save(canvas, f'vehicles/{ti}_{cl}_turret.png'))
        # preview: hull + turret composited with the pivot in the body centre (what the game draws)
        pv = Image.new('RGBA', (900, 560), (40, 44, 36, 255)); b = body.copy()
        pv.alpha_composite(b, (150, 30))
        pv.alpha_composite(canvas, (150 + 300 - round(TW * 0.25), 30 + 250 - TH // 2))
        pv.convert('RGB').resize((450, 280)).save(os.path.join(PREVIEW, f'{tag}_{ti}_{cl}.png'))

def load_set(hull_sheet, tur_sheet, tiers, hull_rows, tur_rows):
    him = load(hull_sheet); tim = load(tur_sheet)
    hr = grid(him, hull_rows)
    try: tr = grid(tim, tur_rows)
    except AssertionError:  # phase-1 sheet: barrels run into the next turret, split by turret body (see process.py)
        tr = []
        for row in rows_of(blobs(tim, merge=6), tol=0.6)[:tur_rows]:
            parts = []
            for sl in row: parts += split_columns(tim, sl)
            parts.sort(key=lambda p: p[1].start); assert len(parts) == 5, len(parts); tr.append(parts)
    hulls, turs = {}, {}
    for ri, ti in enumerate(tiers):
        for ci in range(5):
            hulls[(ti, CLASSES[ci])] = cut(him, hr[ri][ci])
            turs[(ti, CLASSES[ci])] = cut(tim, tr[ri][ci], largest=True)
    return hulls, turs

if __name__ == '__main__':
    which = sys.argv[1:] or ['1-3', '4-6']
    if '1-3' in which:
        h, t = load_set('01_fahrzeug_ruempfe.jpg', '02_fahrzeug_tuerme.jpg', [1, 2, 3], 3, 3); build(h, t, {1, 2, 3}, 'a')
    if '4-6' in which:
        h, t = load_set('11_ruempfe_stufe_4_6.jpg', '12_tuerme_stufe_4_6.jpg', [4, 5, 6], 3, 3); build(h, t, {4, 5, 6}, 'b')
    print(len(manifest2), 'files')
