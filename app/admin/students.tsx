import { useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { describeError } from "../lib/errors";
import type { ImportResult, InvitationResult, Student, StudentLevel } from "../lib/types";
import { fullName, NoticeBar, profileComplete, useAction, useLoad, type Notice } from "./shared";

type LevelChoice = "" | StudentLevel;

function emailSummary(r: InvitationResult) {
  if (r.email.failed.length > 0) return `Invitation créée, mais l'email n'est pas parti : ${r.email.failed[0].reason}`;
  return "Invitation envoyée.";
}

export default function StudentsPage() {
  const students = useLoad(() => api.students.list());
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
      if (r.email.failed.length) {
        setNotice({ kind: "error", text: `${fullName(s)} : ${emailSummary(r)}` });
        return;
      }
      return `${fullName(s)} : ${emailSummary(r)}`;
    });

  const inviteAll = () =>
    run("invite-all", async () => {
      if (!confirm(`Envoyer une invitation aux ${incomplete.length} étudiants dont le profil est incomplet ?`)) return;
      let sent = 0;
      const failed: string[] = [];
      for (const s of incomplete) {
        try {
          const r = await api.invitations.send(s.id);
          if (r.email.failed.length) failed.push(s.email);
          else sent++;
        } catch {
          failed.push(s.email);
        }
      }
      if (failed.length) {
        setNotice({ kind: "error", text: `${sent} invitation(s) envoyée(s), ${failed.length} échec(s) : ${failed.join(", ")}` });
        return;
      }
      return failed.length
        ? `${sent} invitation(s) envoyée(s), ${failed.length} échec(s) : ${failed.join(", ")}`
        : `${sent} invitation(s) envoyée(s).`;
    });

  return (
    <>
      <ImportPanel onImported={students.reload} />

      <section className="adm-panel">
        <div className="adm-panel-head">
          <h2>Étudiants</h2>
          <div className="adm-row">
            <input
              className="adm-input"
              placeholder="Rechercher (nom, email, matricule)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="adm-btn" onClick={students.reload} disabled={students.loading}>
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
              onUpdated={replace}
              setNotice={setNotice}
            />
            <StudentTable
              title="ING3 · Filleuls"
              level="ING3"
              rows={byLevel("ING3")}
              busy={busy}
              onInvite={invite}
              onUpdated={replace}
              setNotice={setNotice}
            />
          </div>
        )}
      </section>
    </>
  );
}

/* ── Import ── */

function ImportPanel({ onImported }: { onImported: () => void }) {
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
      <h2>Importer une liste</h2>
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
  onUpdated,
  setNotice,
}: {
  title: string;
  level: StudentLevel;
  rows: Student[];
  busy: string | null;
  onInvite: (s: Student, resend: boolean) => void;
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
