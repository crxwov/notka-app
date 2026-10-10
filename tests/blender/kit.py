"""Нотка: набор 3D-иконок бренда. Единый материал (матовый soft-touch), единый свет, авто-кадр.
Запуск: blender.exe --background --python tests/blender/kit.py   env ICONS=heart,vinyl,... SIZE SAMPLES BG=1/0 OUTDIR
Построено поверх icon_logo.py (материал soft_touch, склейка/сглаживание форм)."""
import os, sys, math
os.environ["ICON_BUILD"] = "0"
HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Users\leksik\Documents\Notka\tests\blender"
exec(compile(open(os.path.join(HERE, "icon_logo.py"), encoding="utf-8").read(), "icon_logo.py", "exec"))
import mathutils, bmesh as _bm

SIZE = int(os.environ.get("SIZE", 1400)); SAMPLES = int(os.environ.get("SAMPLES", 96)); BG = os.environ.get("BG", "0") == "1"
KITDIR = os.environ.get("OUTDIR", os.path.join(OUT, "kit")); os.makedirs(KITDIR, exist_ok=True)
sc = bpy.context.scene

# ---------- палитра семейств (все из приложения: слива → малина → коралл → оранж → персик) ----------
FAM = {
    "warm":   [(0.0, "#3E1052"), (0.22, "#A0246C"), (0.52, "#E64A52"), (0.82, "#FF8A4A"), (1.0, "#FFC47E")],
    "rose":   [(0.0, "#560B3A"), (0.35, "#C21F66"), (0.7, "#F2457F"), (1.0, "#FF8CB0")],
    "plum":   [(0.0, "#1A0A2C"), (0.45, "#4A1E6E"), (0.8, "#7A3AA0"), (1.0, "#B07AD8")],
    "cream":  [(0.0, "#C98A78"), (0.5, "#F2BFA6"), (1.0, "#FFE3D0")],
    "orange": [(0.0, "#B02A10"), (0.4, "#EE5A1A"), (0.8, "#FF8E2E"), (1.0, "#FFB85A")],
    "green":  [(0.0, "#1E5A2A"), (0.6, "#4E9A3A"), (1.0, "#9ADA5A")],
}


def mfam(name, fam, rough=0.46, glitter=0.0, grain=1.5, sheen=0.2, axis="Z", flip=False):
    stops = [(p, hexc(c)) for p, c in FAM[fam]]
    if flip: stops = [(1 - p, c) for p, c in reversed(stops)]
    m = soft_touch(name, stops, lo=0.0, hi=1.0, rough=rough, sheen=sheen, glitter=glitter, glitter_col="#FFD8C0", grain=grain, sss=0.05, axis=axis)
    nt = m.node_tree; n = nt.nodes; l = nt.links; b = bsdf(n.values())
    # градиент по границам самого предмета (Generated), а не по абсолютным координатам
    tc = next(x for x in n if x.type == "TEX_COORD"); sep = next(x for x in n if x.type == "SEPXYZ")
    for lk in list(sep.inputs[0].links): l.remove(lk)
    l.new(tc.outputs["Generated"], sep.inputs[0])
    sh = next(x for x in n if x.type == "MATH" and x.operation == "MULTIPLY_ADD")
    sh.inputs[1].default_value = 0.14; sh.inputs[2].default_value = -0.07      # меньше «грязных» пятен цвета
    setv(b, "Coat Weight", 0.28); setv(b, "Coat Roughness", 0.3); setv(b, "Specular IOR Level", 0.6)
    lw = n.new("ShaderNodeLayerWeight"); lw.inputs["Blend"].default_value = 0.3
    ew = n.new("ShaderNodeMath"); ew.operation = "MULTIPLY"; ew.inputs[1].default_value = 0.13
    l.new(lw.outputs["Fresnel"], ew.inputs[0]); l.new(ew.outputs[0], b.inputs["Emission Strength"]); setv(b, "Emission Color", hexc("#FF9A78"))
    return m


