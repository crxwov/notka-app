"""Нотка, Хэллоуин: реквизит к сцене призрака. exec из scene_ghost.py после сборки"""
import bpy, bmesh, math, random
from mathutils import Vector
from ghost_lib import *


def vinyl_mat():
    m, n, l = mat("vinyl"); b = bsdf(n.values())
    setv(b, "Metallic", 0.75); setv(b, "Roughness", 0.28); setv(b, "Anisotropic", 0.85)
    setv(b, "Coat Weight", 0.6); setv(b, "Coat Roughness", 0.05)
    tc = n.new("ShaderNodeTexCoord"); sep = n.new("ShaderNodeSeparateXYZ"); l.new(tc.outputs["Object"], sep.inputs[0])
    x2 = n.new("ShaderNodeMath"); x2.operation = "MULTIPLY"; l.new(sep.outputs["X"], x2.inputs[0]); l.new(sep.outputs["X"], x2.inputs[1])
    y2 = n.new("ShaderNodeMath"); y2.operation = "MULTIPLY"; l.new(sep.outputs["Y"], y2.inputs[0]); l.new(sep.outputs["Y"], y2.inputs[1])
    s = n.new("ShaderNodeMath"); s.operation = "ADD"; l.new(x2.outputs[0], s.inputs[0]); l.new(y2.outputs[0], s.inputs[1])
    r = n.new("ShaderNodeMath"); r.operation = "SQRT"; l.new(s.outputs[0], r.inputs[0])
    mul = n.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = 90.0; l.new(r.outputs[0], mul.inputs[0])
    fr = n.new("ShaderNodeMath"); fr.operation = "FRACT"; l.new(mul.outputs[0], fr.inputs[0])
    bm = n.new("ShaderNodeBump"); bm.inputs["Strength"].default_value = 0.15; bm.inputs["Distance"].default_value = 0.003
    l.new(fr.outputs[0], bm.inputs["Height"]); l.new(bm.outputs["Normal"], b.inputs["Normal"])
    base = ramp(n, [(0.0, hexc("#1A0B24")), (0.5, hexc("#2B1040")), (1.0, hexc("#140A1E"))])
    mp = n.new("ShaderNodeMapRange"); mp.inputs["From Min"].default_value = 0; mp.inputs["From Max"].default_value = 2.0
    l.new(r.outputs[0], mp.inputs["Value"]); l.new(mp.outputs["Result"], base.inputs["Fac"])
    l.new(base.outputs["Color"], b.inputs["Base Color"])
    setv(b, "Thin Film Thickness", 520.0); setv(b, "Thin Film IOR", 1.8)
    return m


def vinyl(loc, scale=1.0, rot=(math.pi / 2, 0, 0)):
    d = cyl("vinyl", 1.9 * scale, 0.07 * scale, loc, rot, bevel=0.02, seg=128, mat_=vinyl_mat())
    lab_m = grad_mat("vlabel", [(0.0, hexc(ORANGE_)), (0.5, hexc(PINK_)), (1.0, hexc(PURPLE_))], axis="X", lo=-0.7, hi=0.7,
                     rough=0.3, coat=1.0)
    lab = cyl("vlabel", 0.66 * scale, 0.085 * scale, loc, rot, bevel=0.01, seg=96, mat_=lab_m)
    hole = cyl("vhole", 0.07 * scale, 0.1 * scale, loc, rot, bevel=0, seg=24, mat_=plain("hole", "#10081A", rough=0.4))
    return d, lab


ORANGE_, PINK_, PURPLE_ = "#FF8A1F", "#F0307F", "#7A33F0"


def pumpkin(loc, scale=1.0, rot=(0, 0, 0)):
    prof = [(0, 0.66), (0.22, 0.74), (0.55, 0.8), (0.86, 0.66), (1.02, 0.25), (1.02, -0.2), (0.86, -0.62), (0.5, -0.8), (0.2, -0.76), (0, -0.66)]

    def fn(r, z, th):
        k = 1 + 0.11 * math.cos(9 * th) * min(1, r * 1.4)
        return r * k, z * 0.96
    m = grad_mat("pumpkin", [(0.0, hexc("#E83E00")), (0.5, hexc("#FF6A0A")), (1.0, hexc("#FF9A22"))],
                 lo=-0.8, hi=0.8, rough=0.3, coat=0.7, sss=0.15)
    o = lathe("pumpkin", prof, seg=90, fn=fn, subsurf=2); o.data.materials.append(m)
    sol = o.modifiers.new("hollow", "SOLIDIFY"); sol.thickness = -0.07; sol.offset = -1
    inner = plain("pumpkin_in", "#FF9A2E", rough=0.5, coat=0.0)
    o.data.materials.append(inner); sol.material_offset = 1
    # вырезы: глаза-треугольники, рот
    cutters = []
    for sx in (-1, 1):
        cutters.append(poly_solid("cut_eye", [(sx * 0.2, 0.0), (sx * 0.62, 0.0), (sx * 0.42, 0.38)] if sx > 0 else
                                  [(-0.62, 0.0), (-0.2, 0.0), (-0.42, 0.38)], depth=3.0, loc=(0, 0, 0.15), bevel=0.02, subsurf=0))
    mp = [(-0.62, -0.22), (-0.4, -0.38), (-0.2, -0.28), (0, -0.4), (0.2, -0.28), (0.4, -0.38), (0.62, -0.22), (0.4, -0.12),
          (0.2, -0.2), (0, -0.1), (-0.2, -0.2), (-0.4, -0.12)]
    cutters.append(poly_solid("cut_mouth", mp, depth=3.0, loc=(0, 0, -0.08), bevel=0.02, subsurf=0))
    for c in cutters:
        c.parent = o; c.hide_render = True; c.hide_viewport = True; c.display_type = "WIRE"
        bo = o.modifiers.new("cut", "BOOLEAN"); bo.object = c; bo.operation = "DIFFERENCE"; bo.solver = "MANIFOLD"
    # свет изнутри
    ld = bpy.data.lights.new("pk_light", "POINT"); ld.energy = 500; ld.color = hexc("#FF9A2E")[:3]; ld.shadow_soft_size = 0.2
    lo = new_obj("pk_light", ld, (0, 0, -0.05)); lo.parent = o
    # хвостик
    stem = lathe("stem", [(0.0, 0.0), (0.16, 0.0), (0.2, 0.22), (0.15, 0.45), (0.0, 0.5)], seg=24, subsurf=1,
                 fn=lambda r, z, th: (r + 0.02 * z * math.cos(th), z))
    stem.data.materials.append(plain("stem", "#8FE03A", rough=0.3, coat=0.8))
    stem.location = (0, 0, 0.7); stem.rotation_euler = (math.radians(12), 0, math.radians(20)); stem.parent = o
    o.location = loc; o.scale = (scale,) * 3; o.rotation_euler = rot
    return o


