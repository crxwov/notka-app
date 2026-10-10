"""Нотка: 3D-иконка знака (нота). Пухлая мягкая форма + «живые» матовые материалы.
exec из живого Блендера или blender.exe --background --python tests/blender/icon_logo.py (env SAMPLES, W, H, VARIANT)"""
import bpy, bmesh, math, os, sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Users\leksik\Documents\Notka\tests\blender"
sys.path.insert(0, HERE)
import importlib, ghost_lib as G
importlib.reload(G)
from ghost_lib import *

OUT = os.path.join(HERE, "out"); os.makedirs(OUT, exist_ok=True)
SAMPLES = int(os.environ.get("SAMPLES", 48)); W = int(os.environ.get("W", 1800)); H = int(os.environ.get("H", 800))

CORE, WARM, MID, DEEP, LIKED = "#FFE2D2", "#EE905A", "#CF5A68", "#47204E", "#FF5C93"
S = 0.2          # масштаб логотипа (24 ед. SVG -> 4.8 м)
T = 0.78         # толщина (пухлость)

clear_all()
sc = bpy.context.scene


def P(X, Y): return ((X - 14.3) * S, (11.0 - Y) * S)      # SVG -> (x, z)


# ---------- форма знака: пухлые «надутые» части со сглаженными стыками ----------
def to_mesh_obj(name, src, mats=()):
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(src.evaluated_get(dg))
    me.transform(src.matrix_world); me.materials.clear()
    o = new_obj(name, me)
    for m in mats: o.data.materials.append(m)
    return o


def heal(o):
    """замкнуть сетку: склеить дубли, заделать дыры, нормали наружу (иначе булева операция игнорирует часть)"""
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    edges = [e for e in bm.edges if e.is_boundary]
    if edges: bmesh.ops.holes_fill(bm, edges=edges, sides=256)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data); bm.free(); o.data.update(); return o


def tube(name, pts, hw=1.45):
    """штрих как круглая трубка. pts: [(точка, ручка_слева, ручка_справа)] в координатах SVG"""
    cd = bpy.data.curves.new(name, "CURVE"); cd.dimensions = "3D"; cd.bevel_depth = hw * S; cd.bevel_resolution = 16
    cd.resolution_u = 32; cd.use_fill_caps = True
    sp = cd.splines.new("BEZIER"); sp.bezier_points.add(len(pts) - 1)
    for bp, (c, hl, hr) in zip(sp.bezier_points, pts):
        x, z = P(*c); bp.co = (x, 0, z)
        bp.handle_left_type = bp.handle_right_type = "FREE"
        hx, hz = P(*(hl or c)); bp.handle_left = (hx, 0, hz)
        hx, hz = P(*(hr or c)); bp.handle_right = (hx, 0, hz)
    return new_obj(name, cd)


def ball(name, c, r, ysc=1.0):
    x, z = P(*c)
    return sphere(name, r * S, (1, ysc, 1), (x, 0, z), seg=64, rings=32)


def merge(name, parts, mats=(), voxel=0.02, smooth=14):
    parts = [to_mesh_obj(name + "_p%d" % i, q) for i, q in enumerate(parts)] if False else parts
    meshes = [heal(to_mesh_obj(name + "_p%d" % i, q)) for i, q in enumerate(parts)]
    for q in parts: bpy.data.objects.remove(q, do_unlink=True)
    parts = meshes
    base = to_mesh_obj(name + "_0", parts[0])
    for p in parts[1:]:
        bo = base.modifiers.new("u", "BOOLEAN"); bo.object = p; bo.operation = "UNION"; bo.solver = "MANIFOLD"
    u = to_mesh_obj(name + "_u", base)
    rm = u.modifiers.new("rem", "REMESH"); rm.mode = "VOXEL"; rm.voxel_size = voxel
    sm = u.modifiers.new("sm", "SMOOTH"); sm.factor = 0.85; sm.iterations = smooth
    o = to_mesh_obj(name, u, mats)
    for q in [base, u] + list(parts): bpy.data.objects.remove(q, do_unlink=True)
    for pl in o.data.polygons: pl.use_smooth = True
    return o