def assign(o, m):
    o.data.materials.clear(); o.data.materials.append(m); return o


def pillow(name, o_or_parts, mat_, voxel=0.03, smooth=16):
    parts = o_or_parts if isinstance(o_or_parts, list) else [o_or_parts]
    ob = merge(name, parts, voxel=voxel, smooth=smooth); assign(ob, mat_); return ob


def wtube(name, pts, r, cyclic=False):
    """трубка по точкам (x, z) в мировых координатах, сглаженная"""
    cd = bpy.data.curves.new(name, "CURVE"); cd.dimensions = "3D"; cd.bevel_depth = r; cd.bevel_resolution = 16; cd.resolution_u = 32; cd.use_fill_caps = True
    sp = cd.splines.new("BEZIER"); sp.bezier_points.add(len(pts) - 1); sp.use_cyclic_u = cyclic
    for bp, (x, z) in zip(sp.bezier_points, pts):
        bp.co = (x, 0, z); bp.handle_left_type = bp.handle_right_type = "AUTO"
    return new_obj(name, cd)


def torus(name, R, r, loc=(0, 0, 0), axis_y=True):
    prof = [(R + r * math.cos(2 * math.pi * i / 40), r * math.sin(2 * math.pi * i / 40)) for i in range(41)]
    t = lathe(name, prof, seg=72, smooth_it=0, subsurf=0)
    if axis_y: t.rotation_euler = (math.radians(90), 0, 0)
    t.location = loc; return t


def rbox(name, sx, sy, sz, loc=(0, 0, 0), bevel=0.25, sub=2):
    bm = _bm.new(); _bm.ops.create_cube(bm, size=1.0); me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = new_obj(name, me, loc); o.scale = (sx, sy, sz)
    b = o.modifiers.new("b", "BEVEL"); b.width = bevel / max(sx, sy, sz); b.segments = 6; b.limit_method = "NONE"
    s = o.modifiers.new("s", "SUBSURF"); s.levels = sub; s.render_levels = sub
    for p in o.data.polygons: p.use_smooth = True
    return o


