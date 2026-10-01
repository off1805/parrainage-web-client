import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api, ApiError } from '../lib/api';
import { describeError } from '../lib/errors';
import { supabase } from '../lib/supabase';
import { compressImage } from '../lib/image';
import type { InvitationPreview } from '../lib/types';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import './invitation.css';

// Numéro camerounais : 9 chiffres commençant par 6. L'indicatif est ajouté à l'envoi.
const WHATSAPP_RE = /^6\d{8}$/;
const COUNTRY_CODE = '+237';

function formatWhatsapp(digits: string): string {
  // 6XX XX XX XX
  return [digits.slice(0, 3), digits.slice(3, 5), digits.slice(5, 7), digits.slice(7, 9)].filter(Boolean).join(' ');
}
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type Screen =
  | { kind: 'no-token' }
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'already-used' }
  | { kind: 'expired' }
  | { kind: 'cancelled' }
  | { kind: 'network-error'; message: string }
  | { kind: 'form'; preview: InvitationPreview }
  | { kind: 'success'; firstName: string; photoUrl: string };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function classifyError(e: unknown): Screen {
  if (!(e instanceof ApiError)) {
    return { kind: 'network-error', message: describeError(e) };
  }
  if (e.status === 0) {
    return { kind: 'network-error', message: describeError(e) };
  }
  if (e.status === 400 || e.status === 404) {
    return { kind: 'not-found' };
  }
  if (e.status === 410) {
    const msg = e.message.toLowerCase();
    if (msg.includes('déjà utilisée') || msg.includes('deja utilisee')) return { kind: 'already-used' };
    if (msg.includes('expiré') || msg.includes('expire')) return { kind: 'expired' };
    if (msg.includes('annulée') || msg.includes('annulee')) return { kind: 'cancelled' };
    return { kind: 'already-used' };
  }
  return { kind: 'network-error', message: describeError(e) };
}

