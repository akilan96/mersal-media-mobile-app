import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StudioData } from '../domain/types';
import { assertStudioData } from '../domain/validation';
const DATA_KEY = '@mersal/studio/v1';
export const emptyStudio: StudioData = { version: 1, profile: null, events: [], clients: [] };
// This boundary can later be backed by your documented API without changing the screens.
export interface StudioRepository { load(): Promise<StudioData>; save(data: StudioData): Promise<void> }
export const studioRepository: StudioRepository = {
  async load() {
    const raw = await AsyncStorage.getItem(DATA_KEY);
    if (raw === null) return emptyStudio;
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new Error('Saved studio data could not be read. It has been preserved.'); }
    assertStudioData(value); return value;
  },
  async save(data) { assertStudioData(data); await AsyncStorage.setItem(DATA_KEY, JSON.stringify(data)); },
};
