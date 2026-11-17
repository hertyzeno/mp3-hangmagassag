# Ikonok generálása az SVG-forrásokból: python3 src/make_icons.py  (rsvg-convert kell hozzá)
import subprocess
from pathlib import Path
d = Path(__file__).parent.parent / 'icons'
jobs = [('icon.svg', 'icon-192.png', 192), ('icon.svg', 'icon-512.png', 512), ('icon-maskable.svg', 'icon-maskable-512.png', 512),
        ('icon-maskable.svg', 'apple-touch-icon.png', 180), ('icon.svg', 'favicon-32.png', 32)]
for src, out, size in jobs:
    subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), '-o', str(d / out), str(d / src)], check=True)
    print(out, size)