# ================= ИКОНКИ =================
def inflate(name, outline, R=0.9, H=0.95, cuts=22, smooth_outline=0, spacing=None):
    """контур (x, z) -> гладкая «надутая подушка». Равномерная сетка Делоне + уплотнение у края; толщина растёт от края по дуге окружности"""
    import numpy as np
    from mathutils import geometry
    outline = [tuple(p) for p in outline]
    for _ in range(smooth_outline):
        q = []
        for i in range(len(outline)):
            a = outline[i]; b = outline[(i + 1) % len(outline)]
            q += [(a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25), (a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75)]
        outline = q
    P = np.array(outline, float); Q = np.roll(P, -1, axis=0); seg = Q - P; seglen = np.sqrt((seg ** 2).sum(1)); per = seglen.sum()
    s_ = spacing or per / 260.0
    # 1) граница: ресэмпл с шагом s_/1.4
    bnd = []; acc = 0.0; step = s_ / 1.4
    for i in range(len(P)):
        n = max(1, int(round(seglen[i] / step)))
        for k in range(n): bnd.append(tuple(P[i] + seg[i] * (k / n)))
    B = np.array(bnd)
    def dist_to_boundary(pts):
        d = np.full(len(pts), 1e9); ab = Q - P; L2 = (ab ** 2).sum(1) + 1e-12
        for i in range(len(P)):
            t = np.clip(((pts - P[i]) @ ab[i]) / L2[i], 0, 1); proj = P[i] + t[:, None] * ab[i]
            d = np.minimum(d, np.sqrt(((pts - proj) ** 2).sum(1)))
        return d
    def inside(pts):
        x = pts[:, 0]; z = pts[:, 1]; c = np.zeros(len(pts), bool)
        for i in range(len(P)):
            x1, z1 = P[i]; x2, z2 = Q[i]
            cond = ((z1 > z) != (z2 > z)) & (x < (x2 - x1) * (z - z1) / (z2 - z1 + 1e-12) + x1)
            c ^= cond
        return c
    # 2) внутренняя сетка (треугольная) + кольца у края
    mn = P.min(0); mx = P.max(0); pts = []
    zi = 0
    zz = mn[1]
    while zz < mx[1]:
        xx = mn[0] + (0.5 * s_ if zi % 2 else 0.0)
        while xx < mx[0]: pts.append((xx, zz)); xx += s_
        zz += s_ * 0.866; zi += 1
    I = np.array(pts); I = I[inside(I)]; I = I[dist_to_boundary(I) > 0.75 * s_]
    rings = []
    cen = P.mean(0)
    for f in (0.992, 0.978, 0.958, 0.93):
        C = cen + (B - cen) * f
        ok = inside(C) & (dist_to_boundary(C) > 0.18 * s_); rings.append(C[ok][:: max(1, int(round(1.0)))])
    allp = np.vstack([B, I] + rings)
    verts2d = [Vector((float(x), float(z))) for x, z in allp]
    edges = [(i, (i + 1) % len(B)) for i in range(len(B))]
    res = geometry.delaunay_2d_cdt(verts2d, edges, [], 1, 1e-6)
    rv, rf = res[0], res[2]
    bm = _bm.new()
    vs = [bm.verts.new((v.x, 0.0, v.y)) for v in rv]
    for f_ in rf:
        try: bm.faces.new([vs[i] for i in f_])
        except ValueError: pass
    _bm.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    co = np.array([(v.co.x, v.co.z) for v in bm.verts]); d = dist_to_boundary(co)
    k = np.clip(d / R, 0, 1); h = H * np.sqrt(1 - (1 - k) ** 2)
    for v, hh in zip(list(bm.verts), h): v.co.y = -hh
    geom = bm.faces[:]
    dup = _bm.ops.duplicate(bm, geom=geom); nv = [g for g in dup["geom"] if isinstance(g, _bm.types.BMVert)]
    nf = [g for g in dup["geom"] if isinstance(g, _bm.types.BMFace)]
    for v in nv: v.co.y = -v.co.y
    _bm.ops.reverse_faces(bm, faces=nf)
    _bm.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    _bm.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = new_obj(name, me)
    for p_ in me.polygons: p_.use_smooth = True
    sm = o.modifiers.new("sm", "SMOOTH"); sm.factor = 0.5; sm.iterations = 5
    return o


def ic_heart():
    pts = []
    for i in range(180):
        t = 2 * math.pi * i / 180
        pts.append((16 * math.sin(t) ** 3 * 0.25, (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)) * 0.25 + 0.2))
    h = inflate("heart", pts, R=1.5, H=1.3); assign(h, mfam("rose", "rose", glitter=0.03))
    root = new_obj("root", None); h.parent = root; root.rotation_euler = (math.radians(10), math.radians(-24), math.radians(-10)); return root


