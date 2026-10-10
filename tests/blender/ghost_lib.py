"""Нотка, Хэллоуин: общие помощники (материалы, меши). Подключается из scene_ghost.py"""
import bpy, bmesh, math, random
import numpy as np
from mathutils import Vector


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


def bsdf(n):
    return next(x for x in n if x.type == "BSDF_PRINCIPLED")


def grad_mat(name, stops, axis="Z", lo=-1.0, hi=1.0, rough=0.35, coat=0.6, sss=0.0, sss_col=None, extra=None):
    """Принципиал с цветом-градиентом по оси объекта."""
    m, n, l = mat(name); b = bsdf(n.values())
    setv(b, "Roughness", rough); setv(b, "Coat Weight", coat); setv(b, "Coat Roughness", 0.06)
    tc = n.new("ShaderNodeTexCoord"); sep = n.new("ShaderNodeSeparateXYZ"); l.new(tc.outputs["Object"], sep.inputs[0])
    mp = n.new("ShaderNodeMapRange"); mp.inputs["From Min"].default_value = lo; mp.inputs["From Max"].default_value = hi
    l.new(sep.outputs[axis], mp.inputs["Value"])
    r = ramp(n, stops); l.new(mp.outputs["Result"], r.inputs["Fac"])
    l.new(r.outputs["Color"], b.inputs["Base Color"])
    if sss:
        setv(b, "Subsurface Weight", sss); setv(b, "Subsurface Scale", 0.15)
        setv(b, "Subsurface Radius", (1.0, 0.4, 0.3))
    if extra: extra(b, n, l)
    return m


def glass(name, tint="#FFFFFF", rough=0.03, film=400.0, ior=1.45):
    m, n, l = mat(name); b = bsdf(n.values())
    setv(b, "Base Color", hexc(tint)); setv(b, "Roughness", rough); setv(b, "IOR", ior)
    setv(b, "Transmission Weight", 1.0)
    if film: setv(b, "Thin Film Thickness", film); setv(b, "Thin Film IOR", 1.6)
    return m


def glow(name, color, strength=6.0):
    m, n, l = mat(name); b = bsdf(n.values())
    setv(b, "Base Color", (0, 0, 0, 1)); setv(b, "Emission Color", hexc(color)); setv(b, "Emission Strength", strength)
    return m


def plain(name, color, rough=0.3, coat=0.5, metal=0.0):
    m, n, l = mat(name); b = bsdf(n.values())
    setv(b, "Base Color", hexc(color)); setv(b, "Roughness", rough); setv(b, "Coat Weight", coat)
    setv(b, "Metallic", metal); return m


def link(o, m=None, smooth=True):
    if smooth and o.type == "MESH":
        for p in o.data.polygons: p.use_smooth = True
    if m is not None: o.data.materials.append(m)
    return o


def new_obj(name, me, loc=(0, 0, 0), coll=None):
    o = bpy.data.objects.new(name, me); o.location = loc
    (coll or bpy.context.scene.collection).objects.link(o); return o


def chaikin(pts, it=2):
    pts = [np.array(p, float) for p in pts]
    for _ in range(it):
        out = [pts[0]]
        for a, b in zip(pts[:-1], pts[1:]):
            out += [a * 0.75 + b * 0.25, a * 0.25 + b * 0.75]
        out.append(pts[-1]); pts = out
    return pts


def lathe(name, profile, seg=72, fn=None, smooth_it=2, subsurf=2, coll=None):
    """Тело вращения из профиля (r, z). fn(r, z, th) -> (r, z) для искажений."""
    prof = chaikin(profile, smooth_it) if smooth_it else [np.array(p, float) for p in profile]
    verts = []
    for r, z in prof:
        for i in range(seg):
            th = 2 * math.pi * i / seg
            rr, zz = (fn(r, z, th) if fn else (r, z))
            verts.append((rr * math.cos(th), rr * math.sin(th), zz))
    faces = []
    for j in range(len(prof) - 1):
        for i in range(seg):
            a = j * seg + i; b = j * seg + (i + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    o = new_obj(name, me, coll=coll)
    if subsurf:
        s = o.modifiers.new("sub", "SUBSURF"); s.levels = subsurf; s.render_levels = subsurf
    return link(o)


def sphere(name, r=1.0, scale=(1, 1, 1), loc=(0, 0, 0), seg=48, rings=24, mat_=None, coll=None):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = new_obj(name, me, loc, coll); o.scale = scale; link(o, mat_); return o


def cyl(name, r=1.0, d=1.0, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.05, seg=64, mat_=None, coll=None):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=d)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = new_obj(name, me, loc, coll); o.rotation_euler = rot
    if bevel:
        b = o.modifiers.new("b", "BEVEL"); b.width = bevel; b.segments = 5; b.limit_method = "ANGLE"
    link(o, mat_); return o


def poly_solid(name, pts, depth=0.1, loc=(0, 0, 0), bevel=0.03, subsurf=1, mat_=None, coll=None):
    """Плоский контур (x, z) → выдавленная фигура, смотрит на камеру по -Y."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, 0, z)) for x, z in pts]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    vv = [e for e in r["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, depth, 0), verts=vv)
    bmesh.ops.translate(bm, vec=(0, -depth / 2, 0), verts=list(bm.verts))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = new_obj(name, me, loc, coll)
    if bevel:
        b = o.modifiers.new("b", "BEVEL"); b.width = bevel; b.segments = 4; b.limit_method = "ANGLE"
    if subsurf:
        s = o.modifiers.new("s", "SUBSURF"); s.levels = subsurf; s.render_levels = subsurf
    return link(o, mat_)


def star4(name, size=1.0, pinch=0.18, depth=0.18, **kw):
    pts = []
    for i in range(8):
        a = math.pi / 2 + i * math.pi / 4
        rr = size if i % 2 == 0 else size * pinch
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    return poly_solid(name, pts, depth=depth, **kw)


def place_on(obj_name_or_obj, x, z, depth_ray=8.0, offset=0.0):
    """Точка на поверхности спереди (луч вдоль +Y). Возвращает (x, y, z)."""
    sc = bpy.context.scene; dg = bpy.context.evaluated_depsgraph_get()
    ob = obj_name_or_obj if not isinstance(obj_name_or_obj, str) else bpy.data.objects[obj_name_or_obj]
    ok, loc, nor, idx, o, mt = sc.ray_cast(dg, Vector((x, -depth_ray, z)), Vector((0, 1, 0)))
    if not ok: return (x, 0, z)
    return tuple(loc + nor * offset), tuple(nor)


def clear_all():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for d in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.lights, bpy.data.cameras):
        for x in list(d):
            if x.users == 0: d.remove(x)
