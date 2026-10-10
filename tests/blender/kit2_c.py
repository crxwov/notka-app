"""kit2, партия C: конверт, микрофон, чат-облачка + набор мелких деталей. exec из kit2.py"""


def ptube(name, pts3, r, cyclic=False):
    """трубка по 3D-точкам"""
    cd = bpy.data.curves.new(name, "CURVE"); cd.dimensions = "3D"; cd.bevel_depth = r; cd.bevel_resolution = 12; cd.resolution_u = 24; cd.use_fill_caps = True
    sp = cd.splines.new("BEZIER"); sp.bezier_points.add(len(pts3) - 1); sp.use_cyclic_u = cyclic
    for bp, p in zip(sp.bezier_points, pts3):
        bp.co = p; bp.handle_left_type = bp.handle_right_type = "AUTO"
    return new_obj(name, cd)


def rounded_outline(w, h, r, tail=None, n=10):
    """контур скруглённого прямоугольника (x, z), по часовой от левого верхнего; tail=(x0, x1, xtip, ztip) — хвостик снизу"""
    pts = []
    def arc(cx, cz, a0, a1):
        for i in range(n + 1):
            a = math.radians(a0 + (a1 - a0) * i / n); pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    hw, hh = w / 2, h / 2
    arc(-hw + r, hh - r, 180, 90); arc(hw - r, hh - r, 90, 0); arc(hw - r, -hh + r, 0, -90)
    if tail:
        x0, x1, xt, zt = tail
        pts += [(x1, -hh), (xt, zt), (x0, -hh)]
    arc(-hw + r, -hh + r, -90, -180)
    return pts


# ================= КОНВЕРТ С СУРГУЧОМ И ПИСЬМОМ =================
def ic_envelope():
    root = new_obj("root", None)
    cream = pro("e_cream", "cream", rough=0.5, grain=1.5, scratch=0.12, leather=0.1, axis="Z")
    paper = pro("e_paper", "cream", rough=0.55, grain=1.2, scratch=0.05, axis="Z", flip=True)
    warm = pro("e_warm", "warm", rough=0.42, glitter=0.03, axis="Z", coat=0.4)
    rose = pro("e_rose", "rose", rough=0.3, glitter=0.03, coat=0.8, grain=1.0)
    dark = pro("e_dark", "plum", rough=0.55, grain=1.2, scratch=0.0, smudge=False, ao_dist=0.1, edge=0.0)
    chrome = satin_chrome("e_chrome", "#FBE9D6", 0.18, 520.0)
    back = pillow("back", [rbox("bk", 5.6, 0.34, 3.7, (0, 0.0, 0), 0.16)], cream, voxel=0.028, smooth=3); back.parent = root
    # письмо торчит сверху: строки, нота, сердечко
    letter = pillow("letter", [rbox("lt", 4.7, 0.1, 3.2, (0.0, 0.3, 1.25), 0.08)], paper, voxel=0.02, smooth=2); letter.rotation_euler = (0, math.radians(-4), 0); letter.parent = root
    for k, w in enumerate((3.4, 3.0, 3.2, 2.4)):
        ln = pillow("ln", [rbox("ln", w, 0.04, 0.07, (-0.4 - (3.4 - w) / 2 + 0.2, 0.23, 2.3 - k * 0.24), 0.03)], dark, voxel=0.012, smooth=2); ln.parent = root
    note_decal((-1.45, 0.22, 1.35), 0.7, warm, root)
    # передний карман-«V» и строчка
    pocket = inflate("pocket", [(-2.82, -1.85), (2.82, -1.85), (2.82, 1.0), (0.0, -0.4), (-2.82, 1.0)], R=0.18, H=0.14, smooth_outline=1)
    assign(pocket, warm); pocket.location = (0, -0.26, 0); pocket.parent = root
    stitch_on_surface([(-2.55 + 5.1 * i / 26, 0.78 - 1.1 * (1 - abs(-2.55 + 5.1 * i / 26) / 2.55)) for i in range(27)], 0.04, cream, root)
    # сургучная печать на вершине «V»: плоская линза, ободок, нота
    seal = pillow("seal", [sphere("sl", 0.62, (1, 0.28, 1), (0, -0.55, -0.4), seg=48, rings=24)], rose, voxel=0.018, smooth=4); seal.parent = root
    ring = torus("sl_ring", 0.5, 0.035, (0, -0.68, -0.4)); assign(ring, chrome); ring.parent = root
    note_decal((0, -0.7, -0.4), 0.6, cream, root)
    # марка в углу: зубчики, нота
    stamp = pillow("stamp", [rbox("st", 0.95, 0.1, 1.1, (1.95, -0.42, -1.1), 0.06)], rose, voxel=0.015, smooth=2); stamp.parent = root
    for k in range(7):
        for sx_ in (1.95 - 0.475, 1.95 + 0.475):
            d = sphere("ts", 0.04, (1, 1, 1), (sx_, -0.42, -1.1 - 0.48 + k * 0.16), seg=8, rings=6); assign(d, dark); d.parent = root
    note_decal((1.95, -0.52, -1.1), 0.6, cream, root)
    root.rotation_euler = (math.radians(18), math.radians(-14), math.radians(-12)); return root


