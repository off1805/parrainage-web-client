import { Link } from "react-router";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Parrainage" }];
}

export default function Home() {
  return (
    <div className="center">
      <span className="script big">Parrainage</span>
      <p className="lead">Choisis ton écran</p>
      <nav className="links">
        <Link to="/show?demo=1">Répétition (mode démo)</Link>
        <Link to="/show">Le show (dernière session)</Link>
        <Link to="/show-v2">Le show · version code</Link>
        <Link to="/remote">Télécommande</Link>
        <Link to="/admin">Administration</Link>
      </nav>
    </div>
  );
}
