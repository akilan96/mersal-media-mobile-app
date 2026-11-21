import { createSign } from 'node:crypto';
import { getVercelOidcToken } from '@vercel/oidc';
import { IdentityPoolClient } from 'google-auth-library';
import { StoreError } from './store';

const googleApi = 'https://www.googleapis.com/drive/v3/files';
const driveScope = 'https://www.googleapis.com/auth/drive.readonly';
const idPattern = /^[a-zA-Z0-9_-]{1,256}$/;
const photoMime = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif']);
type DriveItem = { id: string; name: string; mimeType: string; parents?: string[]; thumbnailLink?: string; trashed?: boolean };
export type DriveTarget = { kind: 'folder' | 'file' | 'unknown'; id: string; resourceKey?: string };

export function driveTarget(link: string): DriveTarget {
  const url = new URL(link);
  const folder = url.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([^/]+)\/?$/);
  const file = url.pathname.match(/^\/file\/d\/([^/]+)(?:\/|$)/);
  const legacyId = ['/open', '/uc'].includes(url.pathname) ? url.searchParams.get('id') : null;
  const id = folder?.[1] ?? file?.[1] ?? legacyId;
  if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com' || !id || !idPattern.test(id)) {
    throw new StoreError(422, 'Use a Google Drive folder or file sharing link for in-app previews.');
  }
  const key = url.searchParams.get('resourcekey');
  return { kind: folder ? 'folder' : file || url.pathname === '/uc' ? 'file' : 'unknown', id, resourceKey: key && idPattern.test(key) ? key : undefined };
}