# ================= РЕТРО-МИКРОФОН =================
def ic_mic():
    root = new_obj("root", None)
    chrome = satin_chrome("m_chrome", "#F6EEFF", 0.2, 540.0)
    grille = satin_chrome("m_grille", "#E9E0F2", 0.34, 480.0)
    setv(bsdf(grille.node_tree.nodes.values()), "Thin Film Thickness", 0.0)
    nt = grille.node_tree; n = nt.nodes; l = nt.links; b = bsdf(n.values())
    tc = n.new("ShaderNodeTexCoord"); vr = n.new("ShaderNodeTexVoronoi"); vr.feature = "DISTANCE_TO_EDGE"; vr.inputs["Scale"].default_value = 34.0; l.new(tc.outputs["Object"], vr.inputs["Vector"])
    mr = n.new("ShaderNodeMapRange"); mr.inputs["From Min"].default_value = 0.0; mr.inputs["From Max"].default_value = 0.09; l.new(vr.outputs["Distance"], mr.inputs["Value"])
    bmp = n.new("ShaderNodeBump"); bmp.inputs["Strength"].default_value = 1.0; bmp.inputs["Distance"].default_value = 0.05; l.new(mr.outputs["Result"], bmp.inputs["Height"])
    for lk in list(b.inputs["Normal"].links): l.remove(lk)
    l.new(bmp.outputs["Normal"], b.inputs["Normal"])
    mix = n.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.inputs["B"].default_value = hexc("#2A1236"); l.new(mr.outputs["Result"], mix.inputs["Factor"])
    inv = n.new("ShaderNodeMath"); inv.operation = "SUBTRACT"; inv.inputs[0].default_value = 1.0; l.new(mr.outputs["Result"], inv.inputs[1]); l.new(inv.outputs[0], mix.inputs["Factor"])
    mix.inputs["A"].default_value = hexc("#F2EAF8"); l.new(mix.outputs["Result"], b.inputs["Base Color"])
    plum = pro("m_plum", "plum", rough=0.36, sheen=0.45, coat=0.7, scratch=0.35, axis="Z")
    warm = pro("m_warm", "warm", rough=0.38, glitter=0.03, coat=0.5, axis="Z")
    cream = pro("m_cream", "cream", rough=0.45, grain=1.0, scratch=0.1, axis="Z")
    dark = pro("m_dark", "plum", rough=0.55, grain=1.2, scratch=0.0, smudge=False, ao_dist=0.1, edge=0.0)
    head = sphere("head", 1.45, (1.0, 1.0, 1.2), (0, 0, 2.55), seg=96, rings=48); assign(head, grille); head.parent = root
    for z, rr, col in ((2.55, 1.46, warm), (1.85, 1.38, cream), (3.25, 1.22, cream)):
        bd = torus("band", rr * (1.0), 0.1, (0, 0, z), axis_y=False); assign(bd, col); bd.parent = root
    neck = pillow("neck", [cyl("nk", 0.55, 0.7, (0, 0, 1.0), (0, 0, 0), bevel=0.1, seg=48)], cream, voxel=0.024, smooth=3); neck.parent = root
    col1 = torus("collar", 0.62, 0.09, (0, 0, 1.35), axis_y=False); assign(col1, chrome); col1.parent = root
    prof = [(0.0, 0.7), (0.52, 0.7), (0.56, 0.55), (0.52, 0.3), (0.46, -0.9), (0.4, -1.9), (0.44, -2.0), (0.0, -2.0)]
    body = lathe("body", [(r * 1.0, z + 0.2) for r, z in prof], seg=72, smooth_it=1, subsurf=2); assign(body, plum); body.parent = root
    for z in (0.35, 0.05, -0.25, -0.55):
        g = torus("grv", 0.5 - (0.35 - z) * 0.03, 0.02, (0, 0, z), axis_y=False); assign(g, dark); g.parent = root
    cap = torus("cap", 0.46, 0.06, (0, 0, -1.7), axis_y=False); assign(cap, chrome); cap.parent = root
    note_decal((0, -0.5, -0.55), 0.55, pro("m_note", "cream", rough=0.4), root)
    sw = pillow("sw", [rbox("sw", 0.2, 0.12, 0.52, (0, -0.52, 0.1), 0.06)], dark, voxel=0.012, smooth=2); sw.parent = root
    kn = pillow("kn", [rbox("kn", 0.17, 0.16, 0.2, (0, -0.58, 0.18), 0.06)], cream, voxel=0.012, smooth=2); kn.parent = root
    led = sphere("led", 0.05, (1, 0.6, 1), (0, -0.55, 0.52), seg=12, rings=8); assign(led, glow("led", "#FFB066", 6.0)); led.parent = root
    pts3 = [(0.5 * math.cos(t * 0.6) * (1 - t * 0.012), 0.5 * math.sin(t * 0.6), -2.0 - t * 0.06) for t in range(0, 52, 2)]
    cord = pillow("cord", [ptube("cd", [(0.0, 0.0, -1.85), (0.0, 0.0, -2.1)] + [(0.7 * math.cos(t * 0.5), 0.7 * math.sin(t * 0.5), -2.25 - t * 0.075) for t in range(0, 40)], 0.05)], dark, voxel=0.016, smooth=3)
    cord.parent = root
    root.rotation_euler = (math.radians(-6), math.radians(16), math.radians(22)); return root


