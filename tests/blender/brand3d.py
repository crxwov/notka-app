"""Нотка: 3D-набор в духе коммуникаций Ozon Банка. Узнаваемые предметы + фирменные детали (монета со знаком, лента-кольцо,
блёстки, жемчуг, стеклянные ноты) → сцены. Цвета бренда доминируют, у предметов естественные цвета.
blender --background --python tests/blender/brand3d.py   env: ITEM=headphones|vinyl|heart|mic|note|coin|ribbon|scene  SIZE SAMPLES OUT TRANSP=1"""
import bpy, bmesh, os, math, random
from mathutils import Vector, Euler

ITEM = os.environ.get("ITEM", "scene"); SIZE = int(os.environ.get("SIZE", 900)); SAMPLES = int(os.environ.get("SAMPLES", 48))
OUT = os.environ.get("OUT", "C:/Users/leksik/Documents/Notka/3D иконки/_t/%s.png" % ITEM); TRANSP = os.environ.get("TRANSP", "0") == "1"
random.seed(5)
ROSE, PEACH, PLUM, POWDER = "#FF2D78", "#FFB08E", "#1A0B16", "#FFE9DF"

def hexc(h, a=1):
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return (*[(x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4) for x in c], a)
def setv(n, k, v):
    try: n.inputs[k].default_value = v
    except Exception: pass

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; sc.render.engine = "CYCLES"
try:
    p = bpy.context.preferences.addons["cycles"].preferences
    for t in ("OPTIX", "CUDA"):
        try:
            p.compute_device_type = t; p.get_devices()
            for d in p.devices: d.use = True
            sc.cycles.device = "GPU"; break
        except Exception: pass
except Exception: pass
sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
sc.cycles.max_bounces = 16; sc.cycles.transmission_bounces = 16; sc.cycles.glossy_bounces = 10; sc.cycles.transparent_max_bounces = 16
sc.render.resolution_x = SIZE; sc.render.resolution_y = SIZE; sc.render.film_transparent = TRANSP
sc.view_settings.view_transform = os.environ.get("VT", "Standard")
try: sc.view_settings.look = "None"
except Exception: pass
sc.view_settings.exposure = float(os.environ.get("EXP", 0.0))

# ======================= материалы (текстуры) =======================
def new_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    return m, next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), m.node_tree
def noise_bump(nt, b, scale=180, strength=0.04, detail=8):
    """микрорельеф «soft-touch»: мелкий шум в нормаль"""
    tc = nt.nodes.new("ShaderNodeTexCoord"); no = nt.nodes.new("ShaderNodeTexNoise"); bu = nt.nodes.new("ShaderNodeBump")
    no.inputs["Scale"].default_value = scale; no.inputs["Detail"].default_value = detail; no.inputs["Roughness"].default_value = 0.6
    bu.inputs["Strength"].default_value = strength; bu.inputs["Distance"].default_value = 0.01
    nt.links.new(tc.outputs["Object"], no.inputs["Vector"]); nt.links.new(no.outputs["Fac"], bu.inputs["Height"]); nt.links.new(bu.outputs["Normal"], b.inputs["Normal"])
def mat_gel(name, color, rough=0.14, sss=0.14):
    """глянцевый гель-пластик: толстый лак, лёгкий просвет, кромка светлее"""
    m, b, nt = new_mat(name)
    setv(b, "Base Color", hexc(color)); setv(b, "Roughness", rough); setv(b, "Coat Weight", 1.0); setv(b, "Coat Roughness", 0.025)
    setv(b, "Subsurface Weight", sss); setv(b, "Subsurface Radius", (1.0, 0.35, 0.3)); setv(b, "Specular IOR Level", 0.65); setv(b, "Sheen Weight", 0.2)
    lw = nt.nodes.new("ShaderNodeLayerWeight"); lw.inputs["Blend"].default_value = 0.35
    em = nt.nodes.new("ShaderNodeMath"); em.operation = "MULTIPLY"; em.inputs[1].default_value = 0.10
    nt.links.new(lw.outputs["Fresnel"], em.inputs[0]); nt.links.new(em.outputs[0], b.inputs["Emission Strength"]); setv(b, "Emission Color", hexc("#FFD0C0"))
    return m
def mat_soft(name, color, rough=0.62):
    """матовый soft-touch с микрозерном"""
    m, b, nt = new_mat(name)
    setv(b, "Base Color", hexc(color)); setv(b, "Roughness", rough); setv(b, "Sheen Weight", 0.6); setv(b, "Sheen Roughness", 0.4)
    setv(b, "Coat Weight", 0.25); setv(b, "Coat Roughness", 0.3); noise_bump(nt, b, 260, 0.06)
    return m
def mat_glass(name, color, rough=0.08, film=420.0):
    """прозрачное стекло / гель с радужной плёнкой"""
    m, b, nt = new_mat(name)
    setv(b, "Base Color", hexc(color)); setv(b, "Roughness", rough); setv(b, "Transmission Weight", 1.0); setv(b, "IOR", 1.48)
    setv(b, "Thin Film Thickness", film); setv(b, "Thin Film IOR", 1.42); setv(b, "Coat Weight", 0.8); setv(b, "Coat Roughness", 0.03)
    return m
def mat_frost(name, color, rough=0.32):
    m, b, nt = new_mat(name)
    setv(b, "Base Color", hexc(color)); setv(b, "Roughness", rough); setv(b, "Transmission Weight", 1.0); setv(b, "IOR", 1.45)
    setv(b, "Coat Weight", 0.5); setv(b, "Coat Roughness", 0.06); noise_bump(nt, b, 90, 0.02, 4)
    return m
