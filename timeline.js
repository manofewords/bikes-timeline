// The bike timeline: data validation, the model, the screen chart, the A2 poster and the controls.
// Needs utils.js, loaded before it.
(() => {
  // =====================================================================
  // Configuration
  // =====================================================================

  // Part groups: each has its own colour (CSS variable --part-group-<key>).
  const PART_GROUPS = {
    chassis:    { label: 'Chassis',    partTypesDescription: 'frame · shock · fork' },
    wheels:     { label: 'Wheels',     partTypesDescription: 'front rim · front hub · front spokes · front tire · rear rim · rear hub · rear spokes · rear tire' },
    brakes:     { label: 'Brakes',     partTypesDescription: 'brake · lever · disc, front and rear' },
    cockpit:    { label: 'Cockpit',    partTypesDescription: 'headset · stem · handlebars · grips' },
    drivetrain: { label: 'Drivetrain', partTypesDescription: 'cranks · bottom bracket · pedals · sprocket · gears' },
    seat:       { label: 'Seat',       partTypesDescription: 'seat post · seat clamp · seat' },
  };

  // Every lane that exists, in the order lanes appear inside a bike bar.
  // Each bike type uses a subset of these (see BIKE_TYPES); the order is always this one.
  const LANE_DEFINITIONS = [
    { partType: 'frame',             partGroup: 'chassis' },
    { partType: 'shock',             partGroup: 'chassis' },
    { partType: 'fork',              partGroup: 'chassis' },
    { partType: 'front rim',         partGroup: 'wheels' },
    { partType: 'front hub',         partGroup: 'wheels' },
    { partType: 'front spokes',      partGroup: 'wheels' },
    { partType: 'front tire',        partGroup: 'wheels' },
    { partType: 'rear rim',          partGroup: 'wheels' },
    { partType: 'rear hub',          partGroup: 'wheels' },
    { partType: 'rear spokes',       partGroup: 'wheels' },
    { partType: 'rear tire',         partGroup: 'wheels' },
    { partType: 'front brake',       partGroup: 'brakes' },
    { partType: 'front brake lever', partGroup: 'brakes' },
    { partType: 'front disc',        partGroup: 'brakes' },
    { partType: 'rear brake',        partGroup: 'brakes' },
    { partType: 'rear brake lever',  partGroup: 'brakes' },
    { partType: 'rear disc',         partGroup: 'brakes' },
    { partType: 'headset',           partGroup: 'cockpit' },
    { partType: 'stem',              partGroup: 'cockpit' },
    { partType: 'handlebars',        partGroup: 'cockpit' },
    { partType: 'grips',             partGroup: 'cockpit' },
    { partType: 'cranks',            partGroup: 'drivetrain' },
    { partType: 'bottom bracket',    partGroup: 'drivetrain' },
    { partType: 'pedals',            partGroup: 'drivetrain' },
    { partType: 'sprocket',          partGroup: 'drivetrain' },
    { partType: 'gears',             partGroup: 'drivetrain' },
    { partType: 'seat post',         partGroup: 'seat' },
    { partType: 'seat clamp',        partGroup: 'seat' },
    { partType: 'seat',              partGroup: 'seat' },
  ];

  // Default lanes per bike type. A bike counts as "built" while every one of its type's lanes
  // is filled, except the optional ones. The build settings dialog (gear button) can change this.
  const BMX_LANES = [
    'frame', 'fork', 'stem', 'handlebars', 'front rim', 'front hub', 'rear rim', 'rear hub',
    'sprocket', 'cranks', 'rear brake', 'rear brake lever',
  ];
  const COMMUTER_LANES = [...BMX_LANES, 'front brake', 'front brake lever', 'gears'];
  const DH_LANES = [...BMX_LANES, 'shock', 'front brake', 'front brake lever', 'front disc', 'rear disc', 'gears'];
  const MTB_LANES = [...DH_LANES, 'seat post', 'seat'];
  const GRAVEL_LANES = MTB_LANES.filter(partType => partType !== 'shock');
  const ROAD_LANES = [...GRAVEL_LANES]; // starts out like gravel

  // Listed in the order the bike type groups appear along the x axis.
  // label: on the chart; name: in sentences.
  // lanePartTypes and optionalPartTypes are replaced when the build settings dialog is closed.
  const BIKE_TYPES = [
    { type: 'bmx',    label: 'BMX',    name: 'BMX',    lanePartTypes: BMX_LANES,    optionalPartTypes: ['rear brake', 'rear brake lever'] }, // brakeless BMX allowed
    { type: 'mtb',    label: 'MTB',    name: 'MTB',    lanePartTypes: MTB_LANES,    optionalPartTypes: ['shock'] }, // hardtails allowed
    { type: 'dh',     label: 'DH',     name: 'DH',     lanePartTypes: DH_LANES,     optionalPartTypes: [] },
    { type: 'gravel', label: 'GRAVEL', name: 'gravel', lanePartTypes: GRAVEL_LANES, optionalPartTypes: [] },
    { type: 'commuter', label: 'COMMUTER', name: 'commuter', lanePartTypes: COMMUTER_LANES, optionalPartTypes: ['front brake', 'front brake lever', 'rear brake', 'rear brake lever'] },
    { type: 'road',   label: 'ROAD',   name: 'road',   lanePartTypes: ROAD_LANES,   optionalPartTypes: [] },
  ];
  const BIKE_TYPES_BY_KEY = Object.fromEntries(BIKE_TYPES.map(bikeType => [bikeType.type, bikeType]));
  const requiredPartTypesFor = bikeType =>
    bikeType.lanePartTypes.filter(partType => !bikeType.optionalPartTypes.includes(partType));

  // Rows of the build settings dialog: every lane, grouped by part group in lane order.
  // Each one is mandatory, optional or ignored per bike type: mandatory and optional parts
  // get a lane, ignored parts don't.
  const CONFIGURABLE_PART_TYPES = LANE_DEFINITIONS.map(lane => lane.partType);
  const PART_REQUIREMENTS = ['mandatory', 'optional', 'ignored'];
  const partRequirementFor = (bikeType, partType) =>
    !bikeType.lanePartTypes.includes(partType) ? 'ignored'
      : bikeType.optionalPartTypes.includes(partType) ? 'optional' : 'mandatory';

  // Part types that are ignored on every bike type are skipped without a warning.
  // Anything that is not a lane type is reported by validateData().
  const KNOWN_PART_TYPES = new Set(LANE_DEFINITIONS.map(lane => lane.partType));
  let silentlySkippedPartTypes; // set by applyBikeTypeSettings()
  // =====================================================================
  // Layout (all values in pixels)
  // =====================================================================

  const LANE_WIDTH = 5;
  const LANE_GAP = 1;
  const PART_GROUP_GAP = 3;          // extra space between lanes of different part groups
  const BAR_INNER_PADDING = 5;       // space between the bar edge and the first/last lane
  const RIBBON_TRACK_GAP = 1;        // empty space between the tracks of ribbons leaving a bike together
  const CONNECTOR_GAP_SIZE = 3;      // gap between an arriving ribbon and its new strip
  const DEPARTURE_DOT_SHADE = 0.6;   // departure dot colour: this much of the strip colour, the rest black
  const GAP_BETWEEN_BIKES = 24;
  const GAP_BETWEEN_BIKE_TYPES = 34;
  const YEAR_AXIS_WIDTH = 52;
  const HEADER_HEIGHT = 84;
  const BOTTOM_PADDING = 24;
  const BIKE_NAME_AVERAGE_CHARACTER_WIDTH = 6.4; // for wrapping bike names to the width of their bar
  const BIKE_NAME_MAX_LINES = 2;

  // Lane positions for one bike type: x offset of each of its lanes (measured from the left edge
  // of the bike bar, indexed like LANE_DEFINITIONS; undefined for lanes the type doesn't have)
  // and the resulting bar width. Bikes of different types have different widths.
  function computeLaneLayout(bikeType, { laneWidth, laneGap, partGroupGap, barInnerPadding }) {
    const laneOffsetsX = [];
    let currentX = barInnerPadding;
    let previousPartGroup = null;
    LANE_DEFINITIONS.forEach((lane, laneIndex) => {
      if (!bikeType.lanePartTypes.includes(lane.partType)) return;
      if (previousPartGroup && lane.partGroup !== previousPartGroup) currentX += partGroupGap;
      laneOffsetsX[laneIndex] = currentX;
      currentX += laneWidth + laneGap;
      previousPartGroup = lane.partGroup;
    });
    const barWidth = currentX - laneGap + barInnerPadding;
    return { laneOffsetsX, barWidth };
  }

  const SCREEN_LANE_SPACING = { laneWidth: LANE_WIDTH, laneGap: LANE_GAP, partGroupGap: PART_GROUP_GAP, barInnerPadding: BAR_INNER_PADDING };
  let screenLaneLayoutByBikeType; // set by applyBikeTypeSettings()

  // Recomputes everything that depends on the lanes of each bike type. Call it after changing
  // lanePartTypes or optionalPartTypes, then rebuild the model.
  function applyBikeTypeSettings() {
    screenLaneLayoutByBikeType = Object.fromEntries(
      BIKE_TYPES.map(bikeType => [bikeType.type, computeLaneLayout(bikeType, SCREEN_LANE_SPACING)]));
    const partTypesIgnoredOnEveryBikeType = CONFIGURABLE_PART_TYPES
      .filter(partType => BIKE_TYPES.every(bikeType => !bikeType.lanePartTypes.includes(partType)));
    silentlySkippedPartTypes = new Set(partTypesIgnoredOnEveryBikeType);
  }
  applyBikeTypeSettings();

  // ---------------------------------------------------------------------
  // Transfer ribbons: right-angled "L" shapes
  //
  // A ribbon leaves the old bike's strip horizontally, runs across to the part's lane
  // on the new bike, and turns 90° up into the bottom of the new strip.
  //
  // When several parts leave the same bike on the same date (a rebuild), each one gets
  // its own track: track k leaves k steps *before* the move date (lower on the chart).
  // The old strip still runs unbroken to its real end date, and a dot in a darker shade
  // of the strip's colour marks where the ribbon leaves it.
  //
  //   old bike                new bike
  //    ◠                     |_|
  //   | |  ← strip to the    | |
  //   | |    real end date   | |
  //   |●|____________________| |   ← track 1, ● = departure dot
  //   | |
  //
  // A part that leaves on its own leaves exactly at the top of its strip, also marked with a dot.
  // Every departure has a dot; arrivals never do.
  //
  // On the new bike, the ribbon stops a small gap below the new strip, so the strip's
  // bottom edge marks the exact start date. If the incoming part replaces a part that was
  // still in that lane, the replaced part keeps its real end date: the ribbon (drawn below
  // the strips) runs underneath it, so the lane stays unbroken. Its vertical leg shows
  // through when the part is highlighted, because the other strips are dimmed then:
  //
  //   new bike lane
  //     | |   ← incoming part, starts at its real date
  //     | |   ← replaced part, runs to its real end date
  //   ══╡ |   ← horizontal track, ending under the lane
  //     | |

  // Track order: the ribbon that turns up into the lane nearest the old bike gets the
  // highest track, so the ribbons of one rebuild don't cross each other.
  // Built bars and strips always keep their real dates.
  // ---------------------------------------------------------------------
  // Returns the ribbons, plus one departure dot ({ part, x, y }) per ribbon.
  function computeTransferRibbons({ laneCenterX, timestampToY, trackSpacing, ribbonWidth, connectorGapSize }) {
    // Group departures by (old bike, date): everything leaving a bike together shares one set of tracks.
    const departureGroups = new Map();
    for (const part of timelineModel.parts) {
      for (let index = 0; index < part.mountings.length - 1; index++) {
        const previousMounting = part.mountings[index];
        const nextMounting = part.mountings[index + 1];
        if (previousMounting.bikeId === nextMounting.bikeId) continue; // same-bike breaks are drawn as storage links
        const startX = laneCenterX(previousMounting.bikeId, previousMounting.laneIndex);
        const endX = laneCenterX(nextMounting.bikeId, nextMounting.laneIndex);
        if (startX == null || endX == null) continue;
        const groupKey = `${previousMounting.bikeId}@${previousMounting.endTimestamp}`;
        if (!departureGroups.has(groupKey)) departureGroups.set(groupKey, []);
        departureGroups.get(groupKey).push({ part, previousMounting, nextMounting, startX, endX });
      }
    }

    const ribbons = [];
    const departureDots = [];

    for (const departures of departureGroups.values()) {
      const leavesTogether = departures.length > 1;
      // Right-going and left-going ribbons each get their own track sequence.
      const rightGoing = departures.filter(transfer => transfer.endX > transfer.startX).sort((first, second) => first.endX - second.endX);
      const leftGoing = departures.filter(transfer => transfer.endX <= transfer.startX).sort((first, second) => second.endX - first.endX);

      for (const tracks of [rightGoing, leftGoing]) {
        tracks.forEach((transfer, trackIndex) => {
          const moveDateY = timestampToY(transfer.previousMounting.endTimestamp);
          // A lone part runs flush with the top of its strip; parts of a rebuild leave one step apart.
          const departureY = leavesTogether ? moveDateY + (trackIndex + 1) * trackSpacing : moveDateY + ribbonWidth / 2;
          // The new strip's bottom edge sits 1px above its start date; the ribbon stops a gap below that.
          const newStripBottomY = timestampToY(transfer.nextMounting.startTimestamp) - 1;
          const ribbonEndY = Math.min(newStripBottomY + connectorGapSize, departureY);

          departureDots.push({ part: transfer.part, x: transfer.startX, y: departureY });
          ribbons.push({
            ...transfer,
            pathData: `M${transfer.startX},${departureY} H${transfer.endX} V${ribbonEndY}`,
          });
        });
      }
    }

    return { ribbons, departureDots };
  }

  // part type -> its lane index in LANE_DEFINITIONS
  const laneIndexByPartType = Object.fromEntries(LANE_DEFINITIONS.map((lane, laneIndex) => [lane.partType, laneIndex]));
  const partGroupByPartType = Object.fromEntries(LANE_DEFINITIONS.map(lane => [lane.partType, lane.partGroup]));

  // =====================================================================
  // DOM helpers (the date, text and colour helpers are in utils.js)
  // =====================================================================

  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
  function createSvgElement(tagName, attributes = {}, parentElement) {
    const element = document.createElementNS(SVG_NAMESPACE, tagName);
    for (const attributeName in attributes) element.setAttribute(attributeName, attributes[attributeName]);
    if (parentElement) parentElement.appendChild(element);
    return element;
  }

  // =====================================================================
  // State
  // =====================================================================

  let rawData;                   // the JSON as loaded
  let timelineModel;             // derived model, see buildTimelineModel()
  let pixelsPerYear = 64;
  let pinnedHighlightKey = null; // 'part:<id>' or 'bike:<id>', set by clicking
  let hoveredHighlightKey = null;

  // =====================================================================
  // Validation: checks the JSON as loaded, before it is processed
  // =====================================================================

  const REQUIRED_BIKE_FIELDS = ['id', 'type', 'name'];
  const REQUIRED_PART_FIELDS = ['id', 'type', 'description', 'usage'];
  const REQUIRED_USAGE_FIELDS = ['bikeId', 'dateFrom', 'dateTo'];

  // Returns every error found, and the bikes and parts that can be processed: those with all
  // required fields and a known type. Everything else (duplicate ids, overlapping dates, two
  // parts of one type on a bike at once) is reported but still processed. A usage on an
  // unknown bike is reported and left out later, in buildTimelineModel().
  // A usage date may be null (a date still to be found out): the part is then skipped later
  // without an error, see buildTimelineModel().
  function validateData(data) {
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
    const validBikes = data.bikes.filter((bike, bikeIndex) => {
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
    validBikes
      .filter(bike => !BIKE_TYPES_BY_KEY[bike.type])
      .forEach(bike => errors.push(`${withId(bikeLabel(bike), bike)} has unknown bike type "${bike.type}" (known: ${BIKE_TYPES.map(bikeType => bikeType.type).join(', ')})`));
    const validParts = partsWithAllFields.filter(part => {
      if (KNOWN_PART_TYPES.has(part.type)) return true;
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
    const bikeTypeByBikeId = new Map(validBikes.map(bike => [String(bike.id), BIKE_TYPES_BY_KEY[bike.type]]));
    const datedMountingsByBikeId = new Map(validBikes.map(bike => [String(bike.id), []]));
    for (const part of validParts) {
      const isDrawn = !silentlySkippedPartTypes.has(part.type)
        && part.usage.every(usage => usage.dateFrom != null && usage.dateTo != null);
      const datedMountings = [];
      for (const usage of part.usage) {
        if (!datedMountingsByBikeId.has(String(usage.bikeId))) {
          errors.push(`Part "${part.description}" references unknown bike ${usage.bikeId}`);
          continue;
        }
        const bikeType = bikeTypeByBikeId.get(String(usage.bikeId));
        if (!isDrawn || (bikeType && !bikeType.lanePartTypes.includes(part.type))) continue;
        datedMountings.push({ bikeId: String(usage.bikeId), startTimestamp: parseDate(usage.dateFrom), endTimestamp: parseDate(usage.dateTo) });
      }
      datedMountings.sort((first, second) => first.startTimestamp - second.startTimestamp);
      const mergedMountings = [];
      for (const mounting of datedMountings) {
        const previousMounting = mergedMountings[mergedMountings.length - 1];
        const continuesOnSameBike = previousMounting
          && previousMounting.bikeId === mounting.bikeId
          && mounting.startTimestamp <= previousMounting.endTimestamp;
        if (continuesOnSameBike) previousMounting.endTimestamp = Math.max(previousMounting.endTimestamp, mounting.endTimestamp);
        else mergedMountings.push({ ...mounting, part });
      }
      mergedMountings.forEach(mounting => datedMountingsByBikeId.get(mounting.bikeId).push(mounting));
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

  // Shows the errors above the chart and logs each one with console.error.
  const DATA_ERRORS_DEFAULT_NOTE = 'Bikes and parts with a missing field or an unknown type are not shown. Everything else is drawn as it is.';
  function showDataErrors(errors, note = DATA_ERRORS_DEFAULT_NOTE) {
    const errorsElement = document.getElementById('data-errors');
    errorsElement.hidden = errors.length === 0;
    document.getElementById('data-errors-summary').textContent =
      `⚠ ${errors.length} data ${errors.length === 1 ? 'error' : 'errors'}`;
    document.getElementById('data-errors-note').textContent = note;
    document.getElementById('data-errors-list').innerHTML = errors.map(error => `<li>${escapeHtml(error)}</li>`).join('');
    errors.forEach(error => console.error('Bike data: ' + error));
  }

  // =====================================================================
  // Model: derive built periods, lanes and ordering from raw data
  // =====================================================================

  function buildTimelineModel(data) {
    const bikes = data.bikes.map(bike => ({ ...bike, mountings: [] }));
    const bikesById = Object.fromEntries(bikes.map(bike => [bike.id, bike]));

    const hasMissingDate = part => part.usage.some(usage => usage.dateFrom == null || usage.dateTo == null);
    const usableParts = data.parts.filter(part => {
      if (!KNOWN_PART_TYPES.has(part.type)) return false; // reported by validateData()
      if (silentlySkippedPartTypes.has(part.type)) return false;
      if (hasMissingDate(part)) {
        console.log(`Ignored part with a null date: ${part.type} "${part.description}"`, part);
        return false;
      }
      return true;
    });

    // A "mounting" is one period a part spent on one bike.
    const parts = usableParts
      .map(part => ({
        ...part,
        partGroup: partGroupByPartType[part.type],
        mountings: part.usage
          .map(usage => ({ bikeId: usage.bikeId, startTimestamp: parseDate(usage.dateFrom), endTimestamp: parseDate(usage.dateTo) }))
          .sort((first, second) => first.startTimestamp - second.startTimestamp),
      }));

    for (const part of parts) {
      // Merge back-to-back mountings on the same bike, and link each mounting to its part and bike.
      const mergedMountings = [];
      for (const mounting of part.mountings) {
        const bike = bikesById[mounting.bikeId];
        if (!bike) continue; // reported by validateData()
        const bikeType = BIKE_TYPES_BY_KEY[bike.type];
        if (bikeType && !bikeType.lanePartTypes.includes(part.type)) {
          const warning = `${bike.name} (${bike.type}) has no "${part.type}" lane, so "${part.description}" is not shown on it`;
          console.warn(warning);
          continue;
        }
        const previousMounting = mergedMountings[mergedMountings.length - 1];
        const continuesOnSameBike = previousMounting
          && previousMounting.bikeId === mounting.bikeId
          && mounting.startTimestamp <= previousMounting.endTimestamp;
        if (continuesOnSameBike) {
          previousMounting.endTimestamp = Math.max(previousMounting.endTimestamp, mounting.endTimestamp);
        } else {
          mergedMountings.push({ ...mounting, part });
        }
      }
      part.mountings = mergedMountings;
      if (part.mountings.length === 0) continue;
      part.mountings.forEach(mounting => bikesById[mounting.bikeId].mountings.push(mounting));
    }
    const shownParts = parts.filter(part => part.mountings.length > 0);

    for (const bike of bikes) {
      assignLanes(bike);
      bike.builtPeriods = computeBuiltPeriods(bike);
      bike.partsEverMounted = [...new Set(bike.mountings.map(mounting => mounting.part))];
      bike.sortTimestamp = bike.builtPeriods.length
        ? bike.builtPeriods[0].startTimestamp
        : (bike.mountings.length ? Math.min(...bike.mountings.map(mounting => mounting.startTimestamp)) : TODAY_TIMESTAMP);
    }

    // Group bikes by type, chronologically within each group. Bikes of an unknown type are
    // reported by validateData() and not placed.
    const bikeTypeGroups = BIKE_TYPES
      .map(entry => ({
        ...entry,
        bikes: bikes.filter(bike => bike.type === entry.type).sort((first, second) => first.sortTimestamp - second.sortTimestamp),
      }))
      .filter(group => group.bikes.length > 0);
    bikeTypeGroups.forEach(group => group.bikes.forEach((bike, indexInGroup) => { bike.numberWithinType = indexInGroup + 1; }));

    const allTimestamps = shownParts.flatMap(part => part.mountings.flatMap(mounting => [mounting.startTimestamp, mounting.endTimestamp]));
    const earliestYear = new Date(Math.min(...allTimestamps, TODAY_TIMESTAMP)).getUTCFullYear();

    return { bikes, bikesById, parts: shownParts, bikeTypeGroups, earliestYear };
  }

  // Every part type has exactly one lane. Two parts of the same type on one bike at the
  // same time are a data problem: they're reported by validateData() and drawn on top of each other.
  function assignLanes(bike) {
    bike.mountings.forEach(mounting => { mounting.laneIndex = laneIndexByPartType[mounting.part.type]; });
  }

  // Periods during which the bike had every required part of its type mounted.
  function computeBuiltPeriods(bike) {
    const bikeType = BIKE_TYPES_BY_KEY[bike.type];
    if (!bikeType) return [];
    const requiredPartTypes = requiredPartTypesFor(bikeType);
    const changeTimestamps = [...new Set(bike.mountings.flatMap(mounting => [mounting.startTimestamp, mounting.endTimestamp]))]
      .sort((first, second) => first - second);
    const builtPeriods = [];

    for (let index = 0; index < changeTimestamps.length - 1; index++) {
      const intervalStart = changeTimestamps[index];
      const intervalEnd = changeTimestamps[index + 1];

      const mountedCountByPartType = {};
      for (const mounting of bike.mountings) {
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
  // Rendering
  // =====================================================================

  function renderChart() {
    const chartContainer = document.getElementById('chart-container');
    chartContainer.innerHTML = '';

    const timelineStartTimestamp = Date.UTC(timelineModel.earliestYear, 0, 1);
    const timelineEndTimestamp = Date.UTC(CURRENT_YEAR + 1, 0, 1);
    const plotTopY = HEADER_HEIGHT + 10;
    const timestampToY = timestamp => plotTopY + (timelineEndTimestamp - timestamp) / MILLISECONDS_PER_YEAR * pixelsPerYear;
    const svgHeight = timestampToY(timelineStartTimestamp) + BOTTOM_PADDING;

    // Horizontal position of every bike bar
    const barWidthOf = bike => screenLaneLayoutByBikeType[bike.type].barWidth;
    const columns = layoutBikeColumns(YEAR_AXIS_WIDTH + 16, GAP_BETWEEN_BIKES, GAP_BETWEEN_BIKE_TYPES, barWidthOf);
    for (const group of timelineModel.bikeTypeGroups) {
      Object.assign(group, columns.xRangeByGroup.get(group));
      for (const bike of group.bikes) {
        bike.barLeftX = columns.barLeftXByBikeId[bike.id];
        bike.barWidth = barWidthOf(bike);
      }
    }
    const svgWidth = columns.rightX + 24;

    const svg = createSvgElement('svg', {
      width: svgWidth, height: svgHeight, viewBox: `0 0 ${svgWidth} ${svgHeight}`,
      role: 'img', 'aria-label': 'Timeline of bikes and the parts moved between them',
    }, chartContainer);

    renderYearGrid(svg, svgWidth, timestampToY);
    renderBikeHeaders(svg);
    renderBuiltBars(svg, timestampToY);
    const departureDots = renderPartRibbons(svg, timestampToY);
    renderPartSegments(svg, timestampToY);
    renderDepartureDots(svg, departureDots);

    svg.addEventListener('click', event => { if (event.target === svg) togglePinnedHighlight(null); });
    applyHighlight();
  }

  // Places the bike bars left to right, group by group, with a gap between bikes and a wider one
  // between bike types. Returns the left x of every bar, the x range of every group and the right end.
  function layoutBikeColumns(startX, gapBetweenBikes, gapBetweenBikeTypes, barWidthOf) {
    const barLeftXByBikeId = {};
    const xRangeByGroup = new Map();
    let currentX = startX;
    timelineModel.bikeTypeGroups.forEach((group, groupIndex) => {
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

  function renderYearGrid(svg, svgWidth, timestampToY) {
    const yearGrid = createSvgElement('g', { class: 'year-grid' }, svg);
    for (let year = timelineModel.earliestYear; year <= CURRENT_YEAR + 1; year++) {
      const yearStartY = timestampToY(Date.UTC(year, 0, 1));
      createSvgElement('line', { x1: YEAR_AXIS_WIDTH, x2: svgWidth - 8, y1: yearStartY, y2: yearStartY }, yearGrid);
      if (year <= CURRENT_YEAR) {
        const midYearY = timestampToY(Date.UTC(year, 6, 1));
        const yearLabel = createSvgElement('text', { x: YEAR_AXIS_WIDTH - 10, y: midYearY + 4, 'text-anchor': 'end' }, yearGrid);
        yearLabel.textContent = year;
      }
    }

    const todayY = timestampToY(TODAY_TIMESTAMP);
    createSvgElement('line', { class: 'today-line', x1: YEAR_AXIS_WIDTH, x2: svgWidth - 8, y1: todayY, y2: todayY }, svg);
    const todayLabel = createSvgElement('text', { class: 'today-label', x: YEAR_AXIS_WIDTH - 10, y: todayY + 3, 'text-anchor': 'end' }, svg);
    todayLabel.textContent = 'today';
  }

  function renderBikeHeaders(svg) {
    const headerLayer = createSvgElement('g', {}, svg);
    for (const group of timelineModel.bikeTypeGroups) {
      const typeLabel = createSvgElement('text', { class: 'bike-type-label', x: group.leftX, y: 18 }, headerLayer);
      typeLabel.textContent = group.label;
      createSvgElement('line', { class: 'bike-type-rule', x1: group.leftX, x2: group.rightX, y1: 26, y2: 26 }, headerLayer);

      for (const bike of group.bikes) {
        const bikeHeader = createSvgElement('g', { class: 'bike-header', 'data-bike-id': bike.id }, headerLayer);
        // transparent rect = larger hover target
        createSvgElement('rect', { x: bike.barLeftX - 4, y: 30, width: bike.barWidth + 8, height: HEADER_HEIGHT - 26, fill: 'transparent' }, bikeHeader);

        const maxCharactersPerLine = Math.floor(bike.barWidth / BIKE_NAME_AVERAGE_CHARACTER_WIDTH);
        const nameLines = wrapTextIntoLines(displayNameOf(bike, BIKE_TYPES_BY_KEY), maxCharactersPerLine, BIKE_NAME_MAX_LINES);
        nameLines.forEach((line, lineIndex) => {
          const nameText = createSvgElement('text', { class: 'bike-name', x: bike.barLeftX, y: 46 + lineIndex * 14 }, bikeHeader);
          nameText.textContent = line;
        });


        bikeHeader.addEventListener('pointerenter', event => showBikeTooltip(bike, event));
        bikeHeader.addEventListener('pointermove', positionTooltip);
        bikeHeader.addEventListener('pointerleave', clearHover);
        bikeHeader.addEventListener('click', () => togglePinnedHighlight('bike:' + bike.id));
      }
    }
  }

  function renderBuiltBars(svg, timestampToY) {
    const barLayer = createSvgElement('g', {}, svg);
    for (const bike of timelineModel.bikes) {
      if (bike.barLeftX == null) continue; // bike of unknown type: not placed
      for (const period of bike.builtPeriods) {
        const topY = timestampToY(period.endTimestamp);
        const bottomY = timestampToY(period.startTimestamp);
        createSvgElement('rect', {
          class: 'built-bar', 'data-bike-id': bike.id,
          x: bike.barLeftX, y: topY, width: bike.barWidth, height: Math.max(2, bottomY - topY), rx: 4,
        }, barLayer);
      }
    }
  }

  // Ribbons connect consecutive mountings of the same part on different bikes (see computeTransferRibbons).
  // If a part returns to the same bike after a pause, a dashed line marks the gap instead.
  function renderPartRibbons(svg, timestampToY) {
    const ribbonLayer = createSvgElement('g', {}, svg);
    const laneCenterX = (bikeId, laneIndex) => {
      const bike = timelineModel.bikesById[bikeId];
      return bike.barLeftX == null ? null : bike.barLeftX + screenLaneLayoutByBikeType[bike.type].laneOffsetsX[laneIndex] + LANE_WIDTH / 2;
    };

    for (const part of timelineModel.parts) {
      for (let index = 0; index < part.mountings.length - 1; index++) {
        const previousMounting = part.mountings[index];
        const nextMounting = part.mountings[index + 1];
        if (previousMounting.bikeId !== nextMounting.bikeId) continue;
        const linkX = laneCenterX(previousMounting.bikeId, previousMounting.laneIndex);
        if (linkX == null) continue;
        createSvgElement('line', {
          class: 'storage-link', 'data-part-id': part.id, stroke: `var(--part-group-${part.partGroup})`,
          x1: linkX, x2: laneCenterX(nextMounting.bikeId, nextMounting.laneIndex),
          y1: timestampToY(previousMounting.endTimestamp), y2: timestampToY(nextMounting.startTimestamp),
        }, ribbonLayer);
      }
    }

    const { ribbons, departureDots } = computeTransferRibbons({
      laneCenterX, timestampToY, trackSpacing: LANE_WIDTH + RIBBON_TRACK_GAP, ribbonWidth: LANE_WIDTH, connectorGapSize: CONNECTOR_GAP_SIZE,
    });
    for (const transfer of ribbons) {
      const ribbon = createSvgElement('path', {
        class: 'part-ribbon', 'data-part-id': transfer.part.id,
        stroke: `var(--part-group-${transfer.part.partGroup})`, 'stroke-width': LANE_WIDTH,
        d: transfer.pathData,
      }, ribbonLayer);
      attachPartHoverHandlers(ribbon, transfer.part);
    }
    return departureDots;
  }

  function renderPartSegments(svg, timestampToY) {
    const segmentLayer = createSvgElement('g', {}, svg);
    for (const part of timelineModel.parts) {
      for (const mounting of part.mountings) {
        const bike = timelineModel.bikesById[mounting.bikeId];
        if (bike.barLeftX == null) continue;
        // 1px inset at each end leaves a visible gap between a part and its replacement
        const topY = timestampToY(mounting.endTimestamp) + 1;
        const bottomY = timestampToY(mounting.startTimestamp) - 1;
        const segment = createSvgElement('rect', {
          class: 'part-segment', 'data-part-id': part.id, 'data-bike-id': bike.id,
          x: bike.barLeftX + screenLaneLayoutByBikeType[bike.type].laneOffsetsX[mounting.laneIndex], y: topY,
          width: LANE_WIDTH, height: Math.max(1.5, bottomY - topY), rx: LANE_WIDTH / 2, // fully round ends
          fill: `var(--part-group-${part.partGroup})`,
        }, segmentLayer);
        attachPartHoverHandlers(segment, part);
      }
    }
  }

  // A dot in a darker shade of the strip's colour where a ribbon leaves the strip.
  function renderDepartureDots(svg, departureDots) {
    const dotLayer = createSvgElement('g', {}, svg);
    for (const dot of departureDots) {
      const dotElement = createSvgElement('circle', {
        class: 'part-departure-dot', 'data-part-id': dot.part.id,
        cx: dot.x, cy: dot.y, r: LANE_WIDTH / 2,
        fill: `color-mix(in srgb, var(--part-group-${dot.part.partGroup}) ${Math.round(DEPARTURE_DOT_SHADE * 100)}%, black)`,
      }, dotLayer);
      attachPartHoverHandlers(dotElement, dot.part);
    }
  }

  // =====================================================================
  // Interaction: tooltip and highlighting
  // =====================================================================

  const tooltip = document.getElementById('tooltip');

  function attachPartHoverHandlers(element, part) {
    element.addEventListener('pointerenter', event => showPartTooltip(part, event));
    element.addEventListener('pointermove', positionTooltip);
    element.addEventListener('pointerleave', clearHover);
    element.addEventListener('click', event => { event.stopPropagation(); togglePinnedHighlight('part:' + part.id); });
  }

  function positionTooltip(event) {
    const cursorOffset = 14;
    const tooltipBounds = tooltip.getBoundingClientRect();
    let left = event.clientX + cursorOffset;
    let top = event.clientY + cursorOffset;
    if (left + tooltipBounds.width > innerWidth - 8) left = event.clientX - tooltipBounds.width - cursorOffset;
    if (top + tooltipBounds.height > innerHeight - 8) top = event.clientY - tooltipBounds.height - cursorOffset;
    tooltip.style.left = left + 'px';
    tooltip.style.top = Math.max(8, top) + 'px';
  }

  function showPartTooltip(part, event) {
    hoveredHighlightKey = 'part:' + part.id;
    const bikeName = bikeId => escapeHtml(timelineModel.bikesById[bikeId].name);
    const mountingRows = part.mountings.map(mounting => `<tr>
        <td>${bikeName(mounting.bikeId)}</td>
        <td>${formatPeriodDates(mounting, ' – ')}</td>
        <td>${formatDuration(mounting.endTimestamp - mounting.startTimestamp)}</td>
      </tr>`).join('');

    tooltip.innerHTML = `
      <h4><span class="color-swatch" style="background:var(--part-group-${part.partGroup})"></span>${escapeHtml(part.description)}</h4>
      <div class="tooltip-meta">${escapeHtml(part.type)}</div>
      <table>${mountingRows}</table>`;
    tooltip.style.display = 'block';
    positionTooltip(event);
    applyHighlight();
  }

  function showBikeTooltip(bike, event) {
    hoveredHighlightKey = 'bike:' + bike.id;

    const builtPeriodRows = bike.builtPeriods.map(period => `<tr>
        <td>built</td>
        <td>${formatPeriodDates(period, ' – ')}</td>
        <td>${formatDuration(period.endTimestamp - period.startTimestamp)}</td>
      </tr>`).join('');

    const bikesPartsCameFrom = new Set();
    const bikesPartsWentTo = new Set();
    for (const mounting of bike.mountings) {
      const partMountings = mounting.part.mountings;
      const mountingIndex = partMountings.indexOf(mounting);
      const previousMounting = partMountings[mountingIndex - 1];
      const nextMounting = partMountings[mountingIndex + 1];
      if (previousMounting && previousMounting.bikeId !== bike.id) bikesPartsCameFrom.add(timelineModel.bikesById[previousMounting.bikeId].name);
      if (nextMounting && nextMounting.bikeId !== bike.id) bikesPartsWentTo.add(timelineModel.bikesById[nextMounting.bikeId].name);
    }
    const listNames = names => [...names].map(escapeHtml).join(', ');

    tooltip.innerHTML = `
      <h4>${escapeHtml(bike.name)}</h4>
      <table>${builtPeriodRows || '<tr><td>never had the full minimum set</td></tr>'}</table>
      ${bikesPartsCameFrom.size ? `<div class="tooltip-meta" style="margin:6px 0 0">Parts from: ${listNames(bikesPartsCameFrom)}</div>` : ''}
      ${bikesPartsWentTo.size ? `<div class="tooltip-meta" style="margin:2px 0 0">Parts passed to: ${listNames(bikesPartsWentTo)}</div>` : ''}`;
    tooltip.style.display = 'block';
    positionTooltip(event);
    applyHighlight();
  }

  function clearHover() {
    hoveredHighlightKey = null;
    tooltip.style.display = 'none';
    applyHighlight();
  }

  function togglePinnedHighlight(highlightKey) {
    pinnedHighlightKey = pinnedHighlightKey === highlightKey ? null : highlightKey;
    applyHighlight();
  }

  // Highlights the hovered (or else pinned) part or bike and dims everything else.
  function applyHighlight() {
    const svg = document.querySelector('#chart-container svg');
    if (!svg) return;
    svg.querySelectorAll('.is-highlighted').forEach(element => element.classList.remove('is-highlighted'));

    const activeHighlightKey = hoveredHighlightKey || pinnedHighlightKey;
    svg.classList.toggle('has-focus', !!activeHighlightKey);
    if (!activeHighlightKey) return;

    const [highlightKind, highlightedId] = activeHighlightKey.split(/:(.+)/);
    const highlight = selector => svg.querySelectorAll(selector).forEach(element => element.classList.add('is-highlighted'));

    if (highlightKind === 'part') {
      const part = timelineModel.parts.find(candidate => candidate.id === highlightedId);
      if (!part) return;
      highlight(`[data-part-id="${part.id}"]`);
      part.mountings.forEach(mounting => highlight(`.built-bar[data-bike-id="${mounting.bikeId}"]`));
    } else {
      const bike = timelineModel.bikesById[highlightedId];
      if (!bike) return;
      highlight(`.built-bar[data-bike-id="${bike.id}"]`);
      bike.partsEverMounted.forEach(part => highlight(`[data-part-id="${part.id}"]`));
    }
  }

  // =====================================================================
  // Print poster (A2 landscape): every part's description written along its strip
  // =====================================================================

  const MILLIMETERS_TO_PIXELS = 96 / 25.4;
  const POSTER_PRINTABLE_WIDTH_MM = 574;   // A2 landscape 594mm minus 2 × 10mm page margin
  const POSTER_PRINTABLE_HEIGHT_MM = 399;  // 420mm minus margins, 1mm spare so it never spills onto a second page
  const POSTER_FONT_FAMILY = 'Helvetica, Arial, sans-serif';
  const POSTER_COLORS = {
    page: '#ffffff', builtBar: '#ecebe7', builtBarBorder: '#2f2e2c', gridline: '#e4e3df', axisLine: '#c9c8c2',
    textPrimary: '#0b0b0b', textSecondary: '#52514e', textMuted: '#7a7974',
  };
  // Light-mode part group colours (same as the screen palette)
  const POSTER_PART_GROUP_COLORS = {
    chassis: '#446cb4', wheels: '#c38b27', brakes: '#268d81', cockpit: '#8061b0', drivetrain: '#bb566e', seat: '#729343',
  };
  const POSTER_LABEL_TINT_STRENGTH = 0.3; // part strip fill = this much group colour mixed into white
  const POSTER_TITLE_BAND_HEIGHT = 66;
  const POSTER_YEAR_AXIS_WIDTH = 40;
  const POSTER_GAP_BETWEEN_BIKES = 14;
  const POSTER_GAP_BETWEEN_BIKE_TYPES = 30;
  const POSTER_LANE_GAP = 0.75;
  const POSTER_PART_GROUP_GAP = 2;
  const POSTER_BAR_INNER_PADDING = 2;
  const POSTER_BIKE_NAME_FONT_SIZE = 13;
  const POSTER_BIKE_NAME_LINE_HEIGHT = 15;
  const POSTER_BIKE_DETAIL_FONT_SIZE = 9.5;
  const POSTER_BIKE_DETAIL_LINE_HEIGHT = 12;

  const textMeasuringContext = document.createElement('canvas').getContext('2d');
  function measureTextWidth(text, fontSize, fontWeight = 400) {
    textMeasuringContext.font = `${fontWeight} ${fontSize}px ${POSTER_FONT_FAMILY}`;
    return textMeasuringContext.measureText(text).width;
  }

  // Fit text into maxLength at the given font size, shortening it with "…" if needed.
  // Returns null when not even a few characters fit.
  function fitTextIntoLength(text, fontSize, maxLength) {
    if (measureTextWidth(text, fontSize) <= maxLength) return text;
    let shortened = text;
    while (shortened.length > 3 && measureTextWidth(shortened.trimEnd() + '…', fontSize) > maxLength) {
      shortened = shortened.slice(0, -1);
    }
    if (shortened.length <= 3) return null;
    return shortened.trimEnd() + '…';
  }

  function wrapTextByWidth(text, fontSize, fontWeight, maxWidth, maxLines) {
    const lines = [];
    let currentLine = '';
    for (const word of text.split(/\s+/)) {
      const candidate = (currentLine + ' ' + word).trim();
      if (measureTextWidth(candidate, fontSize, fontWeight) <= maxWidth) currentLine = candidate;
      else { if (currentLine) lines.push(currentLine); currentLine = word; }
    }
    if (currentLine) lines.push(currentLine);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      let lastLine = lines[maxLines - 1];
      while (lastLine.length > 1 && measureTextWidth(lastLine + '…', fontSize, fontWeight) > maxWidth) lastLine = lastLine.slice(0, -1);
      lines[maxLines - 1] = lastLine + '…';
    }
    return lines;
  }

  function renderPoster() {
    const posterContainer = document.getElementById('print-poster');
    posterContainer.innerHTML = '';

    const posterWidth = POSTER_PRINTABLE_WIDTH_MM * MILLIMETERS_TO_PIXELS;
    const posterHeight = POSTER_PRINTABLE_HEIGHT_MM * MILLIMETERS_TO_PIXELS;
    const svg = createSvgElement('svg', {
      width: `${POSTER_PRINTABLE_WIDTH_MM}mm`, height: `${POSTER_PRINTABLE_HEIGHT_MM}mm`,
      viewBox: `0 0 ${posterWidth} ${posterHeight}`, 'font-family': POSTER_FONT_FAMILY,
    }, posterContainer);
    createSvgElement('rect', { x: 0, y: 0, width: posterWidth, height: posterHeight, fill: POSTER_COLORS.page }, svg);
    const addText = (parent, content, attributes) => {
      const textElement = createSvgElement('text', attributes, parent);
      textElement.textContent = content;
      return textElement;
    };

    renderPosterTitleBand(svg, posterWidth, addText);

    // ----- columns: one lane width for all bikes, chosen so every bar fits the page -----
    // A bar's width is a fixed part (padding and gaps) plus its number of lanes × lane width,
    // so the lane width that fills the page can be solved for directly.
    const placedGroups = timelineModel.bikeTypeGroups;
    const placedBikes = placedGroups.flatMap(group => group.bikes);
    const totalGapWidth = (placedBikes.length - placedGroups.length) * POSTER_GAP_BETWEEN_BIKES
      + (placedGroups.length - 1) * POSTER_GAP_BETWEEN_BIKE_TYPES;
    const availableBarsWidth = posterWidth - POSTER_YEAR_AXIS_WIDTH - 12 - totalGapWidth;
    const posterLaneSpacing = { laneGap: POSTER_LANE_GAP, partGroupGap: POSTER_PART_GROUP_GAP, barInnerPadding: POSTER_BAR_INNER_PADDING };
    const fixedBarWidthOf = bike => computeLaneLayout(BIKE_TYPES_BY_KEY[bike.type], { ...posterLaneSpacing, laneWidth: 0 }).barWidth;
    const laneCountOf = bike => BIKE_TYPES_BY_KEY[bike.type].lanePartTypes.length;
    const laneWidth = (availableBarsWidth - placedBikes.reduce((total, bike) => total + fixedBarWidthOf(bike), 0))
      / placedBikes.reduce((total, bike) => total + laneCountOf(bike), 0);
    const posterLaneLayoutByBikeType = Object.fromEntries(
      BIKE_TYPES.map(bikeType => [bikeType.type, computeLaneLayout(bikeType, { ...posterLaneSpacing, laneWidth })]));
    const barWidthOf = bikeId => posterLaneLayoutByBikeType[timelineModel.bikesById[bikeId].type].barWidth;
    const laneOffsetX = (bikeId, laneIndex) => posterLaneLayoutByBikeType[timelineModel.bikesById[bikeId].type].laneOffsetsX[laneIndex];

    const { barLeftXByBikeId, xRangeByGroup } = layoutBikeColumns(
      POSTER_YEAR_AXIS_WIDTH + 8, POSTER_GAP_BETWEEN_BIKES, POSTER_GAP_BETWEEN_BIKE_TYPES, bike => barWidthOf(bike.id));

    // ----- bike headers: name, built periods -----
    // A built period is one line ("03.2002–06.2007 · 5.3 y") when it fits the column (bar plus the
    // gap to the next bike), otherwise the duration goes on a line of its own.
    const builtPeriodLinesOf = (period, maxWidth) => {
      const dates = formatPeriodDates(period);
      const duration = formatDuration(period.endTimestamp - period.startTimestamp);
      const oneLine = `${dates} · ${duration}`;
      return measureTextWidth(oneLine, POSTER_BIKE_DETAIL_FONT_SIZE) <= maxWidth ? [oneLine] : [dates, duration];
    };
    const headerLinesByBikeId = {};
    for (const group of placedGroups) {
      group.bikes.forEach((bike, bikeIndex) => {
        const isLastBike = bikeIndex === group.bikes.length - 1;
        const columnWidth = barWidthOf(bike.id)
          + (isLastBike ? (group === placedGroups.at(-1) ? 0 : POSTER_GAP_BETWEEN_BIKE_TYPES) : POSTER_GAP_BETWEEN_BIKES) - 6;
        headerLinesByBikeId[bike.id] = {
          nameLines: wrapTextByWidth(displayNameOf(bike, BIKE_TYPES_BY_KEY), POSTER_BIKE_NAME_FONT_SIZE, 700, columnWidth, 2),
          builtPeriodLines: bike.builtPeriods.flatMap(period => builtPeriodLinesOf(period, columnWidth)),
        };
      });
    }
    const tallestHeaderContent = Math.max(...Object.values(headerLinesByBikeId).map(lines =>
      lines.nameLines.length * POSTER_BIKE_NAME_LINE_HEIGHT + lines.builtPeriodLines.length * POSTER_BIKE_DETAIL_LINE_HEIGHT));
    const headerTopY = POSTER_TITLE_BAND_HEIGHT;
    const plotTopY = headerTopY + 30 + tallestHeaderContent + 10;
    const plotBottomY = posterHeight - 16;

    const headerLayer = createSvgElement('g', {}, svg);
    for (const group of placedGroups) {
      const { leftX: groupLeftX, rightX: groupRightX } = xRangeByGroup.get(group);
      addText(headerLayer, group.label, { x: groupLeftX, y: headerTopY + 12, 'font-size': 13, 'font-weight': 700, 'letter-spacing': '0.06em', fill: POSTER_COLORS.textPrimary });
      createSvgElement('line', { x1: groupLeftX, x2: groupRightX, y1: headerTopY + 19, y2: headerTopY + 19, stroke: POSTER_COLORS.axisLine }, headerLayer);
      for (const bike of group.bikes) {
        const barLeftX = barLeftXByBikeId[bike.id];
        const { nameLines, builtPeriodLines } = headerLinesByBikeId[bike.id];
        let lineY = headerTopY + 36;
        for (const nameLine of nameLines) {
          addText(headerLayer, nameLine, { x: barLeftX, y: lineY, 'font-size': POSTER_BIKE_NAME_FONT_SIZE, 'font-weight': 700, fill: POSTER_COLORS.textPrimary });
          lineY += POSTER_BIKE_NAME_LINE_HEIGHT;
        }
        lineY -= POSTER_BIKE_DETAIL_LINE_HEIGHT + 1; // first built period sits right under the name
        for (const builtPeriodLine of builtPeriodLines) {
          lineY += POSTER_BIKE_DETAIL_LINE_HEIGHT;
          addText(headerLayer, builtPeriodLine, { x: barLeftX, y: lineY, 'font-size': POSTER_BIKE_DETAIL_FONT_SIZE, fill: POSTER_COLORS.textSecondary, 'font-variant-numeric': 'tabular-nums' });
        }
      }
    }

    // ----- time scale -----
    const timelineStartTimestamp = Date.UTC(timelineModel.earliestYear, 0, 1);
    const timelineEndTimestamp = Date.UTC(CURRENT_YEAR + 1, 0, 1);
    const posterPixelsPerYear = (plotBottomY - plotTopY) / ((timelineEndTimestamp - timelineStartTimestamp) / MILLISECONDS_PER_YEAR);
    const timestampToY = timestamp => plotTopY + (timelineEndTimestamp - timestamp) / MILLISECONDS_PER_YEAR * posterPixelsPerYear;

    const gridLayer = createSvgElement('g', {}, svg);
    for (let year = timelineModel.earliestYear; year <= CURRENT_YEAR + 1; year++) {
      const yearStartY = timestampToY(Date.UTC(year, 0, 1));
      createSvgElement('line', { x1: POSTER_YEAR_AXIS_WIDTH, x2: posterWidth, y1: yearStartY, y2: yearStartY, stroke: POSTER_COLORS.gridline, 'stroke-width': 0.75 }, gridLayer);
      if (year <= CURRENT_YEAR) {
        addText(gridLayer, year, { x: POSTER_YEAR_AXIS_WIDTH - 6, y: timestampToY(Date.UTC(year, 6, 1)) + 4, 'text-anchor': 'end', 'font-size': 11, fill: POSTER_COLORS.textMuted });
      }
    }
    const todayY = timestampToY(TODAY_TIMESTAMP);
    createSvgElement('line', { x1: POSTER_YEAR_AXIS_WIDTH, x2: posterWidth, y1: todayY, y2: todayY, stroke: POSTER_COLORS.textMuted, 'stroke-dasharray': '3 3', 'stroke-width': 0.75 }, gridLayer);
    addText(gridLayer, 'today', { x: POSTER_YEAR_AXIS_WIDTH - 6, y: todayY + 3, 'text-anchor': 'end', 'font-size': 9, fill: POSTER_COLORS.textMuted });

    // ----- built bars -----
    const barLayer = createSvgElement('g', {}, svg);
    for (const bike of timelineModel.bikes) {
      const barLeftX = barLeftXByBikeId[bike.id];
      if (barLeftX == null) continue;
      for (const period of bike.builtPeriods) {
        const topY = timestampToY(period.endTimestamp);
        createSvgElement('rect', { x: barLeftX, y: topY, width: barWidthOf(bike.id), height: Math.max(2, timestampToY(period.startTimestamp) - topY), rx: 3, fill: POSTER_COLORS.builtBar, stroke: POSTER_COLORS.builtBarBorder, 'stroke-width': 1 }, barLayer);
      }
    }

    // ----- ribbons (see computeTransferRibbons) and same-bike storage links -----
    const laneCenterX = (bikeId, laneIndex) =>
      barLeftXByBikeId[bikeId] == null ? null : barLeftXByBikeId[bikeId] + laneOffsetX(bikeId, laneIndex) + laneWidth / 2;
    const ribbonLayer = createSvgElement('g', {}, svg);
    for (const part of timelineModel.parts) {
      for (let index = 0; index < part.mountings.length - 1; index++) {
        const previousMounting = part.mountings[index];
        const nextMounting = part.mountings[index + 1];
        if (previousMounting.bikeId !== nextMounting.bikeId) continue;
        const linkX = laneCenterX(previousMounting.bikeId, previousMounting.laneIndex);
        if (linkX == null) continue;
        createSvgElement('line', {
          x1: linkX, x2: linkX, y1: timestampToY(previousMounting.endTimestamp), y2: timestampToY(nextMounting.startTimestamp),
          stroke: POSTER_PART_GROUP_COLORS[part.partGroup], 'stroke-width': 1.5, 'stroke-dasharray': '2 3',
        }, ribbonLayer);
      }
    }
    const posterRibbonWidth = laneWidth * 0.8;
    const { ribbons, departureDots } = computeTransferRibbons({
      laneCenterX, timestampToY, trackSpacing: posterRibbonWidth + RIBBON_TRACK_GAP, ribbonWidth: posterRibbonWidth, connectorGapSize: CONNECTOR_GAP_SIZE,
    });
    for (const transfer of ribbons) {
      createSvgElement('path', {
        d: transfer.pathData, fill: 'none', stroke: POSTER_PART_GROUP_COLORS[transfer.part.partGroup],
        'stroke-opacity': 0.3, 'stroke-width': posterRibbonWidth, 'stroke-linejoin': 'miter', 'stroke-linecap': 'butt',
      }, ribbonLayer);
    }

    // Departure dots by part, so a strip's label can stop before the dots on it
    const departureDotRadius = posterRibbonWidth / 2;
    const departureDotsByPartId = new Map();
    for (const dot of departureDots) {
      if (!departureDotsByPartId.has(dot.part.id)) departureDotsByPartId.set(dot.part.id, []);
      departureDotsByPartId.get(dot.part.id).push(dot);
    }

    // ----- part strips with their descriptions written along them -----
    // A strip is as wide as a ribbon and a departure dot, centred in its lane. Every label uses the
    // same font size, the one that fits across a strip; a label that is too long is shortened with "…".
    const stripWidth = posterRibbonWidth;
    const labelFontSize = Math.min(8.5, stripWidth * 0.95);
    const segmentLayer = createSvgElement('g', {}, svg);
    for (const part of timelineModel.parts) {
      const partColor = POSTER_PART_GROUP_COLORS[part.partGroup];
      const tintColor = mixWithWhite(partColor, POSTER_LABEL_TINT_STRENGTH);
      for (const mounting of part.mountings) {
        const barLeftX = barLeftXByBikeId[mounting.bikeId];
        if (barLeftX == null) continue;
        const laneLeftX = barLeftX + laneOffsetX(mounting.bikeId, mounting.laneIndex);
        const laneCenter = laneLeftX + laneWidth / 2;
        const topY = timestampToY(mounting.endTimestamp) + 1;
        const bottomY = timestampToY(mounting.startTimestamp) - 1;
        const stripHeight = Math.max(1.5, bottomY - topY);
        createSvgElement('rect', {
          x: laneCenter - stripWidth / 2, y: topY, width: stripWidth, height: stripHeight, rx: stripWidth / 2, // fully round ends
          fill: tintColor,
        }, segmentLayer);

        // The label reads upwards and never runs through a departure dot: it goes in the longer free
        // stretch of the strip, below the lowest dot or above the highest one.
        const dotYsOnStrip = (departureDotsByPartId.get(part.id) || [])
          .filter(dot => Math.abs(dot.x - laneCenter) < 0.5 && dot.y >= topY && dot.y <= bottomY)
          .map(dot => dot.y);
        let labelTopY = topY;
        let labelBottomY = bottomY;
        if (dotYsOnStrip.length) {
          const belowDotsTopY = Math.max(...dotYsOnStrip) + departureDotRadius + 1;
          const aboveDotsBottomY = Math.min(...dotYsOnStrip) - departureDotRadius - 1;
          if (bottomY - belowDotsTopY >= aboveDotsBottomY - topY) labelTopY = belowDotsTopY;
          else labelBottomY = aboveDotsBottomY;
        }
        const labelText = fitTextIntoLength(part.description, labelFontSize, labelBottomY - labelTopY - 4);
        if (!labelText) continue;
        // Rotated -90°: text reads bottom-to-top, glyphs extend to the left of the baseline.
        const baselineX = laneCenter + labelFontSize * 0.36;
        const labelStartY = labelBottomY - 2;
        addText(segmentLayer, labelText, {
          transform: `translate(${baselineX.toFixed(2)},${labelStartY.toFixed(2)}) rotate(-90)`,
          'font-size': labelFontSize.toFixed(2), fill: POSTER_COLORS.textPrimary,
        });
      }
    }

    // ----- departure dots of all ribbons, on top of the strips -----
    // The poster's strips are pale tints, so the dot uses the full group colour (one step darker than
    // the strip, like the screen's darker dot on a full-colour strip), and it is only as wide as the ribbon.
    for (const dot of departureDots) {
      createSvgElement('circle', {
        cx: dot.x, cy: dot.y, r: departureDotRadius, fill: POSTER_PART_GROUP_COLORS[dot.part.partGroup],
      }, segmentLayer);
    }
  }

  function renderPosterTitleBand(svg, posterWidth, addText) {
    addText(svg, 'Bike timeline', { x: 0, y: 26, 'font-size': 26, 'font-weight': 700, fill: POSTER_COLORS.textPrimary });
    addText(svg,
      `As of ${formatMonthYear(TODAY_TIMESTAMP)} · ${timelineModel.bikes.length} bikes · ${timelineModel.parts.length} parts`,
      { x: 0, y: 46, 'font-size': 11, fill: POSTER_COLORS.textSecondary });

    // Legend, right-aligned: part groups
    const legendFontSize = 11;
    const legendRowY = 24;
    const legendItems = Object.entries(PART_GROUPS)
      .map(([groupKey, group]) => ({ groupKey, label: group.label, description: group.partTypesDescription }));
    const itemWidth = item => 14 + measureTextWidth(item.label, legendFontSize, 700)
      + 4 + measureTextWidth(item.description, legendFontSize) + 16;
    let itemX = posterWidth - legendItems.reduce((total, item) => total + itemWidth(item), 0) + 16;
    for (const item of legendItems) {
      const legendItem = createSvgElement('g', {}, svg);
      createSvgElement('rect', { x: itemX, y: legendRowY - 9, width: 10, height: 10, rx: 2, fill: POSTER_PART_GROUP_COLORS[item.groupKey] }, legendItem);
      const labelElement = addText(legendItem, '', { x: itemX + 14, y: legendRowY, 'font-size': legendFontSize, fill: POSTER_COLORS.textSecondary });
      const boldLabel = createSvgElement('tspan', { 'font-weight': 700, fill: POSTER_COLORS.textPrimary }, labelElement);
      boldLabel.textContent = item.label;
      const description = createSvgElement('tspan', { dx: 4 }, labelElement);
      description.textContent = item.description;
      itemX += itemWidth(item);
    }
  }

  // =====================================================================
  // Summary legends and table view
  // =====================================================================

  function renderSummaryAndLegends() {
    document.getElementById('part-group-legend').innerHTML = Object.entries(PART_GROUPS)
      .map(([groupKey, group]) => `<span>
          <span class="color-swatch" style="background:var(--part-group-${groupKey})"></span><span class="part-group-legend-name">${group.label}</span>${group.partTypesDescription}
        </span>`)
      .join('');


    renderPartsTable();
  }

  function renderPartsTable() {
    const firstLaneIndexOfType = partType => LANE_DEFINITIONS.findIndex(lane => lane.partType === partType);
    const partsInTableOrder = [...timelineModel.parts].sort((first, second) =>
      firstLaneIndexOfType(first.type) - firstLaneIndexOfType(second.type)
      || first.mountings[0].startTimestamp - second.mountings[0].startTimestamp);

    const bodyRows = partsInTableOrder.map(part => {
      const usageLines = part.mountings
        .map(mounting => `${escapeHtml(timelineModel.bikesById[mounting.bikeId].name)}: ${formatIsoDate(mounting.startTimestamp)} → ${formatIsoDate(mounting.endTimestamp)}`)
        .join('<br>');
      return `<tr><td>${escapeHtml(part.type)}</td><td>${escapeHtml(part.description)}</td><td class="usage-cell">${usageLines}</td></tr>`;
    }).join('');

    document.getElementById('parts-table').innerHTML =
      `<thead><tr><th>Type</th><th>Part</th><th>Usage</th></tr></thead><tbody>${bodyRows}</tbody>`;
  }

  // =====================================================================
  // Loading data and controls
  // =====================================================================

  function loadData(data) {
    rawData = data;
    const { errors, validBikes, validParts, note } = validateData(data);
    showDataErrors(errors, note);
    timelineModel = buildTimelineModel({ bikes: validBikes, parts: validParts });
    pinnedHighlightKey = null;
    renderSummaryAndLegends();
    renderChart();
  }

  const zoomSlider = document.getElementById('zoom-slider');
  zoomSlider.addEventListener('input', () => {
    pixelsPerYear = Number(zoomSlider.value);
    renderChart();
  });

  const jsonFileInput = document.getElementById('json-file-input');
  document.getElementById('load-json-button').addEventListener('click', () => jsonFileInput.click());
  jsonFileInput.addEventListener('change', async event => {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;
    try {
      loadData(JSON.parse(await selectedFile.text()));
    } catch (error) {
      showDataErrors(['Could not read JSON: ' + error.message], 'The data that was loaded before is still shown.');
    }
  });

  document.getElementById('copy-json-button').addEventListener('click', async event => {
    const copyButton = event.currentTarget;
    try {
      await navigator.clipboard.writeText(JSON.stringify(rawData, null, 2));
      copyButton.textContent = 'Copied ✓';
    } catch {
      copyButton.textContent = 'Copy blocked';
    }
    setTimeout(() => { copyButton.textContent = 'Copy JSON'; }, 1600);
  });

  // Build settings dialog: one section per bike type, one row per part type, and one radio button
  // per requirement (mandatory, optional, ignored). Closing it applies the settings to the timeline.
  const buildSettingsDialog = document.getElementById('build-settings-dialog');
  const buildSettingsSections = document.getElementById('build-settings-sections');
  const radioInputName = (bikeType, partType) => `${bikeType.type}:${partType}`;

  function renderBuildSettings() {
    const capitalize = text => text[0].toUpperCase() + text.slice(1);
    buildSettingsSections.innerHTML = BIKE_TYPES.map(bikeType => {
      const partRow = partType => {
        const currentRequirement = partRequirementFor(bikeType, partType);
        const radioCells = PART_REQUIREMENTS.map(requirement => `<td><input type="radio"
            name="${escapeHtml(radioInputName(bikeType, partType))}" value="${requirement}"
            aria-label="${escapeHtml(`${bikeType.name} ${partType}: ${requirement}`)}"${requirement === currentRequirement ? ' checked' : ''}></td>`).join('');
        return `<tr><td>${escapeHtml(partType)}</td>${radioCells}</tr>`;
      };
      // One tbody per part group, headed by the group's colour and name as in the legend.
      const groupBodies = Object.entries(PART_GROUPS).map(([groupKey, group]) => {
        const groupPartTypes = LANE_DEFINITIONS.filter(lane => lane.partGroup === groupKey).map(lane => lane.partType);
        return `<tbody class="settings-part-group" style="--group-color:var(--part-group-${groupKey})">
            <tr class="settings-part-group-heading"><th colspan="${PART_REQUIREMENTS.length + 1}" scope="rowgroup">
              <span class="color-swatch"></span>${escapeHtml(group.label)}</th></tr>
            ${groupPartTypes.map(partRow).join('')}
          </tbody>`;
      }).join('');
      return `<section class="settings-section">
          <h3>${escapeHtml(bikeType.label)}</h3>
          <table class="settings-table">
            <thead><tr><th>Part type</th>${PART_REQUIREMENTS.map(requirement => `<th>${capitalize(requirement)}</th>`).join('')}</tr></thead>
            ${groupBodies}
          </table>
        </section>`;
    }).join('');
  }

  function readBuildSettings() {
    for (const bikeType of BIKE_TYPES) {
      const requirementOf = partType =>
        buildSettingsSections.querySelector(`input[name="${CSS.escape(radioInputName(bikeType, partType))}"]:checked`).value;
      bikeType.lanePartTypes = CONFIGURABLE_PART_TYPES.filter(partType => requirementOf(partType) !== 'ignored');
      bikeType.optionalPartTypes = CONFIGURABLE_PART_TYPES.filter(partType => requirementOf(partType) === 'optional');
    }
  }

  document.getElementById('build-settings-button').addEventListener('click', () => {
    renderBuildSettings();
    buildSettingsDialog.showModal();
  });
  // Fires for the close button, Done and the Escape key.
  buildSettingsDialog.addEventListener('close', () => {
    readBuildSettings();
    applyBikeTypeSettings();
    loadData(rawData);
  });

  document.getElementById('print-poster-button').addEventListener('click', () => {
    renderPoster();
    window.print();
  });
  // Also covers printing via the browser menu or Ctrl/Cmd+P
  window.addEventListener('beforeprint', renderPoster);

  loadData(JSON.parse(document.getElementById('bike-data').textContent));
})();
