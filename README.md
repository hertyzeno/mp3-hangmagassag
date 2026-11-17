# MP3 Hangmagasság és Sebesség

Böngészőben futó program: MP3-ak és videók (MP4, MOV, WebM) hangmagasságát félhangonként tolja el, a sebességet külön állítja, felismeri a hangnemet, és MP3-ban vagy WAV-ban ment.

- Minden a böngészőben fut, a fájl nem töltődik fel sehova.
- Hangolás: fázisvokóder csúcskövető fázisrögzítéssel + Kaiser-sinc újramintavételezés.
- Hangnem-felismerés: hangolásbecslés + kromagram + Krumhansl–Kessler profilok.
- Kiesés-javítás: a felvétel rövid, hirtelen elnémulásait megtalálja, és a közvetlenül előttük szóló hang folytatásával pótolja.
- MP3-kódolás: [lamejs](https://github.com/zhuker/lamejs) (a LAME JavaScript-változata, LGPL), első mentéskor CDN-ről töltődik be.

Használat: nyisd meg a GitHub Pages címet, vagy töltsd le az `index.html`-t, és nyisd meg böngészőben.

## Telepítés telefonra / gépre

Az oldal telepíthető alkalmazásként (PWA): saját ikonnal, címsor nélkül indul, és internet nélkül is megnyílik.

- **Android (Chrome):** nyisd meg a címet → jobb felső ⋮ menü → **„Alkalmazás telepítése”** (vagy „Hozzáadás a kezdőképernyőhöz”).
- **iPhone / iPad (Safari):** Megosztás gomb (négyzet felfelé nyíllal) → **„Főképernyőhöz adás”**.
- **Gépen (Chrome, Edge):** a címsor jobb végén a telepítés ikon (monitor lefelé nyíllal) → **Telepítés**.

Offline a feldolgozás és a WAV-mentés mindig működik. Az MP3-mentéshez az MP3-kódolót egyszer, internettel kell betölteni (első MP3-mentés), utána offline is elérhető.

## Fejlesztés

- `src/dsp.js` – hangfeldolgozó motor (időnyújtás, újramintavételezés, hangnem-felismerés, WAV/ZIP)
- `src/template.html` – felület
- `python3 src/build.py` – összeállítja az `index.html`-t (kézzel ne szerkeszd)
- `python3 src/make_icons.py` – az `icons/icon.svg` és `icons/icon-maskable.svg` forrásból legenerálja a PNG ikonokat (rsvg-convert kell)
- `manifest.webmanifest`, `sw.js` – PWA; új kiadásnál az `sw.js`-ben növeld a `VERSION` értékét
- `node src/test.js`, `node src/test_key.js`, `node src/test_dropout.js` – tesztek