export default function Invitation() {
  const [params] = useSearchParams();
  const token = params.get('token');

  const [screen, setScreen] = useState<Screen>(
    token ? { kind: 'loading' } : { kind: 'no-token' },
  );

  // Form state
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [whatsapp, setWhatsapp] = useState('');
  const [whatsappError, setWhatsappError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [sending, setSending] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [sendError, setSendError] = useState('');

  // Keep uploaded URL across retries so we don't re-upload
  const uploadedUrl = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setScreen({ kind: 'loading' });
    try {
      const preview = await api.invitations.verify(token);
      setScreen({ kind: 'form', preview });
    } catch (e: unknown) {
      setScreen(classifyError(e));
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Cleanup photo preview URL
  useEffect(() => {
    return () => { if (photoPreview) URL.revokeObjectURL(photoPreview); };
  }, [photoPreview]);

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    setPhotoError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setPhotoError('Format accepté : JPEG, PNG ou WebP.');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setPhotoError('La photo ne doit pas dépasser 8 Mo.');
      e.target.value = '';
      return;
    }

    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    // Reset uploaded URL if user changes photo
    uploadedUrl.current = null;
  }

  function handleWhatsapp(value: string) {
    // On ne garde que les chiffres, 9 au maximum
    let digits = value.replace(/\D/g, '');
    // Numéro collé avec l'indicatif (+237 / 00237) : on le retire, il est ajouté à l'envoi
    digits = digits.replace(/^(00)?237(?=6)/, '').slice(0, 9);
    setWhatsapp(digits);
    if (digits && digits[0] !== '6') {
      setWhatsappError('Le numéro doit commencer par 6.');
    } else if (digits.length === 9 && !WHATSAPP_RE.test(digits)) {
      setWhatsappError('Numéro invalide. Exemple : 6XX XX XX XX');
    } else {
      setWhatsappError('');
    }
  }

  const isValid = photo && WHATSAPP_RE.test(whatsapp) && !sending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !photo || !isValid) return;

    setSending(true);
    setSendError('');

    try {
      // 1) Upload to Supabase (unless already done)
      let publicUrl = uploadedUrl.current;
      if (!publicUrl) {
        if (!supabase) {
          setSendError('Configuration Supabase manquante. Contacte l\'équipe.');
          setSending(false);
          return;
        }

        const compressed = await compressImage(photo);
        const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('profil')
          .upload(filename, compressed, { contentType: 'image/jpeg' });

        if (uploadError) {
          setSendError(`Échec de l'envoi de la photo : ${uploadError.message}`);
          setSending(false);
          return;
        }

        const { data } = supabase.storage
          .from('profil')
          .getPublicUrl(filename);

        publicUrl = data.publicUrl;
        uploadedUrl.current = publicUrl;
      }

      // 2) Complete profile
      await api.invitations.complete({
        token,
        profilePictureUrl: publicUrl,
        whatsapp: COUNTRY_CODE + whatsapp,
      });

      setScreen({
        kind: 'success',
        firstName: screen.kind === 'form' ? screen.preview.firstName : '',
        photoUrl: publicUrl,
      });
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 410) {
        setScreen(classifyError(err));
        return;
      }
      setSendError(describeError(err));
    } finally {
      setSending(false);
    }
  }

  /* ── Screens ── */

  if (screen.kind === 'no-token') {
    return (
      <Shell path="invitation" status="error">
        <h1 className="inv-title">Oups<span className="inv-cursor">_</span></h1>
        <p className="inv-text">Ce lien est invalide. Vérifie l'adresse dans ton email.</p>
      </Shell>
    );
  }

  if (screen.kind === 'loading') {
    return (
      <Shell path="invitation --verify">
        <p className="inv-text inv-pulse"><span className="inv-prompt">$</span> Vérification en cours…</p>
        <div className="inv-loader"><span /></div>
      </Shell>
    );
  }

  if (screen.kind === 'not-found') {
    return (
      <Shell path="invitation" status="404">
        <h1 className="inv-title">Lien introuvable</h1>
        <p className="inv-text">Ce lien n'existe pas ou est incomplet. Vérifie que tu as bien copié l'adresse depuis ton email.</p>
      </Shell>
    );
  }

  if (screen.kind === 'already-used') {
    return (
      <Shell path="invitation" status="done">
        <h1 className="inv-title">Déjà envoyé <span className="inv-ok">✓</span></h1>
        <p className="inv-text">Tu as déjà envoyé ton profil, merci ! On se retrouve le jour J.</p>
      </Shell>
    );
  }

  if (screen.kind === 'expired') {
    return (
      <Shell path="invitation" status="410">
        <h1 className="inv-title">Lien expiré</h1>
        <p className="inv-text">Ce lien a expiré, demande-en un nouveau à l'équipe.</p>
      </Shell>
    );
  }

  if (screen.kind === 'cancelled') {
    return (
      <Shell path="invitation" status="410">
        <h1 className="inv-title">Lien remplacé</h1>
        <p className="inv-text">Ce lien a été remplacé, utilise le dernier email reçu.</p>
      </Shell>
    );
  }

  if (screen.kind === 'network-error') {
    return (
      <Shell path="invitation" status="error">
        <h1 className="inv-title">Erreur</h1>
        <p className="inv-text">{screen.message}</p>
        <button className="inv-btn inv-btn-primary" onClick={load}>Réessayer</button>
      </Shell>
    );
  }

  if (screen.kind === 'success') {
    return <Success firstName={screen.firstName} photoUrl={screen.photoUrl} />;
  }

  /* ── Form ── */
  const { preview } = screen;

  return (
    <Shell path="profil.ts" status={introDone ? 'ready' : 'running'}>
      <Script
        lines={[
          [{ t: '$ ', c: 'prompt' }, { t: 'node ', c: 'fn' }, { t: 'parrainage.js --invite ', c: 'plain' }, { t: preview.firstName.toLowerCase(), c: 'str' }],
          [{ t: '> ', c: 'arrow' }, { t: 'Bonjour ', c: 'plain' }, { t: preview.firstName, c: 'name' }, { t: ' 👋', c: 'plain' }],
          [{ t: '> ', c: 'arrow' }, { t: 'Bienvenue dans le programme de parrainage de Saint Jean Ingénieur.', c: 'plain' }],
          [{ t: '> ', c: 'arrow' }, { t: 'Ici, les aînés guident les nouveaux : un parrain, un filleul, un binôme.', c: 'plain' }],
          [{ t: '> ', c: 'arrow' }, { t: 'Pour créer ta carte, il nous manque juste deux variables.', c: 'plain' }],
          [{ t: '// deadline : ', c: 'comment' }, { t: formatDate(preview.expiresAt), c: 'comment-strong' }],
        ]}
        onDone={() => setIntroDone(true)}
      />

      {introDone && (
        <motion.form
          className="inv-form"
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          {/* Photo */}
          <label className="inv-code-label" htmlFor="inv-photo-input">
            <span className="tk-kw">const</span> <span className="tk-var">photo</span>
            <span className="tk-op">:</span> <span className="tk-type">Image</span> <span className="tk-op">=</span>
            <span className="tk-fn"> upload</span><span className="tk-op">(</span><span className="tk-op">)</span>
          </label>
          <p className="inv-hint">// ta plus belle photo, visage bien visible</p>
          <div className="inv-photo-zone">
            <label htmlFor="inv-photo-input" className={`inv-photo${photoPreview ? ' has-photo' : ''}`}>
              <i className="c tl" /><i className="c tr" /><i className="c bl" /><i className="c br" />
              {photoPreview ? (
                <img src={photoPreview} alt="Aperçu" />
              ) : (
                <span className="inv-photo-empty">
                  <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
                  <span>null</span>
                </span>
              )}
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhoto}
              className="inv-file-input"
              id="inv-photo-input"
            />
            <label htmlFor="inv-photo-input" className="inv-btn inv-btn-outline">
              {photo ? 'changer_photo()' : 'choisir_photo()'}
            </label>
            {photoError && <p className="inv-error">✗ {photoError}</p>}
          </div>

          {/* WhatsApp */}
          <label className="inv-code-label" htmlFor="inv-whatsapp">
            <span className="tk-kw">let</span> <span className="tk-var">whatsapp</span>
            <span className="tk-op">:</span> <span className="tk-type">string</span> <span className="tk-op">=</span>
          </label>
          <div className="inv-input-wrap">
            <span className="tk-str" aria-hidden>"</span>
            <span className="inv-prefix" title="Indicatif ajouté automatiquement">{COUNTRY_CODE}</span>
            <input
              id="inv-whatsapp"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              className="inv-input"
              placeholder="6XX XX XX XX"
              value={formatWhatsapp(whatsapp)}
              onChange={(e) => handleWhatsapp(e.target.value)}
            />
            <span className="tk-str" aria-hidden>";</span>
          </div>
          {whatsappError && <p className="inv-error">✗ {whatsappError}</p>}

          {sendError && <p className="inv-error">✗ {sendError}</p>}

          <button
            type="submit"
            className="inv-btn inv-btn-primary"
            disabled={!isValid}
          >
            {sending ? <>executing<span className="inv-dots" /></> : <><span aria-hidden>▶</span> envoyerProfil()</>}
          </button>
        </motion.form>
      )}
    </Shell>
  );
}

