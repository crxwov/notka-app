import sys
from PIL import Image
import numpy as np
SPD = None
BG = r"C:\Users\leksik\Documents\Notka\брендбук\Frame 4.png"

def compose(fg_path, out_path, size=1024, bg_shift=0.0):
    fg = Image.open(fg_path).convert('RGBA').resize((size, size), Image.LANCZOS)
    bg = Image.open(BG).convert('RGB')
    h = size; w = int(bg.width * h / bg.height); bg = bg.resize((w, h), Image.LANCZOS)
    x0 = (w - size) // 2; bg = bg.crop((x0, 0, x0 + size, h))
    f = np.array(fg, dtype=np.float32); al = f[..., 3:4] / 255.0
    o = f[..., :3] * al + np.array(bg, dtype=np.float32) * (1 - al)
    Image.fromarray(o.clip(0, 255).astype(np.uint8)).save(out_path)

if __name__ == '__main__':
    compose(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 1024)