# ================= ЧАТ-ОБЛАЧКА =================
def ic_chat():
    root = new_obj("root", None)
    rose = pro("c_rose", "rose", rough=0.3, glitter=0.035, coat=0.8, grain=1.0, scratch=0.3)
    plum = pro("c_plum", "plum", rough=0.35, glitter=0.02, coat=0.6, scratch=0.3)
    cream = pro("c_cream", "cream", rough=0.45, grain=1.0, scratch=0.05, edge=0.0)
    warm = pro("c_warm", "warm", rough=0.38, glitter=0.03, coat=0.5, axis="Z")
    dark = pro("c_dark", "plum", rough=0.5, grain=1.0, scratch=0.0, smudge=False, ao_dist=0.1, edge=0.0)
    chrome = satin_chrome("c_chrome", "#FBE9D6", 0.18, 520.0)
    # задний пузырь (слива) со своим хвостом
    b2 = inflate("bub2", [(x + 1.5, z + 0.9) for x, z in rounded_outline(3.6, 2.4, 0.9, tail=(1.0, 1.7, 1.9, -1.95))], R=0.8, H=0.75, smooth_outline=2); assign(b2, plum); b2.location = (0.0, 0.9, 0.0); b2.parent = root
    # главный пузырь
    outline = rounded_outline(5.2, 3.5, 1.15, tail=(-1.9, -0.8, -2.2, -2.55))
    b1 = inflate("bub1", outline, R=1.05, H=1.0, smooth_outline=2); assign(b1, rose); b1.parent = root
    inner = [(x * 0.88, z * 0.86 + 0.0) for x, z in outline]; inner.append(inner[0])
    stitch_on_surface(inner[::2], 0.05, cream, root)
    # содержимое: нота-знак и три точки печати
    note_decal((-1.2, -1.05, 0.0), 1.55, cream, root)
    for i in range(3):
        d = sphere("dot", 0.24, (1, 0.7, 1), (0.55 + i * 0.7, -1.0, 0.0), seg=24, rings=12); assign(d, cream); d.parent = root
    # на заднем пузыре сердечко
    hp = []
    for i in range(80):
        t = 2 * math.pi * i / 80
        hp.append((16 * math.sin(t) ** 3 * 0.045 + 1.5, (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)) * 0.045 + 1.0))
    hh = inflate("hh", hp, R=0.3, H=0.28); assign(hh, warm); hh.location = (0.0, -0.05, 0.0); hh.parent = root
    # хромовые заклёпки и блик-полоска
    for (x, z) in ((-2.2, 1.35), (2.2, 1.35)):
        rv = mini_cyl("rv", 0.1, 0.07, (x, -1.12, z), (math.radians(90), 0, 0), chrome, 0.025, 24); rv.parent = root
    root.rotation_euler = (math.radians(10), math.radians(-14), math.radians(-8)); return root


