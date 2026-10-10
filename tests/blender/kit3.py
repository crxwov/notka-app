"""Нотка, иконки v3: те же формы (kit2), другой цвет, свет и материал: чистый конфетный глянец, светлая палитра бренда, яркий мягкий свет.
Запуск: blender.exe --background --python tests/blender/kit3.py   env ICONS=heart,..., SIZE, SAMPLES, OUTDIR, TAG"""
import os, sys, math
os.environ["KIT2_RUN"] = "0"; os.environ["KIT_RUN"] = "0"
HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Users\leksik\Documents\Notka\tests\blender"
exec(compile(open(os.path.join(HERE, "kit2.py"), encoding="utf-8").read(), "kit2.py", "exec"))

# ---------- светлая палитра бренда (из градиента: сиренево-розовый -> персик -> ярко-розовый) ----------
FAM3 = {
    "warm":   [(0.0, "#FF5FA8"), (0.5, "#FF9A9E"), (1.0, "#FFC9A0")],      # розово-персиковое свечение
    "rose":   [(0.0, "#FF1F7D"), (0.5, "#FF5FA8"), (1.0, "#FFA6CF")],      # ярко-розовый
    "plum":   [(0.0, "#9B6BFF"), (0.5, "#BE94FF"), (1.0, "#E2CCFF")],      # сиреневый
    "cream":  [(0.0, "#FFB9A8"), (0.5, "#FFD9C8"), (1.0, "#FFF2EA")],      # сливочно-персиковый
    "orange": [(0.0, "#FF7A45"), (0.5, "#FF9C5C"), (1.0, "#FFC57E")],      # светлый оранж (тыква)
    "green":  [(0.0, "#5FC97F"), (1.0, "#C6F2A6")],                        # мятный (черенок)
}
DEEP3 = {"warm": "#F0488F", "rose": "#D3166E", "plum": "#7E4BEB", "cream": "#F09B88", "orange": "#F2602F", "green": "#4DB06C"}   # цвет затемнения в углублениях: насыщенный, не чёрный


def clean(name, fam, axis="Z", flip=False, rough=0.2, jelly=0.55, coat=1.0, ao_dist=0.4, iri=True):
    m, n, l = mat(name); b = bsdf(n.values())
    stops = [(p, hexc(c)) for p, c in FAM3[fam]]
    if flip: stops = [(1 - p, c) for p, c in reversed(stops)]
    tc = n.new("ShaderNodeTexCoord"); sep = n.new("ShaderNodeSeparateXYZ"); l.new(tc.outputs["Generated"], sep.inputs[0])
    rp = ramp(n, stops); l.new(sep.outputs[axis], rp.inputs["Fac"])
    # цветное затемнение в складках (насыщенный розовый/сиреневый вместо чёрного) = глубина без грязи
    ao = n.new("ShaderNodeAmbientOcclusion"); ao.inputs["Distance"].default_value = ao_dist; ao.samples = 8; ao.inputs["Color"].default_value = (1, 1, 1, 1)
    mx = n.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.inputs["A"].default_value = hexc(DEEP3[fam])
    l.new(ao.outputs["AO"], mx.inputs["Factor"]); l.new(rp.outputs["Color"], mx.inputs["B"])
    l.new(mx.outputs["Result"], b.inputs["Base Color"])
    # шероховатость плывёт плавно (низкая частота): блики разной силы, как у дорогого литья; микро-сатин только под лаком
    rn = n.new("ShaderNodeTexNoise"); rn.inputs["Scale"].default_value = 2.2; rn.inputs["Detail"].default_value = 2; l.new(tc.outputs["Generated"], rn.inputs["Vector"])
    rm = n.new("ShaderNodeMapRange"); rm.inputs["To Min"].default_value = rough - 0.06; rm.inputs["To Max"].default_value = rough + 0.08; l.new(rn.outputs["Fac"], rm.inputs["Value"]); l.new(rm.outputs["Result"], b.inputs["Roughness"])
    fn = n.new("ShaderNodeTexNoise"); fn.inputs["Scale"].default_value = 260.0; fn.inputs["Detail"].default_value = 1; l.new(tc.outputs["Object"], fn.inputs["Vector"])
    bm = n.new("ShaderNodeBump"); bm.inputs["Strength"].default_value = 0.018; bm.inputs["Distance"].default_value = 0.004; l.new(fn.outputs["Fac"], bm.inputs["Height"]); l.new(bm.outputs["Normal"], b.inputs["Normal"])
    setv(b, "Specular IOR Level", 0.7); setv(b, "IOR", 1.45)
    setv(b, "Coat Weight", coat); setv(b, "Coat Roughness", 0.03); setv(b, "Coat IOR", 1.5)
    setv(b, "Subsurface Weight", jelly); setv(b, "Subsurface Scale", 0.2); setv(b, "Subsurface Radius", (1.0, 0.3, 0.45))
    setv(b, "Sheen Weight", 0.5); setv(b, "Sheen Roughness", 0.35); setv(b, "Sheen Tint", hexc("#FFD0E8"))
    if iri: setv(b, "Thin Film Thickness", 330.0); setv(b, "Thin Film IOR", 1.35)
    # светлая кромка (rim): предмет «светится» по контуру
    lw = n.new("ShaderNodeLayerWeight"); lw.inputs["Blend"].default_value = 0.3
    em = n.new("ShaderNodeMath"); em.operation = "MULTIPLY"; em.inputs[1].default_value = 0.35; l.new(lw.outputs["Fresnel"], em.inputs[0]); l.new(em.outputs[0], b.inputs["Emission Strength"])
    setv(b, "Emission Color", hexc("#FFD9EC"))
    return m


