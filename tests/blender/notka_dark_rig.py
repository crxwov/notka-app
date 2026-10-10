import bpy, math
from mathutils import Vector

def hexc(h, a=1.0):
    h = h.lstrip('#'); r, g, b = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    f = lambda c: ((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92
    return (f(r), f(g), f(b), a)

# Градиент из брендбука/Frame 4.png: слива #1A0B16 внизу, розовое свечение сверху по центру (пик #BE2562)
GRAD = [(0.0, '#BE2562'), (0.07, '#AF235A'), (0.14, '#9E2153'), (0.29, '#7A1A42'), (0.43, '#5A1534'),
        (0.57, '#411128'), (0.71, '#2E0D1F'), (0.86, '#210C19'), (1.14, '#1B0B17')]

def build_world(sc, strength=1.0):
    w = sc.world or bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
    nt = w.node_tree; nt.nodes.clear()
    N = nt.nodes.new
    out = N('ShaderNodeOutputWorld'); bg = N('ShaderNodeBackground'); tc = N('ShaderNodeTexCoord'); sp = N('ShaderNodeSeparateXYZ')
    dx = N('ShaderNodeMath'); dx.operation = 'SUBTRACT'; dx.inputs[1].default_value = 0.5
    dx2 = N('ShaderNodeMath'); dx2.operation = 'POWER'; dx2.inputs[1].default_value = 2.0
    dy = N('ShaderNodeMath'); dy.operation = 'SUBTRACT'; dy.inputs[0].default_value = 1.0   # 1 - Y
    dys = N('ShaderNodeMath'); dys.operation = 'DIVIDE'; dys.inputs[1].default_value = 0.7
    dy2 = N('ShaderNodeMath'); dy2.operation = 'POWER'; dy2.inputs[1].default_value = 2.0
    add = N('ShaderNodeMath'); add.operation = 'ADD'
    sq = N('ShaderNodeMath'); sq.operation = 'SQRT'
    rp = N('ShaderNodeValToRGB')
    L = nt.links.new
    L(tc.outputs['Window'], sp.inputs[0])
    L(sp.outputs[0], dx.inputs[0]); L(dx.outputs[0], dx2.inputs[0])
    L(sp.outputs[1], dy.inputs[1]); L(dy.outputs[0], dys.inputs[0]); L(dys.outputs[0], dy2.inputs[0])
    L(dx2.outputs[0], add.inputs[0]); L(dy2.outputs[0], add.inputs[1]); L(add.outputs[0], sq.inputs[0]); L(sq.outputs[0], rp.inputs[0])
    el = rp.color_ramp.elements
    el[0].position = GRAD[0][0]; el[0].color = hexc(GRAD[0][1]); el[1].position = GRAD[-1][0]; el[1].color = hexc(GRAD[-1][1])
    for pos, c in GRAD[1:-1]: el.new(pos).color = hexc(c)
    L(rp.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = strength; L(bg.outputs[0], out.inputs[0])

def light_by(sc, base):
    for o in bpy.data.objects:
        if o.type == 'LIGHT' and o.name.split('.')[0] in (base, 'rig_' + base): return o

def set_light(o, loc, col, power, size, target=(0, 0, 0.8), shape=None, size_y=None):
    o.location = loc; o.data.color = col; o.data.energy = power; o.data.size = size
    if shape: o.data.shape = shape
    if size_y: o.data.size_y = size_y
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()

def new_area(sc, name, col):
    ld = bpy.data.lights.new(name, 'AREA'); o = bpy.data.objects.new(name, ld)
    (bpy.data.collections.get('rig_lights') or sc.collection).objects.link(o); return o

def build_glow(sc, color='#FF4A8C', strength=3.0, r_in=3.2, r_out=4.5):
    """Мягкое розовое свечение под подиумом: диск с радиальным спадом, прозрачный по краю."""
    for o in list(bpy.data.objects):
        if o.name == 'rig_glow': bpy.data.objects.remove(o, do_unlink=True)
    me = bpy.data.meshes.new('rig_glow'); n = 96
    v = [(0, 0, 0)] + [(r_out * math.cos(2 * math.pi * i / n), r_out * math.sin(2 * math.pi * i / n), 0) for i in range(n)]
    f = [[0, 1 + i, 1 + (i + 1) % n] for i in range(n)]
    me.from_pydata(v, [], f); me.update()
    o = bpy.data.objects.new('rig_glow', me); o.location = (0, 0, 0.004)
    (bpy.data.collections.get('rig_floor') or sc.collection).objects.link(o)
    m = bpy.data.materials.new('rig_glow'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    N = nt.nodes.new; L = nt.links.new
    out = N('ShaderNodeOutputMaterial'); mix = N('ShaderNodeMixShader'); tr = N('ShaderNodeBsdfTransparent'); em = N('ShaderNodeEmission')
    tc = N('ShaderNodeTexCoord'); vl = N('ShaderNodeVectorMath'); vl.operation = 'LENGTH'; mr = N('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = r_in; mr.inputs['From Max'].default_value = r_out; mr.inputs['To Min'].default_value = 1.0; mr.inputs['To Max'].default_value = 0.0
    mr.interpolation_type = 'SMOOTHERSTEP'
    em.inputs['Color'].default_value = hexc(color); em.inputs['Strength'].default_value = strength
    L(tc.outputs['Object'], vl.inputs[0]); L(vl.outputs['Value'], mr.inputs['Value']); L(mr.outputs['Result'], mix.inputs['Fac'])
    L(tr.outputs[0], mix.inputs[1]); L(em.outputs[0], mix.inputs[2]); L(mix.outputs[0], out.inputs['Surface'])
    o.data.materials.append(m)
    o.visible_shadow = False
    return o

def apply_dark_rig(P=None):
    P = P or {}
    sc = bpy.context.scene
    build_world(sc, P.get('world', 1.0))
    key = light_by(sc, 'key'); top = light_by(sc, 'top'); rim = light_by(sc, 'rim'); back = light_by(sc, 'back')
    fill = light_by(sc, 'fill'); strip = light_by(sc, 'strip')
    # основной: очень мягкий, сверху, со стороны светлой части градиента
    set_light(key, (-1.5, -3.5, 9.0), (1.0, 0.80, 0.84), P.get('key', 260), 7.0)
    set_light(top, (0, 0, 8.0), (1.0, 0.55, 0.72), P.get('top', 60), 4.0)
    # контровые: розовый справа, персиковый слева
    set_light(rim, (5.5, 4.5, 3.5), (1.0, 0.18, 0.47), P.get('rim', 380), 3.0)
    set_light(back, (-5.5, 6.0, 3.5), (1.0, 0.69, 0.55), P.get('back', 380), 3.0)
    set_light(fill, (5.0, -4.5, 1.8), (1.0, 0.55, 0.68), P.get('fill', 25), 6.0)
    if strip: strip.data.color = (1.0, 0.80, 0.70); strip.data.energy = P.get('strip', 260)
    # светлый край подиума: узкая полоса сзади-низко
    edge = light_by(sc, 'edge') or new_area(sc, 'rig_edge', None)
    set_light(edge, (0, 6.5, 0.9), (1.0, 0.76, 0.64), P.get('edge', 260), 0.3, target=(0, 0, 0.35), shape='RECTANGLE', size_y=7.0)
    refl = light_by(sc, 'reflect') or new_area(sc, 'rig_reflect', None)
    set_light(refl, (3.5, -9.5, 3.8), (1.0, 0.86, 0.88), P.get('reflect', 220), 11.0, target=(0, 0, 1.0))
    for _o in list(bpy.data.objects):
        if _o.name == 'rig_glow': bpy.data.objects.remove(_o, do_unlink=True)
    if P.get('glow'): build_glow(sc, strength=P['glow'])  # по умолчанию свечения под подиумом нет
    sc.render.film_transparent = True
    sc.view_settings.view_transform = P.get('vt', 'Standard'); sc.view_settings.exposure = P.get('expo', 0.0)
    try: sc.view_settings.look = P.get('look', 'None')
    except Exception: pass
    sc['notka_rig'] = 'dark: world from брендбук/Frame 4.png, film transparent'
