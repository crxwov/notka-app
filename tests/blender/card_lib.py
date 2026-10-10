import bpy, bmesh, math, random
from mathutils import Vector

# ---------- сброс ----------
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)
for m in list(bpy.data.materials): bpy.data.materials.remove(m)
for c in list(bpy.data.curves): bpy.data.curves.remove(c)
sc = bpy.context.scene
col = sc.collection

def hexc(h, a=1.0):
    h = h.lstrip('#'); r, g, b = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    f = lambda c: ((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92
    return (f(r), f(g), f(b), a)

def setin(n, k, v):
    if k in n.inputs:
        n.inputs[k].default_value = v

# ---------- материалы ----------
def mat(name, color, metal=0.0, rough=0.4, coat=0.0, coat_rough=0.05, spec=0.5, sheen=0.0, trans=0.0, ior=1.45, emit=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    setin(b, 'Base Color', hexc(color) if isinstance(color, str) else color)
    setin(b, 'Metallic', metal); setin(b, 'Roughness', rough)
    setin(b, 'Coat Weight', coat); setin(b, 'Coat Roughness', coat_rough)
    setin(b, 'Specular IOR Level', spec); setin(b, 'Sheen Weight', sheen)
    setin(b, 'Transmission Weight', trans); setin(b, 'IOR', ior)
    if emit:
        setin(b, 'Emission Color', hexc(emit[0])); setin(b, 'Emission Strength', emit[1])
    return m

def mat_card():
    """Заря: роза -> персик по диагонали карты, сатиновый пластик с лаком."""
    m = mat('card', '#FF2D78', rough=0.34, coat=0.6, coat_rough=0.08)
    nt = m.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    mix = nt.nodes.new('ShaderNodeMath'); mix.operation = 'ADD'
    mp = nt.nodes.new('ShaderNodeMapRange')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    nt.links.new(sep.outputs[0], mix.inputs[0]); nt.links.new(sep.outputs[1], mix.inputs[1])
    mp.inputs['From Min'].default_value = -2.6; mp.inputs['From Max'].default_value = 2.6
    nt.links.new(mix.outputs[0], mp.inputs[0]); nt.links.new(mp.outputs[0], ramp.inputs[0])
    e = ramp.color_ramp.elements
    e[0].position = 0.05; e[0].color = hexc('#FFA27A')
    e[1].position = 0.75; e[1].color = hexc('#FF1F6E')
    e.new(0.38).color = hexc('#FF3A7E')
    nt.links.new(ramp.outputs[0], b.inputs['Base Color'])
    return m

M = {
    'card':   mat_card(),
    'pearl':  mat('pearl', '#FFEAE0', metal=1.0, rough=0.26, coat=0.25),
    'peach':  mat('peach', '#FFC2A0', metal=1.0, rough=0.24),
    'rosem':  mat('rosem', '#FF3D85', metal=0.7, rough=0.28, coat=0.7, coat_rough=0.05),
    'rose':   mat('rose', '#FF2D78', rough=0.3, coat=0.7, coat_rough=0.05),
    'mark':   mat('mark', '#FF1F6E', rough=0.4, coat=0.3, coat_rough=0.15),
    'cface':  mat('cface', '#FFE0D0', rough=0.5, coat=0.15, coat_rough=0.3),
    'cface2': mat('cface2', '#FFF1EA', rough=0.5, coat=0.15, coat_rough=0.3),
    'powder': mat('powder', '#FFE9DF', rough=0.42, coat=0.35),
    'dark':   mat('dark', '#3A1230', rough=0.45),
    'glass':  mat('glass', '#FFD0DE', rough=0.04, trans=1.0, ior=1.5),
}

# ---------- геометрия ----------
def link(o):
    col.objects.link(o); return o

def bevel(o, w, seg=3, harden=True):
    m = o.modifiers.new('bev', 'BEVEL'); m.width = w; m.segments = seg; m.limit_method = 'ANGLE'; m.angle_limit = math.radians(30)
    if bpy.app.version < (5, 0, 0): pass
    return o

def smooth(o, auto=True):
    for p in o.data.polygons: p.use_smooth = True
    try:
        o.data.set_sharpness_by_angle(angle=math.radians(35)) if hasattr(o.data, 'set_sharpness_by_angle') else None
    except Exception: pass

def prism(pts, h, material, name='prism', z0=0.0, bev=0.0, seg=3):
    me = bpy.data.meshes.new(name); n = len(pts)
    v = [(x, y, z0) for x, y in pts] + [(x, y, z0 + h) for x, y in pts]
    f = [list(range(n))[::-1], list(range(n, 2 * n))] + [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    me.from_pydata(v, [], f); me.update()
    o = link(bpy.data.objects.new(name, me)); o.data.materials.append(material)
    for p in o.data.polygons: p.use_smooth = True
    if bev: bevel(o, bev, seg)
    return o

def rrect(w, h, r, n=14):
    pts = []
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n); pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts

def circle(r, n=96):
    return [(r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n)) for i in range(n)]

def shape2(s, h, material, z0=0.0, bev=0.0):
    """Знак Shape2 (два модуля), центр в нуле, размер ~120*s."""
    def conv(pts): return [((x - 60) * s, -(y - 60) * s) for x, y in pts]
    def arc(cx, cy, r, a0, a1, n=24): return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]
    right = [(60, 0), (120, 0)] + arc(120, 60, 60, 90, 180)  # (120,120)->(60,60)
    left = [(0, 120), (60, 120)] + [(60, 60)] if False else None
    # правый: (60,0)-(120,0)-(120,120)-дуга-(60,60)
    right = [(60, 0), (120, 0)] + arc(120, 60, 60, 90, 180)
    # левый: (0,120)-(60,120)-(60,60)-дуга-(0,0)
    left = [(0, 0), (0, 120), (60, 120)] + arc(0, 60, 60, 0, -90)[::-1][::-1]
    left = [(0, 120), (60, 120)] + arc(0, 60, 60, 0, -90)
    objs = [prism(conv(right), h, material, 'sR', z0, bev), prism(conv(left), h, material, 'sL', z0, bev)]
    return objs

def reeded_ring(r, h, ridges, depth, name='rim'):
    """Цилиндр с рифлёным ребром."""
    n = ridges * 2
    pts = [((r if i % 2 == 0 else r - depth) * math.cos(2 * math.pi * i / n), (r if i % 2 == 0 else r - depth) * math.sin(2 * math.pi * i / n)) for i in range(n)]
    return pts

def annulus(ro, ri, h, material, name='ring', z0=0.0, n=96, bev=0.0, seg=2, reed=0.0):
    me = bpy.data.meshes.new(name); v = []; f = []
    for z in (z0, z0 + h):
        for rr in (ro, ri):
            for i in range(n):
                a = 2 * math.pi * i / n; q = rr - (reed if (rr == ro and i % 2) else 0.0); v.append((q * math.cos(a), q * math.sin(a), z))
    def ix(layer, ring, i): return (layer * 2 + ring) * n + i % n
    for i in range(n):
        f.append([ix(1, 0, i), ix(1, 0, i + 1), ix(1, 1, i + 1), ix(1, 1, i)])      # верх
        f.append([ix(0, 0, i + 1), ix(0, 0, i), ix(0, 1, i), ix(0, 1, i + 1)])      # низ
        f.append([ix(0, 0, i), ix(0, 0, i + 1), ix(1, 0, i + 1), ix(1, 0, i)])      # наружная
        f.append([ix(0, 1, i + 1), ix(0, 1, i), ix(1, 1, i), ix(1, 1, i + 1)])      # внутренняя
    me.from_pydata(v, [], f); me.update()
    o = link(bpy.data.objects.new(name, me)); o.data.materials.append(material)
    for p in o.data.polygons: p.use_smooth = True
    if bev: bevel(o, bev, seg)
    return o

def coin(r, h, loc, rot, mat_body, mat_face, mat_mark, parent=None, mark=True):
    root = link(bpy.data.objects.new('coin', None)); root.location = loc; root.rotation_euler = rot
    rim = annulus(r, r * 0.9, h, mat_body, 'rim', -h / 2, n=160, bev=0.01, reed=0.014)
    ring = annulus(r * 0.92, r * 0.8, h * 1.0, mat_body, 'ring', -h * 0.5, bev=0.01)
    face = prism(circle(r * 0.81), h * 0.78, mat_face, 'face', -h * 0.39)
    parts = [rim, ring, face]
    if mark:
        for sgn in (1, -1):
            for o in shape2(r * 0.0058, 0.014, mat_mark, z0=0, bev=0.003):
                o.location.z = (h * 0.39) if sgn > 0 else -(h * 0.39) - 0.014
                if sgn < 0:
                    o.scale.x = -1
                parts.append(o)
    for o in parts: o.parent = root
    return root

