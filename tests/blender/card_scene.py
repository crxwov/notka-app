import os
P = globals().get('PARAMS', {})
VT = P.get('vt', 'Standard'); EXPO = P.get('expo', 0.0); LOOK = P.get('look', None)
FONT = bpy.data.fonts.load(r"C:\Users\leksik\AppData\Local\Temp\claude\C--Users-leksik-Documents-Notka\c797f173-2521-43bf-97fa-b935ef25869b\scratchpad\fonts\unbounded-700.ttf")

# ---------- дополнительные материалы ----------
def mat_ao(name, color, rough=0.5, coat=0.2, dist=0.6):
    m = mat(name, color, rough=rough, coat=coat, coat_rough=0.25)
    nt = m.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    ao = nt.nodes.new('ShaderNodeAmbientOcclusion'); ao.inputs['Color'].default_value = hexc(color); ao.inputs['Distance'].default_value = dist
    ao.samples = 8
    nt.links.new(ao.outputs['Color'], b.inputs['Base Color'])
    return m

M['plum'] = mat('plum', '#4A0E3A', rough=0.22, coat=0.9, coat_rough=0.04)
M['plum2'] = mat('plum2', '#2A0A22', rough=0.35, coat=0.5, coat_rough=0.1)
M['chkm'] = mat('chkm', '#FFF3EC', rough=0.5, coat=0.0)
M['ped_top'] = mat_ao('ped_top', '#F26A92', rough=0.5, coat=0.2, dist=0.7)
M['holo'] = mat('holo', '#EADCFF', metal=1.0, rough=0.14)
hb = next(n for n in M['holo'].node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); setin(hb, 'Thin Film Thickness', 650.0); setin(hb, 'Thin Film IOR', 1.6)
M['glass2'] = mat('glass2', '#FFC4D8', rough=0.015, trans=1.0, ior=1.47)
gb = next(n for n in M['glass2'].node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); setin(gb, 'Thin Wall', False)
for k in ('Dispersion',):
    setin(gb, k, 0.4)
def mat_card3():
    m = mat('card3', '#FF2D78', rough=0.25, coat=0.7, coat_rough=0.04)
    nt = m.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (0.26, 0.26, 0.26); mp.inputs['Rotation'].default_value = (0, 0, -0.55); mp.inputs['Location'].default_value = (0.5, 0.5, 0)
    gr = nt.nodes.new('ShaderNodeTexGradient'); gr.gradient_type = 'LINEAR'
    rp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], gr.inputs['Vector']); nt.links.new(gr.outputs['Fac'], rp.inputs['Fac'])
    el = rp.color_ramp.elements; el[0].position = 0.12; el[0].color = hexc('#FF8468'); el[1].position = 0.95; el[1].color = hexc('#DF1F5C')
    mid = el.new(0.5); mid.color = hexc('#FF2D78')
    nt.links.new(rp.outputs['Color'], b.inputs['Base Color'])
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 380.0; nz.inputs['Detail'].default_value = 6.0
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = 0.2; mr.inputs['To Max'].default_value = 0.3
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector']); nt.links.new(nz.outputs['Fac'], mr.inputs['Value']); nt.links.new(mr.outputs['Result'], b.inputs['Roughness'])
    bm = nt.nodes.new('ShaderNodeBump'); bm.inputs['Strength'].default_value = 0.025; bm.inputs['Distance'].default_value = 0.01
    nt.links.new(nz.outputs['Fac'], bm.inputs['Height']); nt.links.new(bm.outputs['Normal'], b.inputs['Normal'])
    return m
M['card'] = mat_card3()
M['embo'] = mat('embo', '#FFD2C2', rough=0.34, coat=0.3, coat_rough=0.2)  # не используется
M['chipm'] = mat('chipm', '#F7B596', metal=1.0, rough=0.32, coat=0.2, coat_rough=0.2)
M['groove'] = mat('groove', '#9A5A48', rough=0.5)
M['bgpearl'] = mat('bgpearl', '#FFDCCD', metal=0.7, rough=0.38, coat=0.3, coat_rough=0.25)
M['logo'] = mat('logo', '#F6B9A6', metal=0.8, rough=0.28, coat=0.5, coat_rough=0.06)
M['txt'] = mat('txt', '#FFD2C2', rough=0.34, coat=0.3, coat_rough=0.2)
M['bordo'] = mat('bordo', '#94104A', metal=0.55, rough=0.16, coat=1.0, coat_rough=0.02)
M['bordo2'] = mat('bordo2', '#6E0A38', metal=0.35, rough=0.14, coat=1.0, coat_rough=0.02)

