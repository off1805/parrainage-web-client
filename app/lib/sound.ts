// Effets sonores synthétisés (Web Audio, aucun fichier) calés sur l'animation du show.
// Ambiance facultative : dépose un fichier dans public/audio/ambiance.mp3 (titre de ton choix, non fourni).
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let amb: HTMLAudioElement | null = null;

/** Sortie commune : volume général et léger compresseur pour éviter la saturation. */
function out(): AudioNode | null {
  if (!ctx || !sound.on) return null;
  if (!master) {
    const comp = ctx.createDynamicsCompressor();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp).connect(ctx.destination);
  }
  return master;
}

/** Note simple avec enveloppe attaque / décroissance. */
function tone(freq: number, dur: number, { type = 'sine' as OscillatorType, gain = 0.1, at = 0, slideTo = 0 } = {}) {
  const dest = out();
  if (!ctx || !dest) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
}

/** Souffle filtré (bruit blanc) : balayages, « whoosh ». */
function noise(dur: number, { from = 400, to = 4000, gain = 0.08, at = 0 } = {}) {
  const dest = out();
  if (!ctx || !dest) return;
  const t = ctx.currentTime + at;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = buf;
  f.type = 'bandpass'; f.Q.value = 0.9;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t); src.stop(t + dur);
}

export const sound = {
  on: false,
  unlock() { ctx ??= new AudioContext(); void ctx.resume(); },
  set(on: boolean) {
    sound.on = on;
    if (!amb) { amb = new Audio('/audio/ambiance.mp3'); amb.loop = true; amb.volume = 0.25; }
    if (on) void amb.play().catch(() => {}); else amb.pause();
  },

  /** Frappe de clavier très courte (lignes de console, décodage du nom). */
  key() { tone(1800 + Math.random() * 600, 0.025, { type: 'square', gain: 0.012 }); },

  /** Chargement d'un étudiant : flux de données montant, calé sur la dépixellisation (~1,3 s). */
  load() {
    for (let i = 0; i < 10; i++) tone(500 + i * 90, 0.06, { type: 'triangle', gain: 0.035, at: i * 0.12 });
    noise(1.3, { from: 300, to: 3000, gain: 0.025 });
    tone(1400, 0.12, { type: 'sine', gain: 0.06, at: 1.3 });
  },


  /**
   * Passage du curseur sur un candidat : note de boîte à musique (gamme pentatonique,
   * toujours consonante), qui monte doucement au fil de la recherche.
   */
  step(progress: number) {
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
    const base = Math.min(scale.length - 2, Math.floor(progress * (scale.length - 1)));
    const f = scale[base + (Math.random() < 0.5 ? 0 : 1)];
    tone(f, 0.35, { type: 'sine', gain: 0.045 });
    tone(f / 2, 0.25, { type: 'triangle', gain: 0.015 });
  },

  /** Verrouillage sur le bon candidat : double bip de confirmation. */
  lock() {
    tone(660, 0.12, { type: 'sine', gain: 0.07 });
    tone(880, 0.25, { type: 'sine', gain: 0.07, at: 0.12 });
  },

  /** Révélation : souffle ascendant puis accord lumineux, synchronisé avec la photo et les confettis. */
  reveal() {
    noise(0.6, { from: 500, to: 6000, gain: 0.07 });
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone(f, 1.8, { type: 'sine', gain: 0.07 / (1 + i * 0.4), at: 0.05 + i * 0.06 }),
    );
    tone(2093, 0.9, { type: 'triangle', gain: 0.025, at: 0.3 });
  },

  /** Retournement d'une carte : court souffle + petit clic. */
  flip() {
    noise(0.28, { from: 2500, to: 700, gain: 0.05 });
    tone(900, 0.05, { type: 'triangle', gain: 0.04, at: 0.22 });
  },

  /** Écran final : arpège montant. */
  finale() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) =>
      tone(f, 1.4, { type: 'sine', gain: 0.06, at: i * 0.12 }),
    );
    noise(1.2, { from: 800, to: 8000, gain: 0.04, at: 0.5 });
  },

};
