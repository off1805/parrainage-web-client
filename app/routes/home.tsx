import { Link } from "react-router";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Parrainage · SJI" }];
}

const ITEMS = [
  { to: "/show", cmd: "run show()", hint: "l'animation du parrainage (dernière session tirée)" },
  { to: "/show?demo=1", cmd: "run show --demo", hint: "répétition avec des binômes fictifs" },
  { to: "/remote", cmd: "open remote", hint: "télécommande sur téléphone" },
  { to: "/admin", cmd: "sudo admin", hint: "étudiants, contraintes, sessions" },
];

export default function Home() {
  return (
    <div className="sji-page">
      <span className="sji-logo">SJI</span>
      <h1 className="sji-title">
        <span className="sji-kw">await</span> parrainage<span className="sji-op">.</span><span className="sji-fn">menu</span><span className="sji-op">()</span>
      </h1>
      <p className="sji-comment">// Saint Jean Ingénieur · programme de parrainage</p>
      <nav className="sji-menu">
        {ITEMS.map((item) => (
          <Link key={item.to} to={item.to} className="sji-item">
            <span>
              <b>$</b> {item.cmd}
              <small>// {item.hint}</small>
            </span>
            <span className="arrow">→</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
