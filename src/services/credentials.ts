import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
const CREDENTIAL_KEY = 'mersal.device-lock.v1';
const ATTEMPTS_KEY = 'mersal.device-lock.attempts.v1';
interface Credential { salt: string; digest: string }
interface Attempts { failures: number; blockedUntil: number }
// Browser previews use browser-local storage. Native Expo Go uses OS SecureStore.
const credentialStorage = {
  get: (key: string): Promise<string | null> => Platform.OS === 'web' ? Promise.resolve(localStorage.getItem(key)) : SecureStore.getItemAsync(key),
  set: (key: string, value: string): Promise<void> => Platform.OS === 'web' ? Promise.resolve(localStorage.setItem(key, value)) : SecureStore.setItemAsync(key, value),
  remove: (key: string): Promise<void> => Platform.OS === 'web' ? Promise.resolve(localStorage.removeItem(key)) : SecureStore.deleteItemAsync(key),
};
export const validPin = (pin: string) => /^\d{4}$/.test(pin);
const digest = (salt: string, pin: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
export async function hasCredential() { return (await credentialStorage.get(CREDENTIAL_KEY)) !== null; }
export async function createCredential(pin: string) {
  if (!validPin(pin)) throw new Error('Use a PIN with exactly 4 digits.');
  const salt = Crypto.randomUUID();
  const record = JSON.stringify({ salt, digest: await digest(salt, pin) });
  await credentialStorage.remove(ATTEMPTS_KEY);
  await credentialStorage.set(CREDENTIAL_KEY, record);
}
export async function removeCredential() { await credentialStorage.remove(CREDENTIAL_KEY); }
export async function verifyPin(pin: string) {
  const attemptsRaw = await credentialStorage.get(ATTEMPTS_KEY);
  const attempts: Attempts = attemptsRaw ? JSON.parse(attemptsRaw) : { failures: 0, blockedUntil: 0 };
  if (attempts.blockedUntil > Date.now()) throw new Error(`Too many attempts. Try again in ${Math.ceil((attempts.blockedUntil - Date.now()) / 1000)} seconds.`);
  const raw = await credentialStorage.get(CREDENTIAL_KEY);
  if (!raw) throw new Error('No device PIN is configured.');
  const credential: Credential = JSON.parse(raw);
  const candidate = await digest(credential.salt, pin);
  let mismatch = candidate.length ^ credential.digest.length;
  for (let i = 0; i < candidate.length; i++) mismatch |= candidate.charCodeAt(i) ^ (credential.digest.charCodeAt(i) || 0);
  if (mismatch !== 0) {
    const failures = attempts.failures + 1;
    await credentialStorage.set(ATTEMPTS_KEY, JSON.stringify({ failures, blockedUntil: failures >= 5 ? Date.now() + 60000 : 0 }));
    throw new Error(failures >= 5 ? 'Too many attempts. Wait 60 seconds before trying again.' : 'The username or PIN is incorrect.');
  }
  await credentialStorage.remove(ATTEMPTS_KEY);
}
