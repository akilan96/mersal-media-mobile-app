import type { StudioData } from '../src/domain/types';

export interface StudioAccount {
  id: string;
  username: string;
  salt: string;
  passwordHash: string;
  data: StudioData;
}

export interface SessionRecord {
  hash: string;
  studioId: string;
  expires: number;
}

export interface HomePhoto {
  contentType: string;
  bytes: Uint8Array;
}

type Result<T> = T | Promise<T>;

export interface StudioStore {
  ping(): Result<void>;
  register(account: StudioAccount, session: SessionRecord): Result<boolean>;
  findCredentials(username: string): Result<Pick<StudioAccount, 'id' | 'salt' | 'passwordHash'> | null>;
  createSession(session: SessionRecord): Result<void>;
  findSession(hash: string, now: number): Result<string | null>;
  revokeSession(hash: string): Result<void>;
  load(studioId: string): Result<{ data: StudioData; revision: number } | null>;
  save(studioId: string, revision: number, data: StudioData): Result<boolean>;
  hasPhoto(studioId: string): Result<boolean>;
  getPhoto(studioId: string): Result<HomePhoto | null>;
  savePhoto(studioId: string, photo: HomePhoto): Result<void>;
  deletePhoto(studioId: string): Result<void>;
}

export class StoreError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