def mat_holo(name, x0, x1):
    m = mat(name, '#FFFFFF', metal=1.0, rough=0.1)
    nt = m.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tc = nt.nodes.new('ShaderNodeTexCoord'); sp = nt.nodes.new('ShaderNodeSeparateXYZ'); mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = x0; mr.inputs['From Max'].default_value = x1; mr.inputs['To Min'].default_value = 300.0; mr.inputs['To Max'].default_value = 1000.0
    nt.links.new(tc.outputs['Object'], sp.inputs[0]); nt.links.new(sp.outputs[0], mr.inputs['Value'])
    if 'Thin Film Thickness' in b.inputs:
        nt.links.new(mr.outputs['Result'], b.inputs['Thin Film Thickness']); setin(b, 'Thin Film IOR', 2.2)
    return m
M['holo_p'] = mat_holo('holo_p', -0.23, 0.23)
M['holo_b'] = mat_holo('holo_b', -1.2, 1.2)
M['rgold'] = mat('rgold', '#EE9A86', metal=1.0, rough=0.2, coat=0.35, coat_rough=0.05)
M['pmark'] = mat('pmark', '#FFB08E', rough=0.35, coat=0.3, coat_rough=0.1)
M['inlay'] = mat('inlay', '#7C0A3E', rough=0.22, coat=0.15, coat_rough=0.08)
M['rose_g'] = mat('rose_g', '#FF2D78', rough=0.18, coat=1.0, coat_rough=0.03, trans=0.0)
M['card'].node_tree.nodes  # уже создан в lib; углубляем конец градиента
for n in M['card'].node_tree.nodes:
    if n.type == 'VALTORGB':
        n.color_ramp.elements[0].color = hexc('#FF9C78'); n.color_ramp.elements[-1].color = hexc('#D8105E')

def stroke(pts, w):
    n = len(pts); L = []; R = []
    def nrm(a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]; l = math.hypot(dx, dy); return (-dy / l, dx / l)
    for i, p in enumerate(pts):
        if i == 0: mv = nrm(pts[0], pts[1])
        elif i == n - 1: mv = nrm(pts[-2], pts[-1])
        else:
            n1 = nrm(pts[i - 1], p); n2 = nrm(p, pts[i + 1]); d = 1 + n1[0] * n2[0] + n1[1] * n2[1]
            mv = ((n1[0] + n2[0]) / d, (n1[1] + n2[1]) / d)
        L.append((p[0] + mv[0] * w, p[1] + mv[1] * w)); R.append((p[0] - mv[0] * w, p[1] - mv[1] * w))
    return R + L[::-1]

def star4(r, k=0.2, n=4):
    pts = []
    for i in range(n * 2):
        a = math.pi * i / n + math.pi / 2; rr = r if i % 2 == 0 else r * k
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    return pts

def sparkle(r, loc, rot, material):
    o = prism(star4(r, 0.24), r * 0.3, material, 'sparkle', -r * 0.15, bev=r * 0.06, seg=4)
    o.location = loc; o.rotation_euler = rot; return o

def text3d(txt, size, material, loc, parent, extrude=0.008, align='LEFT', bevd=0.0015):
    cu = bpy.data.curves.new('t', 'FONT'); cu.body = txt; cu.font = FONT; cu.size = size
    cu.extrude = extrude; cu.bevel_depth = bevd; cu.align_x = align; cu.resolution_u = 4
    o = link(bpy.data.objects.new('txt', cu)); o.data.materials.append(material); o.location = loc; o.parent = parent
    return o

def text_spaced(txt, size, material, x0, y, adv, parent, z, extrude, bevd, group_gap=0.0):
    x = x0
    for ch in txt:
        if ch == ' ':
            x += group_gap; continue
        text3d(ch, size, material, (x + adv / 2, y, z), parent, extrude=extrude, align='CENTER', bevd=bevd)
        x += adv

def sphere(r, loc, material, name='pearl'):
    sp = link(bpy.data.objects.new(name, bpy.data.meshes.new(name)))
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=24, radius=r); bm.to_mesh(sp.data); bm.free()
    for p_ in sp.data.polygons: p_.use_smooth = True
    sp.data.materials.append(material); sp.location = loc; return sp

random.seed(4)
PS = 1.15  # масштаб подиума
# ---------- подиум ----------
base = prism(circle(3.45, 180), 0.07, M['pearl'], 'ped_base', 0, bev=0.025, seg=3)
ped = prism(circle(3.35, 180), 0.24, M['inlay'], 'pedestal', 0.0, bev=0.05, seg=5)
inl = annulus(3.4, 3.3, 0.04, M['pearl'], 'inlay', 0.19, n=180, bev=0.008)
ped_top = prism(circle(3.0, 180), 0.05, M['ped_top'], 'ped_top', 0.24, bev=0.02, seg=3)
TOP = 0.29

