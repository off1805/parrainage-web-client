import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router";
import { describeError } from "../lib/errors";
import type { Student, StudentSection } from "../lib/types";

export function fullName(s: { firstName: string; lastName: string }) {
  return `${s.firstName} ${s.lastName}`;
}

export function profileComplete(s: Pick<Student, "whatsapp" | "profilePictureUrl">) {
  return Boolean(s.whatsapp && s.profilePictureUrl);
}

export function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

/** Charge une ressource et expose { data, error, loading, reload }. */
export function useLoad<T>(fn: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fn());
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, setData, error, loading, reload };
}

/** Message de retour (succès / erreur) affiché après une action. */
export type Notice = { kind: "ok" | "error"; text: string } | null;

export function NoticeBar({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  if (!notice) return null;
  return (
    <div className={`adm-notice ${notice.kind}`}>
      <span>{notice.text}</span>
      <button className="adm-link" onClick={onClose} aria-label="Fermer">×</button>
    </div>
  );
}

/** Exécute une action asynchrone en gérant l'état « occupé » et le message de retour. */
export function useAction(setNotice: (n: Notice) => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(
    async (key: string, fn: () => Promise<string | void>) => {
      setBusy(key);
      try {
        const msg = await fn();
        if (msg) setNotice({ kind: "ok", text: msg });
      } catch (e) {
        setNotice({ kind: "error", text: describeError(e) });
      } finally {
        setBusy(null);
      }
    },
    [setNotice],
  );
  return { busy, run };
}

/** Libellés des sections. */
export const SECTION_LABEL: Record<StudentSection, string> = { FR: "Francophone", EN: "Anglophone" };

/** Section choisie en haut de l'admin (fournie par le layout). */
export function useSection(): StudentSection {
  return useOutletContext<StudentSection>();
}
