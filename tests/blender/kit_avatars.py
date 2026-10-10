"""Аватарки для новостного канала (мегафон) и поддержки (спасательный круг), в стиле иконок v2.
Запуск: blender.exe --background --python tests/blender/kit_avatars.py  env ICONS=megaphone,lifebuoy SIZE SAMPLES OUTDIR"""
import os, sys, math
os.environ["KIT2_RUN"] = "0"; os.environ["KIT_RUN"] = "0"
HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Users\leksik\Documents\Notka\tests\blender"
exec(compile(open(os.path.join(HERE, "kit2.py"), encoding="utf-8").read(), "kit2.py", "exec"))


def adopt(root, obj):
    """привязать объект, лежащий в мировых координатах, к root так, чтобы он ездил вместе с ним"""
    bpy.context.view_layer.update()
    loc = obj.matrix_world.copy()
    obj.parent = root; obj.matrix_parent_inverse = root.matrix_world.inverted(); obj.matrix_world = loc
    return obj


def ic_megaphone():
    root = new_obj("root", None)
    warm = pro("mg_warm", "warm", rough=0.38, glitter=0.03, axis="X", coat=0.6)
    cream = pro("mg_cream", "cream", rough=0.5, grain=1.4, scratch=0.12, leather=0.1)
    plum = pro("mg_plum", "plum", rough=0.4, sheen=0.4, coat=0.6, scratch=0.3)
    dark = pro("mg_dark", "plum", rough=0.5, grain=1.0, scratch=0.0, smudge=False, ao_dist=0.12, edge=0.0)
    chrome = satin_chrome("mg_chrome", "#FBE9D6", 0.18, 520.0)
    TH = math.radians(66)
    prof = [(0.0, 0.0), (0.5, 0.0), (0.66, 0.12), (0.66, 0.8), (0.86, 1.2), (1.95, 3.95), (2.06, 4.12), (1.98, 4.32), (1.82, 4.27), (1.72, 4.08), (0.7, 1.38), (0.0, 1.32)]
    cone = lathe("cone", prof, seg=96, smooth_it=1, subsurf=2); assign(cone, warm); cone.parent = root
    # полосы-кольца на раструбе
    for zz, col in ((2.2, cream), (3.3, cream)):
        r_ = 0.86 + (zz - 1.2) / 2.75 * 1.09
        t = torus("band", r_ + 0.02, 0.1, (0, 0, zz), axis_y=False); assign(t, col); t.parent = root
    # задняя крышка + ручка с кнопкой и ушком
    cap = pillow("cap", [cyl("cp", 0.5, 0.28, (0, 0, -0.04), (0, 0, 0), bevel=0.1, seg=48)], plum, voxel=0.025, smooth=4); cap.parent = root
    grip = pillow("grip", [rbox("g", 0.62, 0.7, 1.5, (1.0, 0, 1.35), 0.22)], plum, voxel=0.025, smooth=5); grip.parent = root
    for k in range(4):
        gr = rbox("gr", 0.66, 0.74, 0.04, (1.0, 0, 0.85 + k * 0.27), 0.012); assign(gr, dark); gr.parent = root
    btn = pillow("btn", [rbox("b", 0.34, 0.22, 0.4, (0.72, 0, 1.95), 0.1)], cream, voxel=0.02, smooth=3); btn.parent = root
    eye = torus("eye", 0.2, 0.05, (1.0, 0, 0.5)); assign(eye, chrome); eye.parent = root
    cone.rotation_euler = root.rotation_euler = (0, 0, 0)
    root.rotation_euler = (0, TH, 0)
    # знак Нотки на раструбе (в мировых координатах, чтобы стоял прямо)
    d = Vector((math.sin(TH), 0, math.cos(TH)))
    p = d * 2.72
    bpy.context.view_layer.update()
    adopt(root, note_decal((p.x, -1.55, p.z + 0.15), 0.9, pro("mg_note", "cream", rough=0.4), None))
    # звуковые волны перед раструбом: три дуги
    c = d * 4.6; a0 = math.atan2(d.z, d.x)
    for k, (R, col) in enumerate(((0.85, plum), (1.4, warm), (1.95, cream))):
        pts = [(c.x + R * math.cos(a0 + math.radians(t)), c.z + R * math.sin(a0 + math.radians(t))) for t in range(-42, 43, 14)]
        arc = pillow("wave", [wtube("w", pts, 0.15 - k * 0.012)], col, voxel=0.02, smooth=4); adopt(root, arc)
    return root


def ic_lifebuoy():
    root = new_obj("root", None)
    warm = pro("lb_warm", "warm", rough=0.36, glitter=0.03, coat=0.7, axis="X")
    cream = pro("lb_cream", "cream", rough=0.45, grain=1.2, scratch=0.1, leather=0.08)
    plum = pro("lb_plum", "plum", rough=0.4, sheen=0.4, coat=0.6, scratch=0.3)
    chrome = satin_chrome("lb_chrome", "#FBE9D6", 0.18, 520.0)
    R, r = 2.6, 1.0
    prof = [(R + r * math.cos(2 * math.pi * i / 48), r * math.sin(2 * math.pi * i / 48)) for i in range(49)]
    ring = lathe("ring", prof, seg=96, smooth_it=0, subsurf=1)
    ring.data.materials.append(warm); ring.data.materials.append(cream)
    for pl in ring.data.polygons:
        cx = sum(ring.data.vertices[v].co.x for v in pl.vertices) / len(pl.vertices); cy = sum(ring.data.vertices[v].co.y for v in pl.vertices) / len(pl.vertices)
        sector = int(((math.atan2(cy, cx) + math.pi) / (2 * math.pi)) * 8)
        pl.material_index = 0 if sector % 2 == 0 else 1
    ring.parent = root
    # ремни-«верёвка» по кругу и ушки
    rope = torus("rope", R + r + 0.02, 0.07, (0, 0, 0), axis_y=False); assign(rope, plum); rope.parent = root
    for k in range(4):
        a = math.radians(45 + 90 * k)
        e = torus("eye", 0.22, 0.05, ((R + r + 0.1) * math.cos(a), (R + r + 0.1) * math.sin(a), 0.0), axis_y=False); assign(e, chrome); e.parent = root
    root.rotation_euler = (math.radians(90), 0, 0)
    root.rotation_euler = (math.radians(90 + 12), math.radians(-14), math.radians(-12))
    # знаки Нотки на белых секторах: по верху и низу круга (мировые координаты, прямые)
    bpy.context.view_layer.update()
    nm = pro("lb_note", "warm", rough=0.4, glitter=0.03)
    for sector in (1, 5):                                     # центры белых секторов
        phi = -math.pi + (sector + 0.5) * math.pi / 4
        W = root.matrix_world @ Vector(((R) * math.cos(phi), (R) * math.sin(phi), r + 0.02))
        adopt(root, note_decal((W.x, W.y - 0.02, W.z), 1.4, nm, None))
    return root


ICONS2["megaphone"] = ic_megaphone; ICONS2["lifebuoy"] = ic_lifebuoy; ICONS["megaphone"] = ic_megaphone; ICONS["lifebuoy"] = ic_lifebuoy

if bpy.app.background:
    PARTICLES = False
    for nm in os.environ.get("ICONS", "megaphone,lifebuoy").split(","):
        try: build_and_render2(nm.strip(), os.environ.get("TAG", "av"))
        except Exception as e:
            import traceback; traceback.print_exc(); print("FAILED", nm, e)
