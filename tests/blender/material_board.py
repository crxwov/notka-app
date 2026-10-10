"""Нотка: доска материалов (шары + нота-логотип в 3D). exec из живого Блендера или
blender.exe --background --python tests/blender/material_board.py   (env SAMPLES, W, H)"""
import bpy, math, os, sys
from mathutils import Vector
import mathutils

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Users\leksik\Documents\Notka\tests\blender"
sys.path.insert(0, HERE)
import importlib, ghost_lib as G
importlib.reload(G)
from ghost_lib import *

OUT = os.path.join(HERE, "out"); os.makedirs(OUT, exist_ok=True)
SAMPLES = int(os.environ.get("SAMPLES", 48)); W = int(os.environ.get("W", 1600)); H = int(os.environ.get("H", 1000))

CORE, WARM, MID, DEEP, LIKED = "#FFE2D2", "#EE905A", "#CF5A68", "#47204E", "#FF5C93"

clear_all()
sc = bpy.context.scene


def micro(b, n, l, strength=0.04, scale=900.0):
    """чуть неидеальная поверхность: микро-неровность, чтобы не выглядело пластиком из мультика"""
    tc = n.new("ShaderNodeTexCoord"); nz = n.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = scale
    l.new(tc.outputs["Object"], nz.inputs["Vector"])
    bm = n.new("ShaderNodeBump"); bm.inputs["Strength"].default_value = strength; bm.inputs["Distance"].default_value = 0.001
    l.new(nz.outputs["Fac"], bm.inputs["Height"]); l.new(bm.outputs["Normal"], b.inputs["Normal"])


def m_gloss(name, stops, lo=-1.0, hi=1.0):
    def ex(b, n, l):
        setv(b, "Specular IOR Level", 0.6); setv(b, "Sheen Weight", 0.25); setv(b, "Sheen Roughness", 0.4)
        micro(b, n, l, 0.02, 1500.0)
    return grad_mat(name, stops, lo=lo, hi=hi, rough=0.2, coat=1.0, sss=0.35, extra=ex)


def m_glass(name, tint):
    m = glass(name, tint, rough=0.015, film=420.0, ior=1.5)
    n = m.node_tree.nodes; b = bsdf(n.values()); setv(b, "Coat Weight", 0.4); return m


def m_chrome(name, tint="#F3E6FF", film=620.0):
    m, n, l = mat(name); b = bsdf(n.values())
    setv(b, "Base Color", hexc(tint)); setv(b, "Metallic", 1.0); setv(b, "Roughness", 0.06)
    setv(b, "Coat Weight", 0.6); setv(b, "Coat Roughness", 0.02)
    setv(b, "Thin Film Thickness", film); setv(b, "Thin Film IOR", 2.0); micro(b, n, l, 0.015, 1200.0)
    return m


def note3d(name, mat_, s=0.1, loc=(0, 0, 0)):
    """нота из логотипа: головка r=5 в (8.8,16.4), штиль x=13.8 от y=16.4 до 3.3, завиток до (19.8, 9.1), толщина 2.9"""
    def P(x, y, t=0.0): return ((x - 14.3) * s, t, (11.0 - y) * s)
    root = new_obj(name, None, loc)
    head = sphere(name + "_h", 5.0 * s, (1, 0.62, 1), P(8.8, 16.4), mat_=mat_, seg=64, rings=32); head.parent = root
    cd = bpy.data.curves.new(name + "_c", "CURVE"); cd.dimensions = "3D"; cd.bevel_depth = 1.45 * s; cd.bevel_resolution = 12
    cd.resolution_u = 24; cd.use_fill_caps = False
    sp = cd.splines.new("BEZIER"); sp.bezier_points.add(2)
    pts = [(13.8, 16.4), (13.8, 3.3), (19.8, 9.1)]
    for bp, (x, y) in zip(sp.bezier_points, pts):
        bp.co = P(x, y); bp.handle_left_type = bp.handle_right_type = "AUTO"
    sp.bezier_points[1].handle_left = P(13.8, 6.5); sp.bezier_points[1].handle_right = P(16.5, 3.8)
    sp.bezier_points[1].handle_left_type = sp.bezier_points[1].handle_right_type = "FREE"
    sp.bezier_points[2].handle_left = P(18.8, 5.6); sp.bezier_points[2].handle_left_type = "FREE"
    sp.bezier_points[2].handle_right = P(20.0, 9.4); sp.bezier_points[2].handle_right_type = "FREE"
    cd.materials.append(mat_)
    c = new_obj(name + "_stem", cd); c.parent = root
    for (x, y) in (pts[0], pts[2]):
        e = sphere(name + "_cap", 1.45 * s, (1, 1, 1), P(x, y), mat_=mat_, seg=24, rings=12); e.parent = root
    return root


# ---------- фон: тёплые сумерки (не тёмный, не светлый) ----------
def world():
    w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True; n = w.node_tree.nodes; l = w.node_tree.links
    n.clear(); out = n.new("ShaderNodeOutputWorld"); bg = n.new("ShaderNodeBackground")
    tc = n.new("ShaderNodeTexCoord"); sep = n.new("ShaderNodeSeparateXYZ"); l.new(tc.outputs["Generated"], sep.inputs[0])
    r = ramp(n, [(0.0, hexc("#F29A78")), (0.45, hexc("#B2557A")), (0.8, hexc("#5B2D69")), (1.0, hexc("#3A2050"))])
    l.new(sep.outputs["Z"], r.inputs["Fac"]); l.new(r.outputs["Color"], bg.inputs["Color"]); bg.inputs["Strength"].default_value = 0.9
    l.new(bg.outputs[0], out.inputs[0])


