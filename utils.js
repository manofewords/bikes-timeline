// Helpers with no state of their own and no access to the page: dates, mountings, built periods,
// layout, text and data validation. They get everything they need as parameters, so test.js can test them.
// Loaded with a plain <script> tag before timeline.js (and by test.html), so everything here is global.

// =====================================================================
// Dates
// =====================================================================

const MILLISECONDS_PER_DAY = 864e5;
const MILLISECONDS_PER_YEAR = 365.2425 * MILLISECONDS_PER_DAY;
const MILLISECONDS_PER_MONTH = 30.44 * MILLISECONDS_PER_DAY;
// Today at midnight UTC, the timestamp that "now" stands for. A "today" parameter in the page's
// address (index.html?today=2025-09-30) draws the timeline as if it were that day; the visual
// tests in test.html use it so the drawing doesn't change from day to day.
const TODAY_TIMESTAMP = (() => {
  const todayParameter = new URLSearchParams(location.search).get('today');
  if (/^\d{4}-\d{2}-\d{2}$/.test(todayParameter)) return Date.parse(todayParameter);
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
const formatPeriodDates = period => {
  const end = period.endTimestamp === TODAY_TIMESTAMP ? 'now' : formatMonthYear(period.endTimestamp);
  return `${formatMonthYear(period.startTimestamp)}–${end}`;
};
// A period as years only ("2002–2007"), for the chart's bike headers; an ongoing period ends in "now",
// and a period within one year is just that year.
const formatPeriodYears = period => {
  const startYear = new Date(period.startTimestamp).getUTCFullYear();
  if (period.endTimestamp === TODAY_TIMESTAMP) return `${startYear}–now`;
  const endYear = new Date(period.endTimestamp).getUTCFullYear();
  return startYear === endYear ? `${startYear}` : `${startYear}–${endYear}`;
};
// A duration in years with one decimal ("5.3 y"), or in months under a year ("4 mo", at least 1).
const formatDuration = durationMs => {
  const years = durationMs / MILLISECONDS_PER_YEAR;
  return years >= 1 ? `${years.toFixed(1)} y` : `${Math.max(1, Math.round(durationMs / MILLISECONDS_PER_MONTH))} mo`;
};

// =====================================================================
// Mountings: the periods a part spent on a bike
// =====================================================================

// Mountings ({ bikeId, startTimestamp, endTimestamp, … }) in date order, with back-to-back or
// overlapping mountings on the same bike merged into one, which keeps the fields of the first.
// The mountings passed in are not changed.
function mergeBackToBackMountings(mountings) {
  const mergedMountings = [];
  for (const mounting of [...mountings].sort((first, second) => first.startTimestamp - second.startTimestamp)) {
    const previousMounting = mergedMountings[mergedMountings.length - 1];
    const continuesOnSameBike = previousMounting
      && previousMounting.bikeId === mounting.bikeId
      && mounting.startTimestamp <= previousMounting.endTimestamp;
    if (continuesOnSameBike) previousMounting.endTimestamp = Math.max(previousMounting.endTimestamp, mounting.endTimestamp);
    else mergedMountings.push({ ...mounting });
  }
  return mergedMountings;
}

// Each item with the one after it: [a, b, c] gives [[a, b], [b, c]].
const consecutivePairs = items => items.slice(1).map((item, index) => [items[index], item]);

// =====================================================================
// Built periods
// =====================================================================

// The periods ({ startTimestamp, endTimestamp }) during which a bike had a part of every required
// part type mounted, given its mountings ({ part: { type }, startTimestamp, endTimestamp }).
function computeBuiltPeriods(mountings, requiredPartTypes) {
  const changeTimestamps = [...new Set(mountings.flatMap(mounting => [mounting.startTimestamp, mounting.endTimestamp]))]
    .sort((first, second) => first - second);
  const builtPeriods = [];

  for (let index = 0; index < changeTimestamps.length - 1; index++) {
    const intervalStart = changeTimestamps[index];
    const intervalEnd = changeTimestamps[index + 1];

    const mountedCountByPartType = {};
    for (const mounting of mountings) {
      const coversInterval = mounting.startTimestamp <= intervalStart && mounting.endTimestamp >= intervalEnd;
      if (coversInterval) mountedCountByPartType[mounting.part.type] = (mountedCountByPartType[mounting.part.type] || 0) + 1;
    }
    const isBuilt = requiredPartTypes.every(partType => (mountedCountByPartType[partType] || 0) >= 1);
    if (!isBuilt) continue;

    const previousPeriod = builtPeriods[builtPeriods.length - 1];
    if (previousPeriod && previousPeriod.endTimestamp === intervalStart) previousPeriod.endTimestamp = intervalEnd;
    else builtPeriods.push({ startTimestamp: intervalStart, endTimestamp: intervalEnd });
  }
  return builtPeriods;
}

// =====================================================================
// Layout (x positions, in pixels)
// =====================================================================

// Lane positions for one bike type, given every lane ({ partType, partGroup }, in order) and the
// part types the bike type has a lane for: the x offset of each of its lanes (measured from the left
// edge of the bike bar, indexed like laneDefinitions; undefined for lanes the type doesn't have)
// and the resulting bar width. Bikes of different types have different widths, but at least
// minBarWidth: lanes that need less room are centred in the wider bar. Lanes of different part
// groups are partGroupGap further apart.
function computeLaneLayout(laneDefinitions, lanePartTypes, { laneWidth, laneGap, partGroupGap, barInnerPadding, minBarWidth }) {
  const laneOffsetsX = [];
  let currentX = barInnerPadding;
  let previousPartGroup = null;
  laneDefinitions.forEach((lane, laneIndex) => {
    if (!lanePartTypes.includes(lane.partType)) return;
    if (previousPartGroup && lane.partGroup !== previousPartGroup) currentX += partGroupGap;
    laneOffsetsX[laneIndex] = currentX;
    currentX += laneWidth + laneGap;
    previousPartGroup = lane.partGroup;
  });
  const lanesBarWidth = currentX - laneGap + barInnerPadding;
  const barWidth = Math.max(lanesBarWidth, minBarWidth);
  const centringShift = (barWidth - lanesBarWidth) / 2;
  return { laneOffsetsX: laneOffsetsX.map(offsetX => offsetX + centringShift), barWidth };
}

// Places the bike bars of bikeTypeGroups ([{ bikes: [{ id, … }] }]) left to right from startX,
// group by group, with a gap between bikes and a wider one
// between bike types. Returns the left x of every bar, the x range of every group and the right end.
function layoutBikeColumns(bikeTypeGroups, startX, gapBetweenBikes, gapBetweenBikeTypes, barWidthOf) {
  const barLeftXByBikeId = {};
  const xRangeByGroup = new Map();
  let currentX = startX;
  bikeTypeGroups.forEach((group, groupIndex) => {
    if (groupIndex > 0) currentX += gapBetweenBikeTypes;
    const leftX = currentX;
    group.bikes.forEach((bike, bikeIndex) => {
      if (bikeIndex > 0) currentX += gapBetweenBikes;
      barLeftXByBikeId[bike.id] = currentX;
      currentX += barWidthOf(bike);
    });
    xRangeByGroup.set(group, { leftX, rightX: currentX });
  });
  return { barLeftXByBikeId, xRangeByGroup, rightX: currentX };
}

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

// Part types joined with " · ", in the order given. When they come in front and rear pairs only
// ("front rim", "rear rim", …), each pair is named once and ", front and rear" is added:
// "rim · hub, front and rear".
function describePartTypes(partTypes) {
  const frontPrefix = 'front ', rearPrefix = 'rear ';
  const frontNames = partTypes.filter(partType => partType.startsWith(frontPrefix)).map(partType => partType.slice(frontPrefix.length));
  const rearNames = partTypes.filter(partType => partType.startsWith(rearPrefix)).map(partType => partType.slice(rearPrefix.length));
  const isFrontAndRearPairs = frontNames.length > 0 && frontNames.length + rearNames.length === partTypes.length
    && frontNames.length === rearNames.length && frontNames.every(name => rearNames.includes(name));
  return isFrontAndRearPairs ? `${frontNames.join(' · ')}, front and rear` : partTypes.join(' · ');
}

// Fits text into maxLength, shortening it with "…" if needed; measureWidth(text) gives the width of
// a text. Returns null when not even a few characters fit.
function fitTextIntoLength(text, maxLength, measureWidth) {
  if (measureWidth(text) <= maxLength) return text;
  let shortened = text;
  while (shortened.length > 3 && measureWidth(shortened.trimEnd() + '…') > maxLength) {
    shortened = shortened.slice(0, -1);
  }
  if (shortened.length <= 3) return null;
  return shortened.trimEnd() + '…';
}

// =====================================================================
// Validation: checks the JSON as loaded, before it is processed
// =====================================================================

// The part types that no bike type has a lane for (bikeTypes: [{ lanePartTypes }]). Parts of these
// types are not drawn, and not reported either.
const partTypesIgnoredOnEveryBikeType = (bikeTypes, partTypes) =>
  partTypes.filter(partType => bikeTypes.every(bikeType => !bikeType.lanePartTypes.includes(partType)));

const REQUIRED_BIKE_FIELDS = ['id', 'type', 'name'];
const REQUIRED_PART_FIELDS = ['id', 'type', 'description', 'usage'];
const REQUIRED_USAGE_FIELDS = ['bikeId', 'dateFrom', 'dateTo'];

// Returns every error found, and the bikes and parts that can be processed: those with all
// required fields and a known type. Everything else (duplicate ids, overlapping dates, two
// parts of one type on a bike at once) is reported but still processed. A usage on a bike that
// isn't in the data or was left out is reported, and left out later in buildTimelineModel().
// A usage date may be null (a date still to be found out): the part is then skipped later
// without an error, see buildTimelineModel().
// bikeTypes: the bike types with their lanePartTypes (BIKE_TYPES in timeline.js);
// partTypes: every known part type (PART_TYPES).
function validateData(data, bikeTypes, partTypes) {
  const bikeTypesByKey = Object.fromEntries(bikeTypes.map(bikeType => [bikeType.type, bikeType]));
  const ignoredPartTypes = new Set(partTypesIgnoredOnEveryBikeType(bikeTypes, partTypes));
  const errors = [];
  if (data === null || typeof data !== 'object' || !Array.isArray(data.bikes) || !Array.isArray(data.parts)) {
    errors.push('The JSON has to be an object with a "bikes" list and a "parts" list');
    return { errors, validBikes: [], validParts: [], note: 'Nothing can be shown.' };
  }

  const isMissing = value => value === undefined || value === null || value === '';
  const bikeLabel = (bike, index) => isMissing(bike?.name) ? `Bike #${index + 1}` : `Bike "${bike.name}"`;
  const partLabel = (part, index) => isMissing(part?.description) ? `Part #${index + 1}` : `Part "${part.description}"`;
  const withId = (label, item) => isMissing(item?.id) ? label : `${label} (id ${item.id})`;

  // Required fields
  const bikesWithAllFields = data.bikes.filter((bike, bikeIndex) => {
    const missingFields = REQUIRED_BIKE_FIELDS.filter(field => isMissing(bike?.[field]));
    if (missingFields.length) errors.push(`${withId(bikeLabel(bike, bikeIndex), bike)} has no ${missingFields.join(', ')}`);
    return missingFields.length === 0;
  });
  const partsWithAllFields = data.parts.filter((part, partIndex) => {
    const label = withId(partLabel(part, partIndex), part);
    const missingFields = REQUIRED_PART_FIELDS.filter(field => isMissing(part?.[field]));
    if (missingFields.length) {
      errors.push(`${label} has no ${missingFields.join(', ')}`);
      return false;
    }
    if (!Array.isArray(part.usage) || part.usage.length === 0) {
      errors.push(`${label} has an empty usage list`);
      return false;
    }
    let hasCompleteUsage = true;
    part.usage.forEach((usage, usageIndex) => {
      // dateFrom and dateTo may be null, but have to be there
      const missingFields = REQUIRED_USAGE_FIELDS
        .filter(field => field === 'bikeId' ? isMissing(usage?.[field]) : usage?.[field] === undefined || usage[field] === '');
      if (missingFields.length) {
        errors.push(`${label}: usage #${usageIndex + 1} has no ${missingFields.join(', ')}`);
        hasCompleteUsage = false;
      }
    });
    return hasCompleteUsage;
  });

  // Duplicate ids (bikes and parts are checked separately: a bike and a part may share an id)
  const reportDuplicateIds = (items, labelOf, kind) => {
    const labelsById = new Map();
    items.forEach((item, index) => {
      if (isMissing(item?.id)) return;
      const key = String(item.id);
      if (!labelsById.has(key)) labelsById.set(key, []);
      labelsById.get(key).push(labelOf(item, index));
    });
    for (const [id, labels] of labelsById) {
      if (labels.length > 1) errors.push(`${labels.length} ${kind} have the id ${id}: ${labels.join(', ')}`);
    }
  };
  reportDuplicateIds(data.bikes, bikeLabel, 'bikes');
  reportDuplicateIds(data.parts, partLabel, 'parts');

  // Unknown bike types and part types (the ones in the build settings)
  const validBikes = bikesWithAllFields.filter(bike => {
    if (bikeTypesByKey[bike.type]) return true;
    errors.push(`${withId(bikeLabel(bike), bike)} has unknown bike type "${bike.type}" (known: ${bikeTypes.map(bikeType => bikeType.type).join(', ')})`);
    return false;
  });
  const validParts = partsWithAllFields.filter(part => {
    if (partTypes.includes(part.type)) return true;
    errors.push(`${withId(partLabel(part), part)} has unknown part type "${part.type}"`);
    return false;
  });

  // Overlapping usage dates of one part: on two different bikes at once, or twice on the same bike.
  // A usage ending on the day the next one starts is not an overlap.
  const bikeNamesById = new Map(data.bikes.map(bike => [String(bike?.id), bike?.name]));
  const bikeNameOf = bikeId => bikeNamesById.get(String(bikeId)) ?? `unknown bike ${bikeId}`;
  const describeUsage = usage => `${bikeNameOf(usage.bikeId)} ${usage.dateFrom} → ${usage.dateTo}`;
  for (const part of validParts) {
    const datedUsages = part.usage
      .filter(usage => usage.dateFrom != null && usage.dateTo != null)
      .map(usage => ({ usage, startTimestamp: parseDate(usage.dateFrom), endTimestamp: parseDate(usage.dateTo) }));
    for (let firstIndex = 0; firstIndex < datedUsages.length; firstIndex++) {
      for (let secondIndex = firstIndex + 1; secondIndex < datedUsages.length; secondIndex++) {
        const first = datedUsages[firstIndex];
        const second = datedUsages[secondIndex];
        const overlaps = first.startTimestamp < second.endTimestamp && second.startTimestamp < first.endTimestamp;
        if (!overlaps) continue;
        const sameBike = String(first.usage.bikeId) === String(second.usage.bikeId);
        errors.push(`${withId(partLabel(part), part)} ${sameBike ? 'has overlapping usage dates' : 'is on two bikes at once'}: `
          + `${describeUsage(first.usage)} and ${describeUsage(second.usage)}`);
      }
    }
  }

  // Usages on a bike that isn't in the data (or was left out above), and two parts of the same
  // type on one bike at the same time: each part type has one lane, so they would be drawn on
  // top of each other. Only parts that are drawn are compared, like in buildTimelineModel():
  // not parts with a null date, not part types ignored on every bike type, and not part types
  // without a lane on that bike's type. Back-to-back usages of one part on the same bike count
  // as one mounting.
  const bikeTypeByBikeId = new Map(validBikes.map(bike => [String(bike.id), bikeTypesByKey[bike.type]]));
  const datedMountingsByBikeId = new Map(validBikes.map(bike => [String(bike.id), []]));
  for (const part of validParts) {
    const isDrawn = !ignoredPartTypes.has(part.type)
      && part.usage.every(usage => usage.dateFrom != null && usage.dateTo != null);
    const datedMountings = [];
    for (const usage of part.usage) {
      if (!datedMountingsByBikeId.has(String(usage.bikeId))) {
        errors.push(`Part "${part.description}" references unknown bike ${usage.bikeId}`);
        continue;
      }
      const bikeType = bikeTypeByBikeId.get(String(usage.bikeId));
      if (!isDrawn || !bikeType.lanePartTypes.includes(part.type)) continue;
      datedMountings.push({ bikeId: String(usage.bikeId), startTimestamp: parseDate(usage.dateFrom), endTimestamp: parseDate(usage.dateTo) });
    }
    mergeBackToBackMountings(datedMountings)
      .forEach(mounting => datedMountingsByBikeId.get(mounting.bikeId).push({ ...mounting, part }));
  }
  for (const bike of validBikes) {
    const mountingsByPartType = {};
    datedMountingsByBikeId.get(String(bike.id)).forEach(mounting => (mountingsByPartType[mounting.part.type] ||= []).push(mounting));
    for (const partType in mountingsByPartType) {
      let occupiedUntil = -Infinity;
      const mountingsInOrder = mountingsByPartType[partType].sort((first, second) => first.startTimestamp - second.startTimestamp);
      for (const mounting of mountingsInOrder) {
        if (mounting.startTimestamp < occupiedUntil) {
          errors.push(`${bike.name}: two × ${partType} at ${formatIsoDate(mounting.startTimestamp)} (${mounting.part.description})`);
        }
        occupiedUntil = Math.max(occupiedUntil, mounting.endTimestamp);
      }
    }
  }

  return { errors, validBikes, validParts };
}
