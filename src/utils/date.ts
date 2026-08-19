import { logger } from './logger';

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const enum CharCode {
  Zero = 48,
  Plus = 43,
  Dash = 45,
  Dot = 46,
  Colon = 58,
  T = 84,
  Z = 90,
}

// ISO-8601 date/times that carry no time zone designator, matched so the
// UTC interpretation below also applies through the `Date.parse` fallback.
const ZONELESS_START = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const TIMEZONE_SUFFIX = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i;

let warnedMissingTimezone = false;

function warnMissingTimezone(value: string) {
  if (!warnedMissingTimezone) {
    warnedMissingTimezone = true;
    logger.warn(
      `Date/time value without a timezone treated as UTC: "${value}"`,
    );
  }
}

// Consecutive playlist date/times almost always share a `YYYY-MM-DD` prefix,
// so the epoch value of the most recently parsed date is memoized. Only
// written from a fully validated parse, and a hit requires the first ten
// characters to equal that validated prefix, so the cache affects speed,
// never results.
let cachedDate = '';
let cachedDateMs = 0;

/**
 * Parse an HLS playlist date/time value (`EXT-X-PROGRAM-DATE-TIME`, and the
 * `START-DATE`/`END-DATE` attributes of `EXT-X-DATERANGE`) into a timestamp
 * in milliseconds since the epoch. Returns NaN for values that cannot be
 * parsed. Tolerates non-string values at runtime, matching `Date.parse`
 * coercion.
 *
 * Values without a time zone designator are treated as UTC, as
 * draft-pantos-hls-rfc8216bis-17 says clients SHOULD (JavaScript
 * `Date.parse` would interpret them as local time); the first such value
 * is reported with a warning.
 */
