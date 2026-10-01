import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api, ApiError } from "../lib/api";
import { describeError } from "../lib/errors";
import type { Pairing, PairingSessionView, PairingValidationReport, SessionStatus } from "../lib/types";
import { formatDate, fullName, NoticeBar, useAction, useLoad, type Notice } from "./shared";

const STATUS_LABEL: Record<SessionStatus, string> = {
  DRAFT: "Brouillon",
  GENERATED: "Tirage fait",
  FINALIZED: "Finalisée",
};

const ORIGIN_LABEL: Record<Pairing["origin"], string> = {
  RANDOM: "Tirage",
  PRECONFIGURED: "Imposé",
  MANUAL: "Manuel",
};

export default function SessionsPage() {
  const sessions = useLoad(() => api.sessions.list());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<PairingSessionView | null>(null);
  const [report, setReport] = useState<PairingValidationReport | null>(null);
  const [issues, setIssues] = useState<{ code: string; message: string }[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const { busy, run } = useAction(setNotice);

  const list = [...(sessions.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Sélectionne la session la plus récente au premier chargement
  useEffect(() => {
    if (!selectedId && list.length) setSelectedId(list[0].id);
  }, [list, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    setView(null);
    setReport(null);
    setIssues([]);
    api.sessions.get(selectedId).then(setView).catch((e) => setNotice({ kind: "error", text: describeError(e) }));
  }, [selectedId]);

  function applyView(v: PairingSessionView) {
    setView(v);
    sessions.setData((l) => l?.map((s) => (s.id === v.id ? { ...s, ...v } : s)) ?? null);
  }

  /** Les erreurs de génération renvoient la liste des problèmes : on l'affiche. */
  async function withIssues<T>(fn: () => Promise<T>): Promise<T> {
    setIssues([]);
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ApiError && e.issues?.length) setIssues(e.issues);
      throw e;
    }
  }

  const create = () =>
    run("create", async () => {
      const s = await api.sessions.create();
      await sessions.reload();
      setSelectedId(s.id);
      return "Session créée.";
    });

  const validate = (id: string) =>
    run("validate", async () => {
      const r = await api.sessions.validate(id);
      setReport(r);
      return r.valid ? "Les données permettent un tirage." : "Des problèmes empêchent le tirage, voir le rapport.";
    });

  const generate = (id: string, again: boolean) =>
    run(again ? "regenerate" : "generate", async () => {
      if (again && !confirm("Refaire le tirage ? Les binômes actuels (hors couples imposés) seront remplacés.")) return;
      applyView(await withIssues(() => (again ? api.sessions.regenerate(id) : api.sessions.generate(id))));
      return again ? "Nouveau tirage effectué." : "Tirage effectué.";
    });

  const finalize = (id: string) =>
    run("finalize", async () => {
      if (!confirm("Finaliser la session ? Le tirage ne pourra plus être modifié.")) return;
      applyView(await api.sessions.finalize(id));
      return "Session finalisée.";
    });

  const exportXlsx = (id: string) =>
    run("export", async () => {
      await api.sessions.downloadExport(id);
    });

  return (
    <div className="adm-split">
      <section className="adm-panel">
        <div className="adm-panel-head">
          <h2>Sessions</h2>
          <button className="adm-btn primary" onClick={create} disabled={busy !== null}>
            {busy === "create" ? "…" : "Nouvelle session"}
          </button>
        </div>
        {sessions.error && <p className="adm-error">{sessions.error}</p>}
        {list.length === 0 && !sessions.loading && <p className="adm-muted">Aucune session pour l'instant.</p>}
        <ul className="adm-list">
          {list.map((s) => (
            <li key={s.id}>
              <button className={s.id === selectedId ? "active" : undefined} onClick={() => setSelectedId(s.id)}>
                <span>{formatDate(s.createdAt)}</span>
                <span className={`adm-badge ${s.status.toLowerCase()}`}>{STATUS_LABEL[s.status]}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="adm-panel">
        <NoticeBar notice={notice} onClose={() => setNotice(null)} />
        {!selectedId && <p className="adm-muted">Crée ou choisis une session.</p>}
        {selectedId && !view && <p className="adm-muted">Chargement…</p>}
        {view && (
          <>
            <div className="adm-panel-head">
              <div>
                <h2>
                  Session du {formatDate(view.createdAt)}{" "}
                  <span className={`adm-badge ${view.status.toLowerCase()}`}>{STATUS_LABEL[view.status]}</span>
                </h2>
                <p className="adm-muted small">
                  Tirage : {formatDate(view.generatedAt)} · Finalisée : {formatDate(view.finalizedAt)}
                </p>
              </div>
            </div>

            <div className="adm-row wrap">
              <button className="adm-btn" onClick={() => validate(view.id)} disabled={busy !== null}>
                {busy === "validate" ? "…" : "Vérifier les données"}
              </button>
              {view.status === "DRAFT" && (
                <button className="adm-btn primary" onClick={() => generate(view.id, false)} disabled={busy !== null}>
                  {busy === "generate" ? "…" : "Lancer le tirage"}
                </button>
              )}
              {view.status === "GENERATED" && (
                <>
                  <button className="adm-btn" onClick={() => generate(view.id, true)} disabled={busy !== null}>
                    {busy === "regenerate" ? "…" : "Refaire le tirage"}
                  </button>
                  <button className="adm-btn primary" onClick={() => finalize(view.id)} disabled={busy !== null}>
                    {busy === "finalize" ? "…" : "Finaliser"}
                  </button>
                </>
              )}
              {view.status === "FINALIZED" && (
                <button className="adm-btn" onClick={() => exportXlsx(view.id)} disabled={busy !== null}>
                  {busy === "export" ? "…" : "Exporter (Excel)"}
                </button>
              )}
              {view.pairings.length > 0 && (
                <Link className="adm-btn" to="/show" target="_blank">Ouvrir le show ↗</Link>
              )}
            </div>

            {report && <ReportBox report={report} />}
            {issues.length > 0 && (
              <div className="adm-notice error">
                <ul>{issues.map((i, k) => <li key={k}>{i.message}</li>)}</ul>
              </div>
            )}

            {view.status === "GENERATED" && (
              <p className="adm-muted small">L'export Excel sera disponible une fois la session finalisée.</p>
            )}

            <h3>
              Binômes <span className="adm-count">{view.pairings.length}</span>
            </h3>
            {view.pairings.length === 0 ? (
              <p className="adm-muted">Pas encore de tirage.</p>
            ) : (
              <table className="adm-table">
                <thead>
                  <tr><th>Parrain (ING4)</th><th>Filleul (ING3)</th><th>Origine</th></tr>
                </thead>
                <tbody>
                  {[...view.pairings]
                    .sort((a, b) => a.sponsor.lastName.localeCompare(b.sponsor.lastName))
                    .map((p) => (
                      <tr key={p.id}>
                        <td>{fullName(p.sponsor)}</td>
                        <td>{fullName(p.mentee)}</td>
                        <td><span className={`adm-badge ${p.origin.toLowerCase()}`}>{ORIGIN_LABEL[p.origin]}</span></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function ReportBox({ report }: { report: PairingValidationReport }) {
  const { stats } = report;
  return (
    <div className={`adm-notice ${report.valid ? "ok" : "error"}`}>
      <div>
        <strong>{report.valid ? "Données valides" : "Tirage impossible en l'état"}</strong>
        <div className="small">
          {stats.sponsors} parrain(s) · {stats.mentees} filleul(s) · capacité totale {stats.totalCapacity} ·{" "}
          {stats.required} couple(s) imposé(s) · {stats.forbidden} paire(s) interdite(s)
        </div>
        {report.issues.length > 0 && <ul>{report.issues.map((i, k) => <li key={k}>{i.message}</li>)}</ul>}
      </div>
    </div>
  );
}
