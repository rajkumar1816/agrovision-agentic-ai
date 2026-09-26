const DEFAULT_BACKEND_URL = 'https://agrovision-agentic-ai.onrender.com';

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return import.meta.env.VITE_API_BASE_URL || DEFAULT_BACKEND_URL;
  }

  const host = window.location.hostname;
  const isLocalhost = host === 'localhost' || host === '127.0.0.1';

  if (isLocalhost) {
    return '';
  }

  return import.meta.env.VITE_API_BASE_URL || DEFAULT_BACKEND_URL;
}

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBaseUrl().replace(/\/$/, '');
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

export function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(input), init);
}
