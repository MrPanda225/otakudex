const MS_PER_DAY = 86_400_000;

/** Days since 1970-01-01 for an ISO date ('YYYY-MM-DD'). */
export function dayNumberOf(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/**
 * Index of the Monday-to-Sunday week containing an ISO date.
 * Consecutive weeks have consecutive indexes. 1970-01-05 (a Monday) starts week 1.
 */
export function weekIndexOf(isoDate: string): number {
  return Math.floor((dayNumberOf(isoDate) + 3) / 7);
}

/** The Monday ('YYYY-MM-DD') of week number `weekIndex`. */
export function mondayOfWeek(weekIndex: number): string {
  return new Date((weekIndex * 7 - 3) * MS_PER_DAY).toISOString().slice(0, 10);
}
