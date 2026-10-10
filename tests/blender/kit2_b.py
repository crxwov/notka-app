"""kit2, партия B: карта, телефон-плеер, бирка-процент, летучая мышь, кассета. exec из kit2.py"""


def tri_poly(name, pts, depth, loc, mat_, parent, bevel=0.01):
    o = poly_solid(name, pts, depth=depth, loc=loc, bevel=bevel, subsurf=0, mat_=mat_); o.parent = parent; return o


# ================= КАРТА =================
def ic_card2():
    root = new_obj("root", None)
    warm = pro("c_warm", "warm", rough=0.38, glitter=0.035, coat=0.55, axis="Z", scratch=0.3)
    plum = pro("c_plum", "plum", rough=0.4, glitter=0.02, coat=0.5, axis="Z", scratch=0.3)
    cream = pro("c_cream", "cream", rough=0.4, grain=0.8, scratch=0.05, edge=0.0)
    dark = pro("c_dark", "plum", rough=0.55, grain=1.2, scratch=0.0, smudge=False, ao_dist=0.1, edge=0.0)
    chrome = satin_chrome("c_chrome", "#FBE9D6", 0.18, 520.0)
    holo = satin_chrome("c_holo", "#F2E6FF", 0.12, 360.0)
    # задняя карта (слива), виднеется из-за главной
    back = pillow("card_b", [rbox("cb", 5.6, 0.26, 3.5, (1.0, 0.7, 1.0), 0.15)], plum, voxel=0.03, smooth=4); back.rotation_euler = (0, math.radians(-8), 0); back.parent = root
    t0 = text3d("bk", "Нотка Плюс", 0.3, (2.2, 0.55, 2.35), 0.03, cream); t0.rotation_euler = (math.radians(90), math.radians(-8), 0); t0.parent = root
    main = pillow("card", [rbox("c", 5.8, 0.28, 3.65, (0, 0, 0), 0.17)], warm, voxel=0.028, smooth=4); main.parent = root
    # чип с контактными дорожками
    chip = pillow("chip", [rbox("ch", 0.95, 0.1, 0.75, (-2.0, -0.17, 0.4), 0.1)], chrome, voxel=0.02, smooth=3); chip.parent = root
    for dx in (-0.16, 0.16):
        g = rbox("cg", 0.018, 0.12, 0.75, (-2.0 + dx, -0.2, 0.4), 0.004); assign(g, dark); g.parent = root
    for dz in (-0.12, 0.12):
        g = rbox("cg2", 0.95, 0.12, 0.018, (-2.0, -0.2, 0.4 + dz), 0.004); assign(g, dark); g.parent = root
    # бесконтактные дуги
    for rr in (0.28, 0.46, 0.64):
        pts = [(2.1 + rr * math.cos(math.radians(a)) - 0.35, 1.05 + rr * math.sin(math.radians(a))) for a in range(-48, 49, 8)]
        arc = pillow("arc", [wtube("ar", pts, 0.045)], cream, voxel=0.015, smooth=3); arc.location.y = -0.2; arc.parent = root
    note_decal((-2.15, -0.2, 1.1), 0.62, cream, root)
    # номер, имя, срок
    t1 = text3d("num", "0000  0000  0000  0000", 0.3, (-0.2, -0.2, -0.55), 0.03, cream); t1.parent = root
    t2 = text3d("nm", "НОТКА ПЛЮС", 0.2, (-1.55, -0.2, -1.2), 0.025, cream); t2.parent = root
    t3 = text3d("dt", "12/30", 0.18, (1.35, -0.2, -1.2), 0.025, cream); t3.parent = root
    # голографическая полоска и канавка у края
    st = pillow("holo", [rbox("hs", 5.5, 0.05, 0.2, (0, -0.15, -1.52), 0.04)], holo, voxel=0.015, smooth=2); st.parent = root
    root.rotation_euler = (math.radians(26), math.radians(-24), math.radians(-12)); return root


