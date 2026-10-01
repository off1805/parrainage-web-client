import { useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { describeError } from "../lib/errors";
import type { ImportResult, InvitationOverview, InvitationResult, Student, StudentLevel } from "../lib/types";
import { formatDate, fullName, NoticeBar, profileComplete, SECTION_LABEL, useAction, useLoad, useSection, type Notice } from "./shared";

type LevelChoice = "" | StudentLevel;

function emailSummary(r: InvitationResult) {
  if (r.email.failed.length > 0) return `Invitation créée, mais l'email n'est pas parti : ${r.email.failed[0].reason}`;
  return "Invitation envoyée.";
}

export default function StudentsPage() {
  const section = useSection();
  const students = useLoad(() => api.students.list({ section }));
  const overview = useLoad(() => api.invitations.overview());
  const tracking = useMemo(
    () => new Map((overview.data?.students ?? []).map((o) => [o.studentId, o])),
    [overview.data],
  );
  const [notice, setNotice] = useState<Notice>(null);
  const { busy, run } = useAction(setNotice);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = students.data ?? [];
    if (!q) return all;
    return all.filter((s) =>
      [s.firstName, s.lastName, s.email, s.matricule ?? ""].some((v) => v.toLowerCase().includes(q)),
    );
  }, [students.data, search]);

  const byLevel = (level: StudentLevel) =>
    filtered.filter((s) => s.level === level).sort((a, b) => a.lastName.localeCompare(b.lastName));

  const incomplete = (students.data ?? []).filter((s) => !profileComplete(s));

  function replace(updated: Student) {
    students.setData((list) => list?.map((s) => (s.id === updated.id ? updated : s)) ?? null);
  }

  const invite = (s: Student, resend: boolean) =>
    run(`${resend ? "resend" : "send"}-${s.id}`, async () => {
      const r = resend ? await api.invitations.resend(s.id) : await api.invitations.send(s.id);
      void overview.reload();
      if (r.email.failed.length) {
        setNotice({ kind: "error", text: `${fullName(s)} : ${emailSummary(r)}` });
        return;
      }
      return `${fullName(s)} : ${emailSummary(r)}`;
    });

  const inviteAll = () =>
    run("invite-all", async () => {
      if (!confirm(`Envoyer une invitation aux ${incomplete.length} étudiants dont le profil est incomplet ?`)) return;
      const r = await api.invitations.bulk(incomplete.map((s) => s.id));
      void overview.reload();
      if (r.failed.length) {
        setNotice({ kind: "error", text: `${r.sent}/${r.total} invitation(s) envoyée(s). Échecs : ${r.failed.map((f) => f.email).join(", ")} — ${r.failed[0].reason}` });
        return;
      }
      return `${r.sent} invitation(s) envoyée(s).`;
    });

  return (
    <>
      <div className="adm-columns">
        <AddStudentPanel onAdded={students.reload} />
        <ImportPanel onImported={students.reload} />
      </div>

      <section className="adm-panel">
        <div className="adm-panel-head">
          <h2>Étudiants · section {SECTION_LABEL[section].toLowerCase()}</h2>
          <div className="adm-row">
            <input
              className="adm-input"
              placeholder="Rechercher (nom, email, matricule)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="adm-btn" onClick={() => { students.reload(); overview.reload(); }} disabled={students.loading}>
              Actualiser
            </button>
            <button className="adm-btn primary" onClick={inviteAll} disabled={!incomplete.length || busy !== null}>
              {busy === "invite-all" ? "Envoi…" : `Inviter les profils incomplets (${incomplete.length})`}
            </button>
          </div>
        </div>

        <NoticeBar notice={notice} onClose={() => setNotice(null)} />
        {students.error && <p className="adm-error">{students.error}</p>}
        {students.loading && !students.data && <p className="adm-muted">Chargement…</p>}

        {students.data && (
          <div className="adm-columns">
            <StudentTable
              title="ING4 · Parrains"
              level="ING4"
              rows={byLevel("ING4")}
              busy={busy}
              onInvite={invite}
              tracking={tracking}
              onUpdated={replace}
              setNotice={setNotice}
            />
            <StudentTable
              title="ING3 · Filleuls"
              level="ING3"
              rows={byLevel("ING3")}
              busy={busy}
              onInvite={invite}
              tracking={tracking}
              onUpdated={replace}
              setNotice={setNotice}
            />
          </div>
        )}
      </section>
    </>
  );
}

/* ── Suivi des mails ── */