export function createDriveReader(env: Readonly<Record<string, string | undefined>>) {
  const serviceAccountJson = env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON;
  const project = env.GCP_PROJECT_NUMBER?.trim();
  const pool = env.GCP_WORKLOAD_IDENTITY_POOL_ID?.trim();
  const provider = env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID?.trim();
  const accountEmail = env.GCP_SERVICE_ACCOUNT_EMAIL?.trim();
  const federated = project && pool && provider && accountEmail
    ? new IdentityPoolClient({
      type: 'external_account',
      audience: `//iam.googleapis.com/projects/${project}/locations/global/workloadIdentityPools/${pool}/providers/${provider}`,
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      token_url: 'https://sts.googleapis.com/v1/token',
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(accountEmail)}:generateAccessToken`,
      subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
      scopes: [driveScope],
    })
    : null;
  if (!federated && !serviceAccountJson) return undefined;
  let cached: { value: string; expiresAt: number } | undefined;
  let requesting: Promise<string> | undefined;

  async function issueToken() {
    try {
      const account = JSON.parse(serviceAccountJson!) as { client_email: string; private_key: string };
      const now = Math.floor(Date.now() / 1000);
      const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const unsigned = encode({ alg: 'RS256', typ: 'JWT' }) + '.' + encode({
        iss: account.client_email, scope: driveScope,
        aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
      });
      const signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url');
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + signature,
        }), signal: AbortSignal.timeout(8000), redirect: 'error',
      });
      const payload = await response.json();
      if (!response.ok || typeof payload.access_token !== 'string') throw new Error('Drive authentication failed');
      cached = { value: payload.access_token, expiresAt: Date.now() + Number(payload.expires_in ?? 3600) * 1000 };
      return cached.value;
    } catch {
      throw new StoreError(503, 'Google Drive is unavailable. Contact the studio for help.');
    }
  }

  async function headers(target: DriveTarget) {
    let token: string;
    if (federated) {
      try {
        const credential = await federated.getAccessToken();
        if (!credential.token) throw new Error('No Drive access token');
        token = credential.token;
      } catch {
        throw new StoreError(503, 'Google Drive is unavailable. Contact the studio for help.');
      }
    } else if (cached && cached.expiresAt - 60_000 > Date.now()) {
      token = cached.value;
    } else {
      requesting ??= issueToken().finally(() => { requesting = undefined; });
      token = await requesting;
    }
    return {
      Authorization: 'Bearer ' + token,
      ...(target.resourceKey ? { 'X-Goog-Drive-Resource-Keys': target.id + '/' + target.resourceKey } : {}),
    };
  }

  async function driveRequest(url: string, target: DriveTarget) {
    try {
      const response = await fetch(url, { headers: await headers(target), signal: AbortSignal.timeout(10000), redirect: 'error' });
      if (response.status === 403) {
        const payload = await response.json().catch(() => null) as {
          error?: { errors?: { reason?: string }[]; details?: { reason?: string }[] };
        } | null;
        const reasons = [...(payload?.error?.errors ?? []), ...(payload?.error?.details ?? [])].map(item => item.reason);
        if (reasons.some(reason => reason === 'accessNotConfigured' || reason === 'SERVICE_DISABLED')) {
          throw new StoreError(503, 'Enable the Google Drive API in the Google Cloud project used by the studio.');
        }
        if (reasons.some(reason => reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded' || reason === 'dailyLimitExceeded')) {
          throw new StoreError(429, 'Google Drive is limiting requests. Try again later.');
        }
        if (reasons.includes('domainPolicy')) {
          throw new StoreError(403, 'The folder owner’s Google Workspace policy blocks this app’s access.');
        }
        if (reasons.some(reason => reason === 'insufficientPermissions' || reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
          throw new StoreError(503, 'The app’s Google credentials do not include Drive read access.');
        }
      }
      if (response.status === 403 || response.status === 404) {
        throw new StoreError(403, 'Check the saved Drive link and share that exact folder with the studio’s service account as Viewer.');
      }
      if (!response.ok) throw new Error('Drive request failed');
      return response;
    } catch (error) {
      if (error instanceof StoreError) throw error;
      throw new StoreError(502, 'Could not load photos from Google Drive.');
    }
  }

  const itemFields = 'id,name,mimeType,parents,thumbnailLink,trashed';
  async function metadata(fileId: string, target: DriveTarget): Promise<DriveItem> {
    if (!idPattern.test(fileId)) throw new StoreError(404, 'Photo not found.');
    const query = new URLSearchParams({ fields: itemFields, supportsAllDrives: 'true' });
    return await (await driveRequest(googleApi + '/' + fileId + '?' + query, target)).json() as DriveItem;
  }

  const isPhoto = (item: DriveItem) => !item.trashed && photoMime.has(item.mimeType);
  const view = (item: DriveItem) => ({ id: item.id, name: item.name, hasThumbnail: Boolean(item.thumbnailLink) });

  return {
    async list(link: string, pageToken?: string) {
      const target = driveTarget(link);
      const root = await metadata(target.id, target);
      if (root.trashed) throw new StoreError(404, 'This Drive gallery is no longer available.');
      if (root.mimeType !== 'application/vnd.google-apps.folder') {
        return { photos: isPhoto(root) ? [view(root)] : [], nextPageToken: undefined };
      }
      const query = new URLSearchParams({
        q: "'" + target.id + "' in parents and trashed = false and mimeType contains 'image/'",
        fields: 'nextPageToken,files(' + itemFields + ')', orderBy: 'name_natural', pageSize: '30',
        supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
      });
      if (pageToken) query.set('pageToken', pageToken);
      const result = await (await driveRequest(googleApi + '?' + query, target)).json() as { files: DriveItem[]; nextPageToken?: string };
      return { photos: result.files.filter(isPhoto).map(view), nextPageToken: result.nextPageToken };
    },
    async thumbnail(link: string, fileId: string) {
      const target = driveTarget(link);
      if (target.kind === 'file' && target.id !== fileId) throw new StoreError(404, 'Photo not found.');
      const file = await metadata(fileId, target);
      if (!isPhoto(file) || (target.id !== fileId && !file.parents?.includes(target.id)) || !file.thumbnailLink) {
        throw new StoreError(404, 'Photo preview not found.');
      }
      const url = new URL(file.thumbnailLink);
      if (url.protocol !== 'https:' || !url.hostname.endsWith('.googleusercontent.com')) {
        throw new StoreError(502, 'Could not load this photo preview.');
      }
      const response = await driveRequest(url.href, target);
      const contentType = response.headers.get('content-type')?.split(';')[0] ?? '';
      if (!photoMime.has(contentType) || Number(response.headers.get('content-length')) > 2 * 1024 * 1024) {
        throw new StoreError(502, 'Could not load this photo preview.');
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 2 * 1024 * 1024) throw new StoreError(502, 'This photo preview is too large.');
      return { contentType, bytes };
    },
  };
}
