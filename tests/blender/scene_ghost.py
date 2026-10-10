"""Нотка, Хэллоуин: «Призрак-меломан», пост 4:5. Запуск:
blender.exe --background --python tests/blender/scene_ghost.py   (env SAMPLES, W, H, PART)
или из живого Блендера: exec(open(путь).read())"""
import bpy, math, os, sys, random
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Users\leksik\Documents\Notka\tests\blender"
sys.path.insert(0, HERE)
import importlib, ghost_lib as G
importlib.reload(G)
from ghost_lib import *

OUT = os.path.join(HERE, "out"); os.makedirs(OUT, exist_ok=True)
SAMPLES = int(os.environ.get("SAMPLES", 96)); W = int(os.environ.get("W", 1080)); H = int(os.environ.get("H", 1350))
random.seed(11)

PURPLE, PINK, ORANGE, LIME = "#7A33F0", "#F0307F", "#FF8A1F", "#B6F03A"

clear_all()
sc = bpy.context.scene


# ============ ПРИЗРАК ============
def ghost():
    prof = [(0, 1.78), (0.35, 1.72), (0.72, 1.52), (0.97, 1.15), (1.07, 0.7), (1.08, 0.1), (1.13, -0.5),
            (1.19, -1.0), (1.18, -1.25), (1.05, -1.42), (0.8, -1.47), (0.4, -1.40), (0, -1.38)]

    def fn(r, z, th):
        w = min(1, max(0, (-0.9 - z) / 0.5)) * min(1, r)
        drop = 0.30 * (0.5 + 0.5 * math.cos(5 * th + 0.4)) * w
        return r * (1 + 0.04 * w * math.sin(5 * th + 0.4)), z - drop
    body_m = grad_mat("ghost_body", [(0.0, hexc("#B79CFF")), (0.35, hexc("#E2D4FF")), (1.0, hexc("#FFF6FF"))],
                      lo=-1.5, hi=1.2, rough=0.33, coat=0.55, sss=0.35)
    b = lathe("ghost", prof, seg=80, fn=fn, subsurf=2); b.data.materials.append(body_m)
    return b


def face(body):
    eye_m = plain("eye", "#12081F", rough=0.05, coat=1.0)
    shine = glow("shine", "#FFFFFF", 12.0)
    for sx in (-1, 1):
        p, nrm = place_on(body, sx * 0.36, 0.45, offset=-0.02)
        e = sphere("eye", 1, (0.115, 0.07, 0.19), p, mat_=eye_m)
        e.rotation_euler = (0, 0, sx * -0.12)
        p2, _ = place_on(body, sx * 0.36 - 0.035, 0.52, offset=0.035)
        sphere("shine", 1, (0.035, 0.02, 0.05), p2, mat_=shine)
        p3, _ = place_on(body, sx * 0.62, 0.12, offset=-0.01)
        sphere("cheek", 1, (0.17, 0.05, 0.1), p3, mat_=glow("cheek", "#FF5FA2", 1.4))
    p, _ = place_on(body, 0, 0.08, offset=-0.02)
    sphere("mouth", 1, (0.12, 0.07, 0.15), p, mat_=plain("mouth", "#3A0B2E", rough=0.2, coat=0.3))
    p, _ = place_on(body, 0, -0.02, offset=-0.005)
    sphere("tongue", 1, (0.065, 0.045, 0.06), p, mat_=plain("tongue", "#FF4D8D", rough=0.3, coat=0.5))


def arms(body):
    am = body.data.materials[0]
    a = sphere("arm_l", 1, (0.26, 0.26, 0.5), (-1.12, -0.05, -0.25), mat_=am)
    a.rotation_euler = (0, math.radians(-38), 0)
    b = sphere("arm_r", 1, (0.26, 0.26, 0.5), (1.18, -0.2, 0.2), mat_=am)
    b.rotation_euler = (0, math.radians(58), 0)
    for o in (a, b):
        s = o.modifiers.new("s", "SUBSURF"); s.levels = 1


