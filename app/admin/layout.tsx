import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router";
import type { StudentSection } from "../lib/types";
import { SECTION_LABEL } from "./shared";
import type { Route } from "./+types/layout";
import "./admin.css";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Administration · Parrainage" }];
}

const TABS = [
  { to: "/admin", label: "Étudiants", end: true },
  { to: "/admin/contraintes", label: "Contraintes" },
  { to: "/admin/sessions", label: "Sessions" },
];

/*
 * Petite vérification d'identité avant l'admin. Seule l'empreinte SHA-256 de la
 * réponse attendue figure dans le code. C'est un garde-fou côté navigateur, pas une
 * sécurité : l'API reste accessible sans authentification.
 */
const ANSWER_SHA256 = "e8db7939f833383b7d6c12aa531614044cad8a3b980d6f0bf4642b2a1c36f922";
const STORAGE_KEY = "admin-identity-ok";
const SECTION_KEY = "admin-section";

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function readOk(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function readSection(): StudentSection {
  try {
    return sessionStorage.getItem(SECTION_KEY) === "EN" ? "EN" : "FR";
  } catch {
    return "FR";
  }
}

export default function AdminLayout() {
  const [ok, setOk] = useState<boolean | null>(null);
  const [section, setSection] = useState<StudentSection>("FR");
  useEffect(() => { setOk(readOk()); setSection(readSection()); }, []);

  function changeSection(next: StudentSection) {
    setSection(next);
    try { sessionStorage.setItem(SECTION_KEY, next); } catch { /* préférence non mémorisée */ }
  }

  if (ok === null) return <div className="adm" />;
  if (!ok) return <IdentityGate onSuccess={() => setOk(true)} />;

  return (
    <div className="adm">
      <header className="adm-header">
        <span className="adm-brand">Parrainage · Admin</span>
        <nav className="adm-tabs">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? "active" : undefined)}>
              {t.label}
            </NavLink>
          ))}
        </nav>
        {/* Deux parrainages indépendants : tout l'admin porte sur la section choisie */}
        <div className="adm-section" role="tablist" aria-label="Section">
          {(["FR", "EN"] as StudentSection[]).map((s) => (
            <button key={s} role="tab" aria-selected={section === s} className={section === s ? "active" : undefined} onClick={() => changeSection(s)}>
              {SECTION_LABEL[s]}
            </button>
          ))}
        </div>
      </header>
      <main className="adm-main">
        <Outlet key={section} context={section} />
      </main>
    </div>
  );
}

function IdentityGate({ onSuccess }: { onSuccess: () => void }) {
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    const good = (await sha256(answer.trim().toLowerCase())) === ANSWER_SHA256;
    setChecking(false);
    if (!good) {
      setError(true);
      return;
    }
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // stockage indisponible : l'accès vaut pour cette page seulement
    }
    onSuccess();
  }

  return (
    <div className="adm adm-gate">
      <form className="adm-panel adm-gate-box" onSubmit={submit}>
        <h2>Qui êtes-vous ?</h2>
        <p className="adm-muted small">Identifiez-vous pour accéder à l'administration du parrainage.</p>
        <input
          className="adm-input"
          autoFocus
          autoComplete="off"
          value={answer}
          onChange={(e) => { setAnswer(e.target.value); setError(false); }}
          placeholder="Votre réponse"
        />
        {error && <p className="adm-error small">Réponse incorrecte.</p>}
        <button className="adm-btn primary" disabled={!answer.trim() || checking}>Entrer</button>
      </form>
    </div>
  );
}