# ================= ТЕЛЕФОН-ПЛЕЕР =================
def ic_phone2():
    root = new_obj("root", None)
    plum = pro("p_body", "plum", rough=0.34, sheen=0.4, coat=0.6, scratch=0.3, axis="Z")
    glass = pro("p_glass", "plum", rough=0.12, coat=1.0, scratch=0.4, smudge=True, axis="Z", edge=0.0)
    warm = pro("p_warm", "warm", rough=0.4, glitter=0.03, axis="Z", edge=0.0)
    cream = pro("p_cream", "cream", rough=0.4, grain=0.8, scratch=0.0, edge=0.0)
    dark = pro("p_dark", "plum", rough=0.5, grain=1.0, scratch=0.0, smudge=False, ao_dist=0.1, edge=0.0)
    chrome = satin_chrome("p_chrome", "#FBE9D6", 0.2, 520.0)
    body = pillow("phone", [rbox("p", 2.7, 0.42, 5.3, (0, 0, 0), 0.55)], plum, voxel=0.028, smooth=4); body.parent = root
    scr = pillow("screen", [rbox("scr", 2.32, 0.1, 4.86, (0, -0.2, 0), 0.42)], glass, voxel=0.02, smooth=3); scr.parent = root
    # боковые кнопки и вырез камеры
    for z, hgt in ((1.0, 0.55), (0.3, 0.55), (-0.5, 0.35)):
        b = pillow("sb", [rbox("sb", 0.12, 0.14, hgt, (-1.38, 0.0, z), 0.04)], chrome, voxel=0.015, smooth=2); b.parent = root
    pb = pillow("pb", [rbox("pb", 0.12, 0.14, 0.9, (1.38, 0.0, 0.7), 0.04)], chrome, voxel=0.015, smooth=2); pb.parent = root
    isl = pillow("isl", [rbox("is", 0.78, 0.1, 0.2, (0, -0.27, 2.2), 0.08)], dark, voxel=0.015, smooth=2); isl.parent = root
    lens = mini_cyl("lens", 0.05, 0.03, (0.22, -0.34, 2.2), (math.radians(90), 0, 0), chrome, 0.01, 16); lens.parent = root
    # интерфейс: обложка, название, прогресс, кнопки
    art = pillow("art", [rbox("ar", 1.7, 0.06, 1.7, (0, -0.27, 0.85), 0.22)], warm, voxel=0.015, smooth=3); art.parent = root
    note_decal((0, -0.31, 0.85), 1.0, cream, root)
    for (w, z, m_) in ((1.4, -0.35, cream), (0.9, -0.62, warm)):
        o = pillow("tt", [rbox("tt", w, 0.05, 0.13, (0, -0.27, z), 0.05)], m_, voxel=0.012, smooth=2); o.parent = root
    tr = pillow("trk", [rbox("tk", 1.9, 0.04, 0.07, (0, -0.27, -1.0), 0.03)], dark, voxel=0.012, smooth=2); tr.parent = root
    fl = pillow("fill", [rbox("fl", 1.0, 0.05, 0.07, (-0.45, -0.28, -1.0), 0.03)], warm, voxel=0.012, smooth=2); fl.parent = root
    kb = sphere("knob", 0.09, (1, 0.6, 1), (0.05, -0.31, -1.0), seg=20, rings=10); assign(kb, cream); kb.parent = root
    pl = mini_cyl("play", 0.33, 0.07, (0, -0.27, -1.65), (math.radians(90), 0, 0), cream, 0.025, 40); pl.parent = root
    tri_poly("ptri", [(-0.1, -0.14), (-0.1, 0.14), (0.15, 0.0)], 0.05, (0.0, -0.33, -1.65), dark, root, 0.01)
    for sx in (-1, 1):
        tri_poly("ntri", [(0, -0.1), (0, 0.1), (sx * 0.17, 0.0)] if sx > 0 else [(0, -0.1), (0, 0.1), (-0.17, 0.0)], 0.05, (sx * 0.85, -0.3, -1.65), cream, root, 0.01)
        r = rbox("nbar", 0.045, 0.05, 0.2, (sx * (0.85 + 0.2), -0.3, -1.65), 0.015); assign(r, cream); r.parent = root
    # статус-бар
    for i in range(3):
        d = sphere("sig", 0.03, (1, 1, 1), (-0.95 + i * 0.09, -0.27, 2.0), seg=10, rings=6); assign(d, cream); d.parent = root
    bt = pillow("bat", [rbox("bt", 0.3, 0.04, 0.1, (0.9, -0.27, 2.0), 0.03)], cream, voxel=0.012, smooth=2); bt.parent = root
    root.rotation_euler = (math.radians(12), math.radians(-26), math.radians(-14)); return root