# ---------- материалы: живая матовая фактура ----------
def soft_touch(name, stops, lo=-1.0, hi=1.0, rough=0.5, sheen=0.5, glitter=0.0, glitter_col="#FFFFFF", grain=1.0, sss=0.25, axis="Z"):
    m, n, l = mat(name); b = bsdf(n.values())
    tc = n.new("ShaderNodeTexCoord")
    sep = n.new("ShaderNodeSeparateXYZ"); l.new(tc.outputs["Object"], sep.inputs[0])
    mp = n.new("ShaderNodeMapRange"); mp.inputs["From Min"].default_value = lo; mp.inputs["From Max"].default_value = hi
    l.new(sep.outputs[axis], mp.inputs["Value"])
    # цвет: градиент + крупное неровное «облако» (разброс оттенка, как на литой пластмассе)
    cloud = n.new("ShaderNodeTexNoise"); cloud.inputs["Scale"].default_value = 1.6; cloud.inputs["Detail"].default_value = 6
    l.new(tc.outputs["Object"], cloud.inputs["Vector"])
    shift = n.new("ShaderNodeMath"); shift.operation = "MULTIPLY_ADD"; shift.inputs[1].default_value = 0.34; shift.inputs[2].default_value = -0.17
    l.new(cloud.outputs["Fac"], shift.inputs[0])
    gpos = n.new("ShaderNodeMath"); gpos.operation = "ADD"; l.new(mp.outputs["Result"], gpos.inputs[0]); l.new(shift.outputs[0], gpos.inputs[1])
    r = ramp(n, stops); l.new(gpos.outputs[0], r.inputs["Fac"]); l.new(r.outputs["Color"], b.inputs["Base Color"])
    # шероховатость: пятнами 0.35-0.65, не ровная
    rn = n.new("ShaderNodeTexNoise"); rn.inputs["Scale"].default_value = 9.0; rn.inputs["Detail"].default_value = 8
    l.new(tc.outputs["Object"], rn.inputs["Vector"])
    rm = n.new("ShaderNodeMapRange"); rm.inputs["To Min"].default_value = rough - 0.16; rm.inputs["To Max"].default_value = rough + 0.16
    l.new(rn.outputs["Fac"], rm.inputs["Value"]); l.new(rm.outputs["Result"], b.inputs["Roughness"])
    # микрорельеф: мелкое зерно + едва заметная «апельсиновая корка»
    g1 = n.new("ShaderNodeTexNoise"); g1.inputs["Scale"].default_value = 70.0; g1.inputs["Detail"].default_value = 3
    g2 = n.new("ShaderNodeTexNoise"); g2.inputs["Scale"].default_value = 16.0; g2.inputs["Detail"].default_value = 4
    l.new(tc.outputs["Object"], g1.inputs["Vector"]); l.new(tc.outputs["Object"], g2.inputs["Vector"])
    hm = n.new("ShaderNodeMath"); hm.operation = "ADD"; l.new(g1.outputs["Fac"], hm.inputs[0]); l.new(g2.outputs["Fac"], hm.inputs[1])
    bm = n.new("ShaderNodeBump"); bm.inputs["Strength"].default_value = 0.45 * grain; bm.inputs["Distance"].default_value = 0.01
    l.new(hm.outputs[0], bm.inputs["Height"]); l.new(bm.outputs["Normal"], b.inputs["Normal"])
    setv(b, "Sheen Weight", sheen); setv(b, "Sheen Roughness", 0.5); setv(b, "Sheen Tint", hexc(CORE))
    setv(b, "Coat Weight", 0.18); setv(b, "Coat Roughness", 0.35)
    setv(b, "Subsurface Weight", sss); setv(b, "Subsurface Scale", 0.08); setv(b, "Subsurface Radius", (1.0, 0.35, 0.25))
    setv(b, "Specular IOR Level", 0.45)
    if glitter:
        # блёстки: отдельные крошечные металлические крупинки (как на розовом сердечке Ozon)
        vr = n.new("ShaderNodeTexVoronoi"); vr.inputs["Scale"].default_value = 140.0; vr.inputs["Randomness"].default_value = 1.0
        l.new(tc.outputs["Object"], vr.inputs["Vector"])
        sp = n.new("ShaderNodeSeparateColor"); l.new(vr.outputs["Color"], sp.inputs[0])
        th = n.new("ShaderNodeMath"); th.operation = "GREATER_THAN"; th.inputs[1].default_value = 1.0 - glitter
        l.new(sp.outputs["Red"], th.inputs[0])
        # крупинка светлее и металличнее
        l.new(th.outputs[0], b.inputs["Metallic"])
        mix = n.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.inputs["B"].default_value = hexc(glitter_col)
        l.new(th.outputs[0], mix.inputs["Factor"]); l.new(r.outputs["Color"], mix.inputs["A"]); l.new(mix.outputs["Result"], b.inputs["Base Color"])
    return m


