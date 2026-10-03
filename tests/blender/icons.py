"""Нотка: пак 3D-иконок v2. Запуск:
blender.exe --background --python tests/blender/icons.py -- header,day,friend,atmo
Все иконки делят один свет, камеру, ракурс и материалы — отсюда единый стиль.
Палитра Нотки: оранжевый FF6A2E → розовый E23C8C → фиолет 6D34E0, плюс радужный хром."""
import bpy, math, sys, os, bmesh
from mathutils import Vector

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
os.makedirs(OUT, exist_ok=True)
SIZE = 768
names = (sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "header,day,friend,atmo").split(",")
# один и тот же наклон у всех иконок: чуть вниз, чуть вбок, чуть завалены — видна толщина и боковая грань
TILT = (math.radians(8), math.radians(7), math.radians(24))


def hexc(h, a=1.0):
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c]
    return (*lin, a)


# ---------- материалы ----------
def _mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    return m, m.node_tree.nodes, m.node_tree.links


def _set(node, key, val):
    if key in node.inputs:
        node.inputs[key].default_value = val


def ramp(n, stops):
    r = n.new("ShaderNodeValToRGB"); el = r.color_ramp.elements
    while len(el) > 1: el.remove(el[-1])
    el[0].position, el[0].color = stops[0]
    for pos, col in stops[1:]:
        k = el.new(pos); k.color = col
    return r


NOTKA = [(0.0, hexc("#FF7A33")), (0.35, hexc("#F0307F")), (0.7, hexc("#7A33F0")), (1.0, hexc("#3B3BE8"))]
RAINBOW = [(0.0, hexc("#FF9A3D")), (0.2, hexc("#FF3D9A")), (0.4, hexc("#8A3DFF")), (0.6, hexc("#2DB6FF")), (0.8, hexc("#3DFFC4")), (1.0, hexc("#FFD84D"))]


def chrome(name, stops=NOTKA, mix=0.4, rough=0.05, angle=0.0, flip=False):
    """глянцевый металл: цвет плывёт по палитре вдоль формы + радужный перелив по отражению"""
    m, n, l = _mat(name); b = n["Principled BSDF"]
    _set(b, "Metallic", 0.92); _set(b, "Roughness", rough)
    _set(b, "Coat Weight", 1.0); _set(b, "Coat Roughness", 0.02)
    _set(b, "Thin Film Thickness", 520.0); _set(b, "Thin Film IOR", 1.7)
    tc = n.new("ShaderNodeTexCoord"); sep = n.new("ShaderNodeSeparateXYZ"); l.new(tc.outputs["Object"], sep.inputs[0])
    # градиент по форме: по диагонали (объектные оси Blender: x вправо, z вверх)
    sub = n.new("ShaderNodeMath"); sub.operation = "SUBTRACT" if not flip else "ADD"
    l.new(sep.outputs["X"], sub.inputs[0]); l.new(sep.outputs["Z"], sub.inputs[1])
    d = n.new("ShaderNodeMath"); d.operation = "MULTIPLY_ADD"; d.inputs[1].default_value = 0.3; d.inputs[2].default_value = 0.5
    l.new(sub.outputs[0], d.inputs[0])
    base = ramp(n, stops); l.new(d.outputs[0], base.inputs["Fac"])
    # радуга по отражению
    rs = n.new("ShaderNodeSeparateXYZ"); l.new(tc.outputs["Reflection"], rs.inputs[0])
    ra = n.new("ShaderNodeMath"); ra.operation = "MULTIPLY_ADD"; ra.inputs[1].default_value = 0.55; ra.inputs[2].default_value = 0.5 + angle
    l.new(rs.outputs["X"], ra.inputs[0])
    rr = ramp(n, RAINBOW); l.new(ra.outputs[0], rr.inputs["Fac"])
    mx = n.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.inputs[0].default_value = mix
    l.new(base.outputs["Color"], mx.inputs[6]); l.new(rr.outputs["Color"], mx.inputs[7])
    l.new(mx.outputs[2], b.inputs["Base Color"])
    # едва заметная живая неровность: лёгкий рельеф и разброс блеска
    nz = n.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 7.0; nz.inputs["Detail"].default_value = 6.0
    l.new(tc.outputs["Object"], nz.inputs["Vector"])
    bm = n.new("ShaderNodeBump"); bm.inputs["Strength"].default_value = 0.006; bm.inputs["Distance"].default_value = 0.05
    l.new(nz.outputs["Fac"], bm.inputs["Height"]); l.new(bm.outputs["Normal"], b.inputs["Normal"])
    return m


