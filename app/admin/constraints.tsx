import { useMemo, useState } from "react";
import { api } from "../lib/api";
import type { ConstraintType, PairingConstraint, Student } from "../lib/types";
import { formatDate, fullName, NoticeBar, SECTION_LABEL, useAction, useLoad, useSection, type Notice } from "./shared";

const TYPES: { type: ConstraintType; title: string; help: string }[] = [
  { type: "REQUIRED", title: "Couples imposés", help: "Ces binômes seront toujours formés." },
  { type: "FORBIDDEN", title: "Paires interdites", help: "Ces deux étudiants ne seront jamais associés." },
];

export default function ConstraintsPage() {
  const section = useSection();
  const data = useLoad(async () => {
    const [constraints, students] = await Promise.all([api.constraints.list({ section }), api.students.list({ section })]);
    return { constraints, students };
  });
  const [notice, setNotice] = useState<Notice>(null);
  const { busy, run } = useAction(setNotice);

  const [type, setType] = useState<ConstraintType>("REQUIRED");
  const [sponsorId, setSponsorId] = useState("");
  const [menteeId, setMenteeId] = useState("");
  const [reason, setReason] = useState("");

  const students = data.data?.students ?? [];
  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const sponsors = students.filter((s) => s.level === "ING4").sort(byName);
  const mentees = students.filter((s) => s.level === "ING3").sort(byName);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    run("add", async () => {
      const created = await api.constraints.create({ sponsorId, menteeId, type, reason: reason.trim() || undefined });
      data.setData((d) => (d ? { ...d, constraints: [created, ...d.constraints] } : d));
      setMenteeId("");
      setReason("");
      return "Contrainte ajoutée.";
    });
  };

  const remove = (c: PairingConstraint) =>
    run(`del-${c.id}`, async () => {
      await api.constraints.remove(c.id);
      data.setData((d) => (d ? { ...d, constraints: d.constraints.filter((x) => x.id !== c.id) } : d));
      return "Contrainte supprimée.";
    });

  const name = (id: string) => {
    const s = byId.get(id);
    return s ? fullName(s) : "Étudiant inconnu";
  };

  return (
    <>
      <section className="adm-panel">
        <h2>Ajouter une contrainte <span className="adm-muted small">· section {SECTION_LABEL[section].toLowerCase()}</span></h2>
        <form className="adm-form-row" onSubmit={add}>
          <label className="adm-field">
            <span>Type</span>
            <select className="adm-input" value={type} onChange={(e) => setType(e.target.value as ConstraintType)}>
              <option value="REQUIRED">Couple imposé</option>
              <option value="FORBIDDEN">Paire interdite</option>
            </select>
          </label>
          <label className="adm-field">
            <span>Parrain (ING4)</span>
            <select className="adm-input" value={sponsorId} onChange={(e) => setSponsorId(e.target.value)} required>
              <option value="">Choisir…</option>
              {sponsors.map((s) => <option key={s.id} value={s.id}>{label(s)}</option>)}
            </select>
          </label>
          <label className="adm-field">
            <span>Filleul (ING3)</span>
            <select className="adm-input" value={menteeId} onChange={(e) => setMenteeId(e.target.value)} required>
              <option value="">Choisir…</option>
              {mentees.map((s) => <option key={s.id} value={s.id}>{label(s)}</option>)}
            </select>
          </label>
          <label className="adm-field">
            <span>Raison (facultatif)</span>
            <input className="adm-input" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button className="adm-btn primary" disabled={!sponsorId || !menteeId || busy !== null}>
            {busy === "add" ? "Ajout…" : "Ajouter"}
          </button>
        </form>
        {!data.loading && (sponsors.length === 0 || mentees.length === 0) && (
          <p className="adm-muted small">Il faut au moins un ING4 et un ING3 importés pour créer une contrainte.</p>
        )}
        <NoticeBar notice={notice} onClose={() => setNotice(null)} />
        {data.error && <p className="adm-error">{data.error}</p>}
      </section>

      <div className="adm-columns">
        {TYPES.map((t) => {
          const rows = (data.data?.constraints ?? []).filter((c) => c.type === t.type);
          return (
            <section className="adm-panel adm-col" key={t.type}>
              <h2>
                {t.title} <span className="adm-count">{rows.length}</span>
              </h2>
              <p className="adm-muted small">{t.help}</p>
              {rows.length === 0 ? (
                <p className="adm-muted">Aucune.</p>
              ) : (
                <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr><th>Parrain</th><th>Filleul</th><th>Raison</th><th>Créée</th><th /></tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.id}>
                        <td>{name(c.sponsorId)}</td>
                        <td>{name(c.menteeId)}</td>
                        <td className="adm-muted">{c.reason || "—"}</td>
                        <td className="adm-muted small">{formatDate(c.createdAt)}</td>
                        <td>
                          <button className="adm-btn small danger" disabled={busy !== null} onClick={() => remove(c)}>
                            {busy === `del-${c.id}` ? "…" : "Supprimer"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

function byName(a: Student, b: Student) {
  return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
}

function label(s: Student) {
  return `${s.lastName} ${s.firstName}${s.matricule ? ` (${s.matricule})` : ""}`;
}