def mat_chrome(name, color="#FFE9DF", rough=0.1):
    m, b, nt = new_mat(name)
    setv(b, "Base Color", hexc(color)); setv(b, "Metallic", 1.0); setv(b, "Roughness", rough); setv(b, "Thin Film Thickness", 260.0)
    return m
def mat_vinyl(name):
    m, b, nt = new_mat(name)
    setv(b, "Base Color", hexc("#120810")); setv(b, "Roughness", 0.22); setv(b, "Coat Weight", 0.6); setv(b, "Coat Roughness", 0.08)
    tc = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping"); wv = nt.nodes.new("ShaderNodeTexWave"); bu = nt.nodes.new("ShaderNodeBump")
    wv.wave_type = "RINGS"; wv.rings_direction = "Y"; wv.inputs["Scale"].default_value = 55; wv.inputs["Distortion"].default_value = 0.6; wv.inputs["Detail"].default_value = 3
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"]); nt.links.new(mp.outputs["Vector"], wv.inputs["Vector"])
    bu.inputs["Strength"].default_value = 0.35; bu.inputs["Distance"].default_value = 0.01
    nt.links.new(wv.outputs["Fac"], bu.inputs["Height"]); nt.links.new(bu.outputs["Normal"], b.inputs["Normal"])
    # радужный отлив канавок
    setv(b, "Anisotropic", 0.5); setv(b, "Thin Film Thickness", 300.0)
    return m
M = {
    "rose": mat_gel("rose", ROSE), "rose_deep": mat_gel("rose_deep", "#D6155F"), "peach": mat_gel("peach", PEACH, 0.18),
    "powder": mat_gel("powder", POWDER, 0.2, 0.18), "plum": mat_soft("plum", "#2A1226"), "plum_gel": mat_gel("plum_gel", "#3A1630", 0.2),
    "glass_rose": mat_glass("glass_rose", "#FF7FB0"), "glass_peach": mat_glass("glass_peach", "#FFC9B0", 0.06, 520.0), "frost": mat_frost("frost", "#FFD6C6"),
    "chrome": mat_chrome("chrome"), "gold": mat_chrome("gold", "#FFC999", 0.14), "vinyl": mat_vinyl("vinyl"),
}

# ======================= геометрия =======================
def link(o): sc.collection.objects.link(o); return o
def finish(o, mat, smooth=True, subsurf=1):
    o.data.materials.clear(); o.data.materials.append(M[mat] if isinstance(mat, str) else mat)
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    if smooth: bpy.ops.object.shade_smooth()
    return o
def add_bevel(o, w, seg=8, angle=25):
    bv = o.modifiers.new("bevel", "BEVEL"); bv.width = w; bv.segments = seg; bv.limit_method = "ANGLE"; bv.angle_limit = math.radians(angle); bv.profile = 0.7
    return o
def sphere(r, loc, mat, seg=64, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=seg, ring_count=seg // 2); o = bpy.context.object; o.scale = scale
    return finish(o, mat)
def cyl(r, h, loc, rot, mat, bev=0.05, v=96):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, rotation=rot, vertices=v); o = bpy.context.object
    add_bevel(o, bev, 8, 30); return finish(o, mat)
def box(sx, sy, sz, loc, rot, mat, bev=0.08):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot); o = bpy.context.object; o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True); add_bevel(o, bev, 10, 40); return finish(o, mat)
def torus(R, r, loc, rot, mat, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=128, minor_segments=48, location=loc, rotation=rot); o = bpy.context.object; o.scale = scale
    return finish(o, mat)
def pillow(pts, depth, bevel, mat, loc=(0, 0, 0), rot=(0, 0, 0), seg=10, name="pillow"):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); verts = [bm.verts.new((x, 0, z)) for x, z in pts]
    f = bm.faces.new(verts); res = bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, vec=(0, depth, 0), verts=[v for v in res["geom"] if isinstance(v, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new(name, me)); o.location = loc; o.rotation_euler = rot
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    add_bevel(o, bevel, seg, 25); sub = o.modifiers.new("sub", "SUBSURF"); sub.levels = 1; sub.render_levels = 2
    return finish(o, mat)
def arcpts(cx, cz, r, a0, a1, n=40): return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cz + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]
def path_curve(points, bevel_r, mat, cyclic=False, res=24, taper=None):
    cu = bpy.data.curves.new("c", "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = bevel_r; cu.bevel_resolution = 10; cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER"); sp.bezier_points.add(len(points) - 1)
    for i, p in enumerate(points):
        bp = sp.bezier_points[i]; bp.co = p; bp.handle_left_type = bp.handle_right_type = "AUTO"
    sp.use_cyclic_u = cyclic; cu.resolution_u = res
    o = link(bpy.data.objects.new("path", cu)); return finish(o, mat, smooth=False)

def ribbon_ring(R, width, thick, loc, rot, mat, twist=0.0):
    """лента-кольцо (как у Ozon): плоская лента по окружности, чуть изогнутая"""
    bm = bmesh.new(); N = 160; rows = []
    for i in range(N):
        a = 2 * math.pi * i / N; tw = twist * math.sin(a * 2)
        cx, cy = R * math.cos(a), R * math.sin(a)
        nx, ny = math.cos(a), math.sin(a)
        wz = width / 2
        pts = []
        for (dz, dr) in ((-wz, -thick), (-wz, thick), (wz, thick), (wz, -thick)):
            rr = R + dr + dz * math.sin(tw) * 0.0; z = dz * math.cos(tw)
            pts.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), z + dz * 0)))
        rows.append(pts)
    for i in range(N):
        a, b = rows[i], rows[(i + 1) % N]
        for k in range(4): bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("ribbon"); bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new("ribbon", me)); o.location = loc; o.rotation_euler = rot
    bv = o.modifiers.new("bev", "BEVEL"); bv.width = thick * 0.45; bv.segments = 5; bv.limit_method = "ANGLE"
    return finish(o, mat)

