/**
 * Sites the strip stays off out of the box.
 *
 * The bar reserves its space by shifting the document down, which works on an
 * ordinary page and cannot work on an app anchored to the *window* — its chrome
 * is `position: fixed`, so moving the document moves nothing and the strip
 * lands on the app's own toolbar. No stylesheet fixes that from a content
 * script; the only answer is to not inject there.
 *
 * This list is maintained rather than final: it grows as sites turn out to
 * behave this way, and a shipped addition reaches everyone, because what is
 * stored is the user's *edits* to this list rather than a copy of it. Anything
 * missing can be added on the config page.
 */
export const HIDDEN_SITE_DEFAULTS = [
  // Video calls: the whole window is the app, and its controls are pinned to it.
  'meet.google.com',
  'zoom.us',
  'teams.microsoft.com',
  'discord.com',
  'whereby.com',
  // Workspace apps with a fixed toolbar the strip would land on.
  'mail.google.com',
  'docs.google.com',
  'calendar.google.com',
  'slack.com',
  'notion.so',
  'figma.com',
  'linear.app'
];

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

/** What the user has changed about the shipped list, and nothing more. */
export interface HiddenSiteEdits {
  /** Sites added beyond the defaults. */
  added: string[];
  /** Defaults the user has explicitly put back. */
  removed: string[];
}

/**
 * Stored as edits rather than as the resulting list, so a default added in a
 * later version still reaches an install that has already been customised —
 * storing the result would freeze each user on the list that shipped the day
 * they first touched it.
 */
export function effectiveSites(edits: HiddenSiteEdits): string[] {
  const removed = new Set(edits.removed);
  return [...new Set([...HIDDEN_SITE_DEFAULTS.filter((site) => !removed.has(site)), ...edits.added])];
}

/** The inverse: what the user must have changed for this list to be the result. */
export function toEdits(sites: readonly string[]): HiddenSiteEdits {
  const wanted = new Set(sites);
  return {
    added: sites.filter((site) => !HIDDEN_SITE_DEFAULTS.includes(site)),
    removed: HIDDEN_SITE_DEFAULTS.filter((site) => !wanted.has(site))
  };
}

/**
 * The list shipped by the first version that had one. A stored array came from
 * that version, so it must be diffed against *those* defaults: reading it
 * against today's would record every default added since as one the user had
 * removed, and permanently opt them out of a list they never saw.
 */
const LEGACY_DEFAULTS = ['meet.google.com'];

/** Accepts the edits shape, and the plain array an earlier version stored. */
export function readEdits(stored: unknown): HiddenSiteEdits {
  if (Array.isArray(stored)) {
    const sites = stored.filter((site): site is string => typeof site === 'string');
    const wanted = new Set(sites);
    return {
      added: sites.filter((site) => !LEGACY_DEFAULTS.includes(site)),
      removed: LEGACY_DEFAULTS.filter((site) => !wanted.has(site))
    };
  }
  const edits = stored as Partial<HiddenSiteEdits> | undefined;
  return {
    added: Array.isArray(edits?.added) ? edits.added.filter((s): s is string => typeof s === 'string') : [],
    removed: Array.isArray(edits?.removed) ? edits.removed.filter((s): s is string => typeof s === 'string') : []
  };
}