def ic_vinyl():
    root = new_obj("root", None)
    disc = cyl("disc", 2.5, 0.3, (0, 0, 0), (math.radians(90), 0, 0), bevel=0.08, seg=160)
    m = mfam("vinyl_m", "plum", rough=0.4, grain=1.0, sheen=0.45, axis="Y")
    nt = m.node_tree; n = nt.nodes; l = nt.links; b = bsdf(n.values())
    setv(b, "Metallic", 0.4); setv(b, "Anisotropic", 0.7); setv(b, "Thin Film Thickness", 380.0); setv(b, "Thin Film IOR", 1.7); setv(b, "Coat Weight", 0.5)
    # борозды: кольцевой рельеф по радиусу
    tc = n.new("ShaderNodeTexCoord"); sp = n.new("ShaderNodeSeparateXYZ"); l.new(tc.outputs["Object"], sp.inputs[0])
    x2 = n.new("ShaderNodeMath"); x2.operation = "POWER"; x2.inputs[1].default_value = 2.0; l.new(sp.outputs["X"], x2.inputs[0])
    z2 = n.new("ShaderNodeMath"); z2.operation = "POWER"; z2.inputs[1].default_value = 2.0; l.new(sp.outputs["Y"], z2.inputs[0])
    ad = n.new("ShaderNodeMath"); ad.operation = "ADD"; l.new(x2.outputs[0], ad.inputs[0]); l.new(z2.outputs[0], ad.inputs[1])
    rd = n.new("ShaderNodeMath"); rd.operation = "SQRT"; l.new(ad.outputs[0], rd.inputs[0])
    mu = n.new("ShaderNodeMath"); mu.operation = "MULTIPLY"; mu.inputs[1].default_value = 17.0; l.new(rd.outputs[0], mu.inputs[0])
    fr = n.new("ShaderNodeMath"); fr.operation = "FRACT"; l.new(mu.outputs[0], fr.inputs[0])
    bm = n.new("ShaderNodeBump"); bm.inputs["Strength"].default_value = 1.0; bm.inputs["Distance"].default_value = 0.01
    l.new(fr.outputs[0], bm.inputs["Height"])
    for lk in list(b.inputs["Normal"].links): l.remove(lk)
    l.new(bm.outputs["Normal"], b.inputs["Normal"])
    assign(disc, m); disc.parent = root
    lab = cyl("label", 0.95, 0.36, (0, 0, 0), (math.radians(90), 0, 0), bevel=0.05, seg=96); assign(lab, mfam("label", "warm", glitter=0.03, axis="Y")); lab.parent = root
    hole = cyl("hole", 0.1, 0.42, (0, 0, 0), (math.radians(90), 0, 0), bevel=0, seg=24); assign(hole, mfam("hole", "plum")); hole.parent = root
    root.rotation_euler = (math.radians(14), math.radians(-34), math.radians(-12)); return root


def ic_headphones():
    root = new_obj("root", None)
    band = pillow("band", [wtube("b0", [(-2.25, -0.4), (-2.2, 1.2), (-1.4, 2.5), (0, 3.05), (1.4, 2.5), (2.2, 1.2), (2.25, -0.4)], 0.4)], mfam("band", "plum", rough=0.42), voxel=0.03, smooth=10)
    band.parent = root
    for sx in (-1, 1):
        cup = sphere("cup", 1.0, (0.8, 1.2, 1.25), (sx * 2.45, 0, -0.5), seg=64, rings=32)
        cup_o = pillow("cup_m", [cup], mfam("cup", "warm", glitter=0.03, axis="X", flip=(sx > 0)), voxel=0.035, smooth=12); cup_o.parent = root
        pad = sphere("pad", 1.0, (0.5, 1.05, 1.12), (sx * 1.92, 0, -0.5), seg=48, rings=24)
        pad_o = pillow("pad_m", [pad], mfam("pad", "plum", rough=0.6), voxel=0.04, smooth=8); pad_o.parent = root
    root.rotation_euler = (math.radians(8), math.radians(-24), math.radians(-6)); return root


