import bpy, math, bmesh
from mathutils import Vector, Matrix
OUT = r"C:\Users\leksik\Documents\Notka\3D иконки"

RENAME = {
    'pearl': 'mat_pearl', 'bgpearl': 'mat_pearl_bg', 'peach': 'mat_peach_metal', 'powder': 'mat_powder',
    'card3': 'mat_card_lacquer', 'chipm': 'mat_card_chip', 'groove': 'mat_card_chip_groove',
    'holo_p': 'mat_holo_patch', 'holo_b': 'mat_holo_band', 'logo': 'mat_logo_satin', 'txt': 'mat_text_emboss',
    'rgold': 'mat_coin_rim_rosegold', 'cface': 'mat_coin_face', 'cface2': 'mat_coin_face_light', 'mark': 'mat_coin_mark',
    'glass2': 'mat_glass', 'rose': 'mat_rose', 'rose_g': 'mat_rose_gloss',
    'inlay': 'mat_pedestal_gloss', 'ped_top': 'mat_pedestal_top',
    'bordo': 'mat_bordo_gloss', 'bordo2': 'mat_bordo_deep', 'plum': 'mat_plum_gloss', 'plum2': 'mat_plum_deep', 'pmark': 'mat_mark_peach',
}
DESC = {
    'mat_pearl': 'Перламутр: светлый металл, лёгкий лак. Блёстки, жемчуг, борт подиума.',
    'mat_pearl_bg': 'Матовый жемчуг для фоновых шаров (мягче, без пересвета).',
    'mat_peach_metal': 'Персиковый металл.',
    'mat_powder': 'Пудра #FFE9DF: пол-тень (shadow catcher), мелкие детали.',
    'mat_card_lacquer': 'Лак карты: градиент коралл-роза-малина через Color Ramp, шероховатость 0.2-0.3 (Noise), Coat 0.7. Ждёт карту ~3.4x2.14 в локальных координатах.',
    'mat_card_chip': 'Чип карты: персиковый металл.',
    'mat_card_chip_groove': 'Канавки чипа.',
    'mat_holo_patch': 'Голограмма (пятно): тонкоплёночный перелив 300-1000 нм по оси X.',
    'mat_holo_band': 'Голограмма (полоса): тонкоплёночный перелив, диапазон под полосу 2.4 длиной.',
    'mat_logo_satin': 'Знак Shape2 на карте: перламутровый сатин.',
    'mat_text_emboss': 'Рельефные надписи на карте: сатин пудра-персик.',
    'mat_coin_rim_rosegold': 'Рифлёный металл монет: розовое золото, металл 1, Rough 0.2, Coat 0.35.',
    'mat_coin_face': 'Грань монеты: матовая пудра.',
    'mat_coin_face_light': 'Грань монеты: светлее.',
    'mat_coin_mark': 'Знак Shape2 на монете: плотная роза #FF1F6E.',
    'mat_glass': 'Стекло значка: Transmission 1, IOR 1.47, розовый оттенок, Rough 0.015.',
    'mat_rose': 'Плоская роза #FF2D78 с лаком.',
    'mat_rose_gloss': 'Глянцевая роза: галочка, шарики.',
    'mat_pedestal_gloss': 'Глянец подиума: глубокий малиново-бордовый #7C0A3E.',
    'mat_pedestal_top': 'Верх подиума: роза #F26A92, матовый, с AO в стыках.',
    'mat_bordo_gloss': 'Насыщенное бордо #94104A, глянец (тёмный акцент).',
    'mat_bordo_deep': 'Глубокое бордо #6E0A38.',
    'mat_plum_gloss': 'Слива #4A0E3A глянец: слот, подставки.',
    'mat_plum_deep': 'Слива #2A0A22: гнездо слота.',
    'mat_mark_peach': 'Знак персиковый на тёмной монете.',
}

def rename_mats():
    for old, new in RENAME.items():
        m = bpy.data.materials.get(old)
        if m: m.name = new

def used_mats():
    return [m for m in bpy.data.materials if m.name.startswith('mat_') and m.users > 0]

def to_collection(root, name):
    col = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(col)
    for o in [root] + list(root.children_recursive):
        for c in list(o.users_collection): c.objects.unlink(o)
        col.objects.link(o)
    return col

def adopt(root, objs):
    for o in objs:
        o.parent = root; o.matrix_parent_inverse = root.matrix_world.inverted()

def new_root(name, loc=(0, 0, 0), rot=(0, 0, 0)):
    r = bpy.data.objects.new(name, None); r.empty_display_type = 'ARROWS'; r.empty_display_size = 0.4
    bpy.context.scene.collection.objects.link(r); r.location = loc; r.rotation_euler = rot
    bpy.context.view_layer.update(); return r
