# Összeállítja az index.html-t a forrásokból: python3 src/build.py
from pathlib import Path
here = Path(__file__).parent
t = (here / 'template.html').read_text(encoding='utf-8')
t = t.replace('/*DSP*/', (here / 'dsp.js').read_text(encoding='utf-8')).replace('/*DESKTOP*/', 'true')
t = t.replace('minden a böngészőben fut, semmit nem tölt fel.', 'minden a készülékeden fut, semmit nem tölt fel. MP3-ban vagy WAV-ban ment.')
(here.parent / 'index.html').write_text(t, encoding='utf-8')
print('index.html kész')