def glass(name="glass", tint="#FFFFFF", rough=0.02, film=380.0):
    """настоящее стекло: преломляет, по краю радужная плёнка"""
    m, n, l = _mat(name); b = n["Principled BSDF"]
    _set(b, "Base Color", hexc(tint)); _set(b, "Roughness", rough); _set(b, "IOR", 1.5)
    _set(b, "Transmission Weight", 1.0); _set(b, "Thin Film Thickness", film); _set(b, "Thin Film IOR", 1.6)
    return m


def glow(name="glow", stops=None, strength=2.2):
    """светящееся ядро: цвета Нотки плывут по форме, как в шаре Нотки"""
    stops = stops or [(0.0, hexc("#FF9A3D")), (0.28, hexc("#FF4A22")), (0.6, hexc("#E0267F")), (1.0, hexc("#6228E0"))]
    m, n, l = _mat(name); b = n["Principled BSDF"]
    _set(b, "Roughness", 0.5); _set(b, "Base Color", (0, 0, 0, 1))
    tc = n.new("ShaderNodeTexCoord"); sep = n.new("ShaderNodeSeparateXYZ"); l.new(tc.outputs["Object"], sep.inputs[0])
    sub = n.new("ShaderNodeMath"); sub.operation = "SUBTRACT"; l.new(sep.outputs["Z"], sep.outputs["X"]) if False else None
    d = n.new("ShaderNodeMath"); d.operation = "SUBTRACT"
    l.new(sep.outputs["X"], d.inputs[0]); l.new(sep.outputs["Z"], d.inputs[1])
    d2 = n.new("ShaderNodeMath"); d2.operation = "MULTIPLY_ADD"; d2.inputs[1].default_value = 0.42; d2.inputs[2].default_value = 0.5
    l.new(d.outputs[0], d2.inputs[0])
    r = ramp(n, stops); l.new(d2.outputs[0], r.inputs["Fac"])
    l.new(r.outputs["Color"], b.inputs["Emission Color"]); _set(b, "Emission Strength", strength)
    return m


def pearl(name="pearl"):
    """глянцевый светлый «жемчуг» для символов"""
    m, n, l = _mat(name); b = n["Principled BSDF"]
    _set(b, "Base Color", hexc("#E9D6C8")); _set(b, "Roughness", 0.28); _set(b, "Coat Weight", 0.6)
    return m


# ---------- заготовки форм ----------
def P(x, y, z):  # «как на экране»: x вправо, y вверх, z к зрителю
    return (x, -z, y)


def finish(o, mat, subsurf=0):
    for p in o.data.polygons:
        p.use_smooth = True
    if subsurf:
        s = o.modifiers.new("s", "SUBSURF"); s.levels = 2; s.render_levels = subsurf
    o.data.materials.append(mat); return o


def pillow(w, h, d, r, mat, pos=(0, 0, 0)):
    """толстая «надутая» плашка с большим скруглением"""
    bpy.ops.mesh.primitive_cube_add(size=1, location=P(*pos))
    o = bpy.context.active_object; o.scale = (w, d, h); bpy.ops.object.transform_apply(scale=True)
    bv = o.modifiers.new("b", "BEVEL"); bv.width = r; bv.segments = 32; bv.limit_method = "NONE"; bv.profile = 0.5
    return finish(o, mat)


def ball(r, mat, pos=(0, 0, 0), sc=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=96, ring_count=64, location=P(*pos))
    o = bpy.context.active_object; o.scale = (sc[0], sc[2], sc[1]); return finish(o, mat)


def torus(R, r, mat, pos=(0, 0, 0), rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=160, minor_segments=48, location=P(*pos))
    o = bpy.context.active_object; o.rotation_euler = rot; return finish(o, mat)


def poly(points, depth, bevel, mat, pos=(0, 0, 0)):
    """плоская фигура с толщиной и сильным скруглением"""
    me = bpy.data.meshes.new("x"); o = bpy.data.objects.new("x", me); bpy.context.collection.objects.link(o)
    bm = bmesh.new(); vs = [bm.verts.new(Vector((px, 0, py))) for px, py in points]
    f = bm.faces.new(vs); bm.normal_update()
    r = bmesh.ops.extrude_face_region(bm, geom=[f]); mv = [v for v in r["geom"] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, -depth, 0), verts=mv); bm.to_mesh(me); bm.free()   # к зрителю
    o.location = P(*pos); o.location.y += depth / 2
    bv = o.modifiers.new("b", "BEVEL"); bv.width = bevel; bv.segments = 12; bv.limit_method = "NONE"
    return finish(o, mat, 2)


