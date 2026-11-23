// The bike timeline: data validation, the model, the chart (on screen and in print) and the controls.
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
  const HEADER_HEIGHT = 84;          // at least; taller when bike headers need more lines
  const BIKE_NAME_FIRST_LINE_Y = 46;
  const BIKE_NAME_LINE_HEIGHT = 14;
  const BUILT_PERIOD_FONT_SIZE = 10; // built periods under each bike name
  const BUILT_PERIOD_LINE_HEIGHT = 12;
  const NAME_TO_BUILT_PERIODS_MIN_GAP = 8; // at least this much space between a bike's name and its built periods
  const BUILT_PERIODS_BOTTOM_PADDING = 8;  // space between the last built period and the bottom of the header
  const BOTTOM_PADDING = 24;
  const BIKE_NAME_AVERAGE_CHARACTER_WIDTH = 6.4; // for wrapping bike names to the width of their bar
  const BIKE_NAME_MAX_LINES = 2;
  const PART_LABEL_FONT_SIZE = LANE_WIDTH * 0.8;  // print only: part descriptions written along the strips
  const PART_LABEL_END_PADDING = 2;               // space between a label and the ends of its strip

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
  const hiddenBikeIds = new Set(); // bikes whose checkbox is unchecked: not drawn on screen or in print

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

    // Horizontal position of every shown bike bar. Hidden bikes (and bikes of an unknown type)
    // get no position, so nothing is drawn on them and no ribbon goes to or from them.
    const shownBikeTypeGroups = timelineModel.bikeTypeGroups
      .map(group => ({ ...group, bikes: group.bikes.filter(bike => !hiddenBikeIds.has(bike.id)) }))
      .filter(group => group.bikes.length > 0);
    const barWidthOf = bike => screenLaneLayoutByBikeType[bike.type].barWidth;
    const columns = layoutBikeColumns(shownBikeTypeGroups, YEAR_AXIS_WIDTH + 16, GAP_BETWEEN_BIKES, GAP_BETWEEN_BIKE_TYPES, barWidthOf);
    timelineModel.bikes.forEach(bike => { bike.barLeftX = null; });
    for (const group of shownBikeTypeGroups) {
      Object.assign(group, columns.xRangeByGroup.get(group));
      for (const bike of group.bikes) {
        bike.barLeftX = columns.barLeftXByBikeId[bike.id];
        bike.barWidth = barWidthOf(bike);
      }
    }
    const svgWidth = columns.rightX + 24;

    // Header lines of every shown bike; the plot starts below the tallest header.
    const headerLinesByBikeId = {};
    for (const group of shownBikeTypeGroups) {
      group.bikes.forEach((bike, bikeIndex) => {
        const isLastBikeOfGroup = bikeIndex === group.bikes.length - 1;
        const columnWidth = bike.barWidth + (isLastBikeOfGroup ? 0 : GAP_BETWEEN_BIKES - 10);
        headerLinesByBikeId[bike.id] = bikeHeaderLines(bike, columnWidth);
      });
    }
    const headerBottomY = Math.max(HEADER_HEIGHT, ...Object.values(headerLinesByBikeId).map(({ nameLines, builtPeriodLines }) =>
      BIKE_NAME_FIRST_LINE_Y + (nameLines.length - 1) * BIKE_NAME_LINE_HEIGHT + NAME_TO_BUILT_PERIODS_MIN_GAP
      + builtPeriodLines.length * BUILT_PERIOD_LINE_HEIGHT + BUILT_PERIODS_BOTTOM_PADDING));
    const plotTopY = headerBottomY + 10;
    const timestampToY = timestamp => plotTopY + (timelineEndTimestamp - timestamp) / MILLISECONDS_PER_YEAR * pixelsPerYear;
    const svgHeight = timestampToY(timelineStartTimestamp) + BOTTOM_PADDING;

    const svg = createSvgElement('svg', {
      width: svgWidth, height: svgHeight, viewBox: `0 0 ${svgWidth} ${svgHeight}`,
      preserveAspectRatio: 'xMinYMin meet', // in print, scaled to fit the page from the top left
      role: 'img', 'aria-label': 'Timeline of bikes and the parts moved between them',
    }, chartContainer);

    renderYearGrid(svg, svgWidth, timestampToY);
    renderBikeHeaders(svg, shownBikeTypeGroups, headerLinesByBikeId, headerBottomY);
    renderBuiltBars(svg, timestampToY);
    const departureDots = renderPartRibbons(svg, timestampToY);
    const partLabelLayer = renderPartSegments(svg, timestampToY);
    renderDepartureDots(svg, departureDots);
    svg.appendChild(partLabelLayer); // on top of the dots

    svg.addEventListener('click', event => { if (event.target === svg) togglePinnedHighlight(null); });
    applyHighlight();
  }

  // Places the bike bars left to right, group by group, with a gap between bikes and a wider one
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
  }

  // A bike's name (wrapped to the width of its bar) and its built periods. A built period is one line
  // ("2002–2007 · 5.3 y": years only, but the duration from the full dates) when it fits the column (bar plus the gap to the next bike),
  // otherwise the duration goes on a line of its own.
  function bikeHeaderLines(bike, columnWidth) {
    const maxCharactersPerLine = Math.floor(bike.barWidth / BIKE_NAME_AVERAGE_CHARACTER_WIDTH);
    const nameLines = wrapTextIntoLines(displayNameOf(bike, BIKE_TYPES_BY_KEY), maxCharactersPerLine, BIKE_NAME_MAX_LINES);
    const builtPeriodLines = bike.builtPeriods.flatMap(period => {
      const dates = formatPeriodYears(period);
      const duration = formatDuration(period.endTimestamp - period.startTimestamp);
      const oneLine = `${dates} · ${duration}`;
      return measureLabelWidth(oneLine, BUILT_PERIOD_FONT_SIZE) <= columnWidth ? [oneLine] : [dates, duration];
    });
    return { nameLines, builtPeriodLines };
  }

  function renderBikeHeaders(svg, bikeTypeGroups, headerLinesByBikeId, headerBottomY) {
    const headerLayer = createSvgElement('g', {}, svg);
    for (const group of bikeTypeGroups) {
      const typeLabel = createSvgElement('text', { class: 'bike-type-label', x: group.leftX, y: 18 }, headerLayer);
      typeLabel.textContent = group.label;
      createSvgElement('line', { class: 'bike-type-rule', x1: group.leftX, x2: group.rightX, y1: 26, y2: 26 }, headerLayer);

      for (const bike of group.bikes) {
        const bikeHeader = createSvgElement('g', { class: 'bike-header', 'data-bike-id': bike.id }, headerLayer);
        // transparent rect = larger hover target
        createSvgElement('rect', { x: bike.barLeftX - 4, y: 30, width: bike.barWidth + 8, height: headerBottomY - 26, fill: 'transparent' }, bikeHeader);

        const { nameLines, builtPeriodLines } = headerLinesByBikeId[bike.id];
        nameLines.forEach((line, lineIndex) => {
          const nameText = createSvgElement('text', { class: 'bike-name', x: bike.barLeftX, y: BIKE_NAME_FIRST_LINE_Y + lineIndex * BIKE_NAME_LINE_HEIGHT }, bikeHeader);
          nameText.textContent = line;
        });
        // Built periods, aligned to the bottom of the header
        const lastBuiltPeriodY = headerBottomY - BUILT_PERIODS_BOTTOM_PADDING;
        builtPeriodLines.forEach((line, lineIndex) => {
          const periodText = createSvgElement('text', {
            class: 'bike-built-period', x: bike.barLeftX,
            y: lastBuiltPeriodY - (builtPeriodLines.length - 1 - lineIndex) * BUILT_PERIOD_LINE_HEIGHT,
            style: `font-size: ${BUILT_PERIOD_FONT_SIZE}px`,
          }, bikeHeader);
          periodText.textContent = line;
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

  // Each strip also gets its part's description written along it, reading upwards. The descriptions
  // are hidden on screen and shown in print, or with the print-view class on <html> (see styles.css);
  // a long one is shortened with "…".
  function renderPartSegments(svg, timestampToY) {
    const segmentLayer = createSvgElement('g', {}, svg);
    const labelLayer = createSvgElement('g', { class: 'part-labels' });
    for (const part of timelineModel.parts) {
      for (const mounting of part.mountings) {
        const bike = timelineModel.bikesById[mounting.bikeId];
        if (bike.barLeftX == null) continue;
        // 1px inset at each end leaves a visible gap between a part and its replacement
        const topY = timestampToY(mounting.endTimestamp) + 1;
        const bottomY = timestampToY(mounting.startTimestamp) - 1;
        const laneLeftX = bike.barLeftX + screenLaneLayoutByBikeType[bike.type].laneOffsetsX[mounting.laneIndex];
        const segment = createSvgElement('rect', {
          class: 'part-segment', 'data-part-id': part.id, 'data-bike-id': bike.id,
          x: laneLeftX, y: topY,
          width: LANE_WIDTH, height: Math.max(1.5, bottomY - topY), rx: LANE_WIDTH / 2, // fully round ends
          style: `--part-color: var(--part-group-${part.partGroup})`,
        }, segmentLayer);
        attachPartHoverHandlers(segment, part);

        const labelText = fitTextIntoLength(part.description, PART_LABEL_FONT_SIZE, bottomY - topY - 2 * PART_LABEL_END_PADDING);
        if (!labelText) continue;
        // Rotated -90°: the text reads bottom to top and its glyphs extend to the left of the baseline.
        const baselineX = laneLeftX + LANE_WIDTH / 2 + PART_LABEL_FONT_SIZE * 0.36;
        const label = createSvgElement('text', {
          class: 'part-label', 'data-part-id': part.id, style: `font-size: ${PART_LABEL_FONT_SIZE}px`,
          transform: `translate(${baselineX.toFixed(2)},${(bottomY - PART_LABEL_END_PADDING).toFixed(2)}) rotate(-90)`,
        }, labelLayer);
        label.textContent = labelText;
      }
    }
    return labelLayer;
  }

  // Width of a part label in the chart's font, for shortening it to fit its strip.
  const textMeasuringContext = document.createElement('canvas').getContext('2d');
  function measureLabelWidth(text, fontSize) {
    textMeasuringContext.font = `${fontSize}px ${getComputedStyle(document.querySelector('.viz-root')).fontFamily}`;
    return textMeasuringContext.measureText(text).width;
  }

  // Fits text into maxLength at the given font size, shortening it with "…" if needed.
  // Returns null when not even a few characters fit.
  function fitTextIntoLength(text, fontSize, maxLength) {
    if (measureLabelWidth(text, fontSize) <= maxLength) return text;
    let shortened = text;
    while (shortened.length > 3 && measureLabelWidth(shortened.trimEnd() + '…', fontSize) > maxLength) {
      shortened = shortened.slice(0, -1);
    }
    if (shortened.length <= 3) return null;
    return shortened.trimEnd() + '…';
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
  // Summary legends and table view
  // =====================================================================

  function renderSummaryAndLegends() {
    document.getElementById('part-group-legend').innerHTML = Object.entries(PART_GROUPS)
      .map(([groupKey, group]) => `<span>
          <span class="color-swatch" style="background:var(--part-group-${groupKey})"></span><span class="part-group-legend-name">${group.label}</span>${group.partTypesDescription}
        </span>`)
      .join('');


    renderBikeToggles();
    renderPartsTable();
  }

  // One checkbox per bike, grouped by bike type: an unchecked bike is not drawn (on screen or in print).
  // Clicking a group's name checks all its bikes, or unchecks them all if they're all checked.
  function renderBikeToggles() {
    const bikeToggles = document.getElementById('bike-toggles');
    bikeToggles.innerHTML = timelineModel.bikeTypeGroups.map(group => `<div class="bike-toggle-group">
        <button type="button" class="bike-toggle-group-name" title="Show or hide all ${escapeHtml(group.name)} bikes">${escapeHtml(group.label)}</button>
        ${group.bikes.map(bike => `<label><input type="checkbox" value="${escapeHtml(bike.id)}"${hiddenBikeIds.has(bike.id) ? '' : ' checked'}>${escapeHtml(displayNameOf(bike, BIKE_TYPES_BY_KEY))}</label>`).join('')}
      </div>`).join('');
  }
  document.getElementById('bike-toggles').addEventListener('click', event => {
    const groupNameButton = event.target.closest('.bike-toggle-group-name');
    if (!groupNameButton) return;
    const groupCheckboxes = [...groupNameButton.parentElement.querySelectorAll('input[type=checkbox]')];
    const showAll = groupCheckboxes.some(checkbox => !checkbox.checked);
    for (const checkbox of groupCheckboxes) {
      checkbox.checked = showAll;
      if (showAll) hiddenBikeIds.delete(checkbox.value);
      else hiddenBikeIds.add(checkbox.value);
    }
    renderChart();
  });
  document.getElementById('bike-toggles').addEventListener('change', event => {
    const checkbox = event.target;
    if (checkbox.checked) hiddenBikeIds.delete(checkbox.value);
    else hiddenBikeIds.add(checkbox.value);
    renderChart();
  });

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
            <thead><tr><th>Part type</th>${PART_REQUIREMENTS.map(requirement => `<th scope="col"><button type="button"
              class="settings-column-button" data-requirement="${requirement}"
              title="${escapeHtml(`Make every ${bikeType.name} part ${requirement}`)}">${capitalize(requirement)}</button></th>`).join('')}</tr></thead>
            ${groupBodies}
          </table>
        </section>`;
    }).join('');
  }

  // Clicking a column heading (Mandatory, Optional, Ignored) selects it for every part type of that bike type.
  buildSettingsSections.addEventListener('click', event => {
    const columnButton = event.target.closest('.settings-column-button');
    if (!columnButton) return;
    const columnRadios = columnButton.closest('table')
      .querySelectorAll(`input[type=radio][value="${columnButton.dataset.requirement}"]`);
    for (const radio of columnRadios) radio.checked = true;
  });

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


  // The page starts with the test data (see README.md), which shows the cases the timeline can draw.
  // Use "Load JSON…" to show your own data.
  const DEFAULT_DATA_FILE = 'test-bikes.json';
  async function loadDefaultData() {
    let data;
    try {
      const response = await fetch(DEFAULT_DATA_FILE);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      data = await response.json();
    } catch (error) {
      showDataErrors([`Could not load ${DEFAULT_DATA_FILE}: ${error.message}`],
        'Open the page through a local web server (see README.md), or use "Load JSON…".');
      return;
    }
    loadData(data);
  }
  loadDefaultData();
})();
