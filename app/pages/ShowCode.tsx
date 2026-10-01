// Version « code » du show : même logique que Show.tsx (session, ordre, télécommande,
// raccourcis), mise en scène autour d'un algorithme de matching visible à l'écran.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../lib/api';
import { demoPairings } from '../lib/demo';
import { openRoom, type Cmd } from '../lib/channel';
import { sound } from '../lib/sound';
import type { Pairing, StudentRef } from '../lib/types';
import './show-code.css';

type Stage = 'loading' | 'error' | 'intro' | 'show' | 'finale';

// Durées des phases d'un binôme : chargement du parrain, puis recherche du filleul
const SPONSOR_MS = 2200;
const MATCH_MS = 7600;
const POOL_MAX = 24;

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}
const COLORS = ['#1D4ED8', '#3B82F6', '#FACC15', '#FDE68A', '#0F172A'];
const GLYPHS = '01{}[]<>/\\=+*#$%&;:ABCDEF0123456789';
const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const short = (s: StudentRef) => `${s.firstName} ${s.lastName[0] ?? ''}.`;
const initials = (s: StudentRef) => `${s.firstName[0] ?? ''}${s.lastName[0] ?? ''}`.toUpperCase();
/** Faux hash de commit, stable pour un identifiant. */
const hash = (id: string) => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(16).padStart(7, '0').slice(0, 7);
};
/**
 * Lien WhatsApp « wa.me » avec un message pré-rempli. Le numéro est stocké au format
 * +2376XXXXXXXX ; wa.me attend uniquement les chiffres, indicatif compris.
 */
