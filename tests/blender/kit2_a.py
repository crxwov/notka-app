"""kit2, партия A: пластинка в конверте, сердечко с подвеской, подарок с биркой, тыква с лозой. Подключается из kit2.py (exec)."""


def carve(base, cutters, mat_=None, name="carved"):
    """вычесть cutters из base (булева), запечь в обычный меш"""
    base_m = to_mesh_obj(name + "_b", base)
    for c in cutters:
        bo = base_m.modifiers.new("cut", "BOOLEAN"); bo.object = c; bo.operation = "DIFFERENCE"; bo.solver = "MANIFOLD"
    o = to_mesh_obj(name, base_m); o.data.materials.clear()
    for q in [base_m, base] + list(cutters): bpy.data.objects.remove(q, do_unlink=True)
    for pl in o.data.polygons: pl.use_smooth = True
    if mat_: assign(o, mat_)
    return o


def raycast_front(x, z):
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    ok, loc, nor, idx, ob, mt = sc.ray_cast(dg, Vector((x, -40, z)), Vector((0, 1, 0)))
    return (loc, nor) if ok else (Vector((x, 0, z)), Vector((0, -1, 0)))


def stitch_on_surface(pts_xz, size, mat_, parent, lift=0.01):
    """строчка из капсул вдоль контура по поверхности (луч спереди)"""
    objs = []
    hits = [raycast_front(x, z) for x, z in pts_xz]
    for (p0, n0), (p1, n1) in zip(hits[:-1], hits[1:]):
        mid = (p0 + p1) / 2 + (n0 + n1).normalized() * lift; d = p1 - p0; L = d.length
        o = sphere("stt", size, (1, 1, 1), tuple(mid), seg=10, rings=6); o.scale = (max(L * 0.3 / size, 0.4), 0.5, 0.5)
        o.rotation_euler = Vector((1, 0, 0)).rotation_difference(d.normalized()).to_euler(); assign(o, mat_)
        if parent: o.parent = parent
        objs.append(o)
    return objs


def note_decal(loc, size, mat_, parent, yaw=0.0, roll=0.0):
    n = mini_note_mesh(mat_); n.scale = (size / 4.8,) * 3; n.location = loc; n.rotation_euler = (0, math.radians(roll), math.radians(yaw)); n.parent = parent; return n


def band_rough(m, radial_stops):
    """полосы шероховатости по радиусу (дорожки пластинки): [(r, rough), ...]"""
    nt = m.node_tree; n = nt.nodes; l = nt.links; b = bsdf(n.values())
    tc = n.new("ShaderNodeTexCoord"); sp = n.new("ShaderNodeSeparateXYZ"); l.new(tc.outputs["Object"], sp.inputs[0])
    sx = n.new("ShaderNodeMath"); sx.operation = "POWER"; sx.inputs[1].default_value = 2.0; l.new(sp.outputs["X"], sx.inputs[0])
    sy = n.new("ShaderNodeMath"); sy.operation = "POWER"; sy.inputs[1].default_value = 2.0; l.new(sp.outputs["Y"], sy.inputs[0])
    ad = n.new("ShaderNodeMath"); ad.operation = "ADD"; l.new(sx.outputs[0], ad.inputs[0]); l.new(sy.outputs[0], ad.inputs[1])
    rd = n.new("ShaderNodeMath"); rd.operation = "SQRT"; l.new(ad.outputs[0], rd.inputs[0])
    mp = n.new("ShaderNodeMapRange"); mp.inputs["From Min"].default_value = 0.0; mp.inputs["From Max"].default_value = 2.5; l.new(rd.outputs[0], mp.inputs["Value"])
    rp = ramp(n, [(r, (v, v, v, 1.0)) for r, v in radial_stops]); rp.color_ramp.interpolation = "LINEAR"
    l.new(mp.outputs["Result"], rp.inputs["Fac"])
    sp2 = n.new("ShaderNodeSeparateColor"); l.new(rp.outputs["Color"], sp2.inputs[0]); l.new(sp2.outputs["Red"], b.inputs["Roughness"])


