// src/utils/time.ts
// No external timezone libs — using built-in Date with fixed IST offset.

/**
 * We will use luxon for easier timezone math but avoid adding it to package.json to keep deps minimal.
 * Instead, we will implement with JS Date and fixed IST offset (5.5 hours). Simpler and deterministic.
 */

export const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const PEAK_MULTIPLIER = 1.5;
const MIN_IN_HOUR = 60;

export function istStringToUTC(istIsoLike: string): string {
  // istIsoLike expected as ISO UTC string already. For backend clients we expect proper ISO timestamps (UTC).
  // This helper mainly used for computing IST boundaries from UTC timestamps.
  return istIsoLike;
}

export function isWeekdayIst(date: Date): boolean {
  const istMillis = date.getTime() + IST_OFFSET_MS;
  const d = new Date(istMillis);
  const day = d.getUTCDay(); // 0 Sun ... 6 Sat
  return day >= 1 && day <= 5;
}

function peakWindowsForIstDayFromInstant(instant: Date) {
  // given any instant, compute the IST calendar day for that instant, then produce two UTC Date objects
  const istMillis = instant.getTime() + IST_OFFSET_MS;
  const ist = new Date(istMillis);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const d = ist.getUTCDate();

  function istToUtcDate(h: number, min: number) {
    const istMillisLocal = Date.UTC(y, m, d, h, min);
    const utcMillis = istMillisLocal - IST_OFFSET_MS;
    return new Date(utcMillis);
  }

  const w1 = { start: istToUtcDate(10, 0), end: istToUtcDate(13, 0) };
  const w2 = { start: istToUtcDate(16, 0), end: istToUtcDate(19, 0) };
  return [w1, w2];
}

function overlapMinutes(a: Date, b: Date, c: Date, d: Date) {
  const start = Math.max(a.getTime(), c.getTime());
  const end = Math.min(b.getTime(), d.getTime());
  return Math.max(0, Math.round((end - start) / 60000));
}

export function estimatePriceForInterval(baseHourlyRate: number, startUtc: Date, endUtc: Date) {
  if (!(startUtc < endUtc)) return { total: 0, breakdown: [] };
  const totalMinutes = Math.max(0, Math.round((endUtc.getTime() - startUtc.getTime()) / 60000));
  let peakMinutes = 0;
  // iterate each IST day touched by the interval
  let cursor = new Date(Date.UTC(startUtc.getUTCFullYear(), startUtc.getUTCMonth(), startUtc.getUTCDate(), 0, 0, 0));
  // Move cursor to startUtc day in UTC; iterate until >endUtc
  cursor = new Date(Date.UTC(startUtc.getUTCFullYear(), startUtc.getUTCMonth(), startUtc.getUTCDate(), 0, 0, 0));
  while (cursor < endUtc) {
    if (isWeekdayIst(cursor)) {
      const windows = peakWindowsForIstDayFromInstant(cursor);
      for (const w of windows) {
        peakMinutes += overlapMinutes(startUtc, endUtc, w.start, w.end);
      }
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  const offpeakMinutes = totalMinutes - peakMinutes;
  const peakAmount = (peakMinutes / MIN_IN_HOUR) * baseHourlyRate * PEAK_MULTIPLIER;
  const offAmount = (offpeakMinutes / MIN_IN_HOUR) * baseHourlyRate;
  const total = Number((peakAmount + offAmount).toFixed(2));
  const breakdown = [];
  if (peakMinutes > 0) breakdown.push({ label: "Peak hours", minutes: peakMinutes, amount: Number(peakAmount.toFixed(2)) });
  if (offpeakMinutes > 0) breakdown.push({ label: "Off-peak hours", minutes: offpeakMinutes, amount: Number(offAmount.toFixed(2)) });
  return { total, breakdown, totalMinutes };
}