SHAPE_R = [(0, 1), (1, 1), (1, -1)] + arcp if False else None
def shape_right():  # правый модуль знака в единицах [-1..1]
    return [(0, 1), (1, 1), (1, -1)] + arcpts(1, 0, 1, -90, -180, 36)[1:-1] + [(0, 0)]
def shape_left():
    return [(-1, 1), (-1, -1), (0, -1), (0, 0)] + arcpts(-1, 0, 1, 0, 90, 36)[1:-1]

def coin(r, loc, rot, mat_body="chrome", mat_face="rose"):
    """монета со знаком Нотки"""
    parts = [cyl(r, r * 0.16, (0, 0, 0), (math.radians(90), 0, 0), mat_body, r * 0.05)]
    rim = torus(r * 0.9, r * 0.035, (0, -r * 0.085, 0), (math.radians(90), 0, 0), mat_face); parts.append(rim)
    s = r * 0.42
    L = pillow([(x * s, z * s) for x, z in shape_left()], r * 0.1, r * 0.03, mat_face, (-s * 0.5, -r * 0.1, 0), seg=5); R = pillow([(x * s, z * s) for x, z in shape_right()], r * 0.1, r * 0.03, mat_face, (s * 0.5, -r * 0.1, 0), seg=5)
    parts += [L, R]
    grp = link(bpy.data.objects.new("coin", None)); grp.location = loc; grp.rotation_euler = rot
    for o in parts: o.parent = grp
    return grp
def sparkle(r, loc, mat="chrome", rot=(math.radians(90), 0, 0)):
    pts = []
    for i in range(8):
        a = math.radians(45 * i); rr = r if i % 2 == 0 else r * 0.22
        pts.append((rr * math.cos(a + math.pi / 2), rr * math.sin(a + math.pi / 2)))
    o = pillow(pts, r * 0.3, r * 0.1, mat, loc, rot, seg=6, name="sparkle"); return o
def music_note(s, loc, rot, mat="glass_peach", double=False):
    """стеклянная нота: головка-эллипс, штиль, хвост"""
    grp = link(bpy.data.objects.new("note", None)); grp.location = loc; grp.rotation_euler = rot
    h = sphere(s * 0.5, (0, 0, 0), mat, scale=(1.15, 0.55, 0.85)); h.rotation_euler = (0, math.radians(-22), 0); h.parent = grp
    st = cyl(s * 0.09, s * 1.9, (s * 0.52, 0, s * 0.95), (0, 0, 0), mat, s * 0.03); st.parent = grp
    fl = path_curve([(s * 0.52, 0, s * 1.85), (s * 0.95, 0, s * 1.55), (s * 1.0, 0, s * 1.05)], s * 0.09, mat); fl.parent = grp
    return grp


def mat_pumpkin(name):
    """кожа тыквы: оранжево-коралловый градиент, просвет, складки темнее (по кривизне), микрорельеф, лак"""
    m, b, nt = new_mat(name)
    tc = nt.nodes.new("ShaderNodeTexCoord"); sep = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(tc.outputs["Object"], sep.inputs[0])
    mr = nt.nodes.new("ShaderNodeMapRange"); mr.inputs["From Min"].default_value = -1.0; mr.inputs["From Max"].default_value = 1.0; nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
    cr = nt.nodes.new("ShaderNodeValToRGB"); cr.color_ramp.elements[0].position = 0.0; cr.color_ramp.elements[0].color = hexc("#FF6A4A")
    cr.color_ramp.elements[1].position = 1.0; cr.color_ramp.elements[1].color = hexc("#FFC25A"); mid = cr.color_ramp.elements.new(0.55); mid.color = hexc("#FF8F3F")
    nt.links.new(mr.outputs[0], cr.inputs["Fac"])
    geo = nt.nodes.new("ShaderNodeNewGeometry"); pr = nt.nodes.new("ShaderNodeValToRGB"); pr.color_ramp.elements[0].position = 0.40; pr.color_ramp.elements[0].color = (0.45, 0.2, 0.22, 1)
    pr.color_ramp.elements[1].position = 0.58; pr.color_ramp.elements[1].color = (1, 1, 1, 1)
    nt.links.new(geo.outputs["Pointiness"], pr.inputs["Fac"])
    mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"; mx.inputs[0].default_value = 1.0
    nt.links.new(cr.outputs["Color"], mx.inputs[6]); nt.links.new(pr.outputs["Color"], mx.inputs[7]); nt.links.new(mx.outputs[2], b.inputs["Base Color"])
    setv(b, "Roughness", 0.22); setv(b, "Coat Weight", 0.8); setv(b, "Coat Roughness", 0.06); setv(b, "Subsurface Weight", 0.25); setv(b, "Subsurface Radius", (1.0, 0.4, 0.3))
    noise_bump(nt, b, 220, 0.05, 6)
    return m