def area(name, loc, target, color, power, size=3.0, sy=None):
    ld = bpy.data.lights.new(name, "AREA"); ld.energy = power; ld.color = color[:3]
    if sy: ld.shape = "RECTANGLE"; ld.size = size; ld.size_y = sy
    else: ld.size = size
    o = new_obj(name, ld, loc); o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler(); return o


world()
# фон-циклорама: пол плавно уходит в стену, тёплый градиент
import bmesh
def cyc(name="cyc", zf=-1.05, y0=-40.0, yw=12.0, r=7.0, h=24.0, half=80.0):
    prof = [(y0, zf), (yw - r, zf)]
    for i in range(1, 13):
        a = math.pi / 2 * i / 12; prof.append((yw - r + r * math.sin(a), zf + r - r * math.cos(a)))
    prof.append((yw, zf + h))
    verts = []; faces = []
    for (y, z) in prof: verts += [(-half, y, z), (half, y, z)]
    for i in range(len(prof) - 1): faces.append((2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    o = new_obj(name, me)
    for p_ in me.polygons: p_.use_smooth = True
    return o
cy = cyc()
fm, fn_, fl_ = mat("cyc"); fb = bsdf(fn_.values())
setv(fb, "Roughness", 0.6); setv(fb, "Specular IOR Level", 0.25)
tcn = fn_.new("ShaderNodeTexCoord"); spn = fn_.new("ShaderNodeSeparateXYZ"); fl_.new(tcn.outputs["Object"], spn.inputs[0])
mpn = fn_.new("ShaderNodeMapRange"); mpn.inputs["From Min"].default_value = -1.0; mpn.inputs["From Max"].default_value = 14.0
fl_.new(spn.outputs["Z"], mpn.inputs["Value"])
rmp = ramp(fn_, [(0.0, hexc("#B9647A")), (0.35, hexc("#92467F")), (0.75, hexc("#5E2F78")), (1.0, hexc("#44245E"))])
fl_.new(mpn.outputs["Result"], rmp.inputs["Fac"]); fl_.new(rmp.outputs["Color"], fb.inputs["Base Color"])
fl_.new(rmp.outputs["Color"], fb.inputs["Emission Color"]); setv(fb, "Emission Strength", 0.12)
cy.data.materials.append(fm)

stops_peach = [(0.0, hexc(MID)), (0.5, hexc(WARM)), (1.0, hexc(CORE))]
stops_rose = [(0.0, hexc("#B83A6A")), (0.55, hexc(LIKED)), (1.0, hexc("#FFB3CC"))]
stops_plum = [(0.0, hexc("#2E1440")), (0.55, hexc("#6A3A8A")), (1.0, hexc("#C8A0F0"))]
mats = [("gloss_peach", m_gloss("g1", stops_peach)), ("gloss_rose", m_gloss("g2", stops_rose)), ("gloss_plum", m_gloss("g3", stops_plum)),
        ("glass", m_glass("g4", "#FFE6D8")), ("chrome", m_chrome("g5"))]

xs = [(-4.8 + i * 2.4) for i in range(5)]
for (nm, m), x in zip(mats, xs):
    sphere(nm, 1.0, (1, 1, 1), (x, 0, 0), seg=96, rings=48, mat_=m)
# ряд нот (ближе к камере, ниже)
for (nm, m), x in zip([mats[0], mats[1], mats[3], mats[4]], [-3.6, -1.2, 1.2, 3.6]):
    note3d("note_" + nm, m, s=0.17, loc=(x, -3.6, 0.78))

# ---------- свет: большие мягкие «софтбоксы», отражаются длинными бликами ----------
area("key", (-5, -7, 6), (0, 0, 0), hexc("#FFF0E4"), 1800, 7, 2.2)
area("rim_warm", (7, 4, 3), (0, 0, 0), hexc("#FF9A5A"), 2500, 4, 6)
area("rim_pink", (-7, 4, 2), (0, 0, 0), hexc("#FF5CA0"), 2200, 4, 6)
area("top", (0, -1, 8), (0, 0, 0), hexc("#FFFFFF"), 900, 6, 1.5)

# ---------- камера: чуть шире и ниже ----------
cd = bpy.data.cameras.new("cam"); cd.lens = 32; cd.sensor_width = 36
cam = new_obj("cam", cd, (0.3, -15.5, 4.6)); sc.camera = cam
cam.rotation_euler = (Vector((0, -1.5, -0.3)) - cam.location).to_track_quat("-Z", "Y").to_euler()
cd.dof.use_dof = True; cd.dof.aperture_fstop = 8.0; cd.dof.focus_distance = 15.5

sc.render.engine = "CYCLES"; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
sc.cycles.max_bounces = 12; sc.cycles.transparent_max_bounces = 16
sc.render.resolution_x = W; sc.render.resolution_y = H; sc.render.film_transparent = False
sc.view_settings.view_transform = "AgX" if "AgX" in [i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties["view_transform"].enum_items] else "Filmic"
sc.render.filepath = os.path.join(OUT, "material_board.png")
