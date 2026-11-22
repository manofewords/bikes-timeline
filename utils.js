// Small helpers with no state of their own: dates, text and colours.
// Loaded with a plain <script> tag before timeline.js (and by test.html), so everything here is global.

// =====================================================================
// Dates
// =====================================================================

const MILLISECONDS_PER_DAY = 864e5;
const MILLISECONDS_PER_YEAR = 365.2425 * MILLISECONDS_PER_DAY;
const MILLISECONDS_PER_MONTH = 30.44 * MILLISECONDS_PER_DAY;
// Today at midnight UTC, the timestamp that "now" stands for.
const TODAY_TIMESTAMP = (() => {
  const today = new Date();
  return Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
})();
const CURRENT_YEAR = new Date(TODAY_TIMESTAMP).getUTCFullYear();

// An ISO date ("2014-03-15") or "now" as a timestamp.
const parseDate = isoDateOrNow => isoDateOrNow === 'now' ? TODAY_TIMESTAMP : Date.parse(isoDateOrNow);
// A timestamp as an ISO date, or "now" for today.
const formatIsoDate = timestamp => timestamp === TODAY_TIMESTAMP ? 'now' : new Date(timestamp).toISOString().slice(0, 10);
// Month and year as MM.YYYY, e.g. 03.2014.
const formatMonthYear = timestamp => {
  const date = new Date(timestamp);
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}.${date.getUTCFullYear()}`;
};
// A period ({ startTimestamp, endTimestamp }) as "start–end"; an ongoing period ends in "now".
const formatPeriodDates = (period, separator = '–') => {
  const end = period.endTimestamp === TODAY_TIMESTAMP ? 'now' : formatMonthYear(period.endTimestamp);
  return `${formatMonthYear(period.startTimestamp)}${separator}${end}`;
};
// A duration in years with one decimal ("5.3 y"), or in months under a year ("4 mo", at least 1).
const formatDuration = durationMs => {
  const years = durationMs / MILLISECONDS_PER_YEAR;
  return years >= 1 ? `${years.toFixed(1)} y` : `${Math.max(1, Math.round(durationMs / MILLISECONDS_PER_MONTH))} mo`;
};

// =====================================================================
// Text
// =====================================================================

const escapeHtml = text => String(text).replace(/[&<>"]/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));

// Wraps text at word boundaries into lines of at most maxCharactersPerLine characters.
// Beyond maxLines, the last line ends in "…"; so does any single word that is too long.
function wrapTextIntoLines(text, maxCharactersPerLine, maxLines) {
  const lines = [];
  let currentLine = '';
  for (const word of text.split(/\s+/)) {
    const candidate = (currentLine + ' ' + word).trim();
    if (candidate.length <= maxCharactersPerLine) currentLine = candidate;
    else { if (currentLine) lines.push(currentLine); currentLine = word; }
  }
  if (currentLine) lines.push(currentLine);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, maxCharactersPerLine - 1) + '…';
  }
  return lines.map(line => line.length > maxCharactersPerLine ? line.slice(0, maxCharactersPerLine - 1) + '…' : line);
}

// The bike's name, or its type label and number (e.g. "MTB 2") when it has none.
// bikeTypesByKey maps a bike type ("mtb") to its entry in BIKE_TYPES.
const displayNameOf = (bike, bikeTypesByKey) => bike.name || `${bikeTypesByKey[bike.type].label} ${bike.numberWithinType}`;

// =====================================================================
// Colours
// =====================================================================

// "#rrggbb" mixed into white: strength 1 is the colour itself, 0 is white.
function mixWithWhite(hexColor, strength) {
  const channels = [1, 3, 5].map(offset => parseInt(hexColor.slice(offset, offset + 2), 16));
  const mixed = channels.map(channel => Math.round(255 + (channel - 255) * strength));
  return '#' + mixed.map(channel => channel.toString(16).padStart(2, '0')).join('');
}
