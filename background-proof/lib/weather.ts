import { HOUR, type Environment } from "./world";
const units: Environment["units"] = { temperature: "°C", precipitation: "mm", cloud: "%", wind: "km/h" };
export const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=-12.4634&longitude=130.8456&hourly=temperature_2m,precipitation,cloud_cover,wind_speed_10m,is_day&daily=sunrise,sunset&timezone=GMT&timeformat=unixtime&past_days=3&forecast_days=2&temperature_unit=celsius&wind_speed_unit=kmh&precipitation_unit=mm";
type Forecast = { utc_offset_seconds?: number; hourly_units?: Record<string, string>; hourly?: Record<string, unknown>;
  daily?: { time?: number[]; sunrise?: number[]; sunset?: number[] } };
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);
export function parseForecast(raw: unknown, fetchedAt: number, transport: Environment["transport"] = "worker-fetch"): Environment[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid weather payload");
  const data = raw as Forecast;
  const h = data.hourly; const u = data.hourly_units;
  if (!h || data.utc_offset_seconds !== 0 || !Array.isArray(h.time) || u?.temperature_2m !== "°C" || u.precipitation !== "mm" || u.cloud_cover !== "%" || u.wind_speed_10m !== "km/h") throw new Error("Unexpected weather format or units");
  if (h.time.length > 200 || !["temperature_2m", "precipitation", "cloud_cover", "wind_speed_10m", "is_day"].every(k => Array.isArray(h[k]) && h[k].length === (h.time as unknown[]).length)) throw new Error("Invalid weather arrays");
  const lastComplete = Math.floor(fetchedAt / HOUR) * HOUR; const fetchRevision = crypto.randomUUID();
  return h.time.flatMap((seconds: unknown, i: number): Environment[] => {
    const get = (name: string) => Array.isArray(h[name]) ? h[name][i] : undefined;
    const t = get("temperature_2m"), rain = get("precipitation"), cloud = get("cloud_cover"), wind = get("wind_speed_10m"), day = get("is_day");
    if (!finite(seconds) || !finite(t) || !finite(rain) || !finite(cloud) || !finite(wind) || (day !== 0 && day !== 1)) return [];
    const end = (seconds as number) * 1000;
    if (end % HOUR !== 0 || end > lastComplete || (rain as number) < 0 || (wind as number) < 0 || (cloud as number) < 0 || (cloud as number) > 100 || (t as number) < -100 || (t as number) > 70) return [];
    const dailyIndex = data.daily?.time?.findIndex(v => Math.floor(v / 86400) === Math.floor((seconds as number) / 86400)) ?? -1;
    const sun = (name: "sunrise" | "sunset") => { const value = data.daily?.[name]?.[dailyIndex]; return finite(value) ? value! * 1000 : null; };
    return [{ id: `meteo:${end}:${fetchedAt}:${fetchRevision}`, city: "darwin", provider: "open-meteo:best_match", validStart: end - HOUR, validEnd: end, fetchedAt,
      sourceStatus: "modelled", transport, temperatureC: t as number, precipitationMm: rain as number, cloudPercent: cloud as number,
      windKmh: wind as number, isDay: day === 1, sunrise: sun("sunrise"), sunset: sun("sunset"), units }];
  });
}
export async function collectWeather(now: number, fetcher: typeof fetch = fetch) {
  const response = await fetcher(WEATHER_URL, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
  const samples = parseForecast(await response.json(), now); if (!samples.length) throw new Error("No complete weather intervals"); return samples;
}
export function missingInput(tickId: number, now: number): Environment {
  const end = tickId * HOUR; const localHour = new Date(end + 9.5 * HOUR).getUTCHours();
  // Never carry rainfall from a different interval into a missing interval.
  return { id: `fallback:${end}:${now}:v2`, city: "darwin", provider: "stillwild:fallback", validStart: end - HOUR, validEnd: end, fetchedAt: now,
    sourceStatus: "simulated", transport: "fallback", temperatureC: 28, precipitationMm: 0, cloudPercent: 40, windKmh: 5,
    isDay: localHour >= 6 && localHour < 18, sunrise: null, sunset: null, units };
}
export function archivedInput(sample: Environment, now: number): Environment {
  return { ...sample, sourceStatus: now - sample.fetchedAt > 6 * HOUR ? "stale" : sample.sourceStatus };
}
