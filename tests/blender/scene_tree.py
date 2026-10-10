"""Нотка: демо-сцена «ёлка из пластинок». Запуск:
blender.exe --background --python tests/blender/scene_tree.py
env SAMPLES, W, H"""
import bpy, math, os, random
from mathutils import Vector

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
os.makedirs(OUT, exist_ok=True)
SAMPLES = int(os.environ.get("SAMPLES", 128)); W = int(os.environ.get("W", 1280)); H = int(os.environ.get("H", 960))
random.seed(7)


def hexc(h, a=1.0):
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return (*[(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c], a)


def mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    return m, m.node_tree.nodes, m.node_tree.links


def setv(n, k, v):
    if k in n.inputs: n.inputs[k].default_value = v


def ramp(n, stops):
    r = n.new("ShaderNodeValToRGB"); el = r.color_ramp.elements
    while len(el) > 1: el.remove(el[-1])
    el[0].position, el[0].color = stops[0]
    for p, c in stops[1:]:
        e = el.new(p); e.color = c
    return r


# ---------- материалы ----------
def vinyl_mat():
    m, n, l = mat("vinyl"); b = n["Principled BSDF"]
    setv(b, "Metallic", 0.7); setv(b, "Roughness", 0.3); setv(b, "Anisotropic", 0.85)
    setv(b, "Coat Weight", 0.6); setv(b, "Coat Roughness", 0.05)
    tc = n.new("ShaderNodeTexCoord")
    # тонкие борозды: радиальные кольца дают рельеф и радужный блеск
    sep = n.new("ShaderNodeSeparateXYZ"); l.new(tc.outputs["Object"], sep.inputs[0])
    x2 = n.new("ShaderNodeMath"); x2.operation = "MULTIPLY"; l.new(sep.outputs["X"], x2.inputs[0]); l.new(sep.outputs["X"], x2.inputs[1])
    y2 = n.new("ShaderNodeMath"); y2.operation = "MULTIPLY"; l.new(sep.outputs["Y"], y2.inputs[0]); l.new(sep.outputs["Y"], y2.inputs[1])
    s = n.new("ShaderNodeMath"); s.operation = "ADD"; l.new(x2.outputs[0], s.inputs[0]); l.new(y2.outputs[0], s.inputs[1])
    r = n.new("ShaderNodeMath"); r.operation = "SQRT"; l.new(s.outputs[0], r.inputs[0])
    wv = n.new("ShaderNodeTexWave"); wv.wave_type = "RINGS"; wv.inputs["Scale"].default_value = 1.0
    wv.inputs["Distortion"].default_value = 0.0
    mul = n.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = 150.0
    l.new(r.outputs[0], mul.inputs[0])
    fr = n.new("ShaderNodeMath"); fr.operation = "FRACT"; l.new(mul.outputs[0], fr.inputs[0])
    bm = n.new("ShaderNodeBump"); bm.inputs["Strength"].default_value = 0.12; bm.inputs["Distance"].default_value = 0.002
    l.new(fr.outputs[0], bm.inputs["Height"]); l.new(bm.outputs["Normal"], b.inputs["Normal"])
    # цвет: тёмная слива → оттенок по радиусу, плюс радужная плёнка
    base = ramp(n, [(0.0, hexc("#1A0B24")), (0.5, hexc("#2A0F2E")), (1.0, hexc("#140A1E"))])
    l.new(r.outputs[0], base.inputs["Fac"]); l.new(base.outputs["Color"], b.inputs["Base Color"])
    setv(b, "Thin Film Thickness", 450.0); setv(b, "Thin Film IOR", 1.8)
    return m


def label_mat(stops):
    m, n, l = mat("label"); b = n["Principled BSDF"]
    setv(b, "Roughness", 0.3); setv(b, "Coat Weight", 1.0); setv(b, "Base Color", (0, 0, 0, 1))
    tc = n.new("ShaderNodeTexCoord"); sep = n.new("ShaderNodeSeparateXYZ"); l.new(tc.outputs["Object"], sep.inputs[0])
    d = n.new("ShaderNodeMath"); d.operation = "MULTIPLY_ADD"; d.inputs[1].default_value = 0.6; d.inputs[2].default_value = 0.5
    ad = n.new("ShaderNodeMath"); ad.operation = "ADD"; l.new(sep.outputs["X"], ad.inputs[0]); l.new(sep.outputs["Y"], ad.inputs[1])
    l.new(ad.outputs[0], d.inputs[0])
    r = ramp(n, stops); l.new(d.outputs[0], r.inputs["Fac"])
    l.new(r.outputs["Color"], b.inputs["Emission Color"]); setv(b, "Emission Strength", 5.0)
    return m


def gold_mat():
    m, n, l = mat("gold"); b = n["Principled BSDF"]
    setv(b, "Base Color", hexc("#FFC76A")); setv(b, "Metallic", 1.0); setv(b, "Roughness", 0.16)
    setv(b, "Coat Weight", 0.5); return m


def glass_mat(tint="#FFFFFF"):
    m, n, l = mat("glass"); b = n["Principled BSDF"]
    setv(b, "Base Color", hexc(tint)); setv(b, "Roughness", 0.03); setv(b, "IOR", 1.5)
    setv(b, "Transmission Weight", 1.0); setv(b, "Thin Film Thickness", 400.0); setv(b, "Thin Film IOR", 1.6)
    return m


def glow_mat(color, strength=6.0):
    m, n, l = mat("glow"); b = n["Principled BSDF"]
    setv(b, "Base Color", (0, 0, 0, 1)); setv(b, "Emission Color", hexc(color)); setv(b, "Emission Strength", strength)
    return m


def chrome_mat(color):
    m, n, l = mat("chrome"); b = n["Principled BSDF"]
    setv(b, "Base Color", hexc(color)); setv(b, "Metallic", 1.0); setv(b, "Roughness", 0.08); setv(b, "Coat Weight", 1.0)
    setv(b, "Thin Film Thickness", 500.0); setv(b, "Thin Film IOR", 1.7)
    return m


def link(o, m, smooth=True):
    if smooth:
        for p in o.data.polygons: p.use_smooth = True
    o.data.materials.append(m); return o


# ---------- сборка ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

VIN, LAB, GOLD, GLASS = vinyl_mat(), None, gold_mat(), glass_mat()
LAB_A = label_mat([(0.0, hexc("#FF9A3D")), (0.5, hexc("#F0307F")), (1.0, hexc("#7A33F0"))])
LAB_B = label_mat([(0.0, hexc("#7A33F0")), (0.5, hexc("#F0307F")), (1.0, hexc("#FF9A3D"))])

# основание: стеклянная плита на золотой подставке
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=2.1, depth=0.18, location=(0, 0, 0.09))
bev = bpy.context.object; bev.modifiers.new("b", "BEVEL").width = 0.05
bev.modifiers["b"].segments = 4; link(bev, GOLD)
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=1.75, depth=0.22, location=(0, 0, 0.29))
o = bpy.context.object; o.modifiers.new("b", "BEVEL").width = 0.06; o.modifiers["b"].segments = 4; link(o, GLASS)

