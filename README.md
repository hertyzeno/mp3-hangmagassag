# MP3 Hangmagasság és Sebesség

Böngészőben futó program: MP3-ak és videók (MP4, MOV, WebM) hangmagasságát félhangonként tolja el, a sebességet külön állítja, felismeri a hangnemet, és MP3-ban vagy WAV-ban ment.

- Minden a böngészőben fut, a fájl nem töltődik fel sehova.
- Hangolás: fázisvokóder csúcskövető fázisrögzítéssel + Kaiser-sinc újramintavételezés.
- Hangnem-felismerés: hangolásbecslés + kromagram + Krumhansl–Kessler profilok.
- Kiesés-javítás: a felvétel rövid, hirtelen elnémulásait megtalálja, és a közvetlenül előttük szóló hang folytatásával pótolja.
- MP3-kódolás: [lamejs](https://github.com/zhuker/lamejs) (a LAME JavaScript-változata, LGPL), első mentéskor CDN-ről töltődik be.

Használat: nyisd meg a GitHub Pages címet, vagy töltsd le az `index.html`-t, és nyisd meg böngészőben.

## Fejlesztés

- `src/dsp.js` – hangfeldolgozó motor (időnyújtás, újramintavételezés, hangnem-felismerés, WAV/ZIP)
- `src/template.html` – felület
- `python3 src/build.py` – összeállítja az `index.html`-t
- `node src/test.js`, `node src/test_key.js`, `node src/test_dropout.js` – tesztek