def note(loc, scale=1.0, kind="chrome", rot=(0, 0, 0)):
    mats = {
        "chrome": plain("n_chrome", "#E8D8FF", rough=0.06, coat=1.0, metal=1.0),
        "orange": glass("n_orange", "#FF9A3A", rough=0.05, film=300),
        "lime": glass("n_lime", "#C8FF4A", rough=0.05, film=300),
        "pink": glass("n_pink", "#FF4DA0", rough=0.05, film=300),
    }
    if kind == "chrome":
        b = bsdf(mats["chrome"].node_tree.nodes.values()); setv(b, "Thin Film Thickness", 480.0); setv(b, "Thin Film IOR", 1.8)
    m = mats[kind]
    root = new_obj("note", None, loc)
    head = sphere("nh", 0.5, (1.25, 0.55, 0.9), (0, 0, 0), mat_=m); head.rotation_euler = (0, math.radians(-22), 0)
    stem = cyl("ns", 0.085, 1.5, (0.52, 0, 0.78), (0, 0, 0), bevel=0.03, seg=24, mat_=m)
    flag = poly_solid("nf", [(0.52, 1.52), (0.52, 1.05), (0.86, 0.78), (1.02, 0.4), (1.0, 0.1), (1.14, 0.45), (1.0, 0.85), (0.8, 1.2), (0.6, 1.55)],
                      depth=0.17, bevel=0.03, subsurf=1, mat_=m)
    for p in (head, stem, flag): p.parent = root
    root.scale = (scale,) * 3; root.rotation_euler = rot
    return root


def bat(loc, scale=1.0, rot=(0, 0, 0)):
    m = grad_mat("bat", [(0.0, hexc("#5B2AC8")), (1.0, hexc("#9A5CFF"))], lo=-0.6, hi=0.6, rough=0.3, coat=0.9)
    inner = plain("bat_in", "#FF4DA0", rough=0.35, coat=0.8)
    root = new_obj("bat", None, loc)
    body = sphere("bb", 0.5, (1.0, 0.85, 1.05), (0, 0, 0), mat_=m)
    for sx in (-1, 1):
        sphere("ear", 0.16, (0.8, 0.7, 1.6), (sx * 0.28, 0, 0.5), mat_=m).parent = root
    wing = [(0.0, 0.2), (0.7, 0.6), (1.5, 0.45), (2.0, 0.0), (1.55, -0.2), (1.35, -0.5), (0.95, -0.18), (0.6, -0.55), (0.35, -0.1)]
    for sx in (-1, 1):
        pts = [(sx * x, z) for x, z in wing]
        if sx < 0: pts = pts[::-1]
        w = poly_solid("wing", pts, depth=0.09, bevel=0.025, subsurf=1, mat_=m); w.data.materials.append(inner)
        w.parent = root; w.rotation_euler = (0, math.radians(sx * -10), math.radians(0))
    eyes = glow("be", "#FFFFFF", 6.0)
    for sx in (-1, 1):
        sphere("be", 0.07, (1, 0.5, 1.2), (sx * 0.17, -0.38, 0.12), mat_=eyes).parent = root
        sphere("bp", 0.04, (1, 0.5, 1.2), (sx * 0.17, -0.42, 0.12), mat_=plain("pup", "#12081F", rough=0.1)).parent = root
    body.parent = root; root.scale = (scale,) * 3; root.rotation_euler = rot
    return root


def sparkle(loc, size=0.3, color="#FFF3B0", rot=(0, 0, 0)):
    s = star4("spark", size, 0.2, 0.08, loc=loc, bevel=0.01, subsurf=1, mat_=glow("sp", color, 10.0))
    s.rotation_euler = rot; return s


def bubble(loc, r=0.5):
    b = sphere("bubble", r, (1, 1, 1), loc, mat_=glass("bubble", "#FFFFFF", rough=0.0, film=520, ior=1.12), seg=64, rings=32)
    return b


def orb(loc, r, color, glossy=True):
    return sphere("orb", r, (1, 1, 1), loc, mat_=plain("orb", color, rough=0.2, coat=1.0), seg=48, rings=24)