# пластинки: 6 штук, кверху меньше, каждая чуть повёрнута; парят друг над другом
discs = [(1.7, 0.95), (1.4, 1.62), (1.12, 2.22), (0.86, 2.74), (0.62, 3.18), (0.4, 3.54)]
for i, (r, z) in enumerate(discs):
    bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=r, depth=0.07, location=(0, 0, z))
    d = bpy.context.object
    d.rotation_euler = (math.radians(random.uniform(-4, 4)), math.radians(random.uniform(-4, 4)), math.radians(i * 37))
    bv = d.modifiers.new("b", "BEVEL"); bv.width = 0.012; bv.segments = 3
    link(d, VIN)
    # этикетка по центру: на каждой стороне, чтобы было видно и сверху
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=r * 0.36, depth=0.078, location=(0, 0, z))
    lb = bpy.context.object; lb.rotation_euler = d.rotation_euler
    link(lb, LAB_A if i % 2 == 0 else LAB_B)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=r * 0.035, depth=0.06, location=(0, 0, z))
    h = bpy.context.object; h.rotation_euler = d.rotation_euler; link(h, GOLD)

# серебристо-золотая ось-штырь сквозь ёлку
bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.018, depth=3.9, location=(0, 0, 2.0)); link(bpy.context.object, GOLD)

