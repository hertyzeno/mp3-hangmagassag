const DSP = require('./dsp.js');
const sr = 44100;
const NAMES = ['C', 'Cisz', 'D', 'Esz', 'E', 'F', 'Fisz', 'G', 'Asz', 'A', 'B', 'H'];
// Akkordmenet szintézise: basszus + akkord + egyszerű dallam, felhangokkal
function song(rootPc, minor, detuneCents = 0, sec = 24) {
  const I = minor ? [0, 3, 7] : [0, 4, 7], iv = minor ? [5, 8, 12] : [5, 9, 12], V = [7, 11, 14], vi = minor ? [8, 12, 15] : [9, 12, 16], ii = minor ? [2, 5, 8] : [2, 5, 9];
  const prog = minor ? [I, iv, V, I, vi, iv, V, I] : [I, vi, ii, V, I, iv, V, I];
  const scale = minor ? [0, 2, 3, 5, 7, 8, 11, 12] : [0, 2, 4, 5, 7, 9, 11, 12];
  const n = sr * sec, x = new Float32Array(n);
  const seg = n / prog.length;
  const f = m => 440 * Math.pow(2, (m - 69 + detuneCents / 100) / 12);
  let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let s = 0; s < prog.length; s++) {
    const notes = prog[s].map(o => 60 + rootPc + o);
    notes.push(36 + rootPc + prog[s][0]);
    for (let i = Math.floor(s * seg); i < Math.floor((s + 1) * seg); i++) {
      const t = i / sr; let v = 0;
      for (const m of notes) for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * f(m) * h * t) / (h * h);
      const mel = 72 + rootPc + scale[Math.floor(i / (sr / 4)) % 8 === 7 ? 0 : Math.floor(i / (sr / 4)) % 8];
      v += 0.6 * Math.sin(2 * Math.PI * f(mel) * t) + 0.2 * Math.sin(4 * Math.PI * f(mel) * t);
      x[i] = 0.05 * v + 0.01 * (rnd() - 0.5);
    }
  }
  return x;
}
(async () => {
  const cases = [[9, true, 0], [0, false, 0], [6, false, 0], [3, true, 0], [10, false, 0], [4, true, 30], [7, false, -40]];
  for (const [pc, minor, det] of cases) {
    const x = song(pc, minor, det);
    const t0 = Date.now();
    const k = await DSP.detectKey([x, x], sr);
    console.log(`vart ${NAMES[pc]}-${minor ? 'moll' : 'dur'} (${det} cent) -> ${NAMES[k.pc]}-${k.mode}, r=${k.r.toFixed(2)}, margo=${k.margin.toFixed(2)}, hangolas ${k.tuningCents} cent, ${Date.now() - t0}ms`);
  }
  // Eltolás után: A-moll +3 → C-moll
  const x = song(9, true, 0);
  const r = await DSP.process([x, x], { semitones: 3, speed: 1 });
  const k = await DSP.detectKey(r.channels, sr);
  console.log(`A-moll +3 felhang utan -> ${NAMES[k.pc]}-${k.mode}, hangolas ${k.tuningCents} cent`);
  const r2 = await DSP.process([x, x], { semitones: -5, speed: 1.2 });
  const k2 = await DSP.detectKey(r2.channels, sr);
  console.log(`A-moll -5 felhang, 120% utan -> ${NAMES[k2.pc]}-${k2.mode}`);
})();