def puffy(points, depth, bevel, mat, pos=(0, 0, 0), smooth=140):
    """контур → «надутая» подушка: толстая заготовка, плотная сетка, сильное сглаживание"""
    o = poly(points, depth, 0.02, mat, pos)
    o.modifiers.clear()
    rm = o.modifiers.new("r", "REMESH"); rm.mode = "VOXEL"; rm.voxel_size = 0.03
    sm = o.modifiers.new("m", "SMOOTH"); sm.factor = 0.9; sm.iterations = smooth
    sd = o.modifiers.new("s", "SUBSURF"); sd.levels = 1; sd.render_levels = 2
    return o


def cloud_outline(circles, floor, n=96):
    """внешний контур объединения кругов, снизу срезанный ровно"""
    cx = sum(c[0] for c in circles) / len(circles); cy = sum(c[1] for c in circles) / len(circles)
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n; dx, dy = math.cos(a), math.sin(a); best = 0
        for x, y, r in circles:
            ox, oy = cx - x, cy - y; b = ox * dx + oy * dy; c = ox * ox + oy * oy - r * r; disc = b * b - c
            if disc >= 0: best = max(best, -b + math.sqrt(disc))
        pts.append((cx + dx * best, max(cy + dy * best, floor)))
    return pts


def sparkle(size, mat, pos):
    pts = []
    for i in range(8):
        a = i * math.pi / 4 + math.pi / 2; rad = size if i % 2 == 0 else size * 0.32
        pts.append((math.cos(a) * rad, math.sin(a) * rad))
    return poly(pts, size * 0.4, size * 0.13, mat, pos)


def blob(parts, mat, pos=(0, 0, 0)):
    """слитая мягкая форма из метаболов: parts = [(x,y,z, радиус, (sx,sy,sz)), ...]"""
    mb = bpy.data.metaballs.new("mb"); mb.resolution = 0.03; mb.render_resolution = 0.03; mb.threshold = 0.12
    o = bpy.data.objects.new("blob", mb); bpy.context.collection.objects.link(o)
    for x, y, z, r, sc in parts:
        e = mb.elements.new(); e.type = "ELLIPSOID"; e.co = P(x, y, z); e.radius = r; e.stiffness = 2.0
        e.size_x, e.size_y, e.size_z = sc[0], sc[2], sc[1]
    o.location = P(*pos); o.data.materials.append(mat); return o


def group(objs):
    e = bpy.data.objects.new("grp", None); bpy.context.collection.objects.link(e)
    for o in objs:
        o.parent = e
    e.rotation_euler = TILT; return e


def arc(pts, r, mat):
    """дуга-трубка по точкам (x, y, z) — для улыбки"""
    cu = bpy.data.curves.new("t", "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = r; cu.bevel_resolution = 12; cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER"); sp.bezier_points.add(len(pts) - 1)
    for bp, (x, y, z) in zip(sp.bezier_points, pts):
        bp.co = P(x, y, z); bp.handle_left_type = bp.handle_right_type = "AUTO"
    o = bpy.data.objects.new("t", cu); bpy.context.collection.objects.link(o); o.data.materials.append(mat); return o


def drop(r, mat, pos):
    return ball(r, mat, pos, (0.8, 1.25, 0.8))


# ---------- иконки ----------
def note(PE, z, pos=(0, 0), k=1.0):
    x, y = pos
    head = ball(0.36 * k, PE, (x - 0.32 * k, y - 0.62 * k, z), (1.2, 1, 0.85))
    stem = pillow(0.16 * k, 1.35 * k, 0.22 * k, 0.07 * k, PE, (x + 0.0, y + 0.0, z))
    flag = pillow(0.62 * k, 0.2 * k, 0.22 * k, 0.09 * k, PE, (x + 0.27 * k, y + 0.5 * k, z)); flag.rotation_euler = (0, math.radians(40), 0)
    return [head, stem, flag]