def headphones():
    band_m = plain("band", "#1B1030", rough=0.18, coat=1.0, metal=0.6)
    cup_m = grad_mat("cup", [(0.0, hexc("#FF4DA0")), (1.0, hexc("#FF9A2E"))], axis="X", lo=-0.4, hi=0.4, rough=0.22, coat=1.0)
    pad_m = plain("pad", "#2A1A44", rough=0.6, coat=0.1)
    ring = glow("cup_glow", "#FFD84D", 5.0)
    # дужка — полуобруч над головой
    bm = bmesh.new()
    seg = 64; R = 1.2; rr = 0.07
    prof_pts = []
    n_arc = 40
    verts = []; faces = []
    arc = [(R * math.cos(math.pi * i / n_arc), R * math.sin(math.pi * i / n_arc)) for i in range(n_arc + 1)]
    for (ax, az) in arc:
        for k in range(12):
            t = 2 * math.pi * k / 12
            dirx, dirz = ax / R, az / R
            verts.append((ax + dirx * rr * math.cos(t), rr * math.sin(t) * 1.25, az + dirz * rr * math.cos(t)))
    for i in range(n_arc):
        for k in range(12):
            a = i * 12 + k; b = i * 12 + (k + 1) % 12
            faces.append((a, b, b + 12, a + 12))
    me = bpy.data.meshes.new("band"); me.from_pydata(verts, [], faces); me.update()
    o = new_obj("band", me, (0, 0.0, 0.42)); o.scale = (1, 1, 1.3); link(o, band_m)
    s = o.modifiers.new("s", "SUBSURF"); s.levels = 1
    cups = []
    for sx in (-1, 1):
        c = cyl("cup", 0.42, 0.34, (sx * 1.22, 0, 0.45), (0, math.pi / 2, 0), bevel=0.12, mat_=cup_m); cups.append(c)
        pad = cyl("pad", 0.34, 0.14, (sx * 1.07, 0, 0.45), (0, math.pi / 2, 0), bevel=0.05, mat_=pad_m)
        gl = cyl("glow", 0.25, 0.04, (sx * 1.42, 0, 0.45), (0, math.pi / 2, 0), bevel=0.01, mat_=ring)
        nt = cyl("capdisc", 0.19, 0.06, (sx * 1.44, 0, 0.45), (0, math.pi / 2, 0), bevel=0.02, mat_=plain("cap", "#2B1050", rough=0.2, coat=1.0))


body = ghost()
face(body)
arms(body)
headphones()
body.rotation_euler = (0, 0, 0)

# ============ КАМЕРА / СВЕТ ============
def camera(loc, target, lens=24, fstop=2.8, roll=0):
    cd = bpy.data.cameras.new("cam"); cd.lens = lens; cd.sensor_width = 36
    cd.dof.use_dof = True; cd.dof.aperture_fstop = fstop
    cam = new_obj("cam", cd, loc); sc.camera = cam
    empty = new_obj("focus", None, (0, -0.9, 0.3)); cd.dof.focus_object = empty
    d = Vector(target) - Vector(loc)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    cam.rotation_euler.rotate_axis("Z", math.radians(roll)) if False else None
    cam.rotation_mode = "XYZ"
    # крен вокруг оси взгляда
    import mathutils
    q = d.to_track_quat("-Z", "Y") @ mathutils.Quaternion((0, 0, 1), math.radians(roll))
    cam.rotation_euler = q.to_euler()
    return cam


def area(name, loc, target, color, power, size=3.0):
    ld = bpy.data.lights.new(name, "AREA"); ld.energy = power; ld.size = size; ld.color = color[:3]
    o = new_obj(name, ld, loc)
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler(); return o


def world():
    w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True; n = w.node_tree.nodes; l = w.node_tree.links
    n.clear(); out = n.new("ShaderNodeOutputWorld"); bg = n.new("ShaderNodeBackground")
    tc = n.new("ShaderNodeTexCoord"); sep = n.new("ShaderNodeSeparateXYZ"); l.new(tc.outputs["Generated"], sep.inputs[0])
    r = ramp(n, [(0.0, hexc("#FF7A2E")), (0.45, hexc("#B03A9E")), (0.75, hexc("#4B1FA8")), (1.0, hexc("#1A0A3A"))])
    l.new(sep.outputs["Z"], r.inputs["Fac"]); l.new(r.outputs["Color"], bg.inputs["Color"]); bg.inputs["Strength"].default_value = 1.1
    l.new(bg.outputs[0], out.inputs[0])


world()
sc.render.engine = "CYCLES"
sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
sc.render.resolution_x = W; sc.render.resolution_y = H; sc.render.film_transparent = True
sc.view_settings.view_transform = "AgX" if "AgX" in [i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties["view_transform"].enum_items] else "Filmic"

camera((1.0, -4.6, -1.5), (0.0, 0, 0.5), lens=22, fstop=2.0, roll=-8)
area("key", (-3.5, -5, 4.5), (0, 0, 0.4), hexc("#FFF1E6"), 600, 4)
area("rim_pink", (4.5, 2.5, 2.8), (0, 0, 0.4), hexc("#FF3FA4"), 900, 3)
area("rim_orange", (-4.5, 2.5, 0.5), (0, 0, 0.4), hexc("#FF8A1F"), 800, 3)
area("fill_violet", (3.5, -4.5, -2.0), (0, 0, 0.2), hexc("#8A5CFF"), 400, 4)


# ============ РЕКВИЗИТ И КОМПОЗИЦИЯ ============
import ghost_props as P
importlib.reload(P)

def compose():
    P.pumpkin((-1.0, -1.9, -1.55), 0.95, rot=(math.radians(-14), math.radians(6), math.radians(24)))
    P.note((2.1, -1.0, 1.3), 0.95, "chrome", rot=(0.1, 0, -0.25))
    for loc, s, c in [((-1.7, -0.8, 2.3), 0.3, "#FFF3B0"), ((2.3, -0.5, -0.4), 0.2, "#FFFFFF")]:
        P.sparkle(loc, s, c)

if os.environ.get("PART", "all") != "ghost":
    compose()
