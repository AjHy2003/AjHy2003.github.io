// Weather data from Open-Meteo (free, no API key) and official alerts from the
// US National Weather Service (free, no key, US locations only).
const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const NWS = 'https://api.weather.gov/alerts/active';

async function getJson(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Weather service error ${res.status}`);
  return res.json();
}

export async function searchCities(query) {
  const q = query.trim();
  if (q.length < 2) return [];
  const json = await getJson(`${GEO}?name=${encodeURIComponent(q)}&count=8&language=en&format=json`);
  return (json.results || []).map((r) => ({
    id: r.id,
    name: r.name,
    region: r.admin1 || '',
    country: r.country_code || r.country || '',
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone || 'auto',
  }));
}

export async function getForecast({ latitude, longitude }) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current:
      'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,is_day,precipitation',
    hourly: 'temperature_2m,precipitation_probability,weather_code,wind_gusts_10m,is_day',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_gusts_10m_max,sunrise,sunset,uv_index_max',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: 'auto',
    forecast_days: '7',
  });
  const j = await getJson(`${FORECAST}?${params}`);
  const c = j.current;

  // Next 24 hours starting from the current hour.
  const nowIdx = Math.max(0, j.hourly.time.findIndex((t) => t >= c.time.slice(0, 13)));
  const hourly = j.hourly.time.slice(nowIdx, nowIdx + 24).map((time, i) => ({
    time,
    temp: Math.round(j.hourly.temperature_2m[nowIdx + i]),
    rain: j.hourly.precipitation_probability[nowIdx + i] ?? 0,
    code: j.hourly.weather_code[nowIdx + i],
    isDay: j.hourly.is_day[nowIdx + i] === 1,
  }));

  const daily = j.daily.time.map((date, i) => ({
    date,
    code: j.daily.weather_code[i],
    high: Math.round(j.daily.temperature_2m_max[i]),
    low: Math.round(j.daily.temperature_2m_min[i]),
    rain: j.daily.precipitation_probability_max[i] ?? 0,
    gusts: Math.round(j.daily.wind_gusts_10m_max[i] ?? 0),
    uv: j.daily.uv_index_max?.[i] ?? null,
    sunrise: j.daily.sunrise[i],
    sunset: j.daily.sunset[i],
  }));

  return {
    current: {
      time: c.time,
      temp: Math.round(c.temperature_2m),
      feelsLike: Math.round(c.apparent_temperature),
      humidity: c.relative_humidity_2m,
      wind: Math.round(c.wind_speed_10m),
      gusts: Math.round(c.wind_gusts_10m ?? 0),
      precipitation: c.precipitation,
      code: c.weather_code,
      isDay: c.is_day === 1,
    },
    hourly,
    daily,
  };
}

// Official NWS alerts. Returns [] outside the US or if the service is unavailable.
export async function getOfficialAlerts({ latitude, longitude }) {
  try {
    const j = await getJson(`${NWS}?point=${latitude.toFixed(4)},${longitude.toFixed(4)}`, {
      Accept: 'application/geo+json',
    });
    return (j.features || []).map((f) => ({
      id: f.properties.id,
      event: f.properties.event,
      headline: f.properties.headline,
      severity: f.properties.severity,
      description: f.properties.description,
      ends: f.properties.ends || f.properties.expires,
    }));
  } catch {
    return [];
  }
}

// WMO weather codes -> label + a theme-independent condition key.
const CODES = {
  0: ['Clear sky', 'clear'],
  1: ['Mostly clear', 'clear'],
  2: ['Partly cloudy', 'partly'],
  3: ['Overcast', 'cloudy'],
  45: ['Fog', 'fog'],
  48: ['Freezing fog', 'fog'],
  51: ['Light drizzle', 'drizzle'],
  53: ['Drizzle', 'drizzle'],
  55: ['Heavy drizzle', 'drizzle'],
  56: ['Freezing drizzle', 'sleet'],
  57: ['Freezing drizzle', 'sleet'],
  61: ['Light rain', 'rain'],
  63: ['Rain', 'rain'],
  65: ['Heavy rain', 'rain'],
  66: ['Freezing rain', 'sleet'],
  67: ['Freezing rain', 'sleet'],
  71: ['Light snow', 'snow'],
  73: ['Snow', 'snow'],
  75: ['Heavy snow', 'snow'],
  77: ['Snow grains', 'snow'],
  80: ['Rain showers', 'rain'],
  81: ['Rain showers', 'rain'],
  82: ['Violent showers', 'storm'],
  85: ['Snow showers', 'snow'],
  86: ['Snow showers', 'snow'],
  95: ['Thunderstorm', 'storm'],
  96: ['Thunderstorm + hail', 'storm'],
  99: ['Thunderstorm + hail', 'storm'],
};

export function describe(code) {
  const [label, kind] = CODES[code] || ['Unknown', 'cloudy'];
  return { label, kind };
}

export const dayName = (iso, i) =>
  i === 0 ? 'Today' : new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });

export const hourLabel = (iso, i) => {
  if (i === 0) return 'Now';
  const h = Number(iso.slice(11, 13));
  return `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;
};
