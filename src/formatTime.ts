const pad2 = (n: number): string => ('0' + n).slice(-2);
export function formatTime(seconds: number, direction?: string) {
  if (typeof seconds !== 'number') return '';
  let sign = '';
  if (seconds < 0) {
    seconds = -1 * seconds;
    sign = '-';
  }
  const date = new Date(seconds * 1000);
  const hh = date.getUTCHours();
  const mm = date.getUTCMinutes();
  const ss = pad2(date.getUTCSeconds());
  if (direction && direction === 'rtl') {
    if (hh) {
      return `${sign}${ss}:${pad2(mm)}:${hh}`;
    }
    return `${sign}${ss}:${mm}`;
  }
  if (hh) {
    return `${sign}${hh}:${pad2(mm)}:${ss}`;
  }
  return `${sign}${mm}:${ss}`;
}

/** A time span, in seconds. */
export interface TimeRange {
  start: number;
  end: number;
}

// Format a time (in seconds) as a clock time rounded to the nearest second,
// e.g. 75.36 → "1:15".
export const formatClock = (seconds: number): string => {
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
};

// Parse a clock-style timestamp ("M:SS" or "H:MM:SS") to seconds, or null when
// the text isn't such a timestamp (a bare number won't match).
export const parseClockTime = (raw: string): number | null => {
  if (!/^\d+(:\d{1,2})+$/.test(raw)) return null;
  return raw.split(":").reduce((acc, part) => acc * 60 + parseInt(part, 10), 0);
};

// A leading "start – end" range at the front of a string (however the dash is
// typed), with the two clock times captured. Any text after the range — e.g.
// "0:01 – 0:20 Creation Days" — is allowed and left untouched.
const LEADING_RANGE_RE =
  /^\s*(\d+(?::\d{1,2})+)\s*[-–—]\s*(\d+(?::\d{1,2})+)\s*/;

// Interpret a string's leading "start – end" range as a time range, whether the
// range is the whole string ("1:15 – 1:20") or just its prefix
// ("0:01 – 0:20 Creation Days"). Null when there's no valid leading range.
export const parseTimeRange = (text: string): TimeRange | null => {
  const m = text.match(LEADING_RANGE_RE);
  if (!m) return null;
  const start = parseClockTime(m[1]);
  const end = parseClockTime(m[2]);
  if (start === null || end === null || start >= end) return null;
  return { start, end };
};

// Format a time range as a "M:SS – M:SS" label.
export const rangeLabel = (range: TimeRange): string =>
  `${formatClock(range.start)} – ${formatClock(range.end)}`;

// Strip a leading "start – end" range from a string, keeping any trailing text.
export const stripLeadingRange = (text: string): string =>
  text.replace(LEADING_RANGE_RE, "");

// Reflect a time range at the front of a string: rewrite (or prepend) the
// leading range to match `range`, or strip it when `range` is null, preserving
// any trailing text.
export const applyRangeToText = (text: string, range: TimeRange | null): string =>
  [range ? rangeLabel(range) : "", stripLeadingRange(text)]
    .filter(Boolean)
    .join(" ");

// Format an ISO timestamp compactly: clock time for today (e.g. "10:55 AM"),
// otherwise the date too (e.g. "Jun 17, 10:55 AM", or with the year when it
// isn't the current one).
export const formatShortDateTime = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return time;
  const date = d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
  return `${date}, ${time}`;
};
