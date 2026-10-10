#!/bin/bash
cd "C:/Users/leksik/Documents/Notka"
B="C:/Users/leksik/blender-portable/blender-5.2.2-windows-x64/blender.exe"
OUTDIR="C:/Users/leksik/Documents/Notka/иконки_v3/raw" ICONS=headphones,vinyl,cassette,mic,heart,chat,card,phone,tag,gift,envelope,pumpkin,bat,logo SIZE=1800 SAMPLES=128 TAG=icon "$B" --background --python tests/blender/kit3.py > "иконки_v3/log.txt" 2>&1
echo DONE > "иконки_v3/done.txt"