function waLink(phone: string | null, text: string): string | null {
  const digits = phone?.replace(/\D/g, '') ?? '';
  return digits.length >= 8 ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── Confettis en forme de code ── */

let glyphShapes: confetti.Shape[] | null = null;
function codeShapes() {
  glyphShapes ??= ['{ }', '</>', '01', '=>', ';', '()'].flatMap((text) =>
    ['#1D4ED8', '#CA8A04', '#0F172A'].map((color) =>
      confetti.shapeFromText({ text, scalar: 2.2, color, fontFamily: '"JetBrains Mono", monospace' }),
    ),
  );
  return glyphShapes;
}
function celebrate() {
  if (reducedMotion()) return;
  confetti({ particleCount: 46, spread: 110, startVelocity: 42, origin: { y: 0.5 }, shapes: codeShapes(), scalar: 2.2, flat: true, ticks: 160 });
  confetti({ particleCount: 70, angle: 60, spread: 55, startVelocity: 60, origin: { x: 0, y: 0.75 }, colors: COLORS });
  confetti({ particleCount: 70, angle: 120, spread: 55, startVelocity: 60, origin: { x: 1, y: 0.75 }, colors: COLORS });
}

export default function ShowCode() {
  const [params] = useSearchParams();
  const room = useMemo(() => {
    const q = params.get('room'); if (q) return q;
    let r = localStorage.getItem('room');
    if (!r) { r = Math.random().toString(36).slice(2, 7); localStorage.setItem('room', r); }
    return r;
  }, [params]);

  const [stage, setStage] = useState<Stage>('loading');
  const [error, setError] = useState('');
  const [order, setOrder] = useState<Pairing[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState(2); // 0 parrain · 1 recherche · 2 révélé
  const [soundOn, setSoundOn] = useState(false);
  const [flash, setFlash] = useState<number | null>(null);
  const quiet = useRef(false);
  const live = useRef({ index, phase, stage, total: 0, soundOn });
  live.current = { index, phase, stage, total: order.length, soundOn };
  const roomRef = useRef<ReturnType<typeof openRoom>>(undefined);

  useEffect(() => {
    (async () => {
      try {
        let list: Pairing[];
        if (params.get('demo')) list = demoPairings(Number(params.get('demo')));
        else {
          let id = params.get('session');
          if (!id) {
            const s = (await api.sessions.list()).find((x) => x.status !== 'DRAFT');
            if (!s) throw new Error("Aucune session générée. Lance le tirage depuis l'admin.");
            id = s.id;
          }
          list = (await api.sessions.get(id)).pairings;
        }
        if (!list.length) throw new Error('Cette session ne contient aucun binôme.');
        list.forEach((p) => [p.sponsor, p.mentee].forEach((s) => { if (s.profilePictureUrl) new Image().src = s.profilePictureUrl; }));
        setOrder(shuffle(list)); setStage('intro');
      } catch (e) { setError(e instanceof Error ? e.message : String(e)); setStage('error'); }
    })();
  }, [params]);

  const start = () => {
    // Le clic sur « run show() » débloque l'audio : le son est actif par défaut (M pour couper)
    sound.unlock(); sound.set(true); setSoundOn(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
    setStage('show');
  };
  const next = useCallback(() => {
    const s = live.current;
    if (s.stage !== 'show') return;
    if (s.index > 0 && s.phase < 2) return setPhase(2);
    if (s.index >= s.total) return setStage('finale');
    setIndex(s.index + 1); setPhase(0);
  }, []);
  const prev = useCallback(() => {
    const s = live.current;
    if (s.stage === 'finale') return setStage('show');
    if (s.index === 0) return;
    quiet.current = true; setIndex(s.index - 1); setPhase(2);
  }, []);
  const reset = useCallback(() => { setOrder((o) => shuffle(o)); setIndex(0); setPhase(2); setStage('show'); }, []);
  const toggleSound = useCallback(() => { sound.set(!live.current.soundOn); setSoundOn((v) => !v); }, []);
  const exec = useCallback((c: Cmd) => {
    if (c.type === 'next') next(); else if (c.type === 'prev') prev(); else if (c.type === 'reset') reset();
    else if (c.type === 'finale') setStage('finale'); else if (c.type === 'sound') toggleSound();
    else roomRef.current?.sendState({ index: live.current.index, total: live.current.total, sound: live.current.soundOn, stage: live.current.stage });
  }, [next, prev, reset, toggleSound]);
  const execRef = useRef(exec); execRef.current = exec;

  useEffect(() => { roomRef.current = openRoom(room, { onCmd: (c) => execRef.current(c) }); return () => roomRef.current?.close(); }, [room]);
  useEffect(() => { roomRef.current?.sendState({ index, total: order.length, sound: soundOn, stage }); }, [index, order.length, soundOn, stage]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') prev(); else if (e.key.toLowerCase() === 'r') reset();
      else if (e.key.toLowerCase() === 'm') toggleSound(); else if (e.key.toLowerCase() === 'f') setStage('finale');
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [next, prev, reset, toggleSound]);

  // Phase 0 → 1 → 2 : le parrain est chargé, l'algorithme cherche, puis le filleul est révélé
  useEffect(() => {
    if (stage !== 'show' || index === 0 || phase === 2) return;
    const t = window.setTimeout(() => setPhase(phase + 1), phase === 0 ? SPONSOR_MS : MATCH_MS);
    return () => clearTimeout(t);
  }, [stage, index, phase]);

  useEffect(() => {
    if (stage !== 'show' || index === 0 || phase !== 2) return;
    if (quiet.current) { quiet.current = false; return; }
    sound.reveal();
    setFlash(Date.now());
    celebrate();
  }, [phase, index, stage]);
  useEffect(() => {
    if (flash === null) return;
    const t = window.setTimeout(() => setFlash(null), 2300);
    return () => clearTimeout(t);
  }, [flash]);
  useEffect(() => {
    if (stage !== 'finale') return;
    sound.finale();
    if (reducedMotion()) return;
    const end = Date.now() + 3200;
    let n = 0;
    (function f() {
      confetti({ particleCount: 5, angle: 60, spread: 60, origin: { x: 0 }, colors: COLORS });
      confetti({ particleCount: 5, angle: 120, spread: 60, origin: { x: 1 }, colors: COLORS });
      if (n++ % 12 === 0) confetti({ particleCount: 8, spread: 160, startVelocity: 30, origin: { y: 0.3 }, shapes: codeShapes(), scalar: 2.2, flat: true });
      if (Date.now() < end) requestAnimationFrame(f);
    })();
  }, [stage]);

  // Candidats affichés pendant la recherche : les parrains qui ont encore des binômes à révéler
  const remaining = useMemo(() => {
    const seen = new Map<string, StudentRef>();
    order.slice(Math.max(0, index - 1)).forEach((p) => seen.set(p.sponsor.id, p.sponsor));
    return [...seen.values()];
  }, [order, index]);

  /* ── Écrans ── */

  if (stage === 'loading') return (
    <Frame title="parrainage.sh" rain={0}>
      <div className="sv-center"><p className="sv-term"><span className="sv-prompt">$</span> chargement de la session<span className="sv-dots" /></p></div>
    </Frame>
  );
  if (stage === 'error') return (
    <Frame title="parrainage.sh" status="error" rain={0}>
      <div className="sv-center"><p className="sv-term sv-err">✗ {error}</p></div>
    </Frame>
  );
  if (stage === 'intro') return <Intro order={order} room={room} onStart={start} />;
  if (stage === 'finale') return <Finale pairings={order} />;

  const cur = index > 0 ? order[index - 1] : null;
  const total = cur ? order.filter((p) => p.sponsor.id === cur.sponsor.id).length : 0;
  const nth = cur ? order.slice(0, index).filter((p) => p.sponsor.id === cur.sponsor.id).length : 0;
  const done = order.slice(0, index - (phase < 2 ? 1 : 0)).reverse();

  return (
    <Frame
      title={cur ? `binome_${pad(index)}.ts` : 'parrainage.sh'}
      status={!cur ? 'idle' : phase === 0 ? 'loading' : phase === 1 ? 'matching' : 'matched'}
      progress={{ index, total: order.length }}
      rain={cur && phase === 1 ? 1 : 0}
    >
      {!cur ? (
        <div className="sv-center">
          <p className="sv-term big"><span className="sv-prompt">$</span> prêt<span className="sv-caret" /></p>
          <p className="sv-hint">// appuyez sur suivant pour révéler le premier binôme</p>
        </div>
      ) : (
        <Duo key={cur.id} pairing={cur} index={index} phase={phase} pool={remaining} nth={nth} total={total} instant={quiet.current} />
      )}

      <AnimatePresence>
        {flash !== null && <MatchFlash key={flash} />}
      </AnimatePresence>

      <footer className="sv-log">
        <span className="sv-log-title">git log --oneline</span>
        <div className="sv-log-list">
          {done.length === 0 && <span className="sv-muted">// aucun binôme pour l'instant</span>}
          {done.map((p) => (
            <motion.span className="sv-commit" key={p.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              <b>{hash(p.id)}</b> {p.mentee.firstName} <i>⇄</i> {p.sponsor.firstName}
            </motion.span>
          ))}
        </div>
      </footer>
    </Frame>
  );
}

/* ── Cadre commun : fenêtre d'éditeur plein écran + pluie de code en fond ── */

function Frame({ title, status, progress, rain = 0, children }: {
  title: string; status?: string; progress?: { index: number; total: number }; rain?: number; children: React.ReactNode;
}) {
  return (
    <div className="sv">
      <div className="sv-grid" aria-hidden />
      <CodeRain intensity={rain} />
      <header className="sv-bar">
        <span className="sv-dot" /><span className="sv-dot" /><span className="sv-dot" />
        <span className="sv-brand"><span className="sv-logo">SJI</span> ~/sji/parrainage/<b>{title}</b></span>
        <span className="sv-bar-right">
          {progress && (
            <span className="sv-progress" title={`${progress.index} / ${progress.total}`}>
              <span className="sv-progress-bar"><span style={{ width: `${progress.total ? (progress.index / progress.total) * 100 : 0}%` }} /></span>
              <span className="sv-progress-txt">{pad(progress.index)}<i>/{pad(progress.total)}</i></span>
            </span>
          )}
          {status && <span className={`sv-status is-${status}`}>{status}</span>}
        </span>
      </header>
      <main className="sv-main">{children}</main>
    </div>
  );
}

/** Pluie de caractères (binaire / hexadécimal) très légère, qui s'intensifie pendant la recherche. */
function CodeRain({ intensity }: { intensity: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const target = useRef(intensity);
  target.current = intensity;

  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g || reducedMotion()) return;
    const FS = 16, TRAIL = 16;
    const rand = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    let W = 0, H = 0;
    let cols: { y: number; speed: number; chars: string[] }[] = [];
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Array.from({ length: Math.ceil(W / FS) }, () => ({
        y: Math.random() * H * 1.5 - H * 0.5,
        speed: 0.4 + Math.random() * 1.1,
        chars: Array.from({ length: TRAIL }, rand),
      }));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0, last = performance.now(), level = target.current;
    const frame = (now: number) => {
      const dt = Math.min(50, now - last); last = now;
      level += (target.current - level) * 0.04; // transition douce
      g.clearRect(0, 0, W, H);
      g.font = `${FS - 3}px "JetBrains Mono", monospace`;
      const base = 0.045 + 0.14 * level;
      cols.forEach((col, i) => {
        col.y += col.speed * dt * 0.05 * (1 + level * 3);
        if (col.y - TRAIL * FS > H) col.y = -Math.random() * 300;
        if (Math.random() < 0.04 + level * 0.1) col.chars[Math.floor(Math.random() * TRAIL)] = rand();
        for (let j = 0; j < TRAIL; j++) {
          const y = col.y - j * FS;
          if (y < -FS || y > H + FS) continue;
          const a = base * (1 - j / TRAIL) * (j === 0 ? 2.4 : 1);
          g.fillStyle = j === 0 && level > 0.5 ? `rgba(202,138,4,${a})` : `rgba(29,78,216,${a})`;
          g.fillText(col.chars[j], i * FS, y);
        }
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={ref} className="sv-rain" aria-hidden />;
}

/* ── Effets de texte et d'image ── */

/** Texte qui se « décode » caractère par caractère. */
function Scramble({ text, duration = 900, delay = 0, instant = false }: { text: string; duration?: number; delay?: number; instant?: boolean }) {
  const [skip] = useState(() => instant || reducedMotion());
  const [out, setOut] = useState(skip ? text : '');
  useEffect(() => {
    if (skip) return;
    let raf = 0;
    const t0 = performance.now() + delay;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - t0) / duration));
      const fixed = Math.floor(p * text.length);
      let s = '';
      for (let i = 0; i < text.length; i++) {
        s += i < fixed || text[i] === ' ' ? text[i] : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      setOut(s);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, duration, delay, skip]);
  return <span className="sv-scramble">{out}</span>;
}

/** Photo qui apparaît par pixellisation décroissante (comme une image en cours de chargement). */
function PixelPhoto({ s, instant = false, delay = 0 }: { s: StudentRef; instant?: boolean; delay?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [skip] = useState(() => instant || reducedMotion());
  const [failed, setFailed] = useState(!s.profilePictureUrl);

  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g || !s.profilePictureUrl) return;
    const W = canvas.width, H = canvas.height;
    const small = document.createElement('canvas');
    const sg = small.getContext('2d')!;
    const img = new Image();
    let raf = 0, timer = 0;
    const STEPS = [48, 32, 24, 16, 12, 8, 6, 4, 3, 2, 1];
    const DUR = 1300;

    img.onload = () => {
      const k = Math.max(W / img.width, H / img.height);
      const sw = W / k, sh = H / k, sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
      const draw = (block: number) => {
        g.clearRect(0, 0, W, H);
        if (block <= 1) { g.imageSmoothingEnabled = true; g.drawImage(img, sx, sy, sw, sh, 0, 0, W, H); return; }
        const w = Math.max(1, Math.ceil(W / block)), h = Math.max(1, Math.ceil(H / block));
        small.width = w; small.height = h;
        sg.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
        g.imageSmoothingEnabled = false;
        g.drawImage(small, 0, 0, w, h, 0, 0, W, H);
      };
      if (skip) return draw(1);
      draw(STEPS[0]);
      timer = window.setTimeout(() => {
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - t0) / DUR);
          draw(STEPS[Math.min(STEPS.length - 1, Math.floor(p * STEPS.length))]);
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      }, delay);
    };
    img.onerror = () => setFailed(true);
    img.src = s.profilePictureUrl;
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [s.profilePictureUrl, skip, delay]);

  if (failed) return <span className="sv-initials"><Scramble text={initials(s)} duration={700} delay={delay} instant={skip} /></span>;
  return <canvas ref={ref} width={720} height={900} className="sv-canvas" />;
}

/* ── Intro : séquence de démarrage façon terminal ── */

const ASCII_SJI = [
  '███████╗     ██╗██╗',
  '██╔════╝     ██║██║',
  '███████╗     ██║██║',
  '╚════██║██   ██║██║',
  '███████║╚█████╔╝██║',
  '╚══════╝ ╚════╝ ╚═╝',
].join('\n');

type BootLine = { k: 'cmd' | 'out' | 'bar' | 'ok' | 'cmt'; t: string; v?: string };

function Intro({ order, room, onStart }: { order: Pairing[]; room: string; onStart: () => void }) {
  const lines: BootLine[] = [
    { k: 'cmd', t: '$ ssh root@parrainage.sji' },
    { k: 'out', t: '> connexion établie · TLS 1.3 · clé ed25519' },
    { k: 'cmd', t: '$ npm run parrainage -- --promo=ING3' },
    { k: 'cmt', t: '// Saint Jean Ingénieur · programme de parrainage' },
  ];
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= lines.length) return;
    const t = window.setTimeout(() => setShown((n) => n + 1), shown === 0 ? 600 : lines[shown - 1].k === 'bar' ? 950 : 550);
    return () => clearTimeout(t);
  }, [shown, lines]);
  const ready = shown >= lines.length;

  return (
    <Frame title="parrainage.sh" status={ready ? 'ready' : 'booting'} rain={ready ? 0 : 0.4}>
      <div className="sv-intro">
        <pre className="sv-ascii" data-text={ASCII_SJI}>{ASCII_SJI}</pre>
        <h1 className="sv-title">
          <span className="sv-kw">await</span> parrainage<span className="sv-op">.</span><span className="sv-fn">reveal</span><span className="sv-op">()</span>
        </h1>
        <div className="sv-boot">
          {lines.slice(0, shown).map((l, i) => (
            <motion.p key={i} className={`sv-boot-${l.k}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
              <span className="sv-ln">{pad(i + 1)}</span>
              {l.k === 'bar' ? <>&gt; {l.t}… <span className="sv-check">✓ {l.v}</span></> : l.k === 'ok' ? <><span className="sv-check">✓</span> {l.t}</> : l.t}
            </motion.p>
          ))}
          {!ready && <span className="sv-caret" />}
        </div>
        <motion.button className="sv-run" onClick={onStart} initial={{ opacity: 0, y: 10 }} animate={{ opacity: ready ? 1 : 0.3, y: 0 }}>
          ▶ run show()
        </motion.button>
        <p className="sv-hint">
          télécommande : <b>{location.origin}/remote?room={room}</b><br />
          clavier : espace suivant · ← retour · M son · F tableau final · R rejouer
        </p>
      </div>
    </Frame>
  );
}

/* ── Binôme en cours ── */

type LogLine = { k: 'cmd' | 'rej' | 'ok' | 'out'; t: string };

/** Déroulé de la recherche : un curseur teste les parrains en ralentissant, puis se verrouille sur le bon. */
function useMatchRun(pool: StudentRef[], targetId: string, active: boolean, mentee: StudentRef) {
  const [cursor, setCursor] = useState(-1);
  const [rejected, setRejected] = useState<number[]>([]);
  const [locked, setLocked] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);

  useEffect(() => {
    if (!active) return;
    const targetIdx = pool.findIndex((p) => p.id === targetId);
    const others = pool.map((_, i) => i).filter((i) => i !== targetIdx);
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    const push = (l: LogLine) => setLog((x) => [...x.slice(-5), l]);
    const secs = (ms: number) => `[${(ms / 1000).toFixed(2)}s]`;

    push({ k: 'cmd', t: `> match(filleul: "${short(mentee)}", parrains: ${pool.length})` });
    at(220, () => push({ k: 'out', t: '> seed = crypto.getRandomValues() · tirage en cours' }));

    // Pas de plus en plus lents, comme une roue qui s'arrête (~220 ms → ~800 ms)
    const BUDGET = 6400;
    let t = 450, k = 0, prevIdx = -1;
    while (others.length) {
      const d = 220 + 580 * Math.pow(k / 14, 2);
      if (t + d > BUDGET || k > 40) break;
      t += d; k++;
      let i = others[Math.floor(Math.random() * others.length)];
      if (others.length > 1) while (i === prevIdx) i = others[Math.floor(Math.random() * others.length)];
      prevIdx = i;
      const when = t, idx = i;
      at(when, () => {
        setCursor(idx);
        setRejected((r) => (r.includes(idx) ? r : [...r, idx]));
        sound.step(Math.min(1, when / BUDGET));
        const score = (0.18 + Math.random() * 0.6).toFixed(2);
        push({ k: 'rej', t: `${secs(when)} eval #${pad(idx + 1)} ${short(pool[idx]).padEnd(14)} → ${score} ✗` });
      });
    }
    const lockAt = Math.max(t + 700, 1600);
    at(lockAt, () => {
      setCursor(targetIdx);
      setLocked(true);
      sound.lock();
      push({ k: 'ok', t: `${secs(lockAt)} eval #${pad(targetIdx + 1)} ${short(pool[targetIdx]).padEnd(14)} → 0.99 ✓ MATCH` });
    });
    return () => timers.forEach(clearTimeout);
  }, [active, pool, targetId, mentee]);

  return { cursor, rejected, locked, log, iter: rejected.length + (locked ? 1 : 0) };
}