# ================= ПЛАСТИНКА В КОНВЕРТЕ =================
def ic_vinyl2():
    root = new_obj("root", None)
    plum = pro("v_plum", "plum", rough=0.4, sheen=0.5, grain=1.0, scratch=0.5, axis="Y")
    band_rough(plum, [(0.0, 0.5), (0.36, 0.5), (0.4, 0.22), (0.62, 0.22), (0.64, 0.5), (0.7, 0.5), (0.72, 0.22), (0.88, 0.22), (0.9, 0.5), (1.0, 0.5)])
    b = bsdf(plum.node_tree.nodes.values()); setv(b, "Metallic", 0.4); setv(b, "Anisotropic", 0.7); setv(b, "Thin Film Thickness", 380.0); setv(b, "Thin Film IOR", 1.7)
    cream = pro("v_cream", "cream", rough=0.55, grain=1.6, scratch=0.12, leather=0.15, axis="Y")
    warm = pro("v_warm", "warm", rough=0.45, glitter=0.03, axis="Y")
    dark = pro("v_dark", "plum", rough=0.6, grain=1.5, scratch=0.0, smudge=False, ao_dist=0.12, edge=0.0)
    chrome = satin_chrome("v_chrome", "#F8EEE4", 0.2, 520.0)
    sleeve = rbox("sleeve", 5.7, 0.2, 5.7, (-0.6, 0.55, 0.0), 0.12)
    win = cyl("win", 2.55, 0.5, (-0.6, 0.55, 0.0), (math.radians(90), 0, 0), bevel=0, seg=96)
    sl = carve(sleeve, [win], cream, "sleeve_c"); sl.parent = root
    lip = pillow("lip", [rbox("lp", 5.7, 0.26, 0.28, (-0.6, 0.5, 2.78), 0.1)], cream, voxel=0.03, smooth=3); lip.parent = root
    t = text3d("ttl", "Нотка", 0.5, (-2.2, 0.43, -2.25), 0.04, dark); t.parent = root
    t2 = text3d("sub", "STEREO 33", 0.17, (-1.6, 0.43, -2.7), 0.03, dark); t2.parent = root
    cx = 1.15; DY = 0.0
    disc = cyl("disc", 2.5, 0.22, (cx, DY, 0.35), (math.radians(90), 0, 0), bevel=0.06, seg=160); assign(disc, plum); disc.parent = root
    rim = torus("rim", 2.46, 0.07, (cx, DY, 0.35)); assign(rim, plum); rim.parent = root
    for rr in (1.6, 1.95, 2.3):
        g = torus("grv", rr, 0.012, (cx, DY - 0.115, 0.35)); assign(g, dark); g.parent = root
    lab = cyl("lab", 0.92, 0.28, (cx, DY - 0.01, 0.35), (math.radians(90), 0, 0), bevel=0.05, seg=96); assign(lab, warm); lab.parent = root
    for rr, th in ((0.95, 0.03), (0.7, 0.018), (0.3, 0.02)):
        g = torus("lg", rr, th, (cx, DY - 0.155, 0.35)); assign(g, dark if rr < 0.9 else chrome); g.parent = root
    hole = cyl("hole", 0.1, 0.34, (cx, DY - 0.01, 0.35), (math.radians(90), 0, 0), bevel=0.02, seg=24); assign(hole, dark); hole.parent = root
    spin = torus("spin", 0.11, 0.035, (cx, DY - 0.17, 0.35)); assign(spin, chrome); spin.parent = root
    note_decal((cx, DY - 0.17, 0.35 + 0.42), 0.48, cream, root)
    t3 = text3d("lt", "Нотка SIDE A", 0.11, (cx, DY - 0.17, 0.35 - 0.52), 0.015, cream); t3.parent = root
    root.rotation_euler = (math.radians(12), math.radians(-12), math.radians(-24)); return root


