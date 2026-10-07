// Overpass client with mirror failover. Never hardcode a single endpoint —
// single-endpoint Overpass code is the most common cause of this kind of app
// silently breaking.
//
// Mirrors are raced, not queued: the first starts at once, the next joins
// every HEDGE_MS while nothing has answered, the first good answer wins and
// the rest are cancelled. One hung mirror used to stall a search for 30 s
// before the next was even tried.

const DEFAULT_MIRRORS =
  'https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter,https://maps.mail.ru/osm/tools/overpass/api/interpreter,https://overpass.private.coffee/api/interpreter';

const HEDGE_MS = 1500;
// After every mirror has failed, skip Overpass for a while so searches go
// straight to the fallback instead of each waiting out the timeout again.
const COOL_OFF_MS = 120000;
let downUntil = 0;

function downError(detail) {
  const error = new Error(`All Overpass mirrors failed — ${detail}`);
  error.code = 'OVERPASS_DOWN';
  return error;
}

function mirrors() {
  return (process.env.OVERPASS_URLS || DEFAULT_MIRRORS)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function overpassQuery(query, { timeoutMs = 9000 } = {}) {
  if (Date.now() < downUntil) throw downError('cooling off after a recent outage');
  const urls = mirrors();
  const errors = [];
  const controllers = urls.map(() => new AbortController());
  const deadline = setTimeout(() => controllers.forEach((c) => c.abort()), timeoutMs);

  const attempt = async (url, i) => {
    if (i) await new Promise((r) => setTimeout(r, i * HEDGE_MS));
    if (controllers[i].signal.aborted) throw new Error('cancelled');
    try {
      // A User-Agent is required (kumi 429s without one), but overpass-api.de's
      // WAF 406s any UA containing an email/@ — so a plain product token only.
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': 'halfway/0.1',
        },
        body: 'data=' + encodeURIComponent(query),
        signal: controllers[i].signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Overpass reports an overloaded query as 200 + "remark", with no elements.
      if (!data.elements?.length && /runtime error|timed out|out of memory/i.test(data.remark || '')) {
        throw new Error(data.remark.slice(0, 80));
      }
      controllers.forEach((c, j) => j !== i && c.abort());
      return data;
    } catch (err) {
      errors.push(`${url}: ${err.name === 'AbortError' ? 'timeout' : err.message}`);
      throw err;
    }
  };

  try {
    return await Promise.any(urls.map(attempt));
  } catch {
    downUntil = Date.now() + COOL_OFF_MS;
    throw downError(errors.join('; '));
  } finally {
    clearTimeout(deadline);
  }
}