/* ── Intro : un petit discours qui s'affiche comme un script en cours d'exécution ── */

type Token = { t: string; c: string };

function Script({ lines, onDone }: { lines: Token[][]; onDone: () => void }) {
  const total = lines.map((l) => l.reduce((n, tk) => n + tk.t.length, 0));
  const [pos, setPos] = useState({ line: 0, char: 0 });
  const finished = pos.line >= lines.length;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPos({ line: lines.length, char: 0 });
    }
  }, [lines.length]);

  useEffect(() => {
    if (finished) {
      doneRef.current();
      return;
    }
    const lineLen = total[pos.line];
    // Pause en fin de ligne, puis frappe caractère par caractère (la commande est plus rapide)
    const delay = pos.char >= lineLen ? 650 : pos.line === 0 ? 60 : 38;
    const t = window.setTimeout(() => {
      setPos((p) => (p.char >= total[p.line] ? { line: p.line + 1, char: 0 } : { ...p, char: p.char + 1 }));
    }, delay);
    return () => window.clearTimeout(t);
  }, [pos, finished, total]);

  const skip = () => setPos({ line: lines.length, char: 0 });

  return (
    <div className="inv-script" onClick={finished ? undefined : skip} role="log" aria-live="polite">
      {lines.map((line, i) => {
        if (i > pos.line) return null;
        let budget = i < pos.line ? Infinity : pos.char;
        return (
          <div className="inv-line" key={i}>
            <span className="inv-ln">{String(i + 1).padStart(2, '0')}</span>
            <span className="inv-code">
              {line.map((tk, j) => {
                if (budget <= 0) return null;
                const txt = tk.t.slice(0, budget);
                budget -= tk.t.length;
                return <span key={j} className={`tk-${tk.c}`}>{txt}</span>;
              })}
              {(i === pos.line || (finished && i === lines.length - 1)) && <span className="inv-caret" />}
            </span>
          </div>
        );
      })}
      {!finished && <button type="button" className="inv-skip" onClick={skip}>passer ⏭</button>}
    </div>
  );
}