def mat_emit(name, color, strength=8.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; nn_ = m.node_tree.nodes; nn_.clear()
    o_ = nn_.new("ShaderNodeOutputMaterial"); e = nn_.new("ShaderNodeEmission"); e.inputs["Color"].default_value = hexc(color); e.inputs["Strength"].default_value = strength
    m.node_tree.links.new(e.outputs[0], o_.inputs[0]); return m
M["pumpkin"] = mat_pumpkin("pumpkin"); M["stem"] = mat_soft("stem", "#6FD07A", 0.5); M["glow"] = mat_emit("glow", "#FFB070", 6.0)

def pumpkin(loc=(0, 0, 0), s=1.0, rot=(0, 0, 0), logo=True):
    g = link(bpy.data.objects.new("pumpkin", None)); g.location = loc; g.rotation_euler = rot; g.scale = (s, s, s)
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=128, v_segments=72, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co; th = math.acos(max(-1, min(1, z))); ph = math.atan2(y, x)
        rib = 1 + 0.12 * math.cos(8 * (ph + math.pi / 2)) * (math.sin(th) ** 1.2)
        tp = min(th, math.pi - th); dimple = 0.26 * math.exp(-((tp / 0.5) ** 2))
        rxy = 1.18 * rib
        v.co = Vector((x * rxy, y * rxy, (1.08 * z) - (dimple if z > 0 else -dimple) * 1.0))
    bm.to_mesh(bpy.data.meshes.new("pk")) if False else None
    me = bpy.data.meshes.new("pkm"); bm.to_mesh(me); bm.free()
    body = link(bpy.data.objects.new("pk", me)); body.parent = g
    sub = body.modifiers.new("sub", "SUBSURF"); sub.levels = 1; sub.render_levels = 2
    finish(body, "pumpkin")
    stem = path_curve([(0, 0, 0.62), (0.03, 0, 1.0), (0.2, 0, 1.3), (0.52, 0, 1.46)], 0.16, "stem"); stem.parent = g
    cap = sphere(0.19, (0.52, 0, 1.46), "stem", scale=(1, 1, 0.7)); cap.parent = g
    ring = torus(0.2, 0.05, (0.0, 0, 0.7), (0, 0, 0), "stem"); ring.parent = g
    pts = [(0.06 + 0.5 * math.cos(t) * (1 - t / 14), 0.04, 1.0 + 0.5 * math.sin(t) * (1 - t / 14) - t * 0.02) for t in [i * 0.9 for i in range(11)]]
    vine = path_curve(pts, 0.04, "stem"); vine.parent = g
    for sx, rz, rx in ((-1, 22, 14), (1, -26, 10)):
        lf = sphere(1.0, (sx * 0.62, 0.12, 1.05), "stem", seg=48, scale=(0.5, 0.2, 0.045)); lf.rotation_euler = (math.radians(rx), math.radians(rz * sx * -1), math.radians(22 * sx))
        bd = lf.modifiers.new("bend", "SIMPLE_DEFORM"); bd.deform_method = "BEND"; bd.angle = math.radians(40 * sx); bd.deform_axis = "X"; lf.parent = g
    if logo:
        sc_ = 0.40
        cutL = pillow([(x * sc_, z * sc_) for x, z in shape_left()], 0.7, 0.0, "glow", (-0.5 * sc_, -1.18, -0.02), seg=1, name="cutL")
        cutR = pillow([(x * sc_, z * sc_) for x, z in shape_right()], 0.7, 0.0, "glow", (0.5 * sc_, -1.18, -0.02), seg=1, name="cutR")
        for cutter in (cutL, cutR):
            cutter.modifiers.clear(); cutter.parent = g; cutter.hide_render = True; cutter.display_type = "WIRE"
            bo = body.modifiers.new("cut", "BOOLEAN"); bo.operation = "DIFFERENCE"; bo.object = cutter; bo.solver = "EXACT"
        inner = sphere(0.7, (0, -0.15, -0.05), "glow", seg=48); inner.scale = (1.3, 1.0, 1.0); inner.parent = g
    return g


import numpy as np
def puffy(outline, H, R, mat, loc=(0, 0, 0), rot=(0, 0, 0), name="puffy", cuts=4):
    """надутая фигура (как подушка/воздушный шар): плоский контур → объём, высота растёт от края как корень из расстояния"""
    pts = np.array(outline, dtype=float)
    bm = bmesh.new(); vs = [bm.verts.new((x, 0, z)) for x, z in outline]; bm.faces.new(vs)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    for _ in range(cuts): bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True)
    seg_a = pts; seg_b = np.roll(pts, -1, axis=0)
    def dist(px, pz):
        ab = seg_b - seg_a; L2 = (ab ** 2).sum(1) + 1e-12; out = np.empty(len(px))
        for c0 in range(0, len(px), 1500):
            X = px[c0:c0 + 1500, None]; Z = pz[c0:c0 + 1500, None]
            t = np.clip(((X - seg_a[None, :, 0]) * ab[None, :, 0] + (Z - seg_a[None, :, 1]) * ab[None, :, 1]) / L2[None, :], 0, 1)
            dd = np.hypot(X - (seg_a[None, :, 0] + t * ab[None, :, 0]), Z - (seg_a[None, :, 1] + t * ab[None, :, 1]))
            out[c0:c0 + 1500] = dd.min(1)
        return out
    co = np.array([(v.co.x, v.co.z) for v in bm.verts]); d = dist(co[:, 0], co[:, 1])
    k = np.clip(d / R, 0, 1); h = H * np.sqrt(1 - (1 - k) ** 2)
    for v, hh in zip(bm.verts, h): v.co.y = -hh
    front = bm.copy()
    for v in front.verts: v.co.y = -v.co.y
    bmesh.ops.reverse_faces(front, faces=front.faces[:])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); fm = bpy.data.meshes.new(name + "b"); front.to_mesh(fm); bm.free(); front.free()
    o = link(bpy.data.objects.new(name, me)); o2 = link(bpy.data.objects.new(name + "b", fm))
    bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); o2.select_set(True); bpy.context.view_layer.objects.active = o; bpy.ops.object.join()
    o.location = loc; o.rotation_euler = rot
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.mesh.remove_doubles(threshold=0.0005); bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode="OBJECT")
    sub = o.modifiers.new("sub", "SUBSURF"); sub.levels = 1; sub.render_levels = 2
    return finish(o, mat)