def ic_gift():
    root = new_obj("root", None)
    mb = mfam("box", "rose", glitter=0.03); mr = mfam("rib", "cream", rough=0.5, grain=1.3)
    box = pillow("box", [rbox("b", 3.6, 3.2, 2.5, (0, 0, -0.55), 0.35)], mb, voxel=0.035, smooth=6); box.parent = root
    lid = pillow("lid", [rbox("l", 3.9, 3.5, 0.95, (0, 0, 1.0), 0.28)], mfam("lid", "rose", glitter=0.03), voxel=0.035, smooth=6); lid.parent = root
    v = pillow("rib_v", [rbox("rv", 0.78, 3.62, 3.6, (0, 0, 0.1), 0.2)], mr, voxel=0.03, smooth=6); v.parent = root
    h = pillow("rib_h", [rbox("rh", 4.0, 0.78, 0.8, (0, 0, 1.1), 0.2)], mr, voxel=0.03, smooth=6); h.parent = root
    loops = []
    for sx in (-1, 1):
        lp = wtube("loop", [(0, 1.75), (sx * 0.9, 2.9), (sx * 1.7, 2.7), (sx * 1.35, 1.8), (sx * 0.55, 1.55)], 0.26, cyclic=True)
        loops.append(lp)
    knot = sphere("knot", 0.5, (1, 1, 0.9), (0, 0, 1.8), seg=32, rings=16)
    bow = pillow("bow", loops + [knot], mfam("bow", "cream", rough=0.5, grain=1.3), voxel=0.025, smooth=10); bow.parent = root
    root.rotation_euler = (math.radians(14), math.radians(-28), math.radians(-6)); return root


def ic_pumpkin():
    root = new_obj("root", None)
    sys.path.insert(0, HERE); import ghost_props as GP; importlib.reload(GP)
    pk = GP.pumpkin((0, 0, 0), 1.6, rot=(0, 0, 0))
    assign(pk, mfam("pk", "orange", glitter=0.025, rough=0.5, grain=1.4)); pk.data.materials.append(glow("pk_glow", "#FF6A12", 2.4))
    for ch in list(pk.children):
        if ch.name.startswith("stem"):
            assign(ch, mfam("stem", "green", rough=0.55, grain=1.2))
    pk.parent = root
    root.rotation_euler = (math.radians(-12), math.radians(-18), math.radians(6)); return root


def ic_percent():
    root = new_obj("root", None)
    r1 = torus("r1", 0.95, 0.36, (-1.15, 0, 1.25)); r2 = torus("r2", 0.95, 0.36, (1.15, 0, -1.25))
    sl = wtube("slash", [(1.9, 2.3), (-1.9, -2.3)], 0.34)
    o = pillow("pct", [r1, r2, sl], mfam("pct", "warm", glitter=0.03), voxel=0.03, smooth=8); o.parent = root
    root.rotation_euler = (math.radians(8), math.radians(-20), math.radians(-6)); return root



import os as _os
FONT = r"C:\Windows\Fontsrialbd.ttf"


def text3d(name, body, size, loc, extrude=0.05, mat_=None):
    cd = bpy.data.curves.new(name, "FONT"); cd.body = body; cd.size = size; cd.extrude = extrude; cd.bevel_depth = 0.012; cd.bevel_resolution = 3
    cd.align_x = "CENTER"; cd.align_y = "CENTER"
    if _os.path.exists(FONT):
        cd.font = bpy.data.fonts.load(FONT); cd.font_bold = cd.font
    o = new_obj(name, cd, loc); o.rotation_euler = (math.radians(90), 0, 0)
    if mat_: cd.materials.append(mat_)
    return o


def ic_card():
    root = new_obj("root", None)
    card = pillow("card", [rbox("c", 5.6, 0.3, 3.5, (0, 0, 0), 0.16)], mfam("card", "warm", glitter=0.03, axis="Z"), voxel=0.03, smooth=4); card.parent = root
    chip = rbox("chip", 0.95, 0.12, 0.75, (-1.85, -0.15, 0.55), 0.1); assign(chip, satin_chrome("chip_m", "#FBE9D6", 0.2)); chip.parent = root
    t = text3d("word", "Нотка", 0.78, (0.25, -0.2, -1.05), 0.06, mfam("eng", "cream", rough=0.35, grain=0.6)); t.parent = root
    root.rotation_euler = (math.radians(22), math.radians(-28), math.radians(-14)); return root


