import type { YardId } from "./types";

/** Compact daily NOAA GHCN-Daily series per yard (built by scripts/build-weather.ts). */
export interface StationSeries {
  station: string;
  start: string; // first date, ISO
  tmax: (number | null)[];
  tmin: (number | null)[];
  prcp: (number | null)[];
}
export type WeatherData = Partial<Record<YardId, StationSeries>>;

export interface ArrivalWeather {
  tempSwingF: number | null;
  minTempF: number | null;
  precipIn: number | null;
}

const DAY = 86400000;
export const dayIndex = (start: string, date: string) => Math.round((Date.parse(date) - Date.parse(start)) / DAY);

/**
 * Weather exposure in the arrival week (arrival day through day 6):
 *  - tempSwingF: largest day-to-day change in the daily high (°F)
 *  - minTempF:   coldest overnight low (°F)
 *  - precipIn:   total precipitation (inches)
 */
export function arrivalWeather(series: StationSeries | undefined, date: string): ArrivalWeather {
  if (!series) return { tempSwingF: null, minTempF: null, precipIn: null };
  const i0 = dayIndex(series.start, date);
  if (i0 < 1 || i0 + 6 >= series.tmax.length) return { tempSwingF: null, minTempF: null, precipIn: null };
  let swing: number | null = null;
  let minT: number | null = null;
  let pr: number | null = null;
  for (let i = i0; i <= i0 + 6; i++) {
    const a = series.tmax[i];
    const b = series.tmax[i - 1];
    if (a != null && b != null) swing = Math.max(swing ?? 0, Math.abs(a - b));
    const lo = series.tmin[i];
    if (lo != null) minT = minT == null ? lo : Math.min(minT, lo);
    const p = series.prcp[i];
    if (p != null) pr = (pr ?? 0) + p;
  }
  return {
    tempSwingF: swing,
    minTempF: minT,
    precipIn: pr == null ? null : Math.round(pr * 100) / 100,
  };
}

export function seriesEnd(series: StationSeries): string {
  return new Date(Date.parse(series.start) + (series.tmax.length - 1) * DAY).toISOString().slice(0, 10);
}