def rrect(cx, cz, w, h, r, n=18):
    pts = []; 
    for (ccx, ccz, a0) in ((cx + w / 2 - r, cz + h / 2 - r, 0), (cx - w / 2 + r, cz + h / 2 - r, 90), (cx - w / 2 + r, cz - h / 2 + r, 180), (cx + w / 2 - r, cz - h / 2 + r, 270)):
        for i in range(n + 1): a = math.radians(a0 + 90 * i / n); pts.append((ccx + r * math.cos(a), ccz + r * math.sin(a)))
    return pts
def chat_outline():
    w, h, r = 3.2, 2.3, 0.95; pts = []
    cx, cz = 0, 0.2
    arcs = ((cx + w / 2 - r, cz + h / 2 - r, 0), (cx - w / 2 + r, cz + h / 2 - r, 90), (cx - w / 2 + r, cz - h / 2 + r, 180))
    for (ccx, ccz, a0) in arcs:
        for i in range(19): a = math.radians(a0 + 90 * i / 18); pts.append((ccx + r * math.cos(a), ccz + r * math.sin(a)))
    # хвостик слева-снизу
    bz = cz - h / 2
    pts += [(-0.95, bz), (-1.5, bz - 0.95), (-0.2, bz)]
    for i in range(19): a = math.radians(270 + 90 * i / 18); pts.append((cx + w / 2 - r + r * math.cos(a), cz - h / 2 + r + r * math.sin(a)))
    return pts
def star4(r, n=60):
    pts = []
    for i in range(8 * n):
        a = 2 * math.pi * i / (8 * n); k = abs(math.cos(2 * a)) ** 1.9; rr = r * (0.22 + 0.78 * k); pts.append((rr * math.cos(a), rr * math.sin(a)))
    return pts
def heart_outline(s, n=90):
    return [(s * 16 * math.sin(t) ** 3 / 17, s * (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)) / 17) for t in [2 * math.pi * i / n for i in range(n)]]