def satin_chrome(name, tint="#F6F0FF", rough=0.14, film=480.0):
    """сатиновый хром: видно переливы и «чистое» серебро, не зеркало"""
    m, n, l = mat(name); b = bsdf(n.values())
    setv(b, "Base Color", hexc(tint)); setv(b, "Metallic", 1.0)
    tc = n.new("ShaderNodeTexCoord")
    rn = n.new("ShaderNodeTexNoise"); rn.inputs["Scale"].default_value = 5.0; rn.inputs["Detail"].default_value = 7
    l.new(tc.outputs["Object"], rn.inputs["Vector"])
    rm = n.new("ShaderNodeMapRange"); rm.inputs["To Min"].default_value = rough - 0.1; rm.inputs["To Max"].default_value = rough + 0.12
    l.new(rn.outputs["Fac"], rm.inputs["Value"]); l.new(rm.outputs["Result"], b.inputs["Roughness"])
    # толщина плёнки плавает: радужные разводы
    fm = n.new("ShaderNodeMapRange"); fm.inputs["To Min"].default_value = film - 220; fm.inputs["To Max"].default_value = film + 260
    ft = n.new("ShaderNodeTexNoise"); ft.inputs["Scale"].default_value = 1.4; ft.inputs["Detail"].default_value = 2; ft.inputs["Distortion"].default_value = 1.2
    l.new(tc.outputs["Object"], ft.inputs["Vector"]); l.new(ft.outputs["Fac"], fm.inputs["Value"]); l.new(fm.outputs["Result"], b.inputs["Thin Film Thickness"])
    setv(b, "Thin Film IOR", 2.1)
    g1 = n.new("ShaderNodeTexNoise"); g1.inputs["Scale"].default_value = 60.0; l.new(tc.outputs["Object"], g1.inputs["Vector"])
    bm = n.new("ShaderNodeBump"); bm.inputs["Strength"].default_value = 0.1; bm.inputs["Distance"].default_value = 0.005
    l.new(g1.outputs["Fac"], bm.inputs["Height"]); l.new(bm.outputs["Normal"], b.inputs["Normal"])
    return m


# ---------- сборка знака ----------
HEAD = ((8.8, 16.4), 5.0)
STEM_BASE, STEM_TOP, FLAG_END = (13.8, 16.4), (13.8, 3.3), (19.8, 9.1)


def flag_tube(start_y=3.3):
    return tube("flag", [((13.8, start_y), None, (16.5, 3.8)), (FLAG_END, (19.1, 5.6), None)])


def logo(variant="A", loc=(0, 0, 0), rot=(0, 0, 0)):
    head = ball("head", *HEAD, ysc=0.42)
    if variant in ("A", "C"):
        st = tube("stem", [(STEM_BASE, None, (13.8, 11.0)), (STEM_TOP, (13.8, 6.8), (16.5, 3.8)), (FLAG_END, (19.1, 5.6), None)])
        parts = [head, st, ball("cap0", STEM_BASE, 1.45), ball("cap1", FLAG_END, 1.45)]
        body = merge("logo_body", parts)
        if variant == "A":
            m = soft_touch("body_A", [(0.0, hexc(MID)), (0.5, hexc(WARM)), (1.0, hexc("#FFC09A"))], lo=-2.4, hi=2.6, rough=0.52, glitter=0.0)
        else:
            m = soft_touch("body_C", [(0.0, hexc("#2E1440")), (0.5, hexc("#7A3A8A")), (1.0, hexc("#E39AC8"))], lo=-2.4, hi=2.6, rough=0.5, glitter=0.07, glitter_col="#FFF0F8")
        body.data.materials.append(m)
        root = new_obj("logo_" + variant, None, loc); body.parent = root
    else:
        st = tube("stem", [(STEM_BASE, None, (13.8, 11.0)), (STEM_TOP, (13.8, 6.8), None)])
        body = merge("logo_body", [head, st, ball("cap0", STEM_BASE, 1.45), ball("cap1", STEM_TOP, 1.45)])
        body.data.materials.append(soft_touch("body_B", [(0.0, hexc(LIKED)), (0.5, hexc("#FF8FA8")), (1.0, hexc("#FFD0C4"))], lo=-2.4, hi=2.6, rough=0.52, glitter=0.06, glitter_col="#FFFFFF"))
        fl = merge("logo_flag", [flag_tube(3.3), ball("fcap", FLAG_END, 1.45), ball("fcap0", (13.8, 3.3), 1.5)], [satin_chrome("chrome_B")], voxel=0.018, smooth=8)
        root = new_obj("logo_B", None, loc); body.parent = root; fl.parent = root
    root.rotation_euler = rot
    return root