# ---------- карта ----------
CW, CH, CT = 3.4, 2.14, 0.07
SC = 1.2
card_root = link(bpy.data.objects.new('card', None)); card_root.scale = (SC,) * 3
body = prism(rrect(CW, CH, 0.2, 14), CT, M['card'], 'card_body', -CT / 2, bev=0.04, seg=7); body.parent = card_root
z0 = CT / 2
# тиснение знака (выпуклое, с фаской) + подложка-тень
for o in shape2(0.0038, 0.03, M['logo'], z0=0, bev=0.005):
    o.location = (-CW / 2 + 0.62, CH / 2 - 0.52, z0); o.parent = card_root
text_spaced('НОТКА', 0.115, M['txt'], CW / 2 - 0.3 - 5 * 0.125, CH / 2 - 0.62, 0.125, card_root, z0, 0.009, 0.0012)
# чип с толщиной и канавками
chip = prism(rrect(0.56, 0.42, 0.08, 8), 0.035, M['chipm'], 'chip', 0, bev=0.008, seg=3); chip.location = (-CW / 2 + 0.62, 0.02, z0); chip.parent = card_root
for dx, dy, w, h in ((0, 0.07, 0.56, 0.008), (0, -0.07, 0.56, 0.008), (-0.1, 0, 0.008, 0.42), (0.1, 0, 0.008, 0.42)):
    g = prism([(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)], 0.004, M['groove'], 'g', 0)
    g.location = (-CW / 2 + 0.62 + dx, 0.02 + dy, z0 + 0.034); g.parent = card_root
# выпуклые цифры, надпись, голограмма
text_spaced('1234 5678 9012 3456', 0.14, M['txt'], -CW / 2 + 0.34, -CH / 2 + 0.66, 0.117, card_root, z0, 0.011, 0.0012, group_gap=0.08)
text_spaced('НОТКА PLUS', 0.125, M['txt'], -CW / 2 + 0.34, -CH / 2 + 0.44, 0.126, card_root, z0, 0.008, 0.001, group_gap=0.06)
holo = prism(rrect(0.46, 0.34, 0.06, 8), 0.005, M['holo_p'], 'holo', 0, bev=0.0015); holo.location = (CW / 2 - 0.5, -CH / 2 + 0.62, z0); holo.parent = card_root
band = prism(rrect(2.4, 0.06, 0.03, 6), 0.004, M['holo_b'], 'band', 0, bev=0.001); band.location = (-0.08, -CH / 2 + 0.29, z0); band.parent = card_root
hs = shape2(0.0016, 0.006, M['plum'], z0=0, bev=0.0012)
for o in hs: o.location = (CW / 2 - 0.5, -CH / 2 + 0.62, z0 + 0.005); o.parent = card_root

# слот в подиуме и посадка карты
card_root.rotation_euler = (math.radians(70), math.radians(-5), math.radians(-24))
slot_c = (-0.35, -0.1)
card_root.location = (0, 0, 2.0); bpy.context.view_layer.update()
bot = card_root.matrix_world @ Vector((0, -CH / 2, 0))
card_root.location = (slot_c[0] - bot.x, slot_c[1] - bot.y, 2.0 + (TOP + 0.045 - bot.z)); bpy.context.view_layer.update()
SLW = CW * SC + 0.35
frame = prism(rrect(SLW + 0.3, 0.7, 0.24, 10), 0.04, M['plum'], 'slot_frame', 0, bev=0.012, seg=3)
slab = prism(rrect(SLW, 0.38, 0.12, 10), 0.045, M['plum2'], 'slot', 0, bev=0.008, seg=2)
for o in (frame, slab):
    o.location = (slot_c[0], slot_c[1], TOP - 0.002); o.rotation_euler = (0, 0, math.radians(-24))
slab.location.z = TOP + 0.01

