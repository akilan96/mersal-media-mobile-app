import type { ManagedAccount, StudioData } from '../src/domain/types';

export type StudioCredential = { pin: string } | { salt: string; passwordHash: string };

export type StudioAccount = StudioCredential & {
  id: string;
  username: string;
  data: StudioData;
};

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
  claimPinAttempt?(username: string): Result<boolean>;
  clearPinAttempts?(username: string): Result<void>;
  ping(): Result<void>;
  register(account: StudioAccount, session: SessionRecord): Result<boolean>;
  findCredentials(username: string): Result<({ id: string } & StudioCredential) | null>;
  createSession(session: SessionRecord): Result<void>;
  findSession(hash: string, now: number): Result<string | null>;
  findAccountSession?(hash: string, now: number): Result<{ username: string; role: ManagedAccount['role'] } | null>;
  listManagedAccounts?(): Result<ManagedAccount[]>;
  createManagedAccount?(id: string, account: ManagedAccount & { pin: string }): Result<boolean>;
  revokeSession(hash: string): Result<void>;
  load(studioId: string): Result<{ data: StudioData; revision: number } | null>;
  save(studioId: string, revision: number, data: StudioData, previous: StudioData): Result<boolean>;
  hasPhoto(studioId: string): Result<boolean>;
  getPhoto(studioId: string): Result<HomePhoto | null>;
  savePhoto(studioId: string, photo: HomePhoto): Result<void>;
  deletePhoto(studioId: string): Result<void>;
}

export class StoreError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
