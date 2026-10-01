import { ApiError } from './api';

export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 0) return "Le serveur est injoignable. Vérifie ta connexion.";
    return e.message;
  }
  return "Une erreur inattendue est survenue.";
}