# ---------- монеты ----------
R, Hc = 0.62, 0.13
from mathutils import Quaternion
TILT = math.radians(13)
CDIR = Vector((0.53, -0.85, 0.0)); AX = Vector((0, 0, 1)).cross(CDIR).normalized()
def stack(cx, cy, n):
    for i in range(n):
        x = cx + random.uniform(-0.02, 0.02); y = cy + random.uniform(-0.02, 0.02); yaw = math.radians(31.6) + random.uniform(-0.012, 0.012)
        zc = TOP + Hc / 2 + 0.002 + i * (Hc + 0.004)
        if i == n - 1:
            q = Quaternion(AX, TILT) @ Quaternion((0, 0, 1), yaw)
            zc = TOP + 0.002 + i * (Hc + 0.004) + R * math.sin(TILT) + Hc / 2 * math.cos(TILT)
            coin(R, Hc, (x, y, zc), q.to_euler(), M['rgold'], M['cface'], M['mark'])
        else:
            coin(R, Hc, (x, y, zc), (0, 0, yaw), M['rgold'], M['cface'], M['mark'])
stack(1.55, -1.75, 6)
stack(0.0, -2.0, 3)
phi = math.radians(76)
coin(R, Hc, (2.45, -0.5, TOP + R * math.sin(phi) + Hc / 2 * math.cos(phi) + 0.002), (phi, 0, math.radians(62)), M['rgold'], M['cface'], M['mark'])
coin(R * 0.9, Hc, (2.6, -0.6, 3.2), (math.radians(35), math.radians(18), math.radians(20)), M['rgold'], M['cface2'], M['mark'])
coin(R * 0.68, Hc * 0.9, (-2.45, 0.3, 3.0), (math.radians(62), math.radians(-30), math.radians(10)), M['bordo'], M['bordo2'], M['pmark'])

# ---------- стеклянный значок: толстое стекло, объёмная галочка, цветная кайма ----------
tile_root = link(bpy.data.objects.new('tile', None))
T = prism(rrect(1.2, 1.2, 0.34, 12), 0.16, M['glass2'], 'tile', -0.08, bev=0.045, seg=6); T.parent = tile_root
T.visible_shadow = False
chk = prism(stroke([(-0.3, 0.0), (-0.09, -0.22), (0.33, 0.26)], 0.085), 0.1, M['rose_g'], 'check', -0.05, bev=0.03, seg=4); chk.parent = tile_root
rim_ = annulus(0.0, 0.0, 0, M['rose'], 'x') if False else None
tile_root.scale = (1.15, 1.15, 1.15)
tile_root.location = (-1.45, -1.3, 0.29 + 0.72)
tile_root.rotation_euler = (math.radians(72), math.radians(8), math.radians(-4))
# контакт значка: низкая подставка-диск
stand = prism(circle(0.36, 64), 0.1, M['plum'], 'stand', 0, bev=0.025, seg=3); stand.location = (-1.45, -1.3, TOP)
# объект за стеклом: крупная жемчужина
sphere(0.2, (-2.25, -0.6, TOP + 0.2), M['pearl'])

# ---------- блёстки (две), жемчуг разного размера ----------
sparkle(0.46, (3.0, 0.5, 3.9), (math.radians(80), 0, math.radians(15)), M['pearl'])
sparkle(0.22, (-3.0, 0.6, 3.9), (math.radians(80), 0, math.radians(-10)), M['rose'])
for (x, y, r_) in ((2.7, -1.9, 0.17), (-0.9, -2.55, 0.1), (0.9, -2.6, 0.2), (2.0, 0.3, 0.08), (-2.4, -0.4, 0.13)):
    sphere(r_, (x, y, TOP + r_), M['pearl'])
# передний план (размытый): крупная жемчужина на полу перед подиумом
sphere(0.34, (0.4, -4.35, 0.34), M['pearl'], 'fg_pearl')

# ---------- мир, свет, камера ----------
floor = link(bpy.data.objects.new('floor', bpy.data.meshes.new('floor')))
floor.data.from_pydata([(-40, -40, -0.001), (40, -40, -0.001), (40, 40, -0.001), (-40, 40, -0.001)], [], [[0, 1, 2, 3]])
floor.data.materials.append(M['powder']); floor.is_shadow_catcher = True

w = sc.world or bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
nt = w.node_tree; nt.nodes.clear()
out = nt.nodes.new('ShaderNodeOutputWorld'); bg = nt.nodes.new('ShaderNodeBackground')
tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); ramp = nt.nodes.new('ShaderNodeValToRGB')
nt.links.new(tc.outputs['Window'], sep.inputs[0]); nt.links.new(sep.outputs[1], ramp.inputs[0])
e = ramp.color_ramp.elements; e[0].position = 0.0; e[0].color = hexc('#FF7EA6'); e[1].position = 1.0; e[1].color = hexc('#FFE6DA')
nt.links.new(ramp.outputs[0], bg.inputs[0]); bg.inputs[1].default_value = P.get('bgs', 1.0)
nt.links.new(bg.outputs[0], out.inputs[0])

