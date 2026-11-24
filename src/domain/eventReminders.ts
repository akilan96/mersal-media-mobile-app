import type { StudioEvent } from './types';

const offsets = [24, 3, 1] as const;
const hourMs = 60 * 60 * 1000;

export function planEventReminders(events: StudioEvent[], now = Date.now()) {
  return events.flatMap(event => {
    if (event.inactive || event.status !== 'Scheduled') return [];
    const startsAt = new Date(event.date);
    return offsets.flatMap(hours => {
      const at = startsAt.getTime() - hours * hourMs;
      if (!Number.isFinite(at) || at <= now) return [];
      const sameDay = new Date(at).toDateString() === startsAt.toDateString();
      if (hours !== 24 && !sameDay) return [];
      return [{ event, hours, at }];
    });
  }).sort((a, b) => a.at - b.at);
}
