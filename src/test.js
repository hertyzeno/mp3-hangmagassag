const DSP = require('./dsp.js');
const sr = 44100;
function sine(f, sec, amp = 0.5) { const n = Math.round(sr * sec), a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = amp * Math.sin(2 * Math.PI * f * i / sr); return a; }
// Frekvencia + tisztaság mérése a középső szakaszon (DFT csúcs, Blackman-Harris ablak)
function analyze(x) {
  const N = 32768, s = Math.floor(x.length / 2 - N / 2);
  const w = i => 0.35875 - 0.48829 * Math.cos(2 * Math.PI * i / N) + 0.14128 * Math.cos(4 * Math.PI * i / N) - 0.01168 * Math.cos(6 * Math.PI * i / N);
  const mags = new Float64Array(N / 2);
  // naiv DFT csak a 100–3000 Hz-es tartományra, gyorsításként goertzel nélkül: teljes FFT helyett
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = x[s + i] * w(i);
  // egyszerű FFT
  const fft = (re, im) => { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } } for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len; for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) { const wr = Math.cos(a * k), wi = Math.sin(a * k), l = i + k + len / 2; const tr = re[l] * wr - im[l] * wi, ti = re[l] * wi + im[l] * wr; re[l] = re[i + k] - tr; im[l] = im[i + k] - ti; re[i + k] += tr; im[i + k] += ti; } } };
  fft(re, im);
  let pk = 1, tot = 0; for (let k = 1; k < N / 2; k++) { mags[k] = re[k] * re[k] + im[k] * im[k]; tot += mags[k]; if (mags[k] > mags[pk]) pk = k; }
  const a = Math.log(mags[pk - 1]), b = Math.log(mags[pk]), c = Math.log(mags[pk + 1]);
  const d = 0.5 * (a - c) / (a - 2 * b + c);
  let near = 0; for (let k = pk - 6; k <= pk + 6; k++) near += mags[k];
  return { freq: (pk + d) * sr / N, snr: 10 * Math.log10(near / (tot - near)) };
}
(async () => {
  const x = sine(440, 4);
  for (const [st, sp, kp] of [[0, 1, true], [3, 1, true], [-5, 1, true], [12, 1, true], [-12, 1, true], [0, 1.25, true], [0, 0.8, true], [2, 1.1, true], [0, 1.5, false]]) {
    const t0 = Date.now();
    const r = await DSP.process([x, x], { semitones: st, speed: sp, keepPitch: kp });
    const y = r.channels[0];
    const exp = 440 * Math.pow(2, st / 12) * (kp ? 1 : sp);
    const an = analyze(y);
    const lr = r.channels[0].every((v, i) => Math.abs(v - r.channels[1][i]) < 1e-6);
    console.log(`st=${st} speed=${sp} keep=${kp}: freq ${an.freq.toFixed(2)} (vart ${exp.toFixed(2)}, hiba ${(1200 * Math.log2(an.freq / exp)).toFixed(2)} cent), hossz ${(y.length / sr).toFixed(3)}s (vart ${(4 / sp).toFixed(3)}), tisztasag ${an.snr.toFixed(1)} dB, L=R:${lr}, ${Date.now() - t0}ms, bypass:${r.bypass}`);
  }
  // Teljesítmény: 3 perc sztereó zaj
  const n = sr * 180, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = Math.random() - 0.5; R[i] = Math.random() - 0.5; }
  let t0 = Date.now(); await DSP.process([L, R], { semitones: 3, speed: 1.1 }); console.log('3 perc sztereo, +3 felhang, 110%:', Date.now() - t0, 'ms');
  t0 = Date.now(); await DSP.process([L, R], { semitones: -12, speed: 1 }); console.log('3 perc sztereo, -12 felhang:', Date.now() - t0, 'ms');
  // WAV + ZIP ellenőrzés
  const wav = DSP.encodeWAV([x, x], sr, 16);
  const parts = DSP.zipStore('teszt.wav', wav);
  require('fs').writeFileSync('/tmp/t.zip', Buffer.concat(parts.map(p => Buffer.from(p))));
})();
