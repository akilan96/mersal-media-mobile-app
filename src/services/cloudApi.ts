const value = process.env.EXPO_PUBLIC_API_URL?.trim();
export const cloudApiUrl = value?.replace(/\/+$/, '');

export class ApiRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function apiRequest(path: string, options: { method?: string; token?: string; json?: unknown; body?: BodyInit; contentType?: string } = {}) {
  if (!cloudApiUrl || !/^https?:\/\/[^/]+(?:\/[^?#]*)?$/i.test(cloudApiUrl)) {
    throw new Error('Set EXPO_PUBLIC_API_URL to your Express API URL ending in /api/v1.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(cloudApiUrl + path, {
      method: options.method,
      headers: {
        ...(options.token ? { Authorization: 'Bearer ' + options.token } : {}),
        ...(options.json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.contentType ? { 'Content-Type': options.contentType } : {}),
      },
      body: options.json === undefined ? options.body : JSON.stringify(options.json),
      signal: controller.signal,
    });
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new ApiRequestError(response.status, result?.fields?.[0]?.message ?? result?.error ?? 'The studio API returned HTTP ' + response.status + '.');
    }
    return response;
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    throw new Error('Could not connect to the studio API. Check the server URL and your network, then try again.');
  } finally { clearTimeout(timeout); }
}