export function parseDateTime(value: string): number {
  // This body runs for every fragment on every live playlist reload, and its
  // shape is measurement-driven: extracting per-parse helpers cost -40% wall
  // time on Firefox (SpiderMonkey did not inline them), so digit extraction
  // stays unrolled and inline. `(d >>> 0) > 9` rejects any charCodeAt result
  // outside '0'..'9' in one compare. A read past the end of the string
  // yields NaN, which `>>> 0` maps to 0 and the digit checks accept; such
  // truncated strings are instead rejected by the exact length requirement
  // on the zone designator, the only path to the timestamp return.
  fast: {
    if (typeof value !== 'string' || value.length < 16) {
      break fast;
    }
    if (
      value.charCodeAt(10) !== CharCode.T ||
      value.charCodeAt(13) !== CharCode.Colon
    ) {
      break fast;
    }
    let dateMs: number;
    if (cachedDate !== '' && value.startsWith(cachedDate)) {
      dateMs = cachedDateMs;
    } else {
      if (
        value.charCodeAt(4) !== CharCode.Dash ||
        value.charCodeAt(7) !== CharCode.Dash
      ) {
        break fast;
      }
      const y0 = value.charCodeAt(0) - CharCode.Zero;
      const y1 = value.charCodeAt(1) - CharCode.Zero;
      const y2 = value.charCodeAt(2) - CharCode.Zero;
      const y3 = value.charCodeAt(3) - CharCode.Zero;
      const mo0 = value.charCodeAt(5) - CharCode.Zero;
      const mo1 = value.charCodeAt(6) - CharCode.Zero;
      const d0 = value.charCodeAt(8) - CharCode.Zero;
      const d1 = value.charCodeAt(9) - CharCode.Zero;
      if (
        y0 >>> 0 > 9 ||
        y1 >>> 0 > 9 ||
        y2 >>> 0 > 9 ||
        y3 >>> 0 > 9 ||
        mo0 >>> 0 > 9 ||
        mo1 >>> 0 > 9 ||
        d0 >>> 0 > 9 ||
        d1 >>> 0 > 9
      ) {
        break fast;
      }
      const year = y0 * 1000 + y1 * 100 + y2 * 10 + y3;
      const month = mo0 * 10 + mo1;
      const day = d0 * 10 + d1;
      if (month - 1 > 11 || day - 1 > 30 || month === 0 || day === 0) {
        break fast;
      }
      if (
        day > MONTH_DAYS[month - 1] &&
        !(
          month === 2 &&
          day === 29 &&
          year % 4 === 0 &&
          (year % 100 !== 0 || year % 400 === 0)
        )
      ) {
        break fast;
      }
      // Days since the epoch from the civil date (Howard Hinnant's algorithm)
      const shiftedYear = month <= 2 ? year - 1 : year;
      const era = Math.floor(shiftedYear / 400);
      const yearOfEra = shiftedYear - era * 400;
      const dayOfYear = ((153 * ((month + 9) % 12) + 2) / 5) | 0;
      const dayOfEra =
        yearOfEra * 365 +
        ((yearOfEra / 4) | 0) -
        ((yearOfEra / 100) | 0) +
        dayOfYear +
        day -
        1;
      dateMs = (era * 146097 + dayOfEra - 719468) * 86400000;
      cachedDate = value.slice(0, 10);
      cachedDateMs = dateMs;
    }
    const h0 = value.charCodeAt(11) - CharCode.Zero;
    const h1 = value.charCodeAt(12) - CharCode.Zero;
    const mi0 = value.charCodeAt(14) - CharCode.Zero;
    const mi1 = value.charCodeAt(15) - CharCode.Zero;
    if (h0 >>> 0 > 9 || h1 >>> 0 > 9 || mi0 >>> 0 > 9 || mi1 >>> 0 > 9) {
      break fast;
    }
    const hours = h0 * 10 + h1;
    const minutes = mi0 * 10 + mi1;
    if (hours > 23 || minutes > 59) {
      break fast;
    }
    let position = 16;
    let seconds = 0;
    let milliseconds = 0;
    if (value.charCodeAt(position) === CharCode.Colon) {
      const s0 = value.charCodeAt(17) - CharCode.Zero;
      const s1 = value.charCodeAt(18) - CharCode.Zero;
      if (s0 >>> 0 > 5 || s1 >>> 0 > 9) {
        break fast;
      }
      seconds = s0 * 10 + s1;
      position = 19;
      if (value.charCodeAt(position) === CharCode.Dot) {
        const f0 = value.charCodeAt(20) - CharCode.Zero;
        const f1 = value.charCodeAt(21) - CharCode.Zero;
        const f2 = value.charCodeAt(22) - CharCode.Zero;
        if (f0 >>> 0 > 9 || f1 >>> 0 > 9 || f2 >>> 0 > 9) {
          break fast;
        }
        milliseconds = f0 * 100 + f1 * 10 + f2;
        position = 23;
      }
    }
    const zone = value.charCodeAt(position);
    let offsetMinutes = 0;
    if (zone === CharCode.Z) {
      if (position + 1 !== value.length) {
        break fast;
      }
    } else if (zone === CharCode.Plus || zone === CharCode.Dash) {
      const o0 = value.charCodeAt(position + 1) - CharCode.Zero;
      const o1 = value.charCodeAt(position + 2) - CharCode.Zero;
      const o2 = value.charCodeAt(position + 4) - CharCode.Zero;
      const o3 = value.charCodeAt(position + 5) - CharCode.Zero;
      if (
        o0 >>> 0 > 2 ||
        o1 >>> 0 > 9 ||
        o2 >>> 0 > 5 ||
        o3 >>> 0 > 9 ||
        value.charCodeAt(position + 3) !== CharCode.Colon ||
        position + 6 !== value.length
      ) {
        break fast;
      }
      const offsetHours = o0 * 10 + o1;
      if (offsetHours > 23) {
        break fast;
      }
      offsetMinutes = offsetHours * 60 + o2 * 10 + o3;
      if (zone === CharCode.Dash) {
        offsetMinutes = -offsetMinutes;
      }
    } else if (position === value.length) {
      // No time zone designator: treat as UTC per draft-pantos-hls-rfc8216bis
      warnMissingTimezone(value);
    } else {
      break fast;
    }
    return (
      dateMs +
      hours * 3600000 +
      (minutes - offsetMinutes) * 60000 +
      seconds * 1000 +
      milliseconds
    );
  }
  if (ZONELESS_START.test(value) && !TIMEZONE_SUFFIX.test(value)) {
    warnMissingTimezone(value);
    return Date.parse(value + 'Z');
  }
  return Date.parse(value);
}