# звезда наверху: выдавленный 5-лучевой контур, золото с блеском
import bmesh
bm = bmesh.new(); pts = []
for k in range(10):
    a = math.pi / 2 + k * math.pi / 5; rr = 0.34 if k % 2 == 0 else 0.15
    pts.append(bm.verts.new((math.cos(a) * rr, 0, math.sin(a) * rr)))
f = bm.faces.new(pts)
res = bmesh.ops.extrude_face_region(bm, geom=[f])
verts = [v for v in res["geom"] if isinstance(v, bmesh.types.BMVert)]
bmesh.ops.translate(bm, verts=verts, vec=(0, 0.12, 0))
bmesh.ops.translate(bm, verts=bm.verts, vec=(0, -0.06, 0))
me = bpy.data.meshes.new("star"); bm.to_mesh(me); bm.free()
star = bpy.data.objects.new("star", me); sc.collection.objects.link(star)
star.location = (0, 0, 4.12); star.rotation_euler = (0, 0, 0)
bv = star.modifiers.new("b", "BEVEL"); bv.width = 0.035; bv.segments = 4
sd = star.modifiers.new("s", "SUBSURF"); sd.levels = 2
link(star, gold_mat())
# ядро-свет внутри звезды
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.1, location=(0, 0, 4.12)); link(bpy.context.object, glow_mat("#FFB347", 40))

# шарики-ёлочные игрушки вокруг: хром в цветах Нотки, на разной высоте
balls = [(2.2, -0.6, 0.45, 0.2, "#FF3D8A"), (-2.1, 0.5, 0.4, 0.17, "#8A4DFF"), (1.7, 1.4, 1.0, 0.13, "#FF9A3D"),
         (-1.7, -1.3, 0.35, 0.12, "#FFD27A"), (0.9, -2.0, 0.3, 0.14, "#FF3D8A"), (-0.5, 2.2, 0.5, 0.15, "#FF9A3D")]
for x, y, z, r, c in balls:
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=64, ring_count=32, location=(x, y, z + 0.18 + r))
    link(bpy.context.object, chrome_mat(c))

# искры и конфетти: мелкие светящиеся точки и пластинки-блёстки в воздухе
for i in range(70):
    a = random.uniform(0, math.tau); rad = random.uniform(1.6, 4.2)
    p = (math.cos(a) * rad, math.sin(a) * rad * 0.7, random.uniform(0.3, 4.6))
    if random.random() < 0.65:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=random.uniform(0.012, 0.035), segments=12, ring_count=8, location=p)
        link(bpy.context.object, glow_mat(random.choice(["#FFB347", "#FF6AA8", "#FFE2A8"]), 25))
    else:
        bpy.ops.mesh.primitive_plane_add(size=random.uniform(0.07, 0.15), location=p)
        c = bpy.context.object
        c.rotation_euler = (random.uniform(0, 6.28), random.uniform(0, 6.28), random.uniform(0, 6.28))
        c.scale = (1, 0.35, 1)
        link(c, chrome_mat(random.choice(["#FF3D8A", "#8A4DFF", "#FF9A3D", "#3DD0FF"])), smooth=False)

