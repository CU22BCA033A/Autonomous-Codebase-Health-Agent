/**
 * Consecutive completed days ending today (or yesterday, so the streak isn't shown as broken
 * before today's work is done). Rest and exam days never break a streak.
 */
export function currentStreak(completedDays: Set<number>, today: number, freeDays: Set<number> = new Set()): number {
  let day = completedDays.has(today) ? today : today - 1;
  let streak = 0;
  while (day >= 1) {
    if (completedDays.has(day)) streak++;
    else if (!freeDays.has(day)) break;
    day--;
  }
  return streak;
}
