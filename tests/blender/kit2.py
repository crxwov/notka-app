"""Нотка: набор 3D-иконок v2, студийная детализация.
Запуск: blender.exe --background --python tests/blender/kit2.py   env ICONS=headphones,... SIZE SAMPLES BG TAG OUTDIR PARTICLES=1/0
Надстройка над kit.py: слойные материалы (лак+кромка+AO+царапины+следы), мелкие детали, три слоя глубины, композитор, GPU."""
import os, sys, math, random
os.environ["KIT_RUN"] = "0"
HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Users\leksik\Documents\Notka\tests\blender"
exec(compile(open(os.path.join(HERE, "kit.py"), encoding="utf-8").read(), "kit.py", "exec"))

PARTICLES = os.environ.get("PARTICLES", "1") == "1"
random.seed(21)


# ================= GPU =================
def use_gpu():
    try:
        pr = bpy.context.preferences.addons["cycles"].preferences
        for dt in ("OPTIX", "CUDA"):
            try:
                pr.compute_device_type = dt; pr.get_devices()
                if any(d.type == dt for d in pr.devices): break
            except Exception: pass
        for d in pr.devices: d.use = (d.type in ("OPTIX", "CUDA")) and (d.type == pr.compute_device_type)
        sc.cycles.device = "GPU"
        try: sc.cycles.denoiser = "OPENIMAGEDENOISE"
        except Exception: pass
        return True
    except Exception as e:
        print("GPU setup failed:", e); return False