const DELIVERY: Record<string, { label: string; kind: "ok" | "pending" | "error" }> = {
  requests: { label: "Envoi en cours", kind: "pending" },
  deferred: { label: "Différé", kind: "pending" },
  softBounces: { label: "Rebond temporaire", kind: "pending" },
  delivered: { label: "Délivré ✓", kind: "ok" },
  opened: { label: "Ouvert ✓", kind: "ok" },
  clicks: { label: "Lien cliqué ✓", kind: "ok" },
  hardBounces: { label: "Adresse invalide", kind: "error" },
  invalid: { label: "Adresse invalide", kind: "error" },
  blocked: { label: "Bloqué", kind: "error" },
  error: { label: "Rejeté", kind: "error" },
  spam: { label: "Signalé spam", kind: "error" },
  unsubscribed: { label: "Désinscrit", kind: "error" },
};

const INVITATION: Record<string, string> = {
  PENDING: "Lien envoyé",
  USED: "Profil complété",
  EXPIRED: "Lien expiré",
  CANCELLED: "Lien remplacé",
};

/** Sous les boutons : dernière invitation et état de livraison du mail (via Brevo). */
function MailStatus({ info }: { info?: InvitationOverview["students"][number] }) {
  if (!info?.invitation) return <div className="adm-mail"><span className="adm-badge">Jamais invité</span></div>;
  const inv = info.invitation;
  const d = info.delivery ? DELIVERY[info.delivery.event] ?? { label: info.delivery.event, kind: "pending" as const } : null;
  return (
    <div className="adm-mail" title={info.delivery?.reason ?? undefined}>
      <span className="adm-muted small">{INVITATION[inv.status.toUpperCase()] ?? inv.status} · {formatDate(inv.sentAt)}</span>
      {d && <span className={`adm-badge ${d.kind}`}>{d.label}</span>}
    </div>
  );
}

/* ── Ajout d'un seul étudiant ── */

function AddStudentPanel({ onAdded }: { onAdded: () => void }) {
  const section = useSection();
  const empty = { firstName: "", lastName: "", email: "", matricule: "", level: "ING3" as StudentLevel, maxMentees: "2" };
  const [form, setForm] = useState(empty);
  const [notice, setNotice] = useState<Notice>(null);
  const [sending, setSending] = useState(false);
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setNotice(null);
    try {
      const s = await api.students.create({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        matricule: form.matricule || undefined,
        level: form.level,
        section,
        maxMentees: form.level === "ING4" ? Number(form.maxMentees) : undefined,
      });
      setNotice({ kind: "ok", text: `${fullName(s)} ajouté(e) en ${s.level}.` });
      setForm({ ...empty, level: form.level, maxMentees: form.maxMentees });
      onAdded();
    } catch (err) {
      setNotice({ kind: "error", text: describeError(err) });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="adm-panel">
      <h2>Ajouter un étudiant <span className="adm-muted small">· {SECTION_LABEL[section].toLowerCase()}</span></h2>
      <form className="adm-form-grid" onSubmit={submit}>
        <label className="adm-field"><span>Prénom</span><input className="adm-input" required maxLength={100} value={form.firstName} onChange={set("firstName")} /></label>
        <label className="adm-field"><span>Nom</span><input className="adm-input" required maxLength={100} value={form.lastName} onChange={set("lastName")} /></label>
        <label className="adm-field wide"><span>Email</span><input className="adm-input" type="email" required maxLength={255} value={form.email} onChange={set("email")} /></label>
        <label className="adm-field"><span>Matricule (facultatif)</span><input className="adm-input" maxLength={50} value={form.matricule} onChange={set("matricule")} /></label>
        <label className="adm-field">
          <span>Niveau</span>
          <select className="adm-input" value={form.level} onChange={set("level")}>
            <option value="ING3">ING3 · filleul</option>
            <option value="ING4">ING4 · parrain</option>
          </select>
        </label>
        {form.level === "ING4" && (
          <label className="adm-field"><span>Filleuls max</span><input className="adm-input" type="number" min={1} max={50} required value={form.maxMentees} onChange={set("maxMentees")} /></label>
        )}
        <div className="adm-field wide">
          <button className="adm-btn primary" disabled={sending}>{sending ? "Ajout…" : "Ajouter"}</button>
        </div>
      </form>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
    </section>
  );
}

/* ── Import ── */