/* ── Mise en page commune : fenêtre façon éditeur de code (carte sur grand écran uniquement) ── */

function Shell({ path, status, children }: { path: string; status?: string; children: React.ReactNode }) {
  return (
    <div className="inv">
      <div className="inv-grid" aria-hidden />
      <header className="inv-brand">
        <span className="inv-logo">SJI</span>
        <span className="inv-brand-text">Saint Jean Ingénieur</span>
      </header>
      <motion.main
        className="inv-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        <div className="inv-bar">
          <span className="inv-dot" /><span className="inv-dot" /><span className="inv-dot" />
          <span className="inv-path">~/sji/parrainage/<b>{path}</b></span>
          {status && <span className={`inv-status is-${status}`}>{status}</span>}
        </div>
        <div className="inv-body">{children}</div>
      </motion.main>
      <footer className="inv-foot">{'</>'} parrainage@sji · v1.0.0</footer>
    </div>
  );
}

/* ── Écran de succès : « build » animé puis révélation de la photo ── */

const BUILD_STEPS = [
  'upload photo.jpg',
  'enregistrement du profil',
  'génération de ta carte',
];
const COLORS = ['#1D4ED8', '#3B82F6', '#FACC15', '#FDE68A', '#0F172A'];

function Success({ firstName, photoUrl }: { firstName: string; photoUrl: string }) {
  const [step, setStep] = useState(0);
  const done = step > BUILD_STEPS.length;

  useEffect(() => {
    if (done) return;
    const t = window.setTimeout(() => setStep((s) => s + 1), step === 0 ? 300 : 550);
    return () => window.clearTimeout(t);
  }, [step, done]);

  useEffect(() => {
    if (!done) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    // Explosion centrale, puis deux canons latéraux pendant ~1,8 s
    confetti({ particleCount: 140, spread: 90, startVelocity: 45, origin: { y: 0.45 }, colors: COLORS });
    const end = Date.now() + 1800;
    let raf = 0;
    const frame = () => {
      confetti({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors: COLORS });
      confetti({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors: COLORS });
      if (Date.now() < end) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); confetti.reset(); };
  }, [done]);

  return (
    <Shell path="profil --complete" status={done ? 'success' : 'running'}>
      <ul className="inv-build">
        {BUILD_STEPS.map((label, i) =>
          i < step ? (
            <motion.li key={label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
              <span className={i + 1 < step ? 'inv-ok' : 'inv-run'}>{i + 1 < step ? '✓' : '›'}</span> {label}
            </motion.li>
          ) : null,
        )}
      </ul>

      {done && (
        <motion.div
          className="inv-success"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="inv-success-photo"
            initial={{ scale: 0.6, rotate: -6, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 14 }}
          >
            <img src={photoUrl} alt="" />
            <motion.span
              className="inv-badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.35, type: 'spring', stiffness: 400, damping: 12 }}
            >
              ✓
            </motion.span>
          </motion.div>
          <motion.h1
            className="inv-title"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            Merci, <span className="inv-name">{firstName}</span> !
          </motion.h1>
          <motion.p
            className="inv-text"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            Ton profil est enregistré. Ta carte apparaîtra le jour&nbsp;J 🎉
          </motion.p>
          <motion.code
            className="inv-exit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            process exited with code 0
          </motion.code>
        </motion.div>
      )}
    </Shell>
  );
}
