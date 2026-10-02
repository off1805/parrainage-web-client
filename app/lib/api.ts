import type {
  ConstraintType,
  ImportResult,
  InvitationOverview,
  InvitationPreview,
  InvitationResult,
  PairingConstraint,
  PairingSession,
  PairingSessionView,
  PairingValidationReport,
  Student,
  StudentLevel,
  StudentSection,
} from './types';

export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const BASE = API_BASE;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public issues?: { code: string; message: string }[]
  ) {
    super(message);
  }
}

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: any;
  isFormData?: boolean;
}

async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const headers = new Headers();
  
  if (BASE.includes('ngrok')) {
    headers.set('ngrok-skip-browser-warning', '1');
  }

  if (options.body && !options.isFormData) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: options.method ?? 'GET',
      headers,
      body: options.isFormData ? options.body : (options.body ? JSON.stringify(options.body) : undefined),
    });
  } catch {
    throw new ApiError(`Serveur injoignable`, 0);
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  if (!res.ok) {
    let b: any = {};
    try {
      b = await res.json();
    } catch { /* corps vide */ }
    const msg = Array.isArray(b.message) ? b.message.join(' · ') : b.message ?? res.statusText;
    throw new ApiError(msg, res.status, b.code, b.issues);
  }

  const contentType = res.headers.get('Content-Type');
  if (contentType && contentType.includes('spreadsheetml')) {
    return (await res.blob()) as unknown as T;
  }

  return res.json() as Promise<T>;
}

export const api = {
  students: {
    list: (params?: { level?: StudentLevel; section?: StudentSection; search?: string }) => {
      const q = new URLSearchParams();
      if (params?.level) q.set('level', params.level);
      if (params?.section) q.set('section', params.section);
      if (params?.search) q.set('search', params.search);
      const qs = q.toString();
      return request<Student[]>(`/students${qs ? '?' + qs : ''}`);
    },
    get: (id: string) => request<Student>(`/students/${id}`),
    create: (payload: { firstName: string; lastName: string; email: string; matricule?: string; level: StudentLevel; section: StudentSection; maxMentees?: number }) =>
      request<Student>('/students', { method: 'POST', body: payload }),
    /** Champs texte vides (matricule, WhatsApp) : effacés. */
    update: (id: string, patch: Partial<Omit<Student, 'id' | 'createdAt' | 'updatedAt' | 'matricule' | 'whatsapp'>> & { matricule?: string; whatsapp?: string }) => request<Student>(`/students/${id}`, { method: 'PATCH', body: patch }),
    import: (file: File, options: { level?: StudentLevel; section?: StudentSection; maxMentees?: number } = {}) => {
      const fd = new FormData();
      fd.append('file', file);
      if (options.level) fd.append('level', options.level);
      if (options.section) fd.append('section', options.section);
      if (options.maxMentees) fd.append('maxMentees', String(options.maxMentees));
      return request<ImportResult>('/students/import', { method: 'POST', body: fd, isFormData: true });
    },
  },
  invitations: {
    send: (studentId: string) => request<InvitationResult>(`/students/${studentId}/invitations`, { method: 'POST' }),
    overview: () => request<InvitationOverview>('/invitations/overview'),
    /** Envoi groupé ; sans liste : tous les profils incomplets. */
    bulk: (studentIds?: string[]) => request<InvitationResult['email']>('/invitations/bulk', { method: 'POST', body: studentIds ? { studentIds } : {} }),
    resend: (studentId: string) => request<InvitationResult>(`/students/${studentId}/invitations/resend`, { method: 'POST' }),
    verify: (token: string) => request<InvitationPreview>(`/invitations/verify?token=${encodeURIComponent(token)}`),
    complete: (payload: { token: string; profilePictureUrl: string; whatsapp: string }) => request<InvitationPreview>('/invitations/complete', { method: 'POST', body: payload }),
  },
  constraints: {
    list: (params: { type?: ConstraintType; section?: StudentSection } = {}) => {
      const q = new URLSearchParams();
      if (params.type) q.set('type', params.type);
      if (params.section) q.set('section', params.section);
      const qs = q.toString();
      return request<PairingConstraint[]>(`/pairing-constraints${qs ? '?' + qs : ''}`);
    },
    create: (payload: { sponsorId: string; menteeId: string; type: ConstraintType; reason?: string }) => request<PairingConstraint>('/pairing-constraints', { method: 'POST', body: payload }),
    remove: async (id: string) => {
      try {
        await request<void>(`/pairing-constraints/${id}`, { method: 'DELETE' });
      } catch (e: any) {
        if (e instanceof ApiError && e.status === 400 && e.message.startsWith('Contrainte introuvable')) {
          return;
        }
        throw e;
      }
    },
  },
  sessions: {
    list: (section?: StudentSection) => request<PairingSession[]>(`/pairing-sessions${section ? `?section=${section}` : ''}`),
    create: (section: StudentSection) => request<PairingSession>('/pairing-sessions', { method: 'POST', body: { section } }),
    get: (id: string) => request<PairingSessionView>(`/pairing-sessions/${id}`),
    validate: (id: string) => request<PairingValidationReport>(`/pairing-sessions/${id}/validate`, { method: 'POST' }),
    generate: (id: string) => request<PairingSessionView>(`/pairing-sessions/${id}/generate`, { method: 'POST' }),
    regenerate: (id: string) => request<PairingSessionView>(`/pairing-sessions/${id}/regenerate`, { method: 'POST' }),
    finalize: (id: string) => request<PairingSessionView>(`/pairing-sessions/${id}/finalize`, { method: 'POST' }),
    exportBlob: (id: string) => request<Blob>(`/pairing-sessions/${id}/export`),
    downloadExport: async (id: string) => {
      const blob = await api.sessions.exportBlob(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `parrainage-${id}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  },
};