# ================= МЕЛКИЕ ДЕТАЛИ (по одной, для рассыпок) =================
def _smalls_root(): return new_obj("root", None)


def sm_sparkle():
    r = _smalls_root(); m = glow("sm_sp", "#FFE2B8", 6.0)
    o = star4("sp", 1.9, 0.2, 0.32, loc=(0, 0, 0), bevel=0.0, subsurf=0, mat_=m); o.parent = r
    o2 = star4("sp2", 0.9, 0.2, 0.2, loc=(1.6, 0, 1.4), bevel=0.0, subsurf=0, mat_=m); o2.parent = r
    r.rotation_euler = (math.radians(14), math.radians(-18), math.radians(-12)); return r


def sm_star():
    r = _smalls_root()
    pts = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5; rr = 2.0 if i % 2 == 0 else 0.95
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    o = inflate("star", pts, R=0.42, H=0.6, smooth_outline=2); assign(o, pro("sm_star", "warm", rough=0.3, glitter=0.04, coat=0.7, axis="Z")); o.parent = r
    r.rotation_euler = (math.radians(10), math.radians(-20), math.radians(-12)); return r


def sm_pearls():
    r = _smalls_root(); mats = [pro("sm_p%d" % i, f, rough=0.28, coat=0.9, grain=0.6, scratch=0.15) for i, f in enumerate(("warm", "rose", "cream", "orange"))]
    pos = [(-1.6, 0, 0.6, 1.0), (0.2, 0, -0.5, 1.25), (1.8, 0, 0.9, 0.8), (-0.3, 0, 1.9, 0.6), (-1.9, 0, -1.4, 0.55)]
    for i, (x, y, z, rr) in enumerate(pos):
        o = sphere("pearl", rr, (1, 1, 1), (x, y, z), seg=64, rings=32); assign(o, mats[i % 4]); o.parent = r
    chrome = satin_chrome("sm_bead", "#F8EEE4", 0.14, 520.0)
    for (x, y, z, rr) in ((1.3, 0, -1.5, 0.7), (-0.9, 0, -2.0, 0.5)):
        o = sphere("bead", rr, (1, 1, 1), (x, y, z), seg=64, rings=32); assign(o, chrome); o.parent = r
    r.rotation_euler = (math.radians(10), math.radians(-10), 0); return r


