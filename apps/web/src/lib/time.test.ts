import { describe, expect, it } from 'vitest';
import { addDays, formatTime, sastDate, sastInstant } from './time';

describe('SAST time helpers', () => {
  it('converts wall-clock SAST to a UTC instant', () => {
    expect(new Date(sastInstant('2026-03-02', '09:30')).toISOString()).toBe(
      '2026-03-02T07:30:00.000Z',
    );
  });
  it('formats UTC instants in Africa/Johannesburg', () => {
    expect(formatTime('2026-03-02T07:30:00.000Z')).toBe('09:30');
    expect(sastDate('2026-03-02T22:30:00.000Z')).toBe('2026-03-03'); // already next day in SAST
  });
  it('adds days across month boundaries', () => {
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
    expect(addDays('2026-03-02', -2)).toBe('2026-02-28');
  });
});