# ---------- мир и свет ----------
w = bpy.data.worlds.new("w"); w.use_nodes = True; sc.world = w
bg = w.node_tree.nodes["Background"]; bg.inputs["Color"].default_value = hexc("#06030A"); bg.inputs["Strength"].default_value = 1.0


def area(loc, target, size, power, color):
    ld = bpy.data.lights.new("a", "AREA"); ld.energy = power; ld.size = size; ld.color = color[:3]
    ob = bpy.data.objects.new("a", ld); sc.collection.objects.link(ob); ob.location = loc
    d = Vector(target) - Vector(loc); ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


area((-5, -4, 5), (0, 0, 2), 5, 1400, hexc("#FF7A3A"))     # тёплый софтбокс слева
area((5, -3, 4), (0, 0, 2), 4, 650, hexc("#8A4DFF"))      # фиолетовый справа
area((0, 5, 6), (0, 0, 2.5), 6, 1100, hexc("#FF3D8A"))      # розовый контровой сзади
area((0, -6, 2), (0, 0, 2), 3, 500, hexc("#FFFFFF"))       # белый блик спереди

# градиентный фон-полотно: оранжево-малиновое свечение за ёлкой
bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 7, 4)); bgp = bpy.context.object
bgp.rotation_euler = (math.radians(90), 0, 0)
m, n, l = mat("bg"); b = n["Principled BSDF"]; setv(b, "Base Color", (0, 0, 0, 1))
tc = n.new("ShaderNodeTexCoord"); gr = n.new("ShaderNodeTexGradient"); gr.gradient_type = "SPHERICAL"
mp = n.new("ShaderNodeMapping"); mp.inputs["Location"].default_value = (-0.5, -0.45, 0); mp.inputs["Scale"].default_value = (1.1, 1.3, 1)
l.new(tc.outputs["UV"], mp.inputs[0]); l.new(mp.outputs[0], gr.inputs[0])
inv = n.new("ShaderNodeMath"); inv.operation = "SUBTRACT"; inv.inputs[0].default_value = 1.0; l.new(gr.outputs["Fac"], inv.inputs[1])
pw = n.new("ShaderNodeMath"); pw.operation = "POWER"; pw.inputs[1].default_value = 1.6; l.new(inv.outputs[0], pw.inputs[0])
rp = ramp(n, [(0.0, hexc("#05020A")), (0.35, hexc("#3A0F3C")), (0.7, hexc("#C2265F")), (1.0, hexc("#FF7A33"))])
l.new(pw.outputs[0], rp.inputs["Fac"]); l.new(rp.outputs["Color"], b.inputs["Emission Color"]); setv(b, "Emission Strength", 1.1)
bgp.data.materials.append(m)

# камера: чуть снизу, как на референсе — ёлка величественная
cam = bpy.data.cameras.new("c"); cam.lens = 50
co = bpy.data.objects.new("c", cam); sc.collection.objects.link(co)
co.location = (3.6, -10.2, 5.9); d = Vector((0, 0, 2.2)) - co.location
co.rotation_euler = d.to_track_quat("-Z", "Y").to_euler(); sc.camera = co
cam.dof.use_dof = True; cam.dof.focus_distance = d.length; cam.dof.aperture_fstop = 5.6

sc.render.engine = "CYCLES"; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True; sc.cycles.device = "CPU"
sc.cycles.max_bounces = 12; sc.cycles.transmission_bounces = 10; sc.cycles.glossy_bounces = 8
sc.render.resolution_x = W; sc.render.resolution_y = H
sc.view_settings.view_transform = "Filmic" if "Filmic" in [t.identifier for t in sc.view_settings.bl_rna.properties["view_transform"].enum_items] else "AgX"
sc.render.image_settings.file_format = "PNG"
sc.render.filepath = os.path.join(OUT, "tree_demo.png")
bpy.ops.render.render(write_still=True); print("RENDERED", sc.render.filepath)