def build(name):
    BODY = chrome("body"); BODY2 = chrome("body2", angle=0.2, flip=True)
    PE = pearl(); CH = chrome("acc", stops=RAINBOW, mix=0.7, rough=0.04)
    GL = glass("glass", "#EEE3FF"); GLOW = glow("glow", strength=1.6)
    DK = chrome("dark", stops=[(0.0, hexc("#7A3BFF")), (0.5, hexc("#4B1FD0")), (1.0, hexc("#1E0A66"))], mix=0.35, rough=0.06)
    if name == "header":  # Нотка Плюс: стеклянный шар Нотки с живым ядром, нотой и хромовым кольцом
        shell = ball(1.3, GL); core = ball(1.04, GLOW)
        parts = [shell, core] + note(DK, 0.98, (0.1, 0.05), 1.0)
        ring = torus(1.78, 0.075, CH, (0, 0, 0), (math.radians(72), math.radians(-18), 0))
        bead = ball(0.2, CH, (-1.62, -0.55, 0.62))
        s1 = sparkle(0.42, CH, (1.55, 1.3, 0.7)); s2 = sparkle(0.2, CH, (-1.7, 1.2, 0.5))
        return group(parts + [ring, bead, s1, s2])
    if name == "day":  # В этот день: стеклянный календарь с живой страницей
        frame = pillow(2.4, 2.4, 1.0, 0.5, GL)
        card = pillow(1.98, 1.9, 0.62, 0.3, GLOW, (0, -0.1, 0.0))
        loops = [torus(0.3, 0.075, CH, (x, 1.28, 0.05), (0, math.radians(90), 0)) for x in (-0.62, 0.62)]
        tri = poly([(-0.36, -0.46), (0.54, 0), (-0.36, 0.46)], 0.22, 0.12, DK, (0.04, -0.2, 0.38))
        s = sparkle(0.34, CH, (1.55, 1.0, 0.6))
        return group([frame, card, tri, s] + loops)
    if name == "friend":  # Друг Нотки: хромовое сердце
        pts = [(16 * math.sin(t) ** 3 / 13.0, (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)) / 13.0 + 0.2)
               for t in [i * 2 * math.pi / 26 for i in range(26)]]
        inner_pts = [(x * 0.78, y * 0.78 + 0.02) for x, y in pts]
        shell = puffy(pts, 1.1, 0.2, glass("hglass", "#FFE6F4"), (0, 0, 0), smooth=110)
        core = puffy(inner_pts, 0.7, 0.2, chrome("heart", mix=0.3, rough=0.045), (0, 0, 0), smooth=110)
        heart = shell
        s = sparkle(0.36, CH, (1.4, 1.1, 0.6)); s2 = sparkle(0.18, CH, (-1.3, -0.9, 0.5))
        return group([shell, core, s, s2])
    if name == "atmo":  # Атмосферы: матовое стеклянное облако со светом внутри
        circ = [(-1.0, -0.4, 0.6), (-0.35, 0.15, 0.85), (0.5, 0.05, 0.75), (1.05, -0.4, 0.6), (0.0, -0.45, 0.7)]
        outer = puffy(cloud_outline(circ, -0.85), 1.05, 0.2, glass("frost", "#F4E8FF", 0.22), (0, 0.15, 0), smooth=70)
        inner = puffy(cloud_outline([(x * 0.82, y * 0.82, r * 0.82) for x, y, r in circ], -0.7), 0.6, 0.2, GLOW, (0, 0.1, 0), smooth=70)
        d1 = ball(0.27, CH, (-0.4, -1.45, 0.45), (0.8, 1.25, 0.8)); d2 = ball(0.21, CH, (0.5, -1.35, 0.4), (0.8, 1.25, 0.8))
        s = sparkle(0.34, CH, (1.45, 1.1, 0.6))
        return group([outer, inner, d1, d2, s])
    if name == "mood":  # Настроение: стеклянный шар-смайл со светящимся ядром
        shell = ball(1.3, GL); core = ball(1.04, GLOW)
        eyes = [ball(0.21, DK, (x, 0.24, 0.96), (0.85, 1.4, 0.75)) for x in (-0.36, 0.36)]
        smile = arc([(-0.52, -0.1, 0.9), (0.0, -0.46, 1.02), (0.52, -0.1, 0.9)], 0.095, DK)
        cheeks = [ball(0.16, CH, (x, -0.02, 0.95), (1.2, 0.8, 0.5)) for x in (-0.72, 0.72)]
        s1 = sparkle(0.4, CH, (1.45, 1.2, 0.7)); s2 = sparkle(0.2, CH, (-1.5, -1.0, 0.5))
        # лицо разворачиваем обратно к зрителю: шар наклонён, как у всех, а улыбка смотрит прямо
        face = bpy.data.objects.new("face", None); bpy.context.collection.objects.link(face)
        for o in eyes + [smile]: o.parent = face
        from mathutils import Euler
        face.rotation_euler = Euler(TILT).to_matrix().inverted().to_euler()
        return group([shell, core, s1, s2, face])
    raise SystemExit("нет иконки " + name)