function ImportPanel({ onImported }: { onImported: () => void }) {
  const section = useSection();
  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState<LevelChoice>("");
  const [maxMentees, setMaxMentees] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setSending(true);
    setError("");
    setResult(null);
    try {
      const r = await api.students.import(file, {
        level: level || undefined,
        section,
        maxMentees: maxMentees ? Number(maxMentees) : undefined,
      });
      setResult(r);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      onImported();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="adm-panel">
      <h2>Importer une liste <span className="adm-muted small">· {SECTION_LABEL[section].toLowerCase()}</span></h2>
      <form className="adm-form-row" onSubmit={submit}>
        <label className="adm-field">
          <span>Fichier CSV ou XLSX</span>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="adm-field">
          <span>Niveau</span>
          <select className="adm-input" value={level} onChange={(e) => setLevel(e.target.value as LevelChoice)}>
            <option value="">Lu dans le fichier (colonne niveau)</option>
            <option value="ING4">Tout le fichier en ING4 (parrains)</option>
            <option value="ING3">Tout le fichier en ING3 (filleuls)</option>
          </select>
        </label>
        {level !== "ING3" && (
          <label className="adm-field narrow">
            <span>Filleuls max par défaut (ING4)</span>
            <input
              className="adm-input"
              type="number"
              min={1}
              max={50}
              placeholder="ex. 2"
              value={maxMentees}
              onChange={(e) => setMaxMentees(e.target.value)}
            />
          </label>
        )}
        <button className="adm-btn primary" disabled={!file || sending}>
          {sending ? "Import…" : "Importer"}
        </button>
      </form>
      <p className="adm-muted small">
        Colonnes : prénom, nom, email, matricule (facultatif), niveau (facultatif si choisi ci-dessus), maxMentees (pour les ING4, facultatif si une valeur par défaut est donnée).
      </p>

      {error && <p className="adm-error">{error}</p>}
      {result && (
        <div className={`adm-notice ${result.rejected ? "warn" : "ok"}`}>
          <span>
            {result.imported} étudiant(s) importé(s)
            {result.rejected > 0 && `, ${result.rejected} ligne(s) rejetée(s)`}.
          </span>
        </div>
      )}
      {result && result.errors.length > 0 && (
        <table className="adm-table compact">
          <thead>
            <tr><th>Ligne</th><th>Email</th><th>Problème</th></tr>
          </thead>
          <tbody>
            {result.errors.map((e, i) => (
              <tr key={i}><td>{e.row}</td><td>{e.email || "—"}</td><td>{e.message}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/* ── Tableau d'un niveau ── */

function StudentTable({
  title,
  level,
  rows,
  busy,
  onInvite,
  tracking,
  onUpdated,
  setNotice,
}: {
  title: string;
  level: StudentLevel;
  rows: Student[];
  busy: string | null;
  onInvite: (s: Student, resend: boolean) => void;
  tracking: Map<string, InvitationOverview["students"][number]>;
  onUpdated: (s: Student) => void;
  setNotice: (n: Notice) => void;
}) {
  const done = rows.filter(profileComplete).length;

  async function saveCapacity(s: Student, value: string) {
    const n = Number(value);
    if (!value || n === s.maxMentees) return;
    try {
      onUpdated(await api.students.update(s.id, { maxMentees: n }));
      setNotice({ kind: "ok", text: `Capacité de ${fullName(s)} : ${n} filleul(s).` });
    } catch (e) {
      setNotice({ kind: "error", text: describeError(e) });
    }
  }

  return (
    <div className="adm-col">
      <h3>
        {title} <span className="adm-count">{rows.length}</span>
        <span className="adm-muted small"> · {done} profil(s) complet(s)</span>
      </h3>
      {rows.length === 0 ? (
        <p className="adm-muted">Aucun étudiant.</p>
      ) : (
        <table className="adm-table">
          <thead>
            <tr>
              <th />
              <th>Nom</th>
              {level === "ING4" && <th title="Nombre maximum de filleuls">Max</th>}
              <th>Profil</th>
              <th>Invitation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const complete = profileComplete(s);
              return (
                <tr key={s.id}>
                  <td className="adm-avatar">
                    {s.profilePictureUrl ? <img src={s.profilePictureUrl} alt="" /> : <span>{s.firstName[0]}</span>}
                  </td>
                  <td>
                    <strong>{fullName(s)}</strong>
                    <div className="adm-muted small">{s.email}{s.matricule && ` · ${s.matricule}`}</div>
                    {s.whatsapp && <div className="adm-muted small">{s.whatsapp}</div>}
                  </td>
                  {level === "ING4" && (
                    <td>
                      <input
                        className="adm-input tiny"
                        type="number"
                        min={1}
                        max={50}
                        defaultValue={s.maxMentees ?? ""}
                        onBlur={(e) => saveCapacity(s, e.target.value)}
                      />
                    </td>
                  )}
                  <td>
                    <span className={`adm-badge ${complete ? "ok" : "pending"}`}>{complete ? "Complet" : "Incomplet"}</span>
                  </td>
                  <td className="adm-actions">
                    <button className="adm-btn small" disabled={busy !== null} onClick={() => onInvite(s, false)}>
                      {busy === `send-${s.id}` ? "…" : "Envoyer"}
                    </button>
                    <button
                      className="adm-btn small"
                      title="Annule le lien précédent et en envoie un nouveau"
                      disabled={busy !== null}
                      onClick={() => onInvite(s, true)}
                    >
                      {busy === `resend-${s.id}` ? "…" : "Renvoyer"}
                    </button>
                    <MailStatus info={tracking.get(s.id)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