def area(name, loc, color, power, size, target=(0, 0, 0.8)):
    ld = bpy.data.lights.new(name, 'AREA'); ld.energy = power; ld.size = size; ld.color = color[:3]
    o = link(bpy.data.objects.new(name, ld)); o.location = loc
    d = Vector(target) - Vector(loc); o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return o
area('key', (-4.5, -5.5, 6.5), (1, 0.95, 0.9), P.get('key', 430), 2.6)
area('rim', (5.5, 4.5, 3.5), (1, 0.5, 0.7), 420, 3.0)
area('back', (-5.5, 6.0, 3.5), (1, 0.93, 0.95), P.get('back', 520), 2.4)
area('fill', (5.0, -4.5, 1.8), (1, 0.9, 0.9), 70, 6.0)
area('top', (0, 0, 7), (1, 1, 1), 120, 3.0)

bpy.context.view_layer.update()
_mw = card_root.matrix_world; _q = _mw.to_quaternion()
_n = (_q @ Vector((0, 0, 1))).normalized(); _c = _mw.translation
_v = (Vector((6.4, -10.4, 5.5)) - _c).normalized()
_r = (2 * _n * _n.dot(_v) - _v).normalized(); _right = (_q @ Vector((1, 0, 0))).normalized()
sb = area('strip', _c + _r * 9.0 + _right * 3.4, (1, 0.97, 0.95), P.get('strip', 520), 1.0, target=tuple(_c + _right * 0.8))
sb.data.shape = 'RECTANGLE'; sb.data.size = 0.22; sb.data.size_y = 7.0
try: sb.visible_transmission = False
except Exception as ex: print('vt', ex)
cam = link(bpy.data.objects.new('cam', bpy.data.cameras.new('cam')))
cam.data.lens = 58; cam.location = (6.4, -10.4, 5.5)
tgt = link(bpy.data.objects.new('tgt', None)); tgt.location = (0.1, -0.4, 1.5)
tr = cam.constraints.new('TRACK_TO'); tr.target = tgt; tr.track_axis = 'TRACK_NEGATIVE_Z'; tr.up_axis = 'UP_Y'
sc.camera = cam
bpy.context.view_layer.update()
cmw = cam.matrix_world; fwd = cmw.to_quaternion() @ Vector((0, 0, -1)); rgt = cmw.to_quaternion() @ Vector((1, 0, 0)); upv = cmw.to_quaternion() @ Vector((0, 1, 0))
bk = random.Random(7)
BGS = [(-0.42, 0.30, 17, 0.55, 'bgpearl'), (-0.17, 0.44, 22, 0.38, 'rose_g'), (0.14, 0.40, 20, 0.7, 'bgpearl'), (0.27, 0.43, 21, 0.4, 'peach'), (0.47, 0.10, 19, 0.6, 'rose_g'), (-0.47, 0.04, 24, 0.55, 'bgpearl')]
for (u, v, d, rr_, mk_) in BGS:
    pos = cmw.translation + d * (fwd + 2 * u * 0.31 * rgt + 2 * v * 0.31 * upv)
    sph = sphere(rr_, pos, M[mk_], 'bgsphere'); sph.visible_shadow = False; sph.visible_glossy = False
cam.data.dof.use_dof = True; cam.data.dof.focus_object = card_root; cam.data.dof.aperture_fstop = P.get('fstop', 0.55)

sc.render.engine = 'CYCLES'
sc.render.resolution_x = 1000; sc.render.resolution_y = 1000
sc.cycles.samples = 96; sc.cycles.use_denoising = True
try:
    sc.cycles.denoising_input_passes = 'RGB_ALBEDO_NORMAL'; sc.cycles.denoising_prefilter = 'NONE'
except Exception as ex: print('dn', ex)
sc.cycles.max_bounces = 12; sc.cycles.transmission_bounces = 12; sc.cycles.transparent_max_bounces = 12
try: sc.view_settings.view_transform = VT
except Exception as ex: print('vt', ex)
if LOOK:
    try: sc.view_settings.look = LOOK
    except Exception as ex: print('look', str(ex)[:120])
sc.view_settings.exposure = EXPO
try:
    pr = bpy.context.preferences.addons['cycles'].preferences
    for t in ('OPTIX', 'CUDA', 'HIP'):
        try:
            pr.compute_device_type = t; pr.get_devices()
            if [d for d in pr.devices if d.type != 'CPU']:
                for d in pr.devices: d.use = d.type != 'CPU'
                sc.cycles.device = 'GPU'; break
        except Exception: continue
except Exception as ex: print('dev', ex)
print('built', len(bpy.data.objects))