# ================= БИРКА-ПРОЦЕНТ =================
def ic_tag2():
    root = new_obj("root", None)
    warm = pro("t_warm", "warm", rough=0.4, glitter=0.035, coat=0.5, axis="Z", scratch=0.3)
    cream = pro("t_cream", "cream", rough=0.45, grain=1.2, scratch=0.1, leather=0.1)
    dark = pro("t_dark", "plum", rough=0.55, grain=1.2, scratch=0.0, smudge=False, ao_dist=0.1, edge=0.0)
    chrome = satin_chrome("t_chrome", "#FBE9D6", 0.18, 520.0)
    outline = [(-1.7, -2.6), (1.7, -2.6), (1.7, 1.5), (0.8, 2.6), (-0.8, 2.6), (-1.7, 1.5)]
    sl = poly_solid("tag_s", outline, depth=0.55, bevel=0.28, subsurf=2)
    hole = cyl("hole", 0.3, 1.2, (0, 0, 1.85), (math.radians(90), 0, 0), bevel=0, seg=48)
    tag = pillow("tag", [carve(to_mesh_obj("tag_c", sl), [hole], None, "tag_cut")], warm, voxel=0.028, smooth=3); tag.parent = root
    for o_ in list(bpy.data.objects):
        if o_.name.startswith("tag_s"): bpy.data.objects.remove(o_, do_unlink=True)
    eye = torus("eye", 0.36, 0.08, (0, -0.28, 1.85)); assign(eye, chrome); eye.parent = root
    cord = pillow("cord", [wtube("cd", [(0.0, 1.85), (-0.3, 2.9), (0.6, 3.8), (1.3, 3.1), (0.5, 2.5)], 0.07)], cream, voxel=0.018, smooth=3); cord.location.y = -0.3; cord.parent = root
    # объёмный «%» (шрифт) + блёстки
    t = text3d("pct", "%", 3.2, (0.0, -0.3, -0.45), 0.34, cream); t.parent = root
    inset = [(x * 0.86, z * 0.88 + 0.0) for x, z in outline]; inset.append(inset[0])
    stitch_on_surface(inset, 0.05, cream, root)
    t2 = text3d("sub", "Нотка Плюс", 0.26, (0.0, -0.3, -2.1), 0.03, cream); t2.parent = root
    for (x, z) in ((-1.3, 0.95), (1.3, 0.95)):
        rv = mini_cyl("rv", 0.1, 0.06, (x, -0.3, z), (math.radians(90), 0, 0), chrome, 0.025, 20); rv.parent = root
    root.rotation_euler = (math.radians(8), math.radians(-24), math.radians(-16)); return root