# ================= слойный материал =================
def pro(name, fam, rough=0.46, glitter=0.0, grain=1.5, sheen=0.2, axis="Z", flip=False, ao_dist=0.3, scratch=0.35, smudge=True, coat=0.3, edge=0.16, leather=0.0):
    """база (мягкий soft-touch, градиент) + лак + затемнение углублений (AO) + светлая кромка (Bevel) + микроцарапины + следы на лаке"""
    m = mfam(name, fam, rough=rough, glitter=glitter, grain=grain, sheen=sheen, axis=axis, flip=flip)
    nt = m.node_tree; n = nt.nodes; l = nt.links; b = bsdf(n.values())
    # 1) база цвета
    src = b.inputs["Base Color"].links[0].from_socket
    # 2) AO: углубления темнее
    ao = n.new("ShaderNodeAmbientOcclusion"); ao.inputs["Distance"].default_value = ao_dist; ao.samples = 6
    l.new(src, ao.inputs["Color"])
    mx = n.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.inputs["Factor"].default_value = 0.7
    l.new(src, mx.inputs["A"]); l.new(ao.outputs["Color"], mx.inputs["B"])
    # 3) кромка: bevel-нормаль против геометрической
    bv = n.new("ShaderNodeBevel"); bv.inputs["Radius"].default_value = 0.02; bv.samples = 6
    for x_ in n:      # приглушить общую подсветку кромки из базового материала
        if x_.type == "MATH" and x_.operation == "MULTIPLY" and abs(x_.inputs[1].default_value - 0.13) < 1e-6: x_.inputs[1].default_value = 0.05
    gm = n.new("ShaderNodeNewGeometry")
    dt = n.new("ShaderNodeVectorMath"); dt.operation = "DOT_PRODUCT"; l.new(bv.outputs["Normal"], dt.inputs[0]); l.new(gm.outputs["Normal"], dt.inputs[1])
    sb = n.new("ShaderNodeMath"); sb.operation = "SUBTRACT"; sb.inputs[0].default_value = 1.0; l.new(dt.outputs["Value"], sb.inputs[1])
    em = n.new("ShaderNodeMapRange"); em.inputs["From Min"].default_value = 0.0; em.inputs["From Max"].default_value = 0.07
    l.new(sb.outputs[0], em.inputs["Value"])
    lt = n.new("ShaderNodeMix"); lt.data_type = "RGBA"; lt.inputs["B"].default_value = hexc("#FFE2CC")
    l.new(em.outputs["Result"], lt.inputs["Factor"]); l.new(mx.outputs["Result"], lt.inputs["A"])
    ef = n.new("ShaderNodeMath"); ef.operation = "MULTIPLY"; ef.inputs[1].default_value = edge; l.new(em.outputs["Result"], ef.inputs[0])
    l.new(ef.outputs[0], lt.inputs["Factor"])
    l.new(lt.outputs["Result"], b.inputs["Base Color"])
    # 4) царапины: вытянутый шум по двум направлениям
    tc = n.new("ShaderNodeTexCoord")
    def scr(sx, sy, sz, sc_):
        mp = n.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (sx, sy, sz); l.new(tc.outputs["Object"], mp.inputs["Vector"])
        nz = n.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = sc_; nz.inputs["Detail"].default_value = 0.0; l.new(mp.outputs["Vector"], nz.inputs["Vector"])
        mr = n.new("ShaderNodeMapRange"); mr.inputs["From Min"].default_value = 0.66; mr.inputs["From Max"].default_value = 0.69
        l.new(nz.outputs["Fac"], mr.inputs["Value"]); return mr.outputs["Result"]
    s1 = scr(1.0, 45.0, 1.0, 8.0); s2 = scr(40.0, 1.0, 1.0, 6.0)
    ad = n.new("ShaderNodeMath"); ad.operation = "ADD"; l.new(s1, ad.inputs[0]); l.new(s2, ad.inputs[1])
    sh = n.new("ShaderNodeMath"); sh.operation = "MULTIPLY"; sh.inputs[1].default_value = scratch; l.new(ad.outputs[0], sh.inputs[0])
    bm1 = next(x for x in n if x.type == "BUMP")
    bm2 = n.new("ShaderNodeBump"); bm2.inputs["Strength"].default_value = 0.6; bm2.inputs["Distance"].default_value = 0.004
    l.new(sh.outputs[0], bm2.inputs["Height"]); l.new(bm1.outputs["Normal"], bm2.inputs["Normal"]); l.new(bm2.outputs["Normal"], b.inputs["Normal"])
    if leather:
        vr = n.new("ShaderNodeTexVoronoi"); vr.feature = "DISTANCE_TO_EDGE"; vr.inputs["Scale"].default_value = 28.0; l.new(tc.outputs["Object"], vr.inputs["Vector"])
        lm = n.new("ShaderNodeMapRange"); lm.inputs["From Min"].default_value = 0.0; lm.inputs["From Max"].default_value = 0.14; l.new(vr.outputs["Distance"], lm.inputs["Value"])
        bm3 = n.new("ShaderNodeBump"); bm3.inputs["Strength"].default_value = leather; bm3.inputs["Distance"].default_value = 0.006
        l.new(lm.outputs["Result"], bm3.inputs["Height"]); l.new(bm2.outputs["Normal"], bm3.inputs["Normal"])
        for lk in list(b.inputs["Normal"].links): l.remove(lk)
        l.new(bm3.outputs["Normal"], b.inputs["Normal"])
    # 5) следы на лаке: крупная неоднородность шероховатости лака + царапины режут лак
    if smudge:
        sn = n.new("ShaderNodeTexNoise"); sn.inputs["Scale"].default_value = 2.6; sn.inputs["Detail"].default_value = 5; l.new(tc.outputs["Object"], sn.inputs["Vector"])
        sr = n.new("ShaderNodeMapRange"); sr.inputs["To Min"].default_value = 0.14; sr.inputs["To Max"].default_value = 0.55; l.new(sn.outputs["Fac"], sr.inputs["Value"])
        l.new(sr.outputs["Result"], b.inputs["Coat Roughness"])
    setv(b, "Coat Weight", coat)
    return m


# ================= мелкие детали =================
def screw(name, loc, r=0.1, axis="Y", mat_=None, slot_mat=None, depth=0.07):
    rot = {"Y": (math.radians(90), 0, 0), "X": (0, math.radians(90), 0), "Z": (0, 0, 0)}[axis]
    o = cyl(name, r, depth, loc, rot, bevel=r * 0.35, seg=24); assign(o, mat_)
    return o


