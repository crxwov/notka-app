"""Нотка: финальная 3D-иконка знака (одним цветом, без хрома). Запуск:
blender.exe --background --python tests/blender/icon_logo_final.py   env VIEW=hero|low|top, SAMPLES, SIZE, BG=0/1
Из живого Блендера: os.environ[...]=...; exec(open(путь).read())"""
import os, sys, math
os.environ["ICON_BUILD"] = "0"
HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Users\leksik\Documents\Notka\tests\blender"
exec(compile(open(os.path.join(HERE, "icon_logo.py"), encoding="utf-8").read(), "icon_logo.py", "exec"))
import mathutils

VIEW = os.environ.get("VIEW", "hero"); SIZE = int(os.environ.get("SIZE", 2400)); BG = os.environ.get("BG", "0") == "1"
SAMPLES = int(os.environ.get("SAMPLES", 160))
sc = bpy.context.scene

# ---------- материал: глубокий градиент палитры, мягкий сатин, блёстки, тёплая кромка ----------
m = soft_touch("note_final",
               [(0.0, hexc("#3E1052")), (0.22, hexc("#A0246C")), (0.52, hexc("#E64A52")), (0.82, hexc("#FF8A4A")), (1.0, hexc("#FFC47E"))],
               lo=-1.7, hi=2.1, rough=0.5, sheen=0.15, glitter=0.03, glitter_col="#FFD0B8", grain=1.7, sss=0.06)
nt = m.node_tree; n = nt.nodes; l = nt.links; b = bsdf(n.values())
setv(b, "Coat Weight", 0.28); setv(b, "Coat Roughness", 0.3); setv(b, "Specular IOR Level", 0.6)
# светящаяся кромка: на скользящих углах предмет чуть подсвечивается тёплым (как у стеклянной ноты в приложении)
lw = n.new("ShaderNodeLayerWeight"); lw.inputs["Blend"].default_value = 0.3
ew = n.new("ShaderNodeMath"); ew.operation = "MULTIPLY"; ew.inputs[1].default_value = 0.14
l.new(lw.outputs["Fresnel"], ew.inputs[0]); l.new(ew.outputs[0], b.inputs["Emission Strength"])
setv(b, "Emission Color", hexc("#FF9A78"))

body = logo("A", (0, 0, 0), (math.radians(10), math.radians(-22), math.radians(-9)))
for o in bpy.data.objects:
    if o.type == "MESH" and o.name.startswith("logo_body"):
        o.data.materials.clear(); o.data.materials.append(m)

# ---------- сцена ----------
for o in list(bpy.data.objects):
    if o.type in ("LIGHT", "CAMERA"): bpy.data.objects.remove(o, do_unlink=True)

w = bpy.data.worlds.new("w2"); sc.world = w; w.use_nodes = True; wn = w.node_tree.nodes; wl = w.node_tree.links
wn.clear(); out = wn.new("ShaderNodeOutputWorld"); bg = wn.new("ShaderNodeBackground")
tc = wn.new("ShaderNodeTexCoord"); sp = wn.new("ShaderNodeSeparateXYZ"); wl.new(tc.outputs["Generated"], sp.inputs[0])
r = ramp(wn, [(0.0, hexc("#7A4A5E")), (0.5, hexc("#3A2147")), (1.0, hexc("#1E1030"))])
wl.new(sp.outputs["Z"], r.inputs["Fac"]); wl.new(r.outputs["Color"], bg.inputs["Color"]); bg.inputs["Strength"].default_value = 0.55
wl.new(bg.outputs[0], out.inputs[0])

tgt = (0, 0, 0.25)
area("key", (-10, -4, 6), tgt, hexc("#FFE6D0"), 1700, 4, 6)          # большой мягкий ключ сверху-слева
area("rim_warm", (8, 5, 2.5), tgt, hexc("#FF8A3C"), 8000, 1.6, 9)      # контровые полосы по краям
area("rim_pink", (-8, 5, 1.5), tgt, hexc("#FF4F9A"), 8000, 1.6, 9)
area("fill", (6, -8, -2), tgt, hexc("#B9A3FF"), 140, 6, 4)             # холодный лиловый подсвет теней
area("bounce", (5, -6, -4), tgt, hexc("#D0307A"), 500, 5, 4)
area("top", (0, -2, 9), tgt, hexc("#FFFFFF"), 200, 6, 2)

views = {"hero": ((2.0, -9.6, 1.4), 55, 0, 8.0), "low": ((1.6, -7.8, -3.4), 24, -9, 8.0), "top": ((2.0, -9.5, 6.2), 40, 5, 8.0)}
loc, lens, roll, fstop = views[VIEW]
cd = bpy.data.cameras.new("cam"); cd.lens = lens; cd.sensor_width = 36
cam = new_obj("cam", cd, loc); sc.camera = cam
d = Vector(tgt) - Vector(loc)
cam.rotation_euler = (d.to_track_quat("-Z", "Y") @ mathutils.Quaternion((0, 0, 1), math.radians(roll))).to_euler()
cd.dof.use_dof = True; cd.dof.aperture_fstop = fstop; cd.dof.focus_distance = d.length

# мягкая тень под предметом (в прозрачном PNG остаётся только тень)
import bmesh
fm = bpy.data.meshes.new("shadowfloor"); bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=2, y_segments=2, size=60); bm.to_mesh(fm); bm.free()
fo = new_obj("shadowfloor", fm, (0, 0, -3.1 if VIEW != "low" else -6.5)); fo.is_shadow_catcher = True

sc.render.engine = "CYCLES"; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True; sc.cycles.max_bounces = 12
sc.render.resolution_x = sc.render.resolution_y = SIZE
sc.render.film_transparent = not BG
vt = [i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties["view_transform"].enum_items]
for tr in ("AgX", "Filmic"):
    try: sc.view_settings.view_transform = tr; break
    except TypeError: pass
for cand in ("AgX - High Contrast", "High Contrast", "Medium High Contrast"):
    try: sc.view_settings.look = cand; break
    except TypeError: pass
sc.view_settings.exposure = -0.45
sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"
sc.render.filepath = os.path.join(OUT, "logo_final_%s.png" % VIEW)
if "bpy" in globals() and bpy.app.background:
    bpy.ops.render.render(write_still=True)