def ic_phone():
    root = new_obj("root", None)
    body = pillow("phone", [rbox("p", 2.5, 0.36, 5.0, (0, 0, 0), 0.5)], mfam("ph", "plum", rough=0.42, sheen=0.4), voxel=0.03, smooth=4); body.parent = root
    scr = rbox("scr", 2.15, 0.06, 4.55, (0, -0.2, 0), 0.34); assign(scr, mfam("screen", "warm", rough=0.38, glitter=0.02, axis="Z")); scr.parent = root
    isl = rbox("isl", 0.7, 0.08, 0.2, (0, -0.24, 2.0), 0.09); assign(isl, mfam("island", "plum", rough=0.3)); isl.parent = root
    root.rotation_euler = (math.radians(10), math.radians(-30), math.radians(-12)); return root


def ic_bat():
    root = new_obj("root", None)
    sys.path.insert(0, HERE); import ghost_props as GP; importlib.reload(GP)
    b = GP.bat((0, 0, 0), 1.7, rot=(0, 0, 0)); b.parent = root
    stack = [b]
    while stack:
        o = stack.pop(); stack += list(o.children)
        if o.type == "MESH":
            names = [m.name for m in o.data.materials if m]
            if any(n_.startswith("bat_in") for n_ in names):
                o.data.materials.clear(); o.data.materials.append(mfam("bat_w", "plum", rough=0.45)); o.data.materials.append(mfam("bat_wi", "rose", rough=0.5))
            elif any(n_.startswith("bat") for n_ in names): assign(o, mfam("bat_b", "plum", rough=0.45))
    root.rotation_euler = (math.radians(6), math.radians(-14), math.radians(-6)); return root


def ic_cassette():
    root = new_obj("root", None)
    body = pillow("cas", [rbox("c", 5.0, 0.8, 3.3, (0, 0, 0), 0.3)], mfam("cas", "plum", rough=0.45, sheen=0.4), voxel=0.03, smooth=4); body.parent = root
    lab = rbox("lab", 4.3, 0.1, 1.9, (0, -0.42, 0.45), 0.12); assign(lab, mfam("lab", "cream", rough=0.5, grain=1.0)); lab.parent = root
    win = rbox("win", 2.5, 0.1, 0.75, (0, -0.5, 0.25), 0.3); assign(win, mfam("win", "plum", rough=0.3)); win.parent = root
    for sx in (-1, 1):
        r_ = torus("reel", 0.34, 0.1, (sx * 0.9, -0.55, 0.25)); assign(r_, mfam("reel", "warm", glitter=0.03)); r_.parent = root
    bot = rbox("bot", 3.2, 0.1, 0.8, (0, -0.42, -1.2), 0.2); assign(bot, mfam("bot", "warm", axis="X", glitter=0.03)); bot.parent = root
    root.rotation_euler = (math.radians(14), math.radians(-24), math.radians(-8)); return root


ICONS = {"heart": ic_heart, "card": ic_card, "phone": ic_phone, "bat": ic_bat, "cassette": ic_cassette, "vinyl": ic_vinyl, "headphones": ic_headphones, "gift": ic_gift, "pumpkin": ic_pumpkin, "percent": ic_percent}


