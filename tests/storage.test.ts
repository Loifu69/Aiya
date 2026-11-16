import { describe, expect, it } from 'vitest';
import { DrinkLog } from '../src/types';
import {
  computeFriendStatus,
  formatRemainingTime,
  getIntakeForDayMl,
  localDayKey,
  logAmountMl,
  mergeLogs,
} from '../src/utils/storage';

const at = (iso: string) => new Date(iso).getTime();
const log = (id: string, iso: string, amountMl?: number): DrinkLog => ({
  id,
  userId: 'u1',
  action: 'SUDAH',
  timestamp: new Date(iso).toISOString(),
  amountMl,
});

describe('daily intake', () => {
  it('sums only the same local day, older logs count as 250 ml', () => {
    const now = at('2026-11-16T15:00:00');
    const logs = [
      log('a', '2026-11-16T08:00:00', 600),
      log('b', '2026-11-16T12:00:00'), // no amount -> 250
      log('c', '2026-11-15T23:59:00', 500), // yesterday
    ];
    expect(getIntakeForDayMl(logs, now)).toBe(850);
    expect(logAmountMl(log('x', '2026-11-16T08:00:00', 0))).toBe(250);
  });

  it('localDayKey is YYYY-MM-DD in local time', () => {
    expect(localDayKey(at('2026-01-05T23:30:00'))).toBe('2026-01-05');
  });
});

describe('mergeLogs', () => {
  it('dedupes by id and sorts newest first', () => {
    const a = [log('1', '2026-11-16T08:00:00'), log('2', '2026-11-16T10:00:00')];
    const b = [log('2', '2026-11-16T10:00:00'), log('3', '2026-11-16T09:00:00')];
    expect(mergeLogs(a, b).map((l) => l.id)).toEqual(['2', '3', '1']);
  });
});

describe('friend status', () => {
  const due = '2026-11-16T10:00:00';
  it('is SUDAH_MINUM before the due time', () => {
    expect(computeFriendStatus(due, at('2026-11-16T09:59:00'))).toBe('SUDAH_MINUM');
  });
  it('is WAKTUNYA_MINUM within the 5 minute grace period', () => {
    expect(computeFriendStatus(due, at('2026-11-16T10:04:00'))).toBe('WAKTUNYA_MINUM');
  });
  it('is TERLAMBAT after the grace period', () => {
    expect(computeFriendStatus(due, at('2026-11-16T10:06:00'))).toBe('TERLAMBAT');
  });
});

describe('formatRemainingTime', () => {
  const target = '2026-11-16T12:00:00';
  it('counts down', () => {
    expect(formatRemainingTime(target, at('2026-11-16T09:15:00')).text).toBe('dalam 2 jam 45 menit');
  });
  it('shows lateness', () => {
    const r = formatRemainingTime(target, at('2026-11-16T13:20:00'));
    expect(r.isOverdue).toBe(true);
    expect(r.text).toBe('Terlambat 1 jam 20 menit');
  });
});