# ================= СЕРДЕЧКО С ПОДВЕСКОЙ =================
def ic_heart2():
    root = new_obj("root", None)
    rose = pro("h_rose", "rose", rough=0.3, glitter=0.035, coat=0.8, grain=1.0, scratch=0.3)
    chrome = satin_chrome("h_chrome", "#FBE9D6", 0.18, 520.0)
    cream = pro("h_cream", "cream", rough=0.5, grain=1.4, scratch=0.1)
    pts = []
    for i in range(180):
        t = 2 * math.pi * i / 180
        pts.append((16 * math.sin(t) ** 3 * 0.25, (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)) * 0.25 + 0.2))
    h = inflate("heart", pts, R=1.5, H=1.3); assign(h, rose); h.parent = root
    inner = [(x * 0.84, (z - 0.2) * 0.84 + 0.15) for x, z in pts[::3]]
    inner.append(inner[0]); stitch_on_surface(inner, 0.05, cream, root)
    seam = [(0.0, 3.5 - i * 0.28) for i in range(14)]
    stitch_on_surface(seam, 0.045, cream, root)
    eye = torus("eye", 0.32, 0.1, (0.0, -0.05, 3.62)); assign(eye, chrome); eye.parent = root
    ring = torus("ring", 0.55, 0.07, (0.0, -0.05, 4.25)); assign(ring, chrome); ring.parent = root
    riv = mini_cyl("rv", 0.14, 0.08, (0.0, -1.1, 3.1), (math.radians(90), 0, 0), chrome, 0.03, 24); riv.parent = root
    note_decal((-1.45, -1.18, 1.6), 0.9, cream, root)
    root.rotation_euler = (math.radians(8), math.radians(-14), math.radians(-18)); return root


# ================= ПОДАРОК С БИРКОЙ =================
def ic_gift2():
    root = new_obj("root", None)
    rose = pro("g_rose", "rose", rough=0.4, glitter=0.03, coat=0.5, grain=1.4)
    cream = pro("g_cream", "cream", rough=0.5, grain=1.5, scratch=0.15, leather=0.12)
    warm = pro("g_warm", "warm", rough=0.42, glitter=0.03, axis="Z")
    dark = pro("g_dark", "plum", rough=0.6, grain=1.5, scratch=0.0, smudge=False, ao_dist=0.12, edge=0.0)
    chrome = satin_chrome("g_chrome", "#FBE9D6", 0.2, 520.0)
    box = pillow("box", [rbox("b", 3.7, 3.3, 2.5, (0, 0, -0.55), 0.3)], rose, voxel=0.03, smooth=4); box.parent = root
    lid = pillow("lid", [rbox("l", 4.0, 3.6, 0.95, (0, 0, 1.05), 0.26)], pro("g_lid", "rose", rough=0.4, glitter=0.03, coat=0.5, grain=1.4), voxel=0.03, smooth=4); lid.parent = root
    v = pillow("rib_v", [rbox("rv", 0.8, 3.72, 3.65, (0, 0, 0.12), 0.18)], cream, voxel=0.028, smooth=4); v.parent = root
    h = pillow("rib_h", [rbox("rh", 4.12, 0.8, 0.84, (0, 0, 1.15), 0.18)], cream, voxel=0.028, smooth=4); h.parent = root
    for k in range(5):
        fold = rbox("fold", 0.84, 3.76, 0.02, (0, 0, -1.3 + k * 0.62), 0.008); assign(fold, dark); fold.parent = root
    loops = []
    for sx in (-1, 1):
        for scl in (1.0, 0.7):
            loops.append(wtube("loop", [(0, 1.78), (sx * 0.95 * scl, 2.9 * scl + (1 - scl) * 0.4), (sx * 1.75 * scl, 2.7 * scl), (sx * 1.4 * scl, 1.85), (sx * 0.55, 1.58)], 0.24 * scl + 0.03, cyclic=True))
    tails = [wtube("tail", [(0.1, 1.7), (0.9, 1.3), (1.6, 0.4)], 0.17), wtube("tail2", [(-0.1, 1.7), (-0.9, 1.35), (-1.55, 0.55)], 0.17)]
    knot = sphere("knot", 0.52, (1, 1, 0.9), (0, 0, 1.78), seg=32, rings=16)
    bow = pillow("bow", loops + tails + [knot], cream, voxel=0.024, smooth=8); bow.parent = root
    tag = pillow("tag", [rbox("tg", 1.3, 0.1, 1.7, (1.35, -1.78, -0.9), 0.18)], warm, voxel=0.025, smooth=3); tag.parent = root
    eye = torus("tg_eye", 0.14, 0.04, (1.35, -1.86, -0.18)); assign(eye, chrome); eye.parent = root
    cord = wtube("cord", [(1.35, -0.15), (1.2, 0.3), (0.5, 1.0), (0.0, 1.6)], 0.035); cord.location.y = -1.86
    pillow("cord_m", [cord], dark, voxel=0.015, smooth=2).parent = root
    t = text3d("tagt", "Нотка", 0.28, (1.35, -1.9, -0.95), 0.025, cream); t.parent = root
    note_decal((1.35, -1.9, -0.45), 0.5, cream, root)
    for (x, z) in ((-1.15, -0.85), (1.1, -1.55), (-1.1, -1.55)):
        note_decal((x, -1.68, z), 0.55, pro("g_note", "cream", rough=0.45), root)
    root.rotation_euler = (math.radians(14), math.radians(-6), math.radians(-30)); return root