# ---------- общий свет/кадр ----------
def bbox_of(root):
    bpy.context.view_layer.update()
    pts = []
    for o in bpy.data.objects:
        if o.type != "MESH" or o.hide_render: continue
        p = o
        while p and p is not root: p = p.parent
        if p is not root: continue
        for c in o.bound_box: pts.append(o.matrix_world @ Vector(c))
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def stage_for(root, exposure=-0.45):
    lo, hi = bbox_of(root); c = (lo + hi) / 2; R = max((hi - lo)) / 2
    root.location = -c
    for o in list(bpy.data.objects):
        if (o.type in ("LIGHT", "CAMERA") and not o.name.startswith("pk_")) or o.name == "shadowfloor": bpy.data.objects.remove(o, do_unlink=True)
    w = bpy.data.worlds.new("w2"); sc.world = w; w.use_nodes = True; wn = w.node_tree.nodes; wl = w.node_tree.links
    wn.clear(); out_ = wn.new("ShaderNodeOutputWorld"); bg = wn.new("ShaderNodeBackground")
    tcn = wn.new("ShaderNodeTexCoord"); sp = wn.new("ShaderNodeSeparateXYZ"); wl.new(tcn.outputs["Generated"], sp.inputs[0])
    rr = ramp(wn, [(0.0, hexc("#7A4A5E")), (0.5, hexc("#3A2147")), (1.0, hexc("#1E1030"))])
    wl.new(sp.outputs["Z"], rr.inputs["Fac"]); wl.new(rr.outputs["Color"], bg.inputs["Color"]); bg.inputs["Strength"].default_value = 0.55; wl.new(bg.outputs[0], out_.inputs[0])
    k = R / 2.4; tgt = (0, 0, 0)
    def A(n_, loc, col, p, sx_, sy_): area(n_, tuple(v * k for v in loc), tgt, hexc(col), p * k * k, sx_ * k, sy_ * k)
    A("key", (-10, -4, 6), "#FFE6D0", 1700, 4, 6); A("rim_warm", (8, 5, 2.5), "#FF8A3C", 8000, 1.6, 9); A("rim_pink", (-8, 5, 1.5), "#FF4F9A", 8000, 1.6, 9)
    A("fill", (6, -8, -2), "#B9A3FF", 140, 6, 4); A("bounce", (5, -6, -4), "#D0307A", 500, 5, 4); A("top", (0, -2, 9), "#FFFFFF", 200, 6, 2)
    lens = 55; fov = 2 * math.atan(18 / lens); dist = R / math.tan(fov / 2) * 1.32
    d = Vector((0.2, -1.0, 0.16)).normalized(); loc = d * dist
    cd = bpy.data.cameras.new("cam"); cd.lens = lens; cd.sensor_width = 36; cam = new_obj("cam", cd, loc); sc.camera = cam
    cam.rotation_euler = (Vector(tgt) - loc).to_track_quat("-Z", "Y").to_euler()
    cd.dof.use_dof = True; cd.dof.aperture_fstop = 9.0; cd.dof.focus_distance = dist
    fm = bpy.data.meshes.new("shadowfloor"); bm = _bm.new(); _bm.ops.create_grid(bm, x_segments=2, y_segments=2, size=80); bm.to_mesh(fm); bm.free()
    fo = new_obj("shadowfloor", fm, (0, 0, -R * 1.18)); fo.is_shadow_catcher = True
    sc.render.engine = "CYCLES"; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True; sc.cycles.max_bounces = 12
    sc.render.resolution_x = sc.render.resolution_y = SIZE; sc.render.film_transparent = not BG
    for tr in ("AgX", "Filmic"):
        try: sc.view_settings.view_transform = tr; break
        except TypeError: pass
    for cand in ("AgX - High Contrast", "High Contrast"):
        try: sc.view_settings.look = cand; break
        except TypeError: pass
    sc.view_settings.exposure = exposure
    sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"


def build_and_render(name, tag="prev"):
    clear_all()
    for w_ in list(bpy.data.worlds): bpy.data.worlds.remove(w_)
    root = ICONS[name]()
    stage_for(root)
    sc.render.filepath = os.path.join(KITDIR, "%s_%s.png" % (tag, name))
    bpy.ops.render.render(write_still=True)
    print("rendered", sc.render.filepath)


if os.environ.get("KIT_RUN", "1") == "1" and bpy.app.background:
    for nm in os.environ.get("ICONS", ",".join(ICONS)).split(","):
        try: build_and_render(nm.strip(), os.environ.get("TAG", "prev"))
        except Exception as e:
            import traceback; traceback.print_exc(); print("FAILED", nm, e)
