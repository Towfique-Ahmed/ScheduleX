import { Post, Slot } from '../types';

const minuteKey = (d: Date) => Math.floor(d.getTime() / 60000);

const slotDate = (base: Date, time: string) => {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
};

/** Upcoming occurrences of the weekly slots, in order, starting after `from`. */
export function upcomingSlots(slots: Slot[], from = new Date(), days = 60): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(from);
    day.setDate(from.getDate() + i);
    slots
      .filter(s => s.day === day.getDay())
      .map(s => slotDate(day, s.time))
      .sort((a, b) => a.getTime() - b.getTime())
      .forEach(d => { if (d.getTime() > from.getTime()) out.push(d); });
  }
  return out;
}

/** Next slot that no other scheduled post already occupies (Buffer-style queue). */
export function nextFreeSlot(slots: Slot[], posts: Post[], from = new Date()): Date | null {
  const taken = new Set(
    posts.filter(p => p.status === 'scheduled' && p.scheduledAt).map(p => minuteKey(new Date(p.scheduledAt!))),
  );
  return upcomingSlots(slots, from).find(d => !taken.has(minuteKey(d))) ?? null;
}

/**
 * General posting-time guidance, not derived from this account's data.
 * Real per-account "best time" needs platform analytics.
 */
export const SUGGESTED_SLOTS: { day: number; time: string }[] = [1, 2, 3, 4, 5].flatMap(day =>
  ['09:00', '12:30', '17:30'].map(time => ({ day, time })),
);

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Local yyyy-mm-dd, for grouping and <input type="date">. */
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
