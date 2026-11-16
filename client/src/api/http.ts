import { apiErrorBodySchema, type AuthResponse } from '@calisthenics/shared';

/** A failed API call. `code` is stable (e.g. EMAIL_TAKEN) and maps to a translation. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// The access token lives only in memory: a page reload loses it on purpose,
// and the httpOnly refresh cookie gets a new one. Scripts can never read the cookie.
let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

/** Called when a request fails because the session can no longer be renewed. */
export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

async function toApiError(res: Response): Promise<ApiError> {
  const parsed = apiErrorBodySchema.safeParse(await res.json().catch(() => null));
  return parsed.success
    ? new ApiError(
        res.status,
        parsed.data.error.code,
        parsed.data.error.message,
        parsed.data.error.details,
      )
    : new ApiError(res.status, 'UNKNOWN', res.statusText);
}

let refreshInFlight: Promise<AuthResponse | null> | null = null;

/**
 * Renews the session from the refresh cookie. Every caller that asks while a
 * renewal is running shares the same request, because each refresh token works once.
 */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshInFlight ??= requestRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function requestRefresh(): Promise<AuthResponse | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    } catch {
      break; // offline or server down
    }
    if (res.ok) {
      const session = (await res.json()) as AuthResponse;
      accessToken = session.accessToken;
      return session;
    }
    // Another tab renewed first; its new cookie is already in the browser, so try once more.
    if ((await toApiError(res)).code !== 'REFRESH_RACE') break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  accessToken = null;
  return null;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

/** JSON request to the API. Throws ApiError for error responses. */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const send = () =>
    fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers: {
        ...(options.body !== undefined && { 'Content-Type': 'application/json' }),
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

  let res = await send();

  // 401 outside /auth means the access token expired: renew once and repeat the request.
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (await refreshSession()) {
      res = await send();
    } else {
      onSessionExpired?.();
    }
  }

  if (!res.ok) throw await toApiError(res);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}
