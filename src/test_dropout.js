// Kiesés-felismerés és -javítás tesztje: node src/test_dropout.js [nyers f32le sztereó fájl] [mintavétel]
const DSP = require('./dsp.js');
const fs = require('fs');
function load(p) { const b = fs.readFileSync(p); const f = new Float32Array(b.buffer, b.byteOffset, b.length / 4); const n = f.length / 2, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; } return [L, R]; }
(async () => {
  const sr = +(process.argv[3] || 44100);
  if (process.argv[2]) {
    const ch = load(process.argv[2]);
    let t0 = Date.now();
    const ev = await DSP.detectDropouts(ch, sr);
    console.log(`talált kiesések (${Date.now() - t0} ms):`, ev.map(e => `${e.time.toFixed(3)}s/${e.ms}ms`).join(', ') || 'nincs');
    for (const e of ev) { const r = DSP.repairDropout(ch, sr, e.start, e.end); console.log(`  javítás ${e.time.toFixed(3)}: forrás ${r.source.toFixed(3)}s, r=${r.similarity.toFixed(3)}, erősítés ${r.gain.toFixed(3)}`); }
    const after = await DSP.detectDropouts(ch, sr);
    console.log('javítás után:', after.length ? after.map(e => e.time.toFixed(3)).join(', ') : 'nincs');
    if (process.argv[4]) { const out = new Float32Array(ch[0].length * 2); for (let i = 0; i < ch[0].length; i++) { out[2 * i] = ch[0][i]; out[2 * i + 1] = ch[1][i]; } fs.writeFileSync(process.argv[4], Buffer.from(out.buffer)); }
    return;
  }
  // Szintetikus: akkord + 45 ms-os mesterséges kiesés 3,2 s-nál, és egy szándékos 0,6 s-os szünet 6 s-nál
  const n = sr * 9, L = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / sr; L[i] = 0.2 * (Math.sin(2 * Math.PI * 220 * t) + 0.5 * Math.sin(2 * Math.PI * 277.2 * t) + 0.4 * Math.sin(2 * Math.PI * 329.6 * t)); }
  for (let i = Math.round(3.2 * sr); i < Math.round(3.245 * sr); i++) L[i] *= 0.01;
  for (let i = Math.round(6 * sr); i < Math.round(6.6 * sr); i++) L[i] = 0;
  const ch = [L, L.slice()];
  const ev = await DSP.detectDropouts(ch, sr);
  console.log('szintetikus – talált:', ev.map(e => `${e.time.toFixed(3)}s/${e.ms}ms`).join(', '), '(várt: 3.2 s körül, a 6 s-os szünet NEM)');
  DSP.repairDropout(ch, sr, ev[0].start, ev[0].end);
  let mn = 1; for (let s = Math.round(3.15 * sr); s < Math.round(3.3 * sr); s += 441) { let e = 0; for (let j = s; j < s + 441; j++) e += ch[0][j] ** 2; mn = Math.min(mn, Math.sqrt(e / 441)); }
  console.log('javítás után a legkisebb 10 ms-os szint a környéken:', mn.toFixed(3), '(normál ≈ 0.17)');
})();