# ---------- сцена: мягкое окружение, камера, рендер ----------
SAMPLES = int(os.environ.get("SAMPLES", 256)); SIZE = int(os.environ.get("SIZE", SIZE))


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene; sc.render.engine = "CYCLES"; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
    sc.cycles.device = "CPU"; sc.render.resolution_x = sc.render.resolution_y = SIZE
    sc.render.film_transparent = True; sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"
    sc.cycles.max_bounces = 16; sc.cycles.transmission_bounces = 16; sc.cycles.glossy_bounces = 8
    sc.view_settings.view_transform = "Standard"
    try: sc.view_settings.look = "Medium High Contrast"
    except Exception: pass
    # окружение: плавный цветной градиент + мягкие светлые пятна, без видимых софтбоксов
    w = bpy.data.worlds.new("w"); w.use_nodes = True; sc.world = w; n = w.node_tree.nodes; l = w.node_tree.links
    bg = n["Background"]; tc = n.new("ShaderNodeTexCoord"); sep = n.new("ShaderNodeSeparateXYZ"); l.new(tc.outputs["Generated"], sep.inputs[0])
    vr = ramp(n, [(0.0, hexc("#2A0F66")), (0.28, hexc("#E0267F")), (0.5, hexc("#FF8A4A")), (0.72, hexc("#FFE9D2")), (1.0, hexc("#7C9CFF"))])
    l.new(sep.outputs["Z"], vr.inputs["Fac"])
    base = vr
    def spot(vec, power, color, strength):
        dot = n.new("ShaderNodeVectorMath"); dot.operation = "DOT_PRODUCT"; dot.inputs[1].default_value = vec
        nrm = n.new("ShaderNodeVectorMath"); nrm.operation = "NORMALIZE"
        l.new(tc.outputs["Generated"], nrm.inputs[0]); l.new(nrm.outputs[0], dot.inputs[0])
        mr = n.new("ShaderNodeMapRange"); mr.inputs[1].default_value = power; mr.inputs[2].default_value = 1.0; mr.interpolation_type = "SMOOTHSTEP"
        mr.inputs[3].default_value = 0.0; mr.inputs[4].default_value = strength; l.new(dot.outputs["Value"], mr.inputs["Value"])
        return mr, color
    return_nodes = []
    mix_prev = base.outputs["Color"]
    for vec, power, color, strength in (((-0.55, -0.6, 0.55), 0.55, (1, 0.95, 0.9), 4.0), ((0.7, -0.35, 0.2), 0.7, (0.55, 0.75, 1.0), 2.0),
                                         ((-0.2, 0.8, 0.3), 0.6, (1.0, 0.5, 0.9), 1.5)):
        mr, col = spot(vec, power, color, strength)
        mul = n.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "ADD"; mul.inputs[7].default_value = (*col, 1)
        l.new(mr.outputs["Result"], mul.inputs[0]); l.new(mix_prev, mul.inputs[6]); mix_prev = mul.outputs[2]
    l.new(mix_prev, bg.inputs["Color"]); bg.inputs["Strength"].default_value = 1.0

    # мягкое «солнце» даёт только тень и объём (в отражениях его нет)
    sun = bpy.data.lights.new("sun", "SUN"); sun.energy = 2.5; sun.angle = math.radians(22); sun.color = (1, 0.96, 0.92)
    so = bpy.data.objects.new("sun", sun); bpy.context.collection.objects.link(so)
    so.rotation_euler = (math.radians(55), math.radians(10), math.radians(-35))
    so.visible_glossy = False; so.visible_transmission = False
    cam = bpy.data.cameras.new("c"); cam.lens = 70; cam.sensor_width = 36
    co = bpy.data.objects.new("c", cam); bpy.context.collection.objects.link(co)
    co.location = (0, -11.5, 1.2); co.rotation_euler = (math.radians(90 - 6), 0, 0)
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -2.1)); fl = bpy.context.active_object; fl.is_shadow_catcher = True
    sc.camera = co; return sc


for nm in names:
    sc = setup(); build(nm)
    sc.render.filepath = os.path.join(OUT, nm + ".png"); bpy.ops.render.render(write_still=True); print("RENDERED", nm)
