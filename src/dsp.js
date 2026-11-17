// ===== Hangfeldolgozó motor: fázisvokóder (identity phase locking, sztereó-koherens) + Kaiser-sinc újramintavételezés =====
const DSP = (() => {
  const yieldNow = () => new Promise(r => setTimeout(r, 0));

  function makeFFT(n) {
    const levels = Math.round(Math.log2(n));
    const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = Math.sin(2 * Math.PI * i / n); }
    const rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) { let r = 0, x = i; for (let j = 0; j < levels; j++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
    return function fft(re, im, inverse) {
      for (let i = 0; i < n; i++) {
        const j = rev[i];
        if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
      }
      const sgn = inverse ? 1 : -1;
      for (let size = 2; size <= n; size <<= 1) {
        const half = size >> 1, step = n / size;
        for (let i = 0; i < n; i += size) {
          for (let j = i, k = 0; j < i + half; j++, k += step) {
            const wr = cos[k], wi = sgn * sin[k], l = j + half;
            const tr = re[l] * wr - im[l] * wi, ti = re[l] * wi + im[l] * wr;
            re[l] = re[j] - tr; im[l] = im[j] - ti; re[j] += tr; im[j] += ti;
          }
        }
      }
    };
  }

  const TWO_PI = 2 * Math.PI;
  const wrap = p => p - TWO_PI * Math.round(p / TWO_PI);

  // Időnyújtás hangmagasság-változás nélkül. channels: Float32Array[]; stretch > 1 = hosszabb.
  async function timeStretch(channels, stretch, opt = {}) {
    const N = opt.N || 4096, Hs = N / 4, half = N / 2;
    const Ha = Hs / stretch;
    const onProgress = opt.onProgress || (() => {});
    const transients = opt.transients !== false;
    const C = channels.length, len = channels[0].length;
    const pad = N;
    const inLen = len + 2 * pad;
    const xin = channels.map(ch => { const a = new Float32Array(inLen); a.set(ch, pad); return a; });
    const nFrames = Math.floor((inLen - N) / Ha) + 1;
    const outBufLen = (nFrames - 1) * Hs + N;
    const ys = channels.map(() => new Float32Array(outBufLen));
    const fft = makeFFT(N);
    const win = new Float64Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(TWO_PI * i / N);
    const scale = 1 / (N * 1.5); // Hann² 75% átfedésnél összeg = 1.5

    const re = [], im = [], mag = [], ph = [];
    for (let c = 0; c < C; c++) {
      re.push(new Float64Array(N)); im.push(new Float64Array(N));
      mag.push(new Float64Array(half + 1)); ph.push(new Float64Array(half + 1));
    }
    const mMag = new Float64Array(half + 1), mPh = new Float64Array(half + 1);
    let prevMPh = new Float64Array(half + 1), prevSyn = new Float64Array(half + 1);
    const syn = new Float64Array(half + 1), prevMMag = new Float64Array(half + 1);
    const peaks = new Int32Array(half + 1);
    let prevPos = 0, lastReset = -10, fluxAvg = 0;

    for (let f = 0; f < nFrames; f++) {
      const pos = Math.round(f * Ha);
      let mr, mi;
      // Analízis
      let maxMag = 0;
      for (let c = 0; c < C; c++) {
        const r = re[c], m = im[c], x = xin[c];
        for (let i = 0; i < N; i++) { r[i] = x[pos + i] * win[i]; m[i] = 0; }
        fft(r, m, false);
        for (let k = 0; k <= half; k++) { mag[c][k] = Math.hypot(r[k], m[k]); ph[c][k] = Math.atan2(m[k], r[k]); }
      }
      // Közös (mix) spektrum – a sztereókép megőrzéséhez
      for (let k = 0; k <= half; k++) {
        let sr = 0, si = 0;
        for (let c = 0; c < C; c++) { sr += re[c][k]; si += im[c][k]; }
        mMag[k] = Math.hypot(sr, si); mPh[k] = Math.atan2(si, sr);
        if (mMag[k] > maxMag) maxMag = mMag[k];
      }
      // Tranziens-detektálás (spektrális fluxus)
      let reset = f === 0;
      if (transients && f > 0) {
        let flux = 0, tot = 0;
        for (let k = 2; k <= half; k++) { const d = mMag[k] - prevMMag[k]; if (d > 0) flux += d; tot += mMag[k]; }
        const rel = tot > 1e-9 ? flux / tot : 0;
        if (rel > 0.35 && rel > 2.5 * fluxAvg && f - lastReset > 4 && maxMag > 1e-3) { reset = true; lastReset = f; }
        fluxAvg = 0.9 * fluxAvg + 0.1 * rel;
      }
      if (reset) {
        syn.set(mPh);
      } else {
        const ha = pos - prevPos;
        let np = 0;
        const thr = maxMag * 1e-6;
        for (let k = 1; k < half; k++) {
          if (mMag[k] > thr && mMag[k] > mMag[k - 1] && mMag[k] >= mMag[k + 1]) peaks[np++] = k;
        }
        if (np === 0) { syn.set(mPh); }
        else {
          for (let p = 0; p < np; p++) {
            const k = peaks[p], omega = TWO_PI * k / N;
            const d = wrap(mPh[k] - prevMPh[k] - omega * ha);
            syn[k] = prevSyn[k] + (omega + d / ha) * Hs;
          }
          // Identity phase locking: minden bin a legközelebbi csúcshoz igazodik
          let p = 0;
          for (let k = 0; k <= half; k++) {
            while (p < np - 1 && k > (peaks[p] + peaks[p + 1]) / 2) p++;
            const pk = peaks[p];
            if (k !== pk) syn[k] = syn[pk] + (mPh[k] - mPh[pk]);
          }
        }
      }
      // Szintézis csatornánként: saját magnitúdó, saját fázis + közös eltolás
      const op = f * Hs;
      for (let c = 0; c < C; c++) {
        const r = re[c], m = im[c];
        for (let k = 0; k <= half; k++) {
          const phi = ph[c][k] + (syn[k] - mPh[k]);
          r[k] = mag[c][k] * Math.cos(phi); m[k] = mag[c][k] * Math.sin(phi);
        }
        m[0] = 0; m[half] = 0;
        for (let k = 1; k < half; k++) { r[N - k] = r[k]; m[N - k] = -m[k]; }
        fft(r, m, true);
        const y = ys[c];
        for (let i = 0; i < N; i++) y[op + i] += r[i] * win[i] * scale;
      }
      // Állapot
      const t = prevMPh; prevMPh = mPh.slice(); prevSyn = syn.slice(); void t;
      prevMMag.set(mMag);
      prevPos = pos;
      if ((f & 63) === 63) { onProgress(f / nFrames); await yieldNow(); }
    }
    const start = Math.round((pad - N / 2) * stretch + N / 2);
    const outLen = Math.round(len * stretch);
    return ys.map(y => y.slice(start, start + outLen));
  }

  function besselI0(x) {
    let sum = 1, term = 1;
    for (let k = 1; k < 50; k++) { term *= (x / (2 * k)) * (x / (2 * k)); sum += term; if (term < 1e-12 * sum) break; }
    return sum;
  }

  // Újramintavételezés: ratio > 1 → rövidebb, magasabb hang (olvasási lépés = ratio)
  async function resample(channels, ratio, opt = {}) {
    const onProgress = opt.onProgress || (() => {});
    const Z = 24, beta = 9, R = 512;
    const fc = Math.min(1, 1 / ratio) * 0.95;
    const halfW = Math.ceil(Z / fc), taps = 2 * halfW;
    const i0b = besselI0(beta);
    const table = new Float32Array((R + 1) * taps);
    for (let r = 0; r <= R; r++) {
      const frac = r / R;
      for (let j = 0; j < taps; j++) {
        const t = (j - halfW + 1) - frac;
        const x = fc * t;
        const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
        const u = t / (Z / fc);
        const w = Math.abs(u) >= 1 ? 0 : besselI0(beta * Math.sqrt(1 - u * u)) / i0b;
        table[r * taps + j] = fc * sinc * w;
      }
    }
    const len = channels[0].length;
    const outLen = Math.round(len / ratio);
    const out = channels.map(() => new Float32Array(outLen));
    const total = outLen * channels.length;
    let done = 0;
    for (let c = 0; c < channels.length; c++) {
      const x = channels[c], y = out[c];
      for (let i = 0; i < outLen; i++) {
        const pos = i * ratio;
        const ip = Math.floor(pos);
        const fr = (pos - ip) * R;
        const ri = Math.floor(fr), a = fr - ri;
        const o0 = ri * taps, o1 = o0 + taps;
        const base = ip - halfW + 1;
        let s = 0;
        if (base >= 0 && base + taps <= len) {
          for (let j = 0; j < taps; j++) { const h0 = table[o0 + j]; s += x[base + j] * (h0 + a * (table[o1 + j] - h0)); }
        } else {
          for (let j = 0; j < taps; j++) {
            const idx = base + j; if (idx < 0 || idx >= len) continue;
            const h0 = table[o0 + j]; s += x[idx] * (h0 + a * (table[o1 + j] - h0));
          }
        }
        y[i] = s;
        if ((i & 32767) === 32767) { done += 32768; onProgress(done / total); await yieldNow(); }
      }
    }
    return out;
  }

  // Teljes lánc. semitones: félhang; speed: 1 = eredeti; keepPitch: sebességváltás ne változtasson hangmagasságot
  async function process(channels, { semitones = 0, speed = 1, keepPitch = true, transients = true, onProgress } = {}) {
    const prog = onProgress || (() => {});
    const P = Math.pow(2, semitones / 12) * (keepPitch ? 1 : speed); // hangmagasság-arány
    const stretch = P / speed;                                         // időnyújtás a PV-nek
    let data = channels;
    const needPV = Math.abs(stretch - 1) > 1e-9;
    const needRS = Math.abs(P - 1) > 1e-9;
    if (!needPV && !needRS) return { channels: channels.map(c => c.slice()), bypass: true };
    if (needPV) data = await timeStretch(data, stretch, { transients, onProgress: p => prog(needRS ? p * 0.7 : p) });
    if (needRS) data = await resample(data, P, { onProgress: p => prog(needPV ? 0.7 + p * 0.3 : p) });
    prog(1);
    return { channels: data, bypass: false };
  }

  // ---- WAV + ZIP kódolás ----
  function encodeWAV(channels, sampleRate, bits) {
    const C = channels.length, n = channels[0].length;
    const bps = bits / 8, fmt = bits === 32 ? 3 : 1;
    const dataLen = n * C * bps;
    const buf = new ArrayBuffer(44 + dataLen), dv = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); dv.setUint32(4, 36 + dataLen, true); str(8, 'WAVE'); str(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, fmt, true); dv.setUint16(22, C, true);
    dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * C * bps, true);
    dv.setUint16(32, C * bps, true); dv.setUint16(34, bits, true); str(36, 'data'); dv.setUint32(40, dataLen, true);
    let o = 44;
    if (bits === 32) {
      for (let i = 0; i < n; i++) for (let c = 0; c < C; c++) { dv.setFloat32(o, channels[c][i], true); o += 4; }
    } else {
      const max = bits === 16 ? 32767 : 8388607;
      for (let i = 0; i < n; i++) for (let c = 0; c < C; c++) {
        let v = channels[c][i] * max;
        if (bits === 16) v += (Math.random() - Math.random()); // TPDF dither
        v = Math.max(-max - 1, Math.min(max, Math.round(v)));
        if (bits === 16) { dv.setInt16(o, v, true); o += 2; }
        else { dv.setUint8(o, v & 255); dv.setUint8(o + 1, (v >> 8) & 255); dv.setUint8(o + 2, (v >> 16) & 255); o += 3; }
      }
    }
    return new Uint8Array(buf);
  }

  const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  // Tárolt (tömörítetlen) ZIP egyetlen fájllal
  function zipStore(name, data) {
    const nameB = new TextEncoder().encode(name);
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
    lh.setUint16(26, nameB.length, true);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
    cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true);
    cd.setUint16(28, nameB.length, true); cd.setUint32(42, 0, true);
    const cdOff = 30 + nameB.length + data.length;
    const eo = new DataView(new ArrayBuffer(22));
    eo.setUint32(0, 0x06054b50, true); eo.setUint16(8, 1, true); eo.setUint16(10, 1, true);
    eo.setUint32(12, 46 + nameB.length, true); eo.setUint32(16, cdOff, true);
    return [new Uint8Array(lh.buffer), nameB, data, new Uint8Array(cd.buffer), nameB, new Uint8Array(eo.buffer)];
  }

  // ---- Hangnem-felismerés: hangolásbecslés + kromagram + Krumhansl–Kessler profilok ----
  const KK_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const KK_MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  function pearson(a, b) {
    const n = a.length; let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
    let s = 0, sa = 0, sb = 0;
    for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; s += x * y; sa += x * x; sb += y * y; }
    return sa && sb ? s / Math.sqrt(sa * sb) : 0;
  }
  async function detectKey(channels, sr, opt = {}) {
    const onProgress = opt.onProgress || (() => {});
    const len = channels[0].length;
    const N = 8192, H = 4096, half = N / 2;
    const fft = makeFFT(N);
    const win = new Float64Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(TWO_PI * i / N);
    const re = new Float64Array(N), im = new Float64Array(N), mag = new Float64Array(half + 1);
    const kLo = Math.ceil(55 * N / sr), kHi = Math.min(half - 1, Math.floor(4200 * N / sr));
    const peaks = []; // [midi (tört), súly]
    const nFrames = Math.max(1, Math.floor((len - N) / H) + 1);
    // max. kb. 2500 keret (hosszú felvételnél ritkítunk)
    const stride = Math.max(1, Math.ceil(nFrames / 2500));
    for (let f = 0; f < nFrames; f += stride) {
      const pos = f * H;
      for (let i = 0; i < N; i++) {
        let s = 0; const idx = pos + i;
        if (idx < len) for (let c = 0; c < channels.length; c++) s += channels[c][idx];
        re[i] = s * win[i]; im[i] = 0;
      }
      fft(re, im, false);
      let mx = 0;
      for (let k = 0; k <= half; k++) { mag[k] = Math.hypot(re[k], im[k]); if (k >= kLo && k <= kHi && mag[k] > mx) mx = mag[k]; }
      if (mx < 1e-4) continue;
      const thr = mx * 0.02;
      for (let k = kLo; k <= kHi; k++) {
        const m = mag[k];
        if (m > thr && m > mag[k - 1] && m >= mag[k + 1]) {
          const a = Math.log(mag[k - 1] + 1e-12), b = Math.log(m), c = Math.log(mag[k + 1] + 1e-12);
          const den = a - 2 * b + c, d = den ? 0.5 * (a - c) / den : 0;
          const freq = (k + d) * sr / N;
          peaks.push(69 + 12 * Math.log2(freq / 440), Math.sqrt(m / mx));
        }
      }
      if ((f & 127) === 0) { onProgress(f / nFrames); await yieldNow(); }
    }
    if (peaks.length < 40) return null;
    // Hangolás (eltérés az A=440 Hz-es rendszertől), körkörös átlag
    let cx = 0, cy = 0;
    for (let i = 0; i < peaks.length; i += 2) { const fr = peaks[i] - Math.round(peaks[i]); cx += peaks[i + 1] * Math.cos(TWO_PI * fr); cy += peaks[i + 1] * Math.sin(TWO_PI * fr); }
    const tuning = Math.atan2(cy, cx) / TWO_PI; // félhangban, [-0.5, 0.5]
    const chroma = new Float64Array(12);
    for (let i = 0; i < peaks.length; i += 2) {
      const m = peaks[i] - tuning, r = Math.round(m);
      const dev = Math.abs(m - r);
      if (dev > 0.35) continue;
      chroma[((r % 12) + 12) % 12] += peaks[i + 1] * (1 - dev);
    }
    const scores = [];
    for (let pc = 0; pc < 12; pc++) {
      const rot = Array.from({ length: 12 }, (_, i) => chroma[(i + pc) % 12]);
      scores.push({ pc, mode: 'dur', r: pearson(rot, KK_MAJ) });
      scores.push({ pc, mode: 'moll', r: pearson(rot, KK_MIN) });
    }
    scores.sort((a, b) => b.r - a.r);
    onProgress(1);
    return { pc: scores[0].pc, mode: scores[0].mode, r: scores[0].r, second: scores[1], margin: scores[0].r - scores[1].r, tuningCents: Math.round(tuning * 100), chroma: Array.from(chroma) };
  }

  return { timeStretch, resample, process, encodeWAV, zipStore, crc32, detectKey };
})();
if (typeof module !== 'undefined') module.exports = DSP;
