import bpy, numpy as np, time
SP = r"C:\Users\leksik\AppData\Local\Temp\claude\C--Users-leksik-Documents-Notka\c797f173-2521-43bf-97fa-b935ef25869b\scratchpad"

def build(params=None):
    global PARAMS
    PARAMS = params or {}
    g = {'PARAMS': PARAMS}
    exec(open(SP + r"\lib.py", encoding="utf-8").read(), g)
    exec(open(SP + r"\scene2.py", encoding="utf-8").read(), g)

def shoot(path, res=900, samples=64, vig=0.12):
    sc = bpy.context.scene
    sc.render.resolution_x = res; sc.render.resolution_y = res; sc.cycles.samples = samples
    tmp = SP + r"\_raw.png"; sc.render.filepath = tmp
    t = time.time(); bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(tmp, check_existing=False)
    a = np.array(im.pixels[:], dtype=np.float32).reshape(res, res, 4)
    yy, xx = np.mgrid[0:res, 0:res].astype(np.float32); c = (res - 1) / 2
    r = np.sqrt(((xx - c) / c) ** 2 + ((yy - c) / c) ** 2) / 1.2
    f = np.clip((r - 0.5) / 0.6, 0, 1); f = f * f * (3 - 2 * f)
    tint = np.array([0.55, 0.10, 0.32], dtype=np.float32)
    a[..., :3] = a[..., :3] * (1 - vig * f[..., None]) + tint * (vig * 0.35 * f[..., None])
    im.pixels[:] = a.ravel(); im.filepath_raw = path; im.file_format = 'PNG'; im.save()
    bpy.data.images.remove(im)
    print('render sec', round(time.time() - t, 1))

def closeup(path, target='card', dist=10.0, lens=85, w=1600, h=1000, samples=96, oblique=True, off=(0, 0, 0)):
    from mathutils import Vector
    sc = bpy.context.scene
    t = bpy.data.objects[target]
    bb = [t.matrix_world @ Vector(c) for c in t.bound_box] if t.type == 'MESH' else [t.matrix_world.translation]
    ctr = sum(bb, Vector()) / len(bb) + Vector(off)
    for ch in t.children_recursive:
        pass
    old = sc.camera
    dirv = (old.matrix_world.translation - ctr).normalized()
    cc = bpy.data.objects.new('cc', bpy.data.cameras.new('cc')); sc.collection.objects.link(cc)
    cc.data.lens = lens; cc.data.dof.use_dof = False
    cc.location = ctr + dirv * dist
    cc.rotation_euler = (ctr - cc.location).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cc
    sc.render.resolution_x = w; sc.render.resolution_y = h; sc.cycles.samples = samples
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)
    sc.camera = old; bpy.data.objects.remove(cc)


def shoot_alpha(path, res=2048, samples=320):
    sc = bpy.context.scene
    hid = [o for o in bpy.data.objects if o.name.startswith('bgsphere')]
    for o in hid: o.hide_render = True
    sc.render.film_transparent = True; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.file_format = 'PNG'
    sc.render.resolution_x = res; sc.render.resolution_y = res; sc.cycles.samples = samples
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)
    sc.render.film_transparent = False
    for o in hid: o.hide_render = False
