/**
 * The bar reserves its strip by shifting the document down, which works on an
 * ordinary page and cannot work on an app whose own chrome is `position: fixed`
 * — Google Meet, most video calls, anything laid out against the viewport
 * rather than the document. There the strip has nothing to push, so it lands on
 * top of the app's own toolbar.
 *
 * No stylesheet can fix that from a content script, so the answer is to not
 * inject there at all, and to let the user say where "there" is.
 */
export const HIDDEN_SITE_DEFAULTS = ['meet.google.com'];

/**
 * Accepts what a person would actually type — `meet.google.com`,
 * `https://meet.google.com/abc-defg-hij`, `www.example.com/page` — and keeps
 * the hostname alone. Returns null when nothing usable is left.
 */
export function normalizeSite(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0) return null;

  let host = trimmed;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(host) ? host : `https://${host}`;
  try {
    host = new URL(withScheme).hostname;
  } catch {
    // Not a URL at all; fall back to the first path-free chunk.
    host = trimmed.split('/')[0];
  }
  host = host.replace(/^www\./, '');
  // A bare label like "meet" would match nothing and silently do nothing, so it
  // is rejected rather than stored — `localhost` excepted, since it is a real
  // host and the one a developer is most likely to want off.
  if (host.includes(' ')) return null;
  return host.includes('.') || host === 'localhost' ? host : null;
}

/**
 * A stored site covers its subdomains: `google.com` hides `meet.google.com`
 * too. That is the behaviour people expect from a site list, and the narrower
 * reading — exact host only — makes the common case (a whole product on many
 * subdomains) tedious to express.
 */
export function isHiddenSite(hostname: string, sites: readonly string[]): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return sites.some((site) => {
    const target = site.toLowerCase().replace(/^www\./, '');
    return host === target || host.endsWith(`.${target}`);
  });
}
