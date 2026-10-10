/**
 * AIRWISE — Data Quality Assessment Module
 * ─────────────────────────────────────────
 * Pure function — no I/O. Accepts telemetry and produces a structured
 * DataQuality object used by both the backend API responses and the
 * frontend Trust Engine UI components.
 *
 * qualityStatus: "good" | "limited" | "stale" | "insufficient" | "unavailable"
 * - good: observations available, fresh, sufficient coverage
 * - limited: forecast-only, but fresh and sufficient coverage
 * - stale: data is older than the configured threshold
 * - insufficient: required pollutants have < 18 valid hourly values
 * - unavailable: no forecast or observation data at all
 */

const FORECAST_STALE_HOURS = 6;
const OBSERVATION_STALE_HOURS = 2;
const REQUIRED_POLLUTANTS = ["pm2_5", "pm10"];
const OPTIONAL_POLLUTANTS = ["nitrogen_dioxide", "ozone", "sulphur_dioxide", "carbon_monoxide"];

export function assessDataQuality({
  forecast = [],
  observations = [],
  retrievedAt,
  sourceName,
  stationDistanceKm = null,
  existingWarnings = [],
}) {
  const now = Date.now();
  const retrievedMs = new Date(retrievedAt).getTime();
  const ageMinutes = Number.isFinite(retrievedMs)
    ? Math.round((now - retrievedMs) / 60000)
    : null;

  const hasObs = observations.length > 0;
  const hasForecast = forecast.length > 0;
  let sourceType = "unavailable";
  if (hasObs && hasForecast) sourceType = "mixed";
  else if (hasObs) sourceType = "observed";
  else if (hasForecast) sourceType = "forecast";

  const forecastAge = ageMinutes !== null ? ageMinutes * 60000 : Infinity;
  const isStale = hasObs
    ? forecastAge > OBSERVATION_STALE_HOURS * 3600000
    : forecastAge > FORECAST_STALE_HOURS * 3600000;

  const windowStart = now - 3600000;
  const windowEnd = now + 24 * 3600000;
  const validPollutants = [];
  const missingPollutants = [];
  const pollutantHours = {};

  for (const p of [...REQUIRED_POLLUTANTS, ...OPTIONAL_POLLUTANTS]) {
    const pts = forecast.filter(
      (f) =>
        f.pollutant === p &&
        Number.isFinite(f.value) &&
        f.value >= 0 &&
        Date.parse(f.time) >= windowStart &&
        Date.parse(f.time) < windowEnd
    );
    pollutantHours[p] = pts.length;
    if (pts.length > 0) validPollutants.push(p);
    else missingPollutants.push(p);
  }

  const pm25Hours = pollutantHours["pm2_5"] || 0;
  const pm10Hours = pollutantHours["pm10"] || 0;
  const validHourCount = Math.max(pm25Hours, pm10Hours);
  const expectedHourCount = 24;
  const coveragePercent =
    expectedHourCount > 0
      ? Math.min(100, Math.round((validHourCount / expectedHourCount) * 100))
      : 0;

  const warnings = [...existingWarnings];
  if (!hasObs) {
    warnings.push(
      "No measured station observation available. All values are MODELLED FORECASTS (ECMWF CAMS), not physical sensor readings."
    );
  }
  if (isStale && ageMinutes !== null) {
    warnings.push(
      `Data retrieved ${ageMinutes} minutes ago. Conditions may have changed.`
    );
  }
  if (pm25Hours < 18) {
    warnings.push(
      `PM\u2082.\u2085 has only ${pm25Hours}/24 valid hourly values \u2014 insufficient for a regulatory 24-hour mean.`
    );
  }
  if (pm10Hours < 18) {
    warnings.push(
      `PM\u2081\u2080 has only ${pm10Hours}/24 valid hourly values \u2014 insufficient for a regulatory 24-hour mean.`
    );
  }

  const limitations = [
    "Forecast values are modelled estimates and may differ from actual on-campus conditions.",
    "Forecasts cover the nearest grid cell, not a campus-mounted sensor.",
    "A forecast-derived hourly estimate is not equivalent to an official regulatory 24-hour measurement.",
  ];
  if (!hasObs) {
    limitations.push(
      "Ground-station integration requires a verified OpenAQ station linked to this campus."
    );
  }

  let qualityStatus;
  if (!hasForecast && !hasObs) qualityStatus = "unavailable";
  else if (pm25Hours < 18 || pm10Hours < 18) qualityStatus = "insufficient";
  else if (isStale) qualityStatus = "stale";
  else if (!hasObs) qualityStatus = "limited";
  else qualityStatus = "good";

  return {
    sourceType,
    sourceName:
      sourceName ||
      (hasObs
        ? "OpenAQ + Open-Meteo Air Quality (CAMS)"
        : "Open-Meteo Air Quality (CAMS model)"),
    retrievedAt,
    ageMinutes,
    isStale,
    validPollutants,
    missingPollutants,
    validHourCount,
    expectedHourCount,
    coveragePercent,
    stationDistanceKm,
    qualityStatus,
    warnings: [...new Set(warnings)],
    limitations,
    pollutantHours,
  };
}

export function qualityStatusLabel(status) {
  return (
    {
      good: "Good",
      limited: "Limited (Forecast Only)",
      stale: "Stale",
      insufficient: "Insufficient Coverage",
      unavailable: "Unavailable",
    }[status] ?? status
  );
}
