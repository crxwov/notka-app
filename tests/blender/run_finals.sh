#!/bin/bash
# финальные рендеры набора: сначала чистые объекты 2048px (для Фигмы), потом сцены с частицами 1400px
cd "C:/Users/leksik/Documents/Notka"
B="C:/Users/leksik/blender-portable/blender-5.2.2-windows-x64/blender.exe"
HEROES=logo,headphones,vinyl,heart,gift,pumpkin,card,phone,tag,bat,cassette,envelope,mic,chat
SMALLS=sm_sparkle,sm_star,sm_pearls,sm_confetti,sm_candy,sm_spider,sm_bone,sm_pumpkin,sm_note,sm_heart
OUTDIR="C:/Users/leksik/Documents/Notka/tests/blender/out/kit/final" PARTICLES=0 ICONS=$SMALLS SIZE=1400 SAMPLES=96 BG=0 TAG=clean "$B" --background --python tests/blender/kit2.py > tests/blender/out/kit/final/log_smalls.txt 2>&1
OUTDIR="C:/Users/leksik/Documents/Notka/tests/blender/out/kit/final" PARTICLES=0 ICONS=$HEROES SIZE=2048 SAMPLES=128 BG=0 TAG=clean "$B" --background --python tests/blender/kit2.py > tests/blender/out/kit/final/log_clean.txt 2>&1
OUTDIR="C:/Users/leksik/Documents/Notka/tests/blender/out/kit/final" PARTICLES=1 ICONS=$HEROES SIZE=1400 SAMPLES=64 BG=0 TAG=scene "$B" --background --python tests/blender/kit2.py > tests/blender/out/kit/final/log_scene.txt 2>&1
echo ALL_DONE > tests/blender/out/kit/final/done.txt