# ---------- сцена: нейтральный тёплый фон (в Фигме фон делается отдельно) ----------
def world():
    w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True; n = w.node_tree.nodes; l = w.node_tree.links
    n.clear(); out = n.new("ShaderNodeOutputWorld"); bg = n.new("ShaderNodeBackground")
    tc = n.new("ShaderNodeTexCoord"); sep = n.new("ShaderNodeSeparateXYZ"); l.new(tc.outputs["Generated"], sep.inputs[0])
    r = ramp(n, [(0.0, hexc("#E6B9A4")), (0.45, hexc("#C98BA0")), (0.8, hexc("#8D5A86")), (1.0, hexc("#5E3A74"))])
    l.new(sep.outputs["Z"], r.inputs["Fac"]); l.new(r.outputs["Color"], bg.inputs["Color"]); bg.inputs["Strength"].default_value = 1.0
    l.new(bg.outputs[0], out.inputs[0])


def area(name, loc, target, color, power, size=3.0, sy=None):
    ld = bpy.data.lights.new(name, "AREA"); ld.energy = power; ld.color = color[:3]
    if sy: ld.shape = "RECTANGLE"; ld.size = size; ld.size_y = sy
    else: ld.size = size
    o = new_obj(name, ld, loc); o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler(); return o


def stage(cam_loc=(0.5, -13.0, 1.6), target=(0, 0, 0), lens=36, w=W, h=H):
    world()
    area("key", (-5, -8, 6), target, hexc("#FFF0E4"), 1300, 8, 3)
    area("rim_warm", (7, 3, 3), target, hexc("#FF9A5A"), 1800, 4, 7)
    area("rim_pink", (-7, 4, 2), target, hexc("#FF5CA0"), 1500, 4, 7)
    area("under", (0, -6, -5), target, hexc("#FFC8A8"), 500, 8, 3)
    area("strip_l", (-9, -4, 1), target, hexc("#FFFFFF"), 1200, 1.6, 9)
    area("strip_r", (9, -5, 2), target, hexc("#FFE6D2"), 1200, 1.6, 9)
    cd = bpy.data.cameras.new("cam"); cd.lens = lens; cd.sensor_width = 36
    cam = new_obj("cam", cd, cam_loc); sc.camera = cam
    cam.rotation_euler = (Vector(target) - Vector(cam_loc)).to_track_quat("-Z", "Y").to_euler()
    cd.dof.use_dof = True; cd.dof.aperture_fstop = 9.0; cd.dof.focus_distance = (Vector(target) - Vector(cam_loc)).length
    sc.render.engine = "CYCLES"; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True; sc.cycles.max_bounces = 10
    sc.render.resolution_x = w; sc.render.resolution_y = h; sc.render.film_transparent = False
    sc.view_settings.view_transform = "AgX" if "AgX" in [i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties["view_transform"].enum_items] else "Filmic"


if os.environ.get("ICON_BUILD", "1") == "1":
    logo("A", (-6.0, 0, 0), (math.radians(8), math.radians(-18), math.radians(-6)))
    logo("B", (0.0, 0, 0), (math.radians(8), math.radians(-14), math.radians(-6)))
    logo("C", (6.0, 0, 0), (math.radians(8), math.radians(-10), math.radians(-6)))
    stage((0.0, -19.0, 1.5), (0, 0, 0), 34)
    sc.render.filepath = os.path.join(OUT, "logo_variants.png")
