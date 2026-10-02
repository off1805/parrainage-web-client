import { API_BASE } from './api';

/** Intervalle des appels : l'hébergement gratuit (Render) met le backend en veille après ~15 min sans requête. */
export const KEEP_ALIVE_MS = 10 * 60 * 1000;

/**
 * Appelle le backend tout de suite, puis toutes les 10 minutes, pour l'empêcher
 * de s'endormir tant qu'une page de l'application est ouverte.
 * Renvoie la fonction d'arrêt.
 */
export function startKeepAlive(): () => void {
  const ping = () => {
    fetch(`${API_BASE}/`, { method: 'GET', cache: 'no-store' }).catch(() => {
      // Backend injoignable : on réessaiera au prochain intervalle
    });
  };
  ping();
  const id = window.setInterval(ping, KEEP_ALIVE_MS);
  return () => window.clearInterval(id);
}
