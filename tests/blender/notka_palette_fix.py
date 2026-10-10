import bpy, re
DIR = r"C:\Users\leksik\Documents\Notka\3D иконки"
MATS = DIR + r"\materials.blend"

def hexc(h, a=1.0):
    h = h.lstrip('#'); r, g, b = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    f = lambda c: ((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92
    return (f(r), f(g), f(b), a)

def pb(m):
    return next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')

def setin(n, k, v):
    if k in n.inputs: n.inputs[k].default_value = v

# палитра «Румянец» (брендбук): слива #1A0B16, роза #FF2D78, персик #FFB08E, пудра #FFE9DF
# производные: только из брендбука (#FFC4A8, #FFD6C4, #FFE2D2, #FFF3EE, #FF6F7F, #FF5C95, #FFBDD0) и смесей слива→роза
SET = {
    'mat_coin_rim_rosegold': dict(base='#FFB6A8'),          # персиково-розовое золото: персик → пудра .35 → роза .12
    'mat_coin_face': dict(base='#FFE9DF'),
    'mat_coin_face_light': dict(base='#FFF3EE'),
    'mat_coin_mark': dict(base='#FF2D78'),
    'mat_peach_metal': dict(base='#FFB08E'),
    'mat_card_chip': dict(base='#FFB08E'),
    'mat_card_chip_groove': dict(base='#431128'),
    'mat_logo_satin': dict(base='#FFB6A8'),
    'mat_text_emboss': dict(base='#FFD6C4'),
    'mat_pearl': dict(base='#FFE9DF'),
    'mat_pearl_bg': dict(base='#FFE2D2'),
    'mat_glass': dict(base='#FFBDD0'),
    'mat_mark_peach': dict(base='#FFB08E'),
    'mat_pedestal_gloss': dict(base='#4A0D3A', Metallic=0.0, Roughness=0.32, **{'Coat Weight': 0.0, 'Coat Roughness': 0.1, 'Specular IOR Level': 0.2}),
    'mat_plum_gloss': dict(base='#4A0D3A', Metallic=0.0, Roughness=0.3, **{'Coat Weight': 0.25, 'Coat Roughness': 0.1, 'Specular IOR Level': 0.3}),
    'mat_plum_deep': dict(base='#1A0B16', Metallic=0.0, Roughness=0.4, **{'Coat Weight': 0.3, 'Coat Roughness': 0.15}),
}
RENAMES = {'mat_bordo_gloss': 'mat_plum_coin_gloss', 'mat_bordo_deep': 'mat_plum_coin_deep'}
SET2 = {
    'mat_plum_coin_gloss': dict(base='#4A0D3A', Metallic=0.55, Roughness=0.16, **{'Coat Weight': 1.0, 'Coat Roughness': 0.02}),
    'mat_plum_coin_deep': dict(base='#2D0F24', Metallic=0.35, Roughness=0.14, **{'Coat Weight': 1.0, 'Coat Roughness': 0.02}),
}
DESC2 = {
    'mat_coin_rim_rosegold': 'Рифлёный металл монет: персиково-розовое золото #FFB6A8 (персик+пудра+роза), Metallic 1, Rough 0.2.',
    'mat_card_lacquer': 'Лак карты: градиент пудра-персик-роза (#FFD6C4 → #FFB08E → #FF6F7F → #FF2D78), Rough 0.2-0.3, Coat 0.7.',
    'mat_pedestal_gloss': 'Боковая стенка и кольцо подиума: глубокая слива #431128 (слива+роза 18%), без металла, чтобы не было серых отражений.',
    'mat_pedestal_top': 'Верх подиума: роза #FF5C95, Rough 0.5, AO в стыках.',
    'mat_plum_coin_gloss': 'Тёмная монета: слива #431128, Metallic 0.55, Rough 0.16, Coat 1.',
    'mat_plum_coin_deep': 'Тёмная монета, грань: слива #2D0F24.',
    'mat_plum_gloss': 'Слива #431128 для слота и подставок.',
    'mat_plum_deep': 'Слива #1A0B16: гнездо слота, внутренние тени.',
}

def apply_to_materials():
    for old, new in RENAMES.items():
        m = bpy.data.materials.get(old)
        if m: m.name = new
    for name, d in list(SET.items()) + list(SET2.items()):
        m = bpy.data.materials.get(name)
        if not m: print('нет', name); continue
        b = pb(m)
        for k, v in d.items():
            if k == 'base': setin(b, 'Base Color', hexc(v))
            else: setin(b, k, v)
    # верх подиума: цвет в AO-узле
    m = bpy.data.materials['mat_pedestal_top']
    ao = next(n for n in m.node_tree.nodes if n.type == 'AMBIENT_OCCLUSION'); ao.inputs['Color'].default_value = hexc('#FF5C95')
    setin(pb(m), 'Base Color', hexc('#FF5C95'))
    # лак карты: градиент пудра → персик → роза
    m = bpy.data.materials['mat_card_lacquer']
    rp = next(n for n in m.node_tree.nodes if n.type == 'VALTORGB'); el = rp.color_ramp.elements
    while len(el) > 2: el.remove(el[-1])
    el[0].position = 0.0; el[0].color = hexc('#FFD6C4'); el[1].position = 1.0; el[1].color = hexc('#FF2D78')
    el.new(0.10).color = hexc('#FFB08E'); el.new(0.30).color = hexc('#FF6F7F'); el.new(0.50).color = hexc('#FF2D78')
    for n, dsc in DESC2.items():
        mm = bpy.data.materials.get(n)
        if mm and mm.asset_data: mm.asset_data.description = dsc

def pull_materials_into_current():
    """Подтягивает mat_* из materials.blend и заменяет ими локальные (user_remap)."""
    with bpy.data.libraries.load(MATS, link=False) as (src, dst):
        dst.materials = [n for n in src.materials if n.startswith('mat_')]
    alias = {'mat_bordo_gloss': 'mat_plum_coin_gloss', 'mat_bordo_deep': 'mat_plum_coin_deep'}
    for m in list(bpy.data.materials):
        if m.name.startswith('mat_') and not re.search(r'\.\d{3}$', m.name):
            target = alias.get(m.name, m.name)
            new = bpy.data.materials.get(target + '.001') or (bpy.data.materials.get(target) if target != m.name else None)
            if new is not None and new is not m:
                m.user_remap(new)
    for m in list(bpy.data.materials):
        if m.name.startswith('mat_') and not re.search(r'\.\d{3}$', m.name) and m.users == 0:
            bpy.data.materials.remove(m)
    for m in list(bpy.data.materials):
        mm = re.match(r'(mat_.+)\.001$', m.name)
        if mm and not bpy.data.materials.get(mm.group(1)): m.name = mm.group(1)