# ================= ТЫКВА С ЛОЗОЙ =================
def ic_pumpkin2():
    root = new_obj("root", None)
    sys.path.insert(0, HERE); import ghost_props as GP; importlib.reload(GP)
    orange = pro("p_or", "orange", rough=0.42, glitter=0.025, grain=1.6, coat=0.35, scratch=0.25, leather=0.2)
    green = pro("p_gr", "green", rough=0.5, grain=1.6, scratch=0.1, leather=0.25)
    dark = pro("p_dark", "plum", rough=0.7, grain=1.5, scratch=0.0, smudge=False, ao_dist=0.12, edge=0.0)
    pk = GP.pumpkin((0, 0, 0), 1.7, rot=(0, 0, 0))
    assign(pk, orange); pk.data.materials.append(glow("pk_glow", "#FF6A12", 2.4))
    for ch in list(pk.children):
        if ch.name.startswith("stem"): assign(ch, green)
    pk.parent = root
    stem2 = pillow("stem_b", [wtube("st", [(0.0, 1.35), (0.05, 1.7), (0.3, 2.0)], 0.2)], green, voxel=0.025, smooth=4); stem2.parent = root
    vine = pillow("vine", [wtube("v", [(0.2, 1.95), (0.8, 2.3), (1.5, 2.1), (1.65, 1.6), (1.3, 1.45), (1.2, 1.7)], 0.07)], green, voxel=0.018, smooth=4); vine.parent = root
    for (x, z, rz, sc_) in ((-0.7, 1.7, -35, 1.0), (0.85, 1.75, 38, 0.8)):
        leaf = poly_solid("leaf", [(0, 0), (0.35, 0.3), (0.8, 0.35), (1.1, 0.0), (0.8, -0.3), (0.35, -0.28)], depth=0.06, loc=(x, -0.2, z), bevel=0.02, subsurf=1, mat_=green)
        leaf.scale = (sc_, 1, sc_); leaf.rotation_euler = (0.2, 0, math.radians(rz)); leaf.parent = root
    root.rotation_euler = (math.radians(-10), math.radians(-12), math.radians(5)); return root