def mini_cyl(name, r, d, loc, rot, mat_, bevel=0.02, seg=32):
    return assign(cyl(name, r, d, loc, rot, bevel=bevel, seg=seg), mat_)


def stitch_ring(name, cx, cy, cz, R, n, size, axis="X", mat_=None, parent=None):
    """строчка из мелких капсул по окружности (ось axis)"""
    objs = []
    for i in range(n):
        a = 2 * math.pi * i / n
        if axis == "X": p = (cx, cy + R * math.cos(a), cz + R * math.sin(a)); rot = (a + math.pi / 2, 0, 0)
        elif axis == "Y": p = (cx + R * math.cos(a), cy, cz + R * math.sin(a)); rot = (math.pi / 2, 0, a)
        else: p = (cx + R * math.cos(a), cy + R * math.sin(a), cz); rot = (0, 0, a + math.pi / 2)
        s = sphere(name, size, (1.0, 0.38, 0.38), p, seg=12, rings=6); s.rotation_euler = rot
        if axis == "X": s.rotation_euler = (0, 0, 0); s.scale = (0.38, 1.0, 0.38); s.rotation_euler = (a, 0, 0)
        assign(s, mat_); objs.append(s)
        if parent: s.parent = parent
    return objs


def stitch_path(name, pts, size, mat_=None, parent=None, flat_y=True):
    objs = []
    for (x, y, z), (x2, y2, z2) in zip(pts[:-1], pts[1:]):
        mid = ((x + x2) / 2, (y + y2) / 2, (z + z2) / 2)
        d = Vector((x2 - x, y2 - y, z2 - z)); L = d.length
        s = sphere(name, size, (1.0, 0.45, 0.45), mid, seg=12, rings=6); s.scale = (max(L * 0.32 / size, 0.4), 0.5, 0.5)
        s.rotation_euler = Vector((1, 0, 0)).rotation_difference(d.normalized()).to_euler()
        assign(s, mat_); objs.append(s)
        if parent: s.parent = parent
    return objs


