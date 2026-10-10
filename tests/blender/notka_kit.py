"""Сборка иконки Нотки из kit.blend внутри rig.blend.

Использование (в Blender, открыт rig.blend):
    exec(open(r"...\tests\blender\notka_kit.py", encoding="utf-8").read())
    add_icon('icon_pedestal')
    add_icon('icon_card', loc=(-0.35, -0.1, 0.29), rot_z=-24)
    add_icon('icon_coin', loc=(1.5, -1.75, 0.29))
    render_pair(r"...\\имя")   # PNG с фоном + PNG на прозрачном фоне

Материалы берутся из уже открытой сцены (mat_*), дубликаты вида mat_x.001 склеиваются.
Верх подиума в эталоне: z = 0.29.
"""
import bpy, math, re, time

DIR = r"C:\Users\leksik\Documents\Notka\3D иконки"
KIT = DIR + r"\kit.blend"
MATS = DIR + r"\materials.blend"
TOP = 0.29


def _merge_materials(objs):
    """Заменяет mat_x.001 на оригинал mat_x; подтягивает недостающие из materials.blend."""
    need = set()
    for o in objs:
        for s in getattr(o, 'material_slots', []):
            if s.material:
                need.add(re.sub(r'\.\d{3}$', '', s.material.name))
    missing = [n for n in need if n not in bpy.data.materials]
    if missing:
        with bpy.data.libraries.load(MATS, link=False) as (src, dst):
            dst.materials = [n for n in src.materials if n in missing]
    for o in objs:
        for s in getattr(o, 'material_slots', []):
            if s.material:
                base = re.sub(r'\.\d{3}$', '', s.material.name)
                m = bpy.data.materials.get(base)
                if m and m is not s.material:
                    s.material = m


def add_icon(name, loc=(0, 0, 0), rot_z=0.0, scale=1.0):
    """Добавляет заготовку (коллекция icon_*) в сцену, ставит корень в loc."""
    with bpy.data.libraries.load(KIT, link=False) as (src, dst):
        assert name in src.collections, name
        dst.collections = [name]
    col = dst.collections[0]
    bpy.context.scene.collection.children.link(col)
    objs = list(col.all_objects)
    _merge_materials(objs)
    root = next(o for o in objs if o.parent is None)
    root.location = loc
    root.rotation_euler[2] = math.radians(rot_z)
    root.scale = (scale,) * 3
    return root


def render_pair(base, res=2048, samples=640):
    """PNG с фоном (виньетка) и PNG на прозрачном фоне. Нужны функции из card_run.py (shoot, shoot_alpha)."""
    shoot(base + ".png", res, samples, vig=0.1)
    shoot_alpha(base + "_прозрачный.png", res, samples)