/** Les parrains montrés pendant la recherche (le bon parrain est toujours dedans). */
function pickPool(all: StudentRef[], target: StudentRef): StudentRef[] {
  const others = shuffle(all.filter((m) => m.id !== target.id)).slice(0, POOL_MAX - 1);
  const at = Math.floor(Math.random() * (others.length + 1));
  return [...others.slice(0, at), target, ...others.slice(at)];
}

/**
 * Un binôme : le filleul est fixé à gauche, puis les parrains défilent à droite
 * jusqu'au match. La carte de droite n'est jamais remplacée : elle se fige au
 * match, puis la photo du parrain apparaît en fondu.
 */
function Duo({ pairing, index, phase, pool: allSponsors, nth, total, instant }: {
  pairing: Pairing; index: number; phase: number; pool: StudentRef[]; nth: number; total: number; instant: boolean;
}) {
  const { sponsor, mentee } = pairing;
  const pool = useMemo(() => pickPool(allSponsors, sponsor), [allSponsors, sponsor]);
  const run = useMatchRun(pool, sponsor.id, phase === 1, mentee);
  const [quiet] = useState(instant);

  // Son de chargement, calé sur la dépixellisation de la photo du filleul
  useEffect(() => {
    if (phase === 0 && !quiet) sound.load();
  }, [phase, quiet]);

  const consoleLines: LogLine[] =
    phase === 0
      ? [
          { k: 'cmd', t: `$ SELECT * FROM filleuls WHERE id = '${hash(mentee.id)}';` },
          { k: 'out', t: `> 1 row · ${mentee.firstName} ${mentee.lastName} · ING3` },
        ]
      : phase === 1
        ? run.log
        : [
            { k: 'ok', t: `✓ match(${short(mentee)}, ${short(sponsor)}) → true` },
            { k: 'out', t: `> commit ${hash(pairing.id)} · binome_${pad(index)} enregistré` },
          ];

  // QR codes affichés après la révélation : chacun scanne celui de l'autre pour lui écrire
  const menteeWa = waLink(
    mentee.whatsapp,
    `Salut ${mentee.firstName} ! Je suis ${sponsor.firstName} ${sponsor.lastName}, ton parrain du programme de parrainage SJI 👋`,
  );
  const sponsorWa = waLink(
    sponsor.whatsapp,
    `Bonjour ${sponsor.firstName} ! Je suis ${mentee.firstName} ${mentee.lastName}, ton filleul du programme de parrainage SJI 👋`,
  );

  // Au match (ou si l'on saute la recherche), la carte affiche directement le bon parrain
  const candidate = phase === 2 ? sponsor : run.cursor >= 0 ? pool[run.cursor] : null;
  const locked = phase === 2 || run.locked;

  return (
    <div className="sv-stage">
      <div className="sv-duo">
        <motion.div className="sv-left" initial={quiet ? false : { opacity: 0, x: -60 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, ease: [0.2, 0.7, 0.2, 1] }}>
          <Card s={mentee} role="filleul" instant={quiet} back={phase === 2 ? { link: menteeWa, who: mentee, label: 'filleul' } : undefined} />
        </motion.div>

        <Link phase={phase} iter={run.iter} />

        <div className="sv-slot">
          <AnimatePresence mode="wait" initial={false}>
            {phase === 0 ? (
              <motion.div key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Placeholder />
              </motion.div>
            ) : (
              <motion.div key="match" initial={quiet ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                <MatchCard
                  candidate={candidate}
                  index={phase === 2 ? -1 : run.cursor}
                  locked={locked}
                  revealed={phase === 2}
                  instant={quiet}
                  note={total > 1 ? `filleul ${nth}/${total}` : undefined}
                  back={phase === 2 ? { link: sponsorWa, who: sponsor, label: 'parrain' } : undefined}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="sv-console" aria-live="polite">
        {consoleLines.map((l, i) => (
          <p key={`${phase}-${i}-${l.t}`} className={`sv-c-${l.k}`}>{l.t}</p>
        ))}
        {phase === 2 && <p className="sv-c-out">// clique sur une carte pour afficher son QR code WhatsApp</p>}
      </div>
    </div>
  );
}

type BackProps = { link: string | null; who: StudentRef; label: 'filleul' | 'parrain' };

function Card({ s, role, note, accent, instant, delay = 0, back }: {
  s: StudentRef; role: 'parrain' | 'filleul'; note?: string; accent?: boolean; instant?: boolean; delay?: number; back?: BackProps;
}) {
  return (
    <figure className={`sv-card${accent ? ' accent' : ''}`}>
      <Flip back={back}>
        <div className="sv-photo">
          <i className="c tl" /><i className="c tr" /><i className="c bl" /><i className="c br" />
          <PixelPhoto s={s} instant={instant} delay={delay} />
          {!instant && <span className="sv-scanline" />}
        </div>
      </Flip>
      <figcaption>
        <code className="sv-role"><span className="sv-kw">const</span> {role} <span className="sv-op">=</span></code>
        <h2>
          <Scramble text={s.firstName} duration={700} delay={delay + 200} instant={instant} />{' '}
          <em><Scramble text={s.lastName} duration={800} delay={delay + 450} instant={instant} /></em>
        </h2>
        <code className="sv-meta">{role === 'parrain' ? 'ING4' : 'ING3'}{note ? ` · ${note}` : ''}</code>
      </figcaption>
    </figure>
  );
}

function Placeholder() {
  return (
    <figure className="sv-card searching">
      <div className="sv-photo"><span className="sv-q">?</span></div>
      <figcaption>
        <code className="sv-role"><span className="sv-kw">let</span> parrain <span className="sv-op">=</span></code>
        <h2><span className="sv-muted">undefined</span></h2>
        <code className="sv-meta muted">en attente</code>
      </figcaption>
    </figure>
  );
}

/**
 * Carte du parrain, de la recherche jusqu'à la révélation, sans jamais être remplacée :
 * les initiales défilent, se figent au match, puis la photo apparaît en fondu par-dessus.
 */
function MatchCard({ candidate, index, locked, revealed, instant, note, back }: {
  candidate: StudentRef | null; index: number; locked: boolean; revealed: boolean; instant: boolean; note?: string; back?: BackProps;
}) {
  const photo = revealed ? candidate?.profilePictureUrl : null;
  return (
    <figure className={`sv-card searching${locked ? ' locked' : ''}${revealed ? ' revealed' : ''}${instant ? ' instant' : ''}`}>
      <Flip back={back}>
      <div className="sv-photo">
        <i className="c tl" /><i className="c tr" /><i className="c bl" /><i className="c br" />
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={candidate?.id ?? 'none'}
            className="sv-reel-ini"
            initial={{ y: '-60%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            exit={{ y: '60%', opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {candidate ? initials(candidate) : '?'}
          </motion.span>
        </AnimatePresence>
        {photo && <img className="sv-reveal-img" src={photo} alt="" />}
        {!locked && <code className="sv-reel-idx">{index >= 0 ? `candidat #${pad(index + 1)}` : 'seed…'}</code>}
        {!locked && <span className="sv-scan" />}
      </div>
      </Flip>
      <figcaption>
        <code className="sv-role"><span className="sv-kw">{revealed ? 'const' : 'let'}</span> parrain <span className="sv-op">=</span></code>
        <h2 className="sv-reel-name">
          {candidate ? <>{candidate.firstName} <em>{candidate.lastName}</em></> : <span className="sv-muted">undefined</span>}
        </h2>
        <code className="sv-meta">{revealed ? `ING4${note ? ` · ${note}` : ''}` : locked ? '✓ trouvé' : <>match()<span className="sv-dots" /></>}</code>
      </figcaption>
    </figure>
  );
}

/** Logo SJI au centre du QR code (le QR est généré avec une correction d'erreur élevée). */
const SJI_LOGO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40"><rect width="60" height="40" rx="7" fill="#1D4ED8"/>' +
      '<rect y="34" width="60" height="6" fill="#FACC15"/><text x="30" y="26" text-anchor="middle" ' +
      'font-family="JetBrains Mono, Consolas, monospace" font-weight="700" font-size="20" fill="#fff">SJI</text></svg>',
  );

/**
 * Zone photo retournable : une fois la carte révélée, un clic la fait pivoter
 * pour montrer le QR code WhatsApp au dos. Sans `back`, la photo reste fixe.
 */
function Flip({ back, children }: { back?: BackProps; children: React.ReactNode }) {
  const [flipped, setFlipped] = useState(false);
  const toggle = () => {
    if (!back) return;
    sound.flip();
    setFlipped((f) => !f);
  };
  return (
    <div
      className={`sv-flip${back ? ' can-flip' : ''}${flipped && back ? ' flipped' : ''}`}
      onClick={toggle}
      role={back ? 'button' : undefined}
      aria-label={back ? (flipped ? 'Revenir à la photo' : `Afficher le QR code WhatsApp de ${back.who.firstName}`) : undefined}
    >
      <div className="sv-flip-inner">
        <div className="sv-face front">
          {children}
          {back && <span className="sv-flip-hint">⟲ qr</span>}
        </div>
        {back && (
          <div className="sv-face back">
            <QrBack {...back} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Dos de carte : grand QR code WhatsApp aux couleurs SJI. */
function QrBack({ link, who, label }: BackProps) {
  const shown = link?.replace(/^https:\/\//, '').replace(/\?.*$/, '');
  return (
    <div className="sv-qrback">
      <code className="sv-qrback-head">
        <span className="sv-kw">const</span> {label}<span className="sv-op">.</span><span className="sv-fn">whatsapp</span>
      </code>
      {link ? (
        <div className="sv-qr">
          <i className="c tl" /><i className="c tr" /><i className="c bl" /><i className="c br" />
          <QRCodeSVG
            value={link}
            size={512}
            level="H"
            marginSize={0}
            fgColor="#1D4ED8"
            bgColor="#FFFFFF"
            imageSettings={{ src: SJI_LOGO, width: 132, height: 88, excavate: true }}
          />
        </div>
      ) : (
        <div className="sv-qr empty"><span>null</span></div>
      )}
      {shown ? <code className="sv-str">"{shown}"</code> : <code className="sv-muted">whatsapp: null</code>}
      <code className="sv-c-cmt">{link ? `// scanne pour écrire à ${who.firstName}` : '// profil non complété'}</code>
    </div>
  );
}

/** Lien entre les deux cartes : paquets de données pendant la recherche, ligne pleine au match. */
function Link({ phase, iter }: { phase: number; iter: number }) {
  return (
    <div className={`sv-link phase-${phase}`}>
      <div className="sv-wire">
        <span className="sv-wire-fill" />
        {phase === 1 && [0, 1, 2, 3].map((i) => <span key={`r${i}`} className="sv-packet" style={{ animationDelay: `${i * 0.22}s` }} />)}
        {phase === 1 && [0, 1].map((i) => <span key={`l${i}`} className="sv-packet back" style={{ animationDelay: `${0.1 + i * 0.35}s` }} />)}
        {phase === 2 && [0, 1, 2, 3, 4].map((i) => <span key={`b${i}`} className="sv-packet burst" style={{ animationDelay: `${i * 0.08}s` }} />)}
      </div>
      <code className="sv-link-label">
        {phase === 0 && <>await load(parrain)<span className="sv-dots" /></>}
        {phase === 1 && <>matching · iter {pad(iter, 3)}<span className="sv-dots" /></>}
        {phase === 2 && '⇄ matched'}
      </code>
    </div>
  );
}

/** Au moment du match : une lueur douce derrière les cartes (opacité seulement, pour rester fluide). */
function MatchFlash() {
  return (
    <motion.div className="sv-flash" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} aria-hidden>
      <span className="sv-glow" />
    </motion.div>
  );
}

/* ── Final : remerciements ── */

function Finale({ pairings }: { pairings: Pairing[] }) {
  const sponsors = new Set(pairings.map((p) => p.sponsor.id)).size;
  return (
    <Frame title="merci.ts" status="done">
      <div className="sv-thanks">
        <motion.h1 className="sv-title" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <span className="sv-kw">return</span> <span className="sv-fn">merci</span><span className="sv-op">(</span>tous<span className="sv-op">);</span>
        </motion.h1>
        <motion.p className="sv-thanks-text" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.8 }}>
          Merci à chacun pour sa participation.<br />
          Aux <b>{sponsors} parrains</b> pour leur engagement, et aux <b>{pairings.length} filleuls</b> : bienvenue dans la famille SJI.
        </motion.p>
        <motion.p className="sv-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>
          <span className="sv-check">✓</span> process exited with code 0
        </motion.p>
      </div>
    </Frame>
  );
}