# ================= ЛЕТУЧАЯ МЫШЬ =================
def ic_bat2():
    root = new_obj("root", None)
    plum = pro("b_plum", "plum", rough=0.4, sheen=0.5, coat=0.45, scratch=0.2, grain=1.4, leather=0.2)
    wing_m = pro("b_wing", "plum", rough=0.38, coat=0.5, scratch=0.15, grain=1.0, axis="X")
    rose = pro("b_rose", "rose", rough=0.45, glitter=0.02, grain=1.2)
    cream = pro("b_cream", "cream", rough=0.35, grain=0.8, scratch=0.0, edge=0.0)
    dark = pro("b_dark", "plum", rough=0.25, coat=1.0, grain=0.6, scratch=0.0, smudge=False, ao_dist=0.1, edge=0.0)
    body = pillow("body", [sphere("bd", 1.0, (1.0, 0.85, 1.12), (0, 0, 0)), sphere("tuft", 0.6, (1, 0.7, 0.8), (0, -0.55, -0.55))] +
                  [sphere("ear", 0.42, (0.75, 0.55, 1.5), (sx * 0.62, 0, 1.0)) for sx in (-1, 1)], plum, voxel=0.024, smooth=10); body.parent = root
    for sx in (-1, 1):
        ie = pillow("iear", [sphere("ie", 0.3, (0.55, 0.3, 1.2), (sx * 0.62, -0.28, 1.0))], rose, voxel=0.02, smooth=4); ie.parent = root
        eye = sphere("eye", 0.2, (1, 0.7, 1.15), (sx * 0.38, -0.78, 0.18), seg=32, rings=16); assign(eye, dark); eye.parent = root
        hl = sphere("ehl", 0.06, (1, 0.5, 1), (sx * 0.33, -0.93, 0.28), seg=12, rings=8); assign(hl, glow("hl", "#FFFFFF", 12.0)); hl.parent = root
        ch = sphere("chk", 0.17, (1, 0.35, 0.8), (sx * 0.62, -0.74, -0.18), seg=20, rings=10); assign(ch, rose); ch.parent = root
        fang = sphere("fang", 0.07, (0.8, 0.8, 1.9), (sx * 0.13, -0.88, -0.42), seg=16, rings=8); assign(fang, cream); fang.parent = root
        foot = pillow("foot", [sphere("ft", 0.2, (0.8, 0.7, 1.0), (sx * 0.4, -0.2, -1.1))] + [sphere("cl", 0.06, (0.5, 0.5, 1.6), (sx * (0.4 + k * 0.1), -0.26, -1.34)) for k in (-1, 0, 1)], plum, voxel=0.018, smooth=3); foot.parent = root
    nose = sphere("nose", 0.07, (1, 0.7, 0.7), (0, -0.92, -0.05), seg=16, rings=8); assign(nose, rose); nose.parent = root
    mouth = wtube("mouth", [(-0.2, -0.28), (-0.1, -0.36), (0.0, -0.3), (0.1, -0.36), (0.2, -0.28)], 0.022); mouth.location.y = -0.9; assign(mouth, dark); mouth.parent = root
    # крылья: перепонка со скалоп-краем + костные лучи
    for sx in (-1, 1):
        mem = [(0.7, 0.55), (1.5, 0.9), (2.6, 1.15), (3.7, 0.8), (4.3, 0.1), (3.6, -0.15), (3.3, -0.95), (2.6, -0.45), (2.1, -1.2), (1.4, -0.55), (0.9, -0.9), (0.65, -0.2)]
        pts = [(sx * x, z) for x, z in mem]
        if sx < 0: pts = pts[::-1]
        w = poly_solid("wing", pts, depth=0.09, bevel=0.03, subsurf=1, mat_=wing_m); w.location = (0, 0.18, 0); w.parent = root
        for (tx, tz) in ((4.3, 0.1), (3.7, 0.8), (3.3, -0.95), (2.1, -1.2)):
            bn = pillow("bone", [wtube("bn", [(sx * 0.7, 0.45), (sx * (0.7 + (tx - 0.7) * 0.5), 0.45 + (tz - 0.45) * 0.5 + 0.2), (sx * tx, tz)], 0.06)], plum, voxel=0.015, smooth=3); bn.location.y = 0.1; bn.parent = root
    root.rotation_euler = (math.radians(6), math.radians(-10), math.radians(-8)); return root