def sparkle4(r, loc, rot, mat):
    g = link(bpy.data.objects.new("spark", None)); g.location = loc; g.rotation_euler = rot
    for k in (0, 1):
        bm = bmesh.new(); L, w = r, r * 0.2
        if k == 0: V = [(-L, 0, 0), (L, 0, 0), (0, -w, 0), (0, w, 0), (0, 0, -w * 0.6), (0, 0, w * 0.6)]
        else: V = [(0, 0, -L), (0, 0, L), (-w * 0.6, 0, 0), (w * 0.6, 0, 0), (0, -w, 0), (0, w, 0)]
        vs = [bm.verts.new(v) for v in V]
        for i0, i1 in ((0, 1), ):
            pass
        ends = (vs[0], vs[1]); ring = [vs[2], vs[4], vs[3], vs[5]] if k == 0 else [vs[2], vs[4], vs[3], vs[5]]
        for e in ends:
            for j in range(4): bm.faces.new((e, ring[j], ring[(j + 1) % 4]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new("sp"); bm.to_mesh(me); bm.free()
        o = link(bpy.data.objects.new("sp", me)); o.parent = g
        sub = o.modifiers.new("sub", "SUBSURF"); sub.levels = 2; sub.render_levels = 3
        finish(o, mat)
    return g


def meta_obj(elems, mat, name="meta", res=0.03, thr=0.4, scale=(1, 1, 1), loc=(0, 0, 0), rot=(0, 0, 0)):
    """чистая надутая форма из метаболов: ('B'|'C', (x,y,z), radius, size_x, rot_y_deg)"""
    mb = bpy.data.metaballs.new(name); mb.resolution = res; mb.render_resolution = res * 0.5; mb.threshold = thr
    ob = link(bpy.data.objects.new(name, mb))
    for kind, co, r, sx, ry in elems:
        e = mb.elements.new(type="CAPSULE" if kind == "C" else "BALL"); e.co = co; e.radius = r; e.stiffness = 2.0
        if kind == "C": e.size_x = sx; e.rotation = Euler((0, math.radians(ry), 0)).to_quaternion()
    bpy.context.view_layer.objects.active = ob; ob.select_set(True); bpy.ops.object.convert(target="MESH")
    o = bpy.context.object; o.scale = scale; o.location = loc; o.rotation_euler = rot
    return finish(o, mat)
def reeded_coin(r, loc, rot, mat_face="rose"):
    """монета с толстым ребристым ребром, фаской, выпуклым знаком"""
    grp = link(bpy.data.objects.new("coin", None)); grp.location = loc; grp.rotation_euler = rot
    m = bpy.data.materials.new("coin_edge"); m.use_nodes = True; nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"); setv(b, "Base Color", hexc("#FFE9DF")); setv(b, "Metallic", 1.0); setv(b, "Roughness", 0.16); setv(b, "Thin Film Thickness", 220.0)
    tc = nt.nodes.new("ShaderNodeTexCoord"); sp = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(tc.outputs["Object"], sp.inputs[0])
    at = nt.nodes.new("ShaderNodeMath"); at.operation = "ARCTAN2"; nt.links.new(sp.outputs["X"], at.inputs[0]); nt.links.new(sp.outputs["Y"], at.inputs[1])
    ml = nt.nodes.new("ShaderNodeMath"); ml.operation = "MULTIPLY"; ml.inputs[1].default_value = 40.0; nt.links.new(at.outputs[0], ml.inputs[0])
    sn = nt.nodes.new("ShaderNodeMath"); sn.operation = "SINE"; nt.links.new(ml.outputs[0], sn.inputs[0])
    bu = nt.nodes.new("ShaderNodeBump"); bu.inputs["Strength"].default_value = 0.5; bu.inputs["Distance"].default_value = 0.02
    nt.links.new(sn.outputs[0], bu.inputs["Height"]); nt.links.new(bu.outputs["Normal"], b.inputs["Normal"])
    body = cyl(r, r * 0.34, (0, 0, 0), (math.radians(90), 0, 0), m, r * 0.07); body.parent = grp
    disc = cyl(r * 0.84, r * 0.36, (0, 0, 0), (math.radians(90), 0, 0), mat_chrome("coin_face", "#FFD3C4", 0.07), r * 0.05); disc.parent = grp
    s_ = r * 0.40
    for pts, dx in ((shape_left(), -0.5), (shape_right(), 0.5)):
        mdl = pillow([(x * s_, z * s_) for x, z in pts], r * 0.16, r * 0.05, mat_face, (dx * s_, -r * 0.2, 0), seg=6)
        mdl.rotation_euler = (0, 0, 0); mdl.parent = grp
    return grp
def heart_meta(loc, s, mat, rot=(0, 0, 0)):
    el = [("C", (-0.5, 0, 0.5), 0.65, 0.5, 40), ("C", (0.5, 0, 0.5), 0.65, 0.5, -40), ("B", (0, 0, -0.4), 0.95, 0, 0)]
    return meta_obj(el, mat, "heart", scale=(1.1 * s, 0.8 * s, 1.0 * s), loc=loc, rot=rot)
def sparkle_fat(r, loc, rot, mat):
    g = link(bpy.data.objects.new("spark", None)); g.location = loc; g.rotation_euler = rot
    for k in (0, 1):
        bm = bmesh.new(); L, w = r, r * 0.34
        V = [(-L, 0, 0), (L, 0, 0), (0, -w, 0), (0, w, 0), (0, 0, -w), (0, 0, w)] if k == 0 else [(0, 0, -L), (0, 0, L), (-w, 0, 0), (w, 0, 0), (0, -w, 0), (0, w, 0)]
        vs = [bm.verts.new(v) for v in V]; ring = [vs[2], vs[4], vs[3], vs[5]]
        for e_ in (vs[0], vs[1]):
            for j in range(4): bm.faces.new((e_, ring[j], ring[(j + 1) % 4]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces); me = bpy.data.meshes.new("sp"); bm.to_mesh(me); bm.free()
        o = link(bpy.data.objects.new("sp", me)); o.parent = g
        sub = o.modifiers.new("sub", "SUBSURF"); sub.levels = 2; sub.render_levels = 3; finish(o, mat)
    return g
def socket_pearl(x, z, r, y, mat_p, parent):
    ring = torus(r * 1.22, r * 0.2, (x, y, z), (math.radians(90), 0, 0), "chrome"); ring.parent = parent
    p = sphere(r, (x, y - r * 0.15, z), mat_p, seg=96); p.parent = parent

# ======================= предметы =======================
def headphones(loc=(0, 0, 0), s=1.0, rot=(0, 0, 0)):
    g = link(bpy.data.objects.new("headphones", None)); g.location = loc; g.scale = (s, s, s); g.rotation_euler = rot
    ob = []
    def halve(o, z0):
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(0, 1, 0), clear_inner=True)
        bm.to_mesh(o.data); bm.free(); return o
    band = halve(torus(1.62, 0.2, (0, 0, 0.0), (math.radians(90), 0, 0), "rose", scale=(1, 1.0, 1)), 0.0); band.scale = (1, 1.35, 1); ob.append(band)
    pad_top = halve(torus(1.46, 0.1, (0, 0, 0.0), (math.radians(90), 0, 0), "peach", scale=(1, 1.1, 1)), 0.0); ob.append(pad_top)
    for sx in (-1, 1):
        x = sx * 1.62; z = -0.35
        ob.append(sphere(1.0, (x + sx * 0.05, 0, z), "rose", seg=160, scale=(0.5, 0.92, 0.92)))                                    # корпус чашки
        ob.append(torus(0.72, 0.07, (x + sx * 0.5, 0, z), (0, math.radians(90), 0), "chrome"))                                     # хромовое кольцо
        ob.append(cyl(0.64, 0.06, (x + sx * 0.5, 0, z), (0, math.radians(90), 0), "frost", 0.02))                                  # стеклянная линза
        sc2 = 0.3
        for (pts, dx) in ((shape_left(), -0.5), (shape_right(), 0.5)):                                                             # знак на линзе
            m_ = pillow([(xx * sc2, zz * sc2) for xx, zz in pts], 0.07, 0.02, "powder", (x + sx * 0.56, 0, z), seg=4)
            m_.rotation_euler = (0, 0, math.radians(90 * sx)); m_.location = (x + sx * 0.56, 0, z); ob.append(m_)
        ob.append(torus(0.7, 0.22, (x - sx * 0.46, 0, z), (0, math.radians(90), 0), "plum"))                                       # мягкий амбушюр
        ob.append(box(0.2, 0.2, 0.7, (x, 0, z + 1.0), (0, 0, 0), "chrome", 0.07))                                                  # слайдер
    for o in ob: o.parent = g
    return g
def vinyl(loc=(0, 0, 0), s=1.0, rot=(math.radians(90), 0, 0)):
    g = link(bpy.data.objects.new("vinyl", None)); g.location = loc; g.rotation_euler = rot; g.scale = (s, s, s)
    ob = [cyl(1.5, 0.1, (0, 0, 0), (0, 0, 0), "vinyl", 0.02), cyl(0.55, 0.13, (0, 0, 0), (0, 0, 0), "rose", 0.03),
          torus(0.56, 0.02, (0, 0, 0.066), (0, 0, 0), "peach"), cyl(0.07, 0.18, (0, 0, 0), (0, 0, 0), "chrome", 0.01)]
    s2 = 0.28; L = pillow([(x * s2, z * s2) for x, z in shape_left()], 0.03, 0.01, "powder", (-s2 * 0.5, 0, 0.07), (math.radians(-90), 0, 0), seg=4); Rr = pillow([(x * s2, z * s2) for x, z in shape_right()], 0.03, 0.01, "powder", (s2 * 0.5, 0, 0.07), (math.radians(-90), 0, 0), seg=4)
    ob += [L, Rr]
    for o in ob: o.parent = g
    return g
def heart(loc=(0, 0, 0), s=1.0, mat="rose"):
    mb = bpy.data.metaballs.new("heart"); mb.resolution = 0.025; mb.render_resolution = 0.012; mb.threshold = 0.4
    ob = link(bpy.data.objects.new("heart", mb))
    for sx in (-1, 1):
        e = mb.elements.new(type="CAPSULE"); e.co = (sx * 0.5, 0, 0.5); e.radius = 0.65; e.size_x = 0.5; e.stiffness = 2.0
        e.rotation = Euler((0, math.radians(-sx * 40), 0)).to_quaternion()
    e = mb.elements.new(type="BALL"); e.co = (0, 0, -0.4); e.radius = 0.95; e.stiffness = 2.0
    bpy.context.view_layer.objects.active = ob; ob.select_set(True); bpy.ops.object.convert(target="MESH")
    h = bpy.context.object; h.scale = (1.15 * s, 0.85 * s, 1.0 * s); h.location = loc; return finish(h, mat)
def mic(loc=(0, 0, 0), s=1.0):
    g = link(bpy.data.objects.new("mic", None)); g.location = loc; g.scale = (s, s, s)
    ob = [cyl(0.6, 1.7, (0, 0, 0.2), (0, 0, 0), "rose", 0.25), sphere(0.62, (0, 0, 1.2), "frost"), torus(0.62, 0.06, (0, 0, 0.45), (0, 0, 0), "chrome"),
          cyl(0.14, 1.1, (0, 0, -1.2), (0, 0, 0), "chrome", 0.03), cyl(0.78, 0.16, (0, 0, -1.8), (0, 0, 0), "plum_gel", 0.06)]
    for o in ob: o.parent = g
    return g

# ======================= сборка =======================
def build():
    if ITEM == "colorcheck":
        sphere(1.2, (0, 0, 0), "rose")
    elif ITEM == "chat":
        g = link(bpy.data.objects.new("chat", None)); g.rotation_euler = (math.radians(8), math.radians(-5), math.radians(-9))
        body = meta_obj([("C", (0, 0, 0.1), 1.0, 1.0, 0), ("B", (-1.5, 0, 0.05), 0.95, 0, 0), ("B", (1.5, 0, 0.05), 0.95, 0, 0),
                         ("B", (-0.55, 0, -0.95), 0.62, 0, 0), ("B", (-0.9, 0, -1.4), 0.42, 0, 0), ("B", (-1.12, 0, -1.78), 0.27, 0, 0)],
                        "rose", "bubble", res=0.028, scale=(1.0, 0.62, 0.95)); body.parent = g
        for i, x in enumerate((-0.85, 0.0, 0.85)):
            socket_pearl(x, 0.12, 0.27, -0.86, "powder" if i != 1 else "chrome", g)
        back = pillow(rrect(0, 0, 3.4, 2.5, 0.7), 0.35, 0.16, "frost", (0.9, 1.1, 0.35), (math.radians(4), math.radians(8), math.radians(10)), seg=8)
        hg = heart_meta((-2.15, -0.9, 1.15), 0.62, "glass_rose", (0, 0, math.radians(12)))
        hi = heart_meta((-2.15, -0.95, 1.12), 0.36, "rose", (0, 0, math.radians(12)))
        music_note(0.95, (2.35, -0.8, 1.15), (0, math.radians(-10), math.radians(10)), "glass_peach")
        reeded_coin(0.62, (1.45, -1.55, -1.25), (math.radians(-14), math.radians(-18), math.radians(-10)))
        vinyl((-2.35, 0.3, -1.45), 0.5, (math.radians(100), math.radians(-12), math.radians(-14)))
        sparkle_fat(0.55, (0.1, -1.0, 2.15), (0, 0, math.radians(8)), "chrome"); sparkle_fat(0.3, (2.75, -1.0, -0.5), (0, 0, math.radians(-12)), "powder")
        sphere(0.7, (-3.0, -3.6, -2.1), "glass_peach", seg=64)
        for (x, z, r_, m_) in [(1.2, 2.45, 0.1, "powder"), (-1.1, -2.3, 0.13, "peach")]: sphere(r_, (x, -1.0, z), m_)
    elif ITEM == "pumpkin": pumpkin(rot=(math.radians(10), math.radians(-6), math.radians(-8)))
    elif ITEM == "headphones": headphones(rot=(math.radians(-8), math.radians(-28), math.radians(8)))
    elif ITEM == "vinyl": vinyl(rot=(math.radians(80), 0, math.radians(-12)))
    elif ITEM == "heart": heart()
    elif ITEM == "mic": mic()
    elif ITEM == "note": music_note(1.5, (-0.6, 0, -1.2), (0, 0, 0))
    elif ITEM == "coin": coin(1.3, (0, 0, 0), (0, 0, 0))
    elif ITEM == "ribbon": ribbon_ring(1.7, 0.6, 0.03, (0, 0, 0), (math.radians(70), 0, 0), "glass_rose")
    else:  # сцена-пилот
        headphones((0, 0.2, 0.15), 0.95)
        vinyl((1.9, 0.9, -0.8), 0.62, (math.radians(90), math.radians(8), math.radians(-18)))
        ribbon_ring(2.9, 0.75, 0.03, (0.2, 0.3, 0.05), (math.radians(68), math.radians(-6), math.radians(8)), "glass_peach")
        coin(0.62, (-2.35, -0.6, 1.5), (math.radians(90), 0, math.radians(18)))
        coin(0.45, (2.55, -0.5, -1.55), (math.radians(80), 0, math.radians(-24)))
        music_note(0.9, (-2.7, -0.8, -1.1), (0, 0, math.radians(-8)), "glass_rose")
        music_note(0.55, (1.9, -1.0, 1.7), (0, 0, math.radians(14)), "frost")
        sparkle(0.38, (-1.3, -1.2, 2.0), "chrome"); sparkle(0.24, (2.9, -0.9, 0.5), "powder"); sparkle(0.2, (-3.0, -0.8, 0.2), "peach")
        for (x, z, r, m) in [(0.5, 2.5, 0.16, "chrome"), (-2.0, -2.1, 0.13, "powder"), (3.3, -0.2, 0.1, "peach"), (-0.4, -2.6, 0.18, "chrome")]:
            sphere(r, (x, -1.0, z), m)
build()

# ======================= мир, свет, камера =======================
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True; nn = w.node_tree.nodes; nn.clear()
o_ = nn.new("ShaderNodeOutputWorld"); bg = nn.new("ShaderNodeBackground"); tc = nn.new("ShaderNodeTexCoord"); sp = nn.new("ShaderNodeSeparateXYZ"); mr = nn.new("ShaderNodeMapRange"); rp = nn.new("ShaderNodeValToRGB")
w.node_tree.links.new(tc.outputs["Object"], sp.inputs[0]); mr.inputs["From Min"].default_value = -0.7; mr.inputs["From Max"].default_value = 0.9; mr.clamp = True
w.node_tree.links.new(sp.outputs["Z"], mr.inputs["Value"])
LIGHTBG = os.environ.get("BG", "light") == "light"
rp.color_ramp.elements[0].position = 0.0; rp.color_ramp.elements[0].color = hexc("#FF9DB5" if LIGHTBG else "#8a2a55"); rp.color_ramp.elements[1].position = 1.0; rp.color_ramp.elements[1].color = hexc("#FFF1EA" if LIGHTBG else "#1a0b16")
m_ = rp.color_ramp.elements.new(0.5); m_.color = hexc("#FFC7C0" if LIGHTBG else "#3a1330")
w.node_tree.links.new(mr.outputs[0], rp.inputs["Fac"]); w.node_tree.links.new(rp.outputs["Color"], bg.inputs["Color"]); bg.inputs["Strength"].default_value = 1.0
w.node_tree.links.new(bg.outputs[0], o_.inputs[0])
def area(name, loc, col, pw, size):
    d = bpy.data.lights.new(name, "AREA"); d.energy = pw; d.color = col[:3]; d.size = size
    ob = link(bpy.data.objects.new(name, d)); ob.location = loc; ob.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
area("key", (-5, -7, 6), hexc("#FFF6F0"), 2600, 8); area("rim_r", (7, 1, 3), hexc("#FF4FA0"), 2200, 5); area("rim_l", (-7, 2, 2), hexc("#FFB08E"), 1400, 5); area("back", (0, 4, 3), hexc("#FFFFFF"), 1200, 6)
area("under", (0, -5, -5), hexc("#FF8FB0"), 900, 8); area("top", (0, -2, 8), hexc("#FFFFFF"), 500, 8)
bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 8, 0), rotation=(math.radians(90), 0, 0)); wall = bpy.context.object
wm = bpy.data.materials.new("wall"); wm.use_nodes = True; wb = next(n for n in wm.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
wtc = wm.node_tree.nodes.new("ShaderNodeTexCoord"); wsp = wm.node_tree.nodes.new("ShaderNodeSeparateXYZ"); wmr = wm.node_tree.nodes.new("ShaderNodeMapRange"); wcr = wm.node_tree.nodes.new("ShaderNodeValToRGB")
wm.node_tree.links.new(wtc.outputs["Object"], wsp.inputs[0]); wm.node_tree.links.new(wsp.outputs["Z"], wmr.inputs["Value"]); wmr.inputs["From Min"].default_value = -30; wmr.inputs["From Max"].default_value = 30
wcr.color_ramp.elements[0].color = hexc("#FF8FB0" if LIGHTBG else "#1A0B16"); wcr.color_ramp.elements[1].color = hexc("#FFE9DF" if LIGHTBG else "#2a1226")
wm.node_tree.links.new(wmr.outputs[0], wcr.inputs["Fac"]); wm.node_tree.links.new(wcr.outputs["Color"], wb.inputs["Base Color"]); setv(wb, "Roughness", 0.85)
wall.data.materials.append(wm)

# автокадрирование по габаритам
pts = []
for ob in bpy.data.objects:
    if ob.type in ("MESH", "CURVE") and ob is not wall and not ob.hide_render:
        for c in ob.bound_box: pts.append(ob.matrix_world @ Vector(c))
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
ctr = (mn + mx) / 2; size = max(mx.x - mn.x, mx.z - mn.z)
cd = bpy.data.cameras.new("c"); cd.lens = 75; cam = link(bpy.data.objects.new("c", cd)); sc.camera = cam
cd.dof.use_dof = os.environ.get("DOF", "1") == "1"; cd.dof.aperture_fstop = float(os.environ.get("FSTOP", 3.2))
dist = size * 75 / 36 * 0.98 + (mx.y - mn.y)
cam.location = ctr + Vector((float(os.environ.get("CAMX", 0.12)) * dist, -dist, 0.06 * dist)); cam.rotation_euler = (ctr - cam.location).to_track_quat("-Z", "Y").to_euler()
cd.dof.focus_distance = (ctr - cam.location).length - 0.4
sc.render.filepath = OUT; bpy.ops.render.render(write_still=True); print("DONE", OUT)