def pro(name, fam, rough=0.46, glitter=0.0, grain=1.5, sheen=0.2, axis="Z", flip=False, **kw):
    # те же вызовы, что в иконках v2, но материал всегда чистый: без зерна, блёсток, царапин, шума и тёмных пятен
    if fam == "plum" and kw.get("smudge") is False:       # «тёмные» детали (канавки, экран, сетка): плотный сиреневый, но не тёмный
        return clean(name, "plum", axis, flip, rough=0.3, jelly=0.15, iri=False)
    return clean(name, fam, axis, flip)


def satin_chrome(name, tint="#FBE9D6", rough=0.2, film=520.0):
    # блестящая светлая «жемчужина» вместо хрома: чисто, без тёмных отражений
    m, n, l = mat(name); b = bsdf(n.values())
    setv(b, "Base Color", hexc("#FFE3F0")); setv(b, "Metallic", 0.35); setv(b, "Roughness", 0.12)
    setv(b, "Coat Weight", 1.0); setv(b, "Coat Roughness", 0.02)
    setv(b, "Thin Film Thickness", 320.0); setv(b, "Thin Film IOR", 1.4)
    setv(b, "Emission Color", hexc("#FFE0EE")); setv(b, "Emission Strength", 0.15)
    return m


def band_rough(m, radial_stops):
    nt = m.node_tree; b = bsdf(nt.nodes.values()); setv(b, "Roughness", 0.14)


def fix_grille():
    """сетка микрофона: чистый перламутр с ровным мягким рельефом сот, без тёмных крапинок"""
    m = bpy.data.materials.get("m_grille")
    if not m: return
    nt = m.node_tree; nt.nodes.clear(); n = nt.nodes; l = nt.links
    out = n.new("ShaderNodeOutputMaterial"); b = n.new("ShaderNodeBsdfPrincipled"); l.new(b.outputs["BSDF"], out.inputs["Surface"])
    tc = n.new("ShaderNodeTexCoord"); sep = n.new("ShaderNodeSeparateXYZ"); l.new(tc.outputs["Generated"], sep.inputs[0])
    rp = ramp(n, [(0.0, hexc("#C79BFF")), (0.55, hexc("#E4C8FF")), (1.0, hexc("#FFE1F0"))]); l.new(sep.outputs["Z"], rp.inputs["Fac"]); l.new(rp.outputs["Color"], b.inputs["Base Color"])
    vr = n.new("ShaderNodeTexVoronoi"); vr.feature = "DISTANCE_TO_EDGE"; vr.inputs["Scale"].default_value = 12.0; l.new(tc.outputs["Object"], vr.inputs["Vector"])
    mr = n.new("ShaderNodeMapRange"); mr.inputs["From Min"].default_value = 0.0; mr.inputs["From Max"].default_value = 0.12; l.new(vr.outputs["Distance"], mr.inputs["Value"])
    bm = n.new("ShaderNodeBump"); bm.inputs["Strength"].default_value = 0.13; bm.inputs["Distance"].default_value = 0.02; l.new(mr.outputs["Result"], bm.inputs["Height"]); l.new(bm.outputs["Normal"], b.inputs["Normal"])
    setv(b, "Roughness", 0.16); setv(b, "Metallic", 0.0); setv(b, "Specular IOR Level", 0.7)
    setv(b, "Coat Weight", 1.0); setv(b, "Coat Roughness", 0.03); setv(b, "Subsurface Weight", 0.4); setv(b, "Subsurface Scale", 0.15)
    setv(b, "Emission Color", hexc("#FFD9EC")); setv(b, "Emission Strength", 0.08)


