/**
 * Client HTTP frontend typé. Retourne le JSON parsé et lève
 * `ApiError(status, message)` à partir de `{ error }`. À utiliser
 * exclusivement via les hooks React Query des features (jamais `fetch` brut).
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  const contentType = res.headers.get('content-type') ?? '';
  const payload: unknown = contentType.includes('application/json')
    ? await res.json().catch(() => null)
    : null;

  if (!res.ok) {
    const message =
      (payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : null) ?? `Échec de la requête (${res.status})`;
    throw new ApiError(res.status, message);
  }

  return payload as T;
}

export const apiGet = <T>(url: string, signal?: AbortSignal): Promise<T> =>
  request<T>(url, { method: 'GET', signal });

export const apiPost = <T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> =>
  request<T>(url, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

export const apiPatch = <T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> =>
  request<T>(url, {
    method: 'PATCH',
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

export const apiDelete = <T>(url: string, signal?: AbortSignal): Promise<T> =>
  request<T>(url, { method: 'DELETE', signal });