# ================= КАССЕТА =================
def ic_cassette2():
    root = new_obj("root", None)
    plum = pro("k_plum", "plum", rough=0.42, sheen=0.45, coat=0.5, scratch=0.35, grain=1.2, axis="X")
    cream = pro("k_cream", "cream", rough=0.5, grain=1.3, scratch=0.12, leather=0.1, axis="Z")
    warm = pro("k_warm", "warm", rough=0.42, glitter=0.03, axis="X")
    dark = pro("k_dark", "plum", rough=0.35, coat=0.8, grain=0.8, scratch=0.0, smudge=False, ao_dist=0.1, edge=0.0)
    chrome = satin_chrome("k_chrome", "#FBE9D6", 0.2, 520.0)
    body = pillow("cas", [rbox("c", 5.2, 0.8, 3.4, (0, 0, 0), 0.3)], plum, voxel=0.028, smooth=4); body.parent = root
    lab = pillow("lab", [rbox("lb", 4.5, 0.1, 2.05, (0, -0.42, 0.5), 0.14)], cream, voxel=0.02, smooth=3); lab.parent = root
    for k in range(4):
        ln = rbox("rule", 3.9, 0.04, 0.018, (0, -0.48, 1.12 - k * 0.3), 0.005); assign(ln, dark); ln.parent = root
    stripe = pillow("stripe", [rbox("sp", 4.5, 0.08, 0.4, (0, -0.47, 1.45), 0.08)], warm, voxel=0.018, smooth=2); stripe.parent = root
    t = text3d("mix", "Нотка Mix 01", 0.3, (-0.8, -0.5, 0.9), 0.025, dark); t.parent = root
    win = pillow("win", [rbox("w", 2.9, 0.14, 0.95, (0, -0.44, -0.18), 0.4)], dark, voxel=0.02, smooth=3); win.parent = root
    for sx in (-1, 1):
        rim = torus("rim", 0.42, 0.07, (sx * 1.0, -0.52, -0.18)); assign(rim, chrome); rim.parent = root
        hub = mini_cyl("hub", 0.24, 0.08, (sx * 1.0, -0.52, -0.18), (math.radians(90), 0, 0), cream, 0.02, 40); hub.parent = root
        for k in range(6):
            a = math.radians(60 * k)
            sp = rbox("spk", 0.07, 0.07, 0.2, (sx * 1.0 + 0.2 * math.cos(a), -0.58, -0.18 + 0.2 * math.sin(a)), 0.015); sp.rotation_euler = (0, -a + math.radians(90), 0); assign(sp, dark); sp.parent = root
        wrap = torus("tape", 0.52, 0.07 + (0.05 if sx > 0 else 0.0), (sx * 1.0, -0.5, -0.18)); assign(wrap, dark); wrap.parent = root
    # низ с трапецией, отверстиями и винты по углам
    bot = pillow("bot", [rbox("bt", 3.4, 0.1, 0.72, (0, -0.42, -1.3), 0.2)], warm, voxel=0.02, smooth=3); bot.parent = root
    for x in (-1.1, -0.35, 0.35, 1.1):
        h = mini_cyl("hole", 0.11, 0.1, (x, -0.5, -1.3), (math.radians(90), 0, 0), dark, 0.01, 24); h.parent = root
    for (x, z) in ((-2.4, 1.45), (2.4, 1.45), (-2.4, -1.45), (2.4, -1.45), (0.0, 1.55)):
        sc_ = screw("scr", (x, -0.42, z), 0.1, "Y", chrome, None, 0.06); sc_.parent = root
        sl = rbox("slot", 0.15, 0.07, 0.025, (x, -0.47, z), 0.005); assign(sl, dark); sl.parent = root
    # выпавшая лента — глянцевая петля
    ribbon = pillow("tape_o", [wtube("tp", [(1.0, -0.9), (1.9, -2.1), (3.2, -2.3), (3.7, -1.3), (2.9, -0.7), (2.4, -1.5)], 0.06)], dark, voxel=0.015, smooth=4); ribbon.location.y = -0.3; ribbon.parent = root
    root.rotation_euler = (math.radians(14), math.radians(-14), math.radians(-14)); return root