def arc_pts(cx, cz, a_, b_, a0, a1, n, y=0.0):
    return [(cx + a_ * math.cos(math.radians(a0 + (a1 - a0) * i / n)), y, cz + b_ * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def mini_note_mesh(mat_):
    """маленькая нота-знак (для эмбосса и частиц)"""
    hd = ball("mn_h", *HEAD, ysc=0.45)
    st = tube("mn_s", [(STEM_BASE, None, (13.8, 11.0)), (STEM_TOP, (13.8, 6.8), (16.5, 3.8)), (FLAG_END, (19.1, 5.6), None)])
    o = merge("mn", [hd, st, ball("mc0", STEM_BASE, 1.45), ball("mc1", FLAG_END, 1.45)], voxel=0.03, smooth=10)
    assign(o, mat_); return o


# ================= НАУШНИКИ (глубокая версия) =================
def ic_headphones2():
    root = new_obj("root", None)
    plum = pro("hp_plum", "plum", rough=0.42, sheen=0.4, grain=1.2)
    warm = pro("hp_warm", "warm", rough=0.34, glitter=0.03, axis="Z", coat=0.7)
    cream = pro("hp_cream", "cream", rough=0.5, grain=1.6, scratch=0.12, leather=0.55, coat=0.35)
    chrome = satin_chrome("hp_chrome", "#F8EEE4", 0.22, 520.0)
    dark = pro("hp_dark", "plum", rough=0.55, grain=2.0, scratch=0.0, smudge=False, ao_dist=0.12, edge=0.0)
    BX = 2.62
    # ---- оголовье: наружная дуга + мягкая подушка снизу + строчка
    arc_out = arc_pts(0, 0.25, BX, 2.95, 180, 0, 28)
    band = pillow("band", [wtube("b0", [(p[0], p[2]) for p in arc_out], 0.3)], plum, voxel=0.03, smooth=8); band.parent = root
    arc_in = arc_pts(0, -0.05, BX - 0.05, 2.78, 38, 142, 16)
    cush = pillow("cush", [wtube("c0", [(p[0], p[2]) for p in arc_in], 0.4)], cream, voxel=0.03, smooth=8); cush.parent = root
    pts = [(p[0], -0.34, p[2] - 0.12) for p in arc_pts(0, -0.05, BX - 0.05, 2.78, 42, 138, 40)]
    stitch_path("st_c", pts, 0.06, dark, root)
    # канавка-стык подушки и дуги по краям
    for sx in (-1, 1):
        ang = 38 if sx > 0 else 142
        gx = (BX - 0.05) * math.cos(math.radians(ang)); gz = -0.05 + 2.78 * math.sin(math.radians(ang))
        gr = torus("seamring", 0.38, 0.03, (gx, 0, gz), axis_y=False); gr.rotation_euler = (math.radians(90), 0, math.radians(90 + (-52 if sx > 0 else 52))); assign(gr, dark); gr.parent = root
    # ---- слайдеры с насечками + колпачки
    for sx in (-1, 1):
        sl = pillow("slider", [rbox("sl", 0.46, 0.3, 0.85, (sx * BX, 0, -0.08), 0.1)], chrome, voxel=0.025, smooth=3); sl.parent = root
        for k in range(5):
            tick = rbox("tick", 0.5, 0.34, 0.035, (sx * BX, 0, 0.22 - k * 0.14), 0.012); assign(tick, dark); tick.parent = root
        cap = pillow("slcap", [rbox("sc", 0.62, 0.4, 0.2, (sx * BX, 0, 0.42), 0.08)], plum, voxel=0.025, smooth=3); cap.parent = root
    # ---- чашки (масштаб s)
    s_ = 0.82
    for sx in (-1, 1):
        cx = sx * 3.05; cz = -1.55
        arm = pillow("arm", [wtube("a0", [(sx * BX, -0.5), (sx * 2.85, -0.78), (cx, -0.98)], 0.19)], plum, voxel=0.025, smooth=6); arm.parent = root
        prof = [(0.0 * s_, 0.46 * s_), (0.82 * s_, 0.46 * s_), (0.9 * s_, 0.58 * s_), (1.28 * s_, 0.58 * s_), (1.44 * s_, 0.42 * s_), (1.48 * s_, 0.1 * s_), (1.48 * s_, -0.32 * s_), (1.38 * s_, -0.46 * s_), (1.1 * s_, -0.5 * s_), (0.0, -0.5 * s_)]
        shell = lathe("shell", prof, seg=96, smooth_it=1, subsurf=2); assign(shell, warm)
        shell.rotation_euler = (0, math.radians(90 * sx), 0); shell.location = (cx, 0, cz); shell.parent = root
        cap = mini_cyl("capdisc", 0.8 * s_, 0.05, (cx + sx * 0.48 * s_, 0, cz), (0, math.radians(90), 0), plum, 0.015, 64); cap.parent = root
        note = mini_note_mesh(pro("hp_note", "warm", glitter=0.04, rough=0.5, axis="Z"))
        note.scale = (0.17, 0.17, 0.17); note.location = (cx + sx * 0.52 * s_, 0, cz); note.rotation_euler = (0, 0, math.radians(90 * sx)); note.parent = root
        for rr, zz in ((0.86, 0.5), (1.3, 0.55), (1.46, 0.0)):
            g = torus("groove", rr * s_, 0.022, (cx + sx * zz * s_, 0, cz), axis_y=False); g.rotation_euler = (0, math.radians(90), 0); assign(g, dark); g.parent = root
        for i in range(6):
            a = 2 * math.pi * i / 6
            sc_ = screw("scr", (cx + sx * 0.6 * s_, 1.12 * s_ * math.cos(a), cz + 1.12 * s_ * math.sin(a)), 0.06, "X", chrome); sc_.parent = root
        btn = mini_cyl("btn", 0.1, 0.07, (cx, 1.5 * s_, cz + 0.1), (math.radians(90), 0, 0), dark, 0.025, 24); btn.parent = root
        port = rbox("port", 0.3, 0.18, 0.09, (cx, 1.5 * s_, cz - 0.4), 0.035); assign(port, dark); port.parent = root
        pad_prof = [(0.7 * s_, -0.46 * s_), (1.0 * s_, -0.62 * s_), (1.3 * s_, -0.82 * s_), (1.42 * s_, -1.06 * s_), (1.3 * s_, -1.28 * s_), (1.0 * s_, -1.34 * s_), (0.74 * s_, -1.18 * s_), (0.6 * s_, -0.9 * s_), (0.7 * s_, -0.46 * s_)]
        pad = lathe("pad", pad_prof, seg=96, smooth_it=1, subsurf=2); assign(pad, cream)
        pad.rotation_euler = (0, math.radians(90 * sx), 0); pad.location = (cx, 0, cz); pad.parent = root
        stitch_ring("st_pad", cx - sx * 0.84 * s_, 0, cz, 1.2 * s_, 44, 0.06, "X", dark, root)
        mesh = mini_cyl("mesh", 0.62 * s_, 0.05, (cx - sx * 0.95 * s_, 0, cz), (0, math.radians(90), 0), dark, 0.01, 48); mesh.parent = root
    root.rotation_euler = (math.radians(9), math.radians(-9), math.radians(-34)); return root


exec(compile(open(os.path.join(HERE, "kit2_a.py"), encoding="utf-8").read(), "kit2_a.py", "exec"))
exec(compile(open(os.path.join(HERE, "kit2_b.py"), encoding="utf-8").read(), "kit2_b.py", "exec"))
exec(compile(open(os.path.join(HERE, "kit2_c.py"), encoding="utf-8").read(), "kit2_c.py", "exec"))
ICONS2 = {"headphones": ic_headphones2, "vinyl": ic_vinyl2, "heart": ic_heart2, "gift": ic_gift2, "pumpkin": ic_pumpkin2,
          "card": ic_card2, "phone": ic_phone2, "tag": ic_tag2, "bat": ic_bat2, "cassette": ic_cassette2,
          "envelope": ic_envelope, "mic": ic_mic, "chat": ic_chat}
ICONS2.update(SMALLS)
ICONS2["logo"] = sm_note
ICONS.update(ICONS2)


# ================= сцена: три слоя, свет, композитор =================
def particles(R, cam_loc, tgt):
    """передний план (крупные, размытые), средние и задний план; выбор мелочи под бренд"""
    cam_fwd = (Vector(tgt) - cam_loc).normalized(); right = cam_fwd.cross(Vector((0, 0, 1))).normalized(); up = right.cross(cam_fwd).normalized()
    dist = (Vector(tgt) - cam_loc).length; tanh = math.tan(math.atan(18 / 55)); objs = []
    cols = ["warm", "rose", "cream", "orange"]
    mats = {c: pro("pt_" + c, c, rough=0.4, glitter=0.0, grain=0.8, scratch=0.0, smudge=False, coat=0.5) for c in cols}
    glow_m = glow("pt_glow", "#FFD6A8", 3.0); note_m = pro("pt_note", "warm", rough=0.45)
    mnote = mini_note_mesh(note_m); mnote.hide_render = True; mnote.location = (0, 0, -50)
    def place(depth, spread, size, kind):
        px = random.uniform(-spread, spread) * depth * tanh; py = random.uniform(-spread, spread) * depth * tanh
        pos = cam_loc + cam_fwd * depth + right * px + up * py
        if kind == "confetti":
            o = rbox("cf", size * 1.6, size * 0.1, size * 0.7, tuple(pos), size * 0.04, 1); assign(o, mats[random.choice(cols)])
        elif kind == "bead":
            o = sphere("bd", size * 0.6, (1, 1, 1), tuple(pos), seg=24, rings=12); assign(o, mats[random.choice(cols)])
        elif kind == "spark":
            o = star4("sp", size * 1.3, 0.2, size * 0.2, loc=tuple(pos), bevel=0.0, subsurf=0, mat_=glow_m)
        else:
            o = mnote.copy(); o.data = mnote.data; o.hide_render = False; o.location = tuple(pos); sc.collection.objects.link(o); o.scale = (size / 4.0,) * 3
        o.rotation_euler = (random.uniform(0, 6.28), random.uniform(0, 6.28), random.uniform(0, 6.28))
        objs.append(o)
    # передний план: между камерой и предметом (будут размыты)
    for k in ["confetti", "bead", "note", "spark", "confetti"]:
        place(dist * random.uniform(0.5, 0.65), 0.75, R * random.uniform(0.07, 0.12), k)
    # средний план: около предмета, на разной глубине (резкие/полуразмытые)
    for _ in range(14):
        place(dist * random.uniform(0.85, 1.1), 0.75, R * random.uniform(0.03, 0.065), random.choice(["confetti", "bead", "spark", "spark", "confetti"]))
    # задний план: далеко (размыты)
    for _ in range(14):
        place(dist * random.uniform(1.5, 2.6), 0.9, R * random.uniform(0.08, 0.2), random.choice(["bead", "confetti", "note", "spark"]))
    return objs


def comp_setup():
    try:
        cg = bpy.data.node_groups.new("NotkaComp", "CompositorNodeTree")
        cg.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        rl = cg.nodes.new("CompositorNodeRLayers"); gl = cg.nodes.new("CompositorNodeGlare"); cc = cg.nodes.new("CompositorNodeColorCorrection"); out = cg.nodes.new("NodeGroupOutput")
        for tname in ("Fog Glow", "Bloom"):
            try: gl.inputs["Type"].default_value = tname; break
            except Exception: pass
        try: gl.inputs["Threshold"].default_value = 0.9; gl.inputs["Strength"].default_value = 0.5; gl.inputs["Size"].default_value = 6 if "Size" in gl.inputs else None
        except Exception: pass
        try: cc.inputs["Saturation"].default_value = 1.04; cc.inputs["Contrast"].default_value = 1.03
        except Exception: pass
        cg.links.new(rl.outputs["Image"], gl.inputs["Image"]); cg.links.new(gl.outputs["Image"], cc.inputs["Image"]); cg.links.new(cc.outputs[0], out.inputs[0])
        sc.compositing_node_group = cg; return True
    except Exception as e:
        print("compositor failed:", e); return False


def stage2(root, exposure=-0.8, samples=None):
    lo, hi = bbox_of(root); c = (lo + hi) / 2; R = max((hi - lo)) / 2
    root.location = -c
    for o in list(bpy.data.objects):
        if (o.type in ("LIGHT", "CAMERA") and not o.name.startswith("pk_")) or o.name == "shadowfloor": bpy.data.objects.remove(o, do_unlink=True)
    w = bpy.data.worlds.new("w3"); sc.world = w; w.use_nodes = True; wn = w.node_tree.nodes; wl = w.node_tree.links
    wn.clear(); out_ = wn.new("ShaderNodeOutputWorld"); bg = wn.new("ShaderNodeBackground")
    tcn = wn.new("ShaderNodeTexCoord"); sp = wn.new("ShaderNodeSeparateXYZ"); wl.new(tcn.outputs["Generated"], sp.inputs[0])
    rr = ramp(wn, [(0.0, hexc("#8A5468")), (0.5, hexc("#3E2350")), (1.0, hexc("#22123A"))])
    wl.new(sp.outputs["Z"], rr.inputs["Fac"]); wl.new(rr.outputs["Color"], bg.inputs["Color"]); bg.inputs["Strength"].default_value = 0.6; wl.new(bg.outputs[0], out_.inputs[0])
    k = R / 2.4; tgt = (0, 0, 0)
    def A(n_, loc, col, p, sx_, sy_): area(n_, tuple(v * k for v in loc), tgt, hexc(col), p * k * k, sx_ * k, sy_ * k)
    A("key", (-9, -6, 6.5), "#FFE4CC", 1900, 5, 7)           # основной: большой мягкий
    A("fill", (8, -7, 1), "#C8B4FF", 170, 6, 5)               # заполняющий: холодный лиловый
    A("rim_warm", (8, 5, 3), "#FF8A3C", 9000, 1.5, 10)        # контровые полосы
    A("rim_pink", (-8, 5, 2), "#FF4F9A", 9000, 1.5, 10)
    A("strip_top", (0, 3, 9), "#FFF1E0", 1500, 8, 1.2)        # длинная полоса сверху: красивые линейные блики
    A("bounce", (4, -6, -5), "#D0307A", 700, 5, 4)
    lens = 55; fov = 2 * math.atan(18 / lens); dist = R / math.tan(fov / 2) * 1.35
    d = Vector((0.22, -1.0, 0.18)).normalized(); loc = d * dist
    cd = bpy.data.cameras.new("cam"); cd.lens = lens; cd.sensor_width = 36; cam = new_obj("cam", cd, loc); sc.camera = cam
    cam.rotation_euler = (Vector(tgt) - loc).to_track_quat("-Z", "Y").to_euler()
    cd.dof.use_dof = True; cd.dof.aperture_fstop = 2.6; cd.dof.focus_distance = dist
    fm = bpy.data.meshes.new("shadowfloor"); bm = _bm.new(); _bm.ops.create_grid(bm, x_segments=2, y_segments=2, size=120); bm.to_mesh(fm); bm.free()
    fo = new_obj("shadowfloor", fm, (0, 0, -R * 1.2)); fo.is_shadow_catcher = True
    if os.environ.get("NOSHADOW") == "1": fo.is_shadow_catcher = False; fo.visible_camera = False   # пол остаётся для отсвета, но на кадре его нет
    if PARTICLES: particles(R, loc, tgt)
    sc.render.engine = "CYCLES"; sc.cycles.samples = samples or SAMPLES; sc.cycles.use_denoising = True; sc.cycles.max_bounces = 14
    sc.cycles.caustics_reflective = False; sc.cycles.caustics_refractive = False
    use_gpu()
    sc.render.resolution_x = sc.render.resolution_y = SIZE; sc.render.film_transparent = not BG
    for tr in ("AgX", "Filmic"):
        try: sc.view_settings.view_transform = tr; break
        except TypeError: pass
    for cand in ("AgX - High Contrast", "High Contrast"):
        try: sc.view_settings.look = cand; break
        except TypeError: pass
    sc.view_settings.exposure = exposure
    sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"
    comp_setup()


def post(path, vignette=False):
    """зернистость и мягкая виньетка (PIL), только по предмету; альфа не трогаем"""
    try:
        from PIL import Image, ImageChops, ImageFilter
        import random as _r
        im = Image.open(path).convert("RGBA"); r, g, b, a = im.split()
        noise = Image.effect_noise(im.size, 14).convert("L")
        rgb = Image.merge("RGB", (r, g, b))
        grain = ImageChops.add(rgb, Image.merge("RGB", (noise, noise, noise)), 1.0, -128)
        out = Image.merge("RGBA", (*grain.split(), a))
        if vignette:
            vg = Image.radial_gradient("L").resize(im.size).point(lambda v: int(255 - max(0, v - 90) * 0.6))
            rgb2 = ImageChops.multiply(out.convert("RGB"), Image.merge("RGB", (vg, vg, vg)))
            out = Image.merge("RGBA", (*rgb2.split(), a))
        out.save(path)
    except Exception as e:
        print("post skipped:", e)


def build_and_render2(name, tag="v2"):
    clear_all()
    for w_ in list(bpy.data.worlds): bpy.data.worlds.remove(w_)
    root = ICONS[name]()
    global PARTICLES
    PARTICLES = (os.environ.get('PARTICLES', '1') == '1') and not name.startswith('sm_')
    stage2(root)
    sc.render.filepath = os.path.join(KITDIR, "%s_%s.png" % (tag, name))
    bpy.ops.render.render(write_still=True)
    post(sc.render.filepath, vignette=BG)
    print("rendered", sc.render.filepath)


if os.environ.get("KIT2_RUN", "1") == "1" and bpy.app.background:
    for nm in os.environ.get("ICONS", ",".join(ICONS2)).split(","):
        try: build_and_render2(nm.strip(), os.environ.get("TAG", "v2"))
        except Exception as e:
            import traceback; traceback.print_exc(); print("FAILED", nm, e)
