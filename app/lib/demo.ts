import type { Pairing, StudentRef } from './types';

const P = ['Amina', 'Brice', 'Clarisse', 'Dylan', 'Estelle', 'Fabrice', 'Grâce', 'Hervé', 'Inès', 'Jordan', 'Kelly', 'Landry', 'Mireille', 'Nadège', 'Orel', 'Prisca'];
const N = ['Mbarga', 'Tchouta', 'Ngono', 'Fotso', 'Essomba', 'Kamga', 'Nkoulou', 'Tagne', 'Owona', 'Djoumessi', 'Abena', 'Nana', 'Biyong', 'Ndzana', 'Kouam', 'Atangana'];
const mk = (i: number, k: string): StudentRef => ({
  id: `${k}${i}`, firstName: P[i % P.length], lastName: N[(i * 5 + 3 + Math.floor(i / P.length)) % N.length], email: `${k}${i}@demo.cm`,
  matricule: null, whatsapp: null, profilePictureUrl: null,
});

// Par défaut : 6 parrains (3,2,2,1,1,1 filleuls) → 10 couples, sans photo pour tester les monogrammes.
// Avec `size` (ex. ?demo=150) : autant de couples, 1 à 3 filleuls par parrain, pour répéter avec une grande promo.
export function demoPairings(size?: number): Pairing[] {
  const counts = size && size > 1 ? spread(size) : [3, 2, 2, 1, 1, 1]; let m = 0; const out: Pairing[] = [];
  counts.forEach((c, s) => { for (let j = 0; j < c; j++) out.push({ id: `p${m}`, origin: 'RANDOM', sponsor: mk(s, 's'), mentee: mk(m++ + 6, 'm') }); });
  return out;
}

function spread(total: number): number[] {
  const out: number[] = [];
  for (let left = total; left > 0; ) { const c = Math.min(left, 1 + (out.length % 3)); out.push(c); left -= c; }
  return out;
}
