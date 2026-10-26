// @ts-nocheck
/* Sastra Dungeon — SFX engine. Pure WebAudio oscillators/noise, no audio assets.
   Shared AudioContext created lazily on first user gesture; respects a persisted toggle. */
let AC = null, master = null, nbuf = null, dead = false;  /* dead = WebAudio unusable here; never break gameplay */
let off = false;
try { off = localStorage.getItem('sd_sfx_off') === '1' } catch (e) {}

const _last: Record<string, number> = {};
function gate(k: string, ms: number) {
  const n = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  if (_last[k] && n - _last[k] < ms) return false;
  _last[k] = n; return true;
}

function init() {
  if (AC) return !!AC;
  try {
    AC = new (window.AudioContext || (window as any).webkitAudioContext)();
    master = AC.createGain();
    master.gain.value = 0.55;
    master.connect(AC.destination);
    nbuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = nbuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { AC = null }
  return !!AC;
}
function ready() {
  if (off || dead) return false;
  if (!init()) return false;
  if (AC.state === 'suspended') AC.resume().catch(() => {});
  return true;
}
function tone(f0: number, f1: number, dur: number, vol: number, type: OscillatorType, delay = 0) {
  try {
  const t = AC.currentTime + delay;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(20, f0), t);
  o.frequency.exponentialRampToTimeValue(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToTimeValue(vol, t + 0.006);
  g.gain.exponentialRampToTimeValue(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.03);
  } catch (e) { dead = true }
}
function noise(dur: number, vol: number, freq: number, type: BiquadFilterType, delay = 0) {
  try {
  const t = AC.currentTime + delay;
  const s = AC.createBufferSource(); s.buffer = nbuf; s.loop = true;
  const fl = AC.createBiquadFilter(); fl.type = type; fl.frequency.value = freq;
  const g = AC.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToTimeValue(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(master);
  s.start(t); s.stop(t + dur + 0.03);
  } catch (e) { dead = true }
}
function arp(freqs: number[], step: number, dur: number, vol: number, type: OscillatorType) {
  freqs.forEach((f, i) => tone(f, f, dur, vol, type, i * step));
}

export const sfx = {
  hit() { if (!ready() || !gate('hit', 45)) return; tone(200 + Math.random() * 80, 90, 0.07, 0.10, 'square') },
  crit() { if (!ready() || !gate('crit', 60)) return; tone(520, 140, 0.12, 0.14, 'square'); noise(0.08, 0.06, 3000, 'highpass') },
  hurt() { if (!ready() || !gate('hurt', 150)) return; tone(160, 55, 0.22, 0.20, 'sawtooth'); noise(0.12, 0.08, 500, 'lowpass') },
  dash() { if (!ready() || !gate('dash', 200)) return; noise(0.16, 0.10, 1200, 'bandpass') },
  coin() { if (!ready() || !gate('coin', 70)) return; tone(980, 1320, 0.07, 0.07, 'square'); tone(1470, 1470, 0.05, 0.05, 'square', 0.05) },
  xp() { if (!ready() || !gate('xp', 120)) return; tone(620, 780, 0.05, 0.045, 'triangle') },
  loot() { if (!ready() || !gate('loot', 120)) return; tone(520, 780, 0.09, 0.10, 'triangle'); tone(1040, 1560, 0.08, 0.07, 'triangle', 0.07) },
  levelup() { if (!ready()) return; arp([392, 523, 659, 784], 0.07, 0.12, 0.12, 'square') },
  potion() { if (!ready()) return; tone(330, 660, 0.16, 0.10, 'sine'); tone(660, 880, 0.14, 0.08, 'sine', 0.12) },
  ui() { if (!ready() || !gate('ui', 60)) return; tone(700, 900, 0.04, 0.05, 'triangle') },
  click() { if (!ready() || !gate('click', 40)) return; tone(440, 330, 0.05, 0.06, 'square') },
  death() { if (!ready()) return; tone(220, 40, 0.7, 0.20, 'sawtooth'); noise(0.5, 0.10, 300, 'lowpass', 0.05) },
  boss() { if (!ready()) return; tone(90, 45, 0.6, 0.22, 'sawtooth'); tone(45, 38, 0.8, 0.18, 'square', 0.15); noise(0.6, 0.08, 200, 'lowpass', 0.1) },
  win() { if (!ready()) return; arp([523, 659, 784, 1046, 1318], 0.11, 0.28, 0.14, 'triangle'); arp([261, 329, 392, 523], 0.11, 0.4, 0.07, 'square', 0.22) },
};
export function sfxIsOff() { return off }
export function sfxToggle(): boolean {
  off = !off;
  try { localStorage.setItem('sd_sfx_off', off ? '1' : '0') } catch (e) {}
  if (!off) { init(); if (AC && AC.state === 'suspended') AC.resume().catch(() => {}) }
  return off;
}
/* keep the context alive across gestures (music button already does its own; this is the sfx side) */
['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, () => {
  if (AC && AC.state === 'suspended' && !off) AC.resume().catch(() => {});
}, true));
