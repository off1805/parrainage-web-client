import { NavLink, Outlet } from "react-router";
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

export default function AdminLayout() {
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
      </header>
      <main className="adm-main">
        <Outlet />
      </main>
    </div>
  );
}