def sanitize():
    fix_grille()
    for m in bpy.data.materials:
        if not m.use_nodes: continue
        b = next((x for x in m.node_tree.nodes if x.type == "BSDF_PRINCIPLED"), None)
        if b is None: continue
        if "chrome" not in m.name and "holo" not in m.name:
            setv(b, "Metallic", 0.0)
        setv(b, "Anisotropic", 0.0)
        if m.name != "m_grille":
            for lk in list(b.inputs["Normal"].links): m.node_tree.links.remove(lk)


def stage3(root, exposure=0.0, samples=None):
    lo, hi = bbox_of(root); c = (lo + hi) / 2; R = max((hi - lo)) / 2
    root.location = -c
    for o in list(bpy.data.objects):
        if (o.type in ("LIGHT", "CAMERA") and not o.name.startswith("pk_")) or o.name == "shadowfloor": bpy.data.objects.remove(o, do_unlink=True)
    w = bpy.data.worlds.new("w3"); sc.world = w; w.use_nodes = True; wn = w.node_tree.nodes; wl = w.node_tree.links
    wn.clear(); out_ = wn.new("ShaderNodeOutputWorld"); bg = wn.new("ShaderNodeBackground")
    tcn = wn.new("ShaderNodeTexCoord"); sp = wn.new("ShaderNodeSeparateXYZ"); wl.new(tcn.outputs["Generated"], sp.inputs[0])
    rr = ramp(wn, [(0.0, hexc("#FFD9E8")), (0.5, hexc("#FFE6F0")), (1.0, hexc("#EBDDFF"))])
    wl.new(sp.outputs["Z"], rr.inputs["Fac"]); wl.new(rr.outputs["Color"], bg.inputs["Color"]); bg.inputs["Strength"].default_value = 0.4; wl.new(bg.outputs[0], out_.inputs[0])
    k = R / 2.4; tgt = (0, 0, 0)
    def A(n_, loc, col, p, sx_, sy_): area(n_, tuple(v * k for v in loc), tgt, hexc(col), p * k * k, sx_ * k, sy_ * k)
    A("key", (-8, -7, 7), "#FFF1E8", 760, 6, 6)            # большой мягкий основной
    A("fill", (8, -6, 2), "#FF9CCB", 110, 8, 6)             # розовый заполняющий: тени светлые и тёплые
    A("rim_peach", (7, 6, 4), "#FFB08A", 900, 2.4, 9)        # персиковый контровой
    A("rim_lilac", (-8, 6, 3), "#C4A2FF", 760, 2.4, 9)       # сиреневый контровой
    A("top", (0, -2, 9), "#FFFFFF", 320, 9, 2.2)               # мягкая верхняя полоса (чистые блики)
    A("bounce", (0, -5, -6), "#FF5FA8", 170, 8, 5)           # розовый отскок снизу
    lens = 55; fov = 2 * math.atan(18 / lens); dist = R / math.tan(fov / 2) * 1.35
    d = Vector((0.22, -1.0, 0.18)).normalized(); loc = d * dist
    cd = bpy.data.cameras.new("cam"); cd.lens = lens; cd.sensor_width = 36; cam = new_obj("cam", cd, loc); sc.camera = cam
    cam.rotation_euler = (Vector(tgt) - loc).to_track_quat("-Z", "Y").to_euler()
    cd.dof.use_dof = False
    sc.render.engine = "CYCLES"; sc.cycles.samples = samples or SAMPLES; sc.cycles.use_denoising = True; sc.cycles.max_bounces = 14
    sc.cycles.caustics_reflective = False; sc.cycles.caustics_refractive = False
    use_gpu()
    sc.render.resolution_x = sc.render.resolution_y = SIZE; sc.render.film_transparent = True
    for tr in ("Standard", "AgX", "Filmic"):
        try: sc.view_settings.view_transform = tr; break
        except TypeError: pass
    try: sc.view_settings.look = "None"
    except TypeError: pass
    sc.view_settings.exposure = exposure
    sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"
    sc.compositing_node_group = None


def render3(name, tag="v3"):
    clear_all()
    for w_ in list(bpy.data.worlds): bpy.data.worlds.remove(w_)
    global PARTICLES
    PARTICLES = False
    root = ICONS[name]()
    sanitize(); stage3(root)
    sc.render.filepath = os.path.join(KITDIR, "%s_%s.png" % (tag, name))
    bpy.ops.render.render(write_still=True); print("rendered", sc.render.filepath)


if os.environ.get("KIT3_RUN", "1") == "1" and bpy.app.background:
    for nm in os.environ.get("ICONS", "heart,headphones,gift").split(","):
        try: render3(nm.strip(), os.environ.get("TAG", "v3"))
        except Exception as e:
            import traceback; traceback.print_exc(); print("FAILED", nm, e)