def sm_confetti():
    r = _smalls_root(); fams = ("warm", "rose", "cream", "orange"); k = 0
    for i in range(14):
        m_ = pro("cf%d" % i, fams[i % 4], rough=0.35, coat=0.6, grain=0.5, scratch=0.0, smudge=False)
        a = i * 0.9; x = (i % 5 - 2) * 1.1 + math.cos(a) * 0.3; z = (i // 5 - 1) * 1.1 + math.sin(a) * 0.3
        if i % 3 == 0: o = rbox("c", 0.9, 0.08, 0.38, (x, 0, z), 0.03, 1)
        elif i % 3 == 1: o = cyl("c", 0.32, 0.07, (x, 0, z), (math.radians(90), 0, 0), bevel=0.02, seg=24)
        else: o = pillow("cur", [ptube("cc", [(x - 0.4, 0, z), (x - 0.15, 0, z + 0.3), (x + 0.15, 0, z - 0.3), (x + 0.4, 0, z)], 0.07)], m_, voxel=0.015, smooth=2)
        if o.type == "MESH" and not o.name.startswith("cur"): assign(o, m_)
        o.rotation_euler = (random.uniform(0, 3), random.uniform(0, 3), random.uniform(0, 3)); o.parent = r
    return r


def sm_candy():
    r = _smalls_root()
    m = soft_touch("sm_candy", [(0.0, hexc("#FFF2E0")), (0.34, hexc("#FFF2E0")), (0.35, hexc("#FF8A2A")), (0.66, hexc("#FF8A2A")), (0.67, hexc("#FFC247")), (1.0, hexc("#FFC247"))], lo=0, hi=1, rough=0.3, glitter=0.0, grain=0.8)
    mm = mfam("sm_candy2", "warm"); n = m.node_tree.nodes
    for x in n:
        if x.type == "VALTORGB": x.color_ramp.interpolation = "CONSTANT"
    tc = next(x for x in n if x.type == "TEX_COORD"); sep = next(x for x in n if x.type == "SEPXYZ")
    for lk in list(sep.inputs[0].links): m.node_tree.links.remove(lk)
    m.node_tree.links.new(tc.outputs["Generated"], sep.inputs[0])
    for x in n:
        if x.type == "MAP_RANGE": x.inputs["From Min"].default_value = 0.0; x.inputs["From Max"].default_value = 1.0
    pts = [(-1.0, -1.7), (1.0, -1.7), (0.0, 1.8)]
    o = inflate("candy", [(p[0] * 1.0, p[1]) for p in rounded_pts(pts, 0.35)], R=0.7, H=0.8, smooth_outline=1); assign(o, m); o.parent = r
    r.rotation_euler = (math.radians(14), math.radians(-18), math.radians(-14)); return r


def rounded_pts(tri, rad, n=8):
    out = []
    for i in range(3):
        p0, p1, p2 = tri[i - 1], tri[i], tri[(i + 1) % 3]
        v0 = Vector((p0[0] - p1[0], p0[1] - p1[1])).normalized(); v2 = Vector((p2[0] - p1[0], p2[1] - p1[1])).normalized()
        a = Vector((p1[0], p1[1])) + v0 * rad; c = Vector((p1[0], p1[1])) + v2 * rad
        for k in range(n + 1):
            t = k / n; q = (1 - t) ** 2 * a + 2 * (1 - t) * t * Vector((p1[0], p1[1])) + t ** 2 * c; out.append((q.x, q.y))
    return out


def sm_spider():
    r = _smalls_root()
    plum = pro("sp_plum", "plum", rough=0.3, coat=0.8, sheen=0.4, scratch=0.2, grain=1.0)
    cream = pro("sp_cream", "cream", rough=0.4, grain=0.6, edge=0.0)
    dark = pro("sp_dark", "plum", rough=0.25, coat=1.0, grain=0.5, scratch=0.0, smudge=False, edge=0.0)
    body = pillow("sb", [sphere("ab", 1.15, (1.0, 1.0, 0.95), (0, 0.55, 0.0)), sphere("hd", 0.78, (1, 1, 0.95), (0, -0.6, 0.15))], plum, voxel=0.024, smooth=6); body.parent = r
    for sx in (-1, 1):
        e = sphere("eye", 0.24, (1, 0.7, 1.1), (sx * 0.3, -1.25, 0.3), seg=24, rings=12); assign(e, cream); e.parent = r
        p = sphere("pup", 0.12, (1, 0.6, 1.1), (sx * 0.3, -1.4, 0.3), seg=16, rings=8); assign(p, dark); p.parent = r
        for k in range(4):
            yb = -0.7 + k * 0.5; up = 1.7 - abs(k - 1.5) * 0.35
            pts = [(sx * 0.9, yb, 0.1), (sx * 2.1, yb - 0.1, up), (sx * 3.2, yb - 0.2, -0.2), (sx * 3.6, yb - 0.2, -1.4)]
            leg = pillow("leg", [ptube("lg", pts, 0.1)], plum, voxel=0.016, smooth=3); leg.parent = r
    th = pillow("thread", [ptube("th", [(0, 0.55, 1.1), (0, 0.55, 3.5), (0, 0.55, 6.0)], 0.03)], cream, voxel=0.012, smooth=2); th.parent = r
    r.rotation_euler = (math.radians(12), math.radians(-14), math.radians(-6)); return r


def sm_bone():
    r = _smalls_root(); cream = pro("sm_bone", "cream", rough=0.42, grain=1.4, scratch=0.2, leather=0.12)
    parts = [rbox("sh", 3.6, 0.9, 0.8, (0, 0, 0), 0.35)]
    for sx in (-1, 1):
        for dz in (-0.55, 0.55): parts.append(sphere("kn", 0.62, (1, 0.95, 1), (sx * 1.9, 0, dz)))
    o = pillow("bone", parts, cream, voxel=0.028, smooth=10); o.parent = r
    r.rotation_euler = (math.radians(16), math.radians(-12), math.radians(-24)); return r


def sm_minipumpkin():
    r = _smalls_root(); sys.path.insert(0, HERE); import ghost_props as GP; importlib.reload(GP)
    pk = GP.pumpkin((0, 0, 0), 1.5, rot=(0, 0, 0))
    for md in list(pk.modifiers):
        if md.type == "BOOLEAN": pk.modifiers.remove(md)
    for ch in list(pk.children):
        if ch.name.startswith("cut") or ch.name.startswith("pk_light"): bpy.data.objects.remove(ch, do_unlink=True)
    assign(pk, pro("mp_or", "orange", rough=0.42, glitter=0.025, grain=1.6, coat=0.35, scratch=0.25, leather=0.2))
    for ch in list(pk.children):
        if ch.name.startswith("stem"): assign(ch, pro("mp_gr", "green", rough=0.5, grain=1.6, leather=0.25))
    pk.parent = r; r.rotation_euler = (math.radians(-12), math.radians(-14), math.radians(6)); return r


def sm_note():
    r = _smalls_root(); n = mini_note_mesh(pro("sm_n", "warm", rough=0.4, glitter=0.03, coat=0.5)); n.parent = r
    r.rotation_euler = (math.radians(10), math.radians(-24), math.radians(-8)); return r


def sm_heart():
    r = _smalls_root(); pts = []
    for i in range(140):
        t = 2 * math.pi * i / 140
        pts.append((16 * math.sin(t) ** 3 * 0.16, (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)) * 0.16 + 0.1))
    h = inflate("hm", pts, R=0.9, H=0.8); assign(h, pro("sm_h", "rose", rough=0.3, glitter=0.035, coat=0.8, scratch=0.2)); h.parent = r
    r.rotation_euler = (math.radians(8), math.radians(-22), math.radians(-12)); return r


SMALLS = {"sm_sparkle": sm_sparkle, "sm_star": sm_star, "sm_pearls": sm_pearls, "sm_confetti": sm_confetti, "sm_candy": sm_candy,
          "sm_spider": sm_spider, "sm_bone": sm_bone, "sm_pumpkin": sm_minipumpkin, "sm_note": sm_note, "sm_heart": sm_heart}
