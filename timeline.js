// The bike timeline: data validation, the model, the chart (on screen and in print) and the controls.
// Needs utils.js, loaded before it.
(() => {
  // =====================================================================
  // Configuration
  // =====================================================================

  // Part groups: each has its own colour (CSS variable --part-group-<key>).
  const PART_GROUPS = {
    chassis:    { label: 'Chassis' },
    wheels:     { label: 'Wheels' },
    brakes:     { label: 'Brakes' },
    cockpit:    { label: 'Cockpit' },
    drivetrain: { label: 'Drivetrain' },
    seat:       { label: 'Seat' },
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
  // Every known part type, in lane order. A part of any other type is reported by validateData().
  const PART_TYPES = LANE_DEFINITIONS.map(lane => lane.partType);
  // part type -> its lane index in LANE_DEFINITIONS
  const laneIndexByPartType = Object.fromEntries(PART_TYPES.map((partType, laneIndex) => [partType, laneIndex]));
  const partGroupByPartType = Object.fromEntries(LANE_DEFINITIONS.map(lane => [lane.partType, lane.partGroup]));
  // The part types of a part group, in lane order.
  const partTypesOfGroup = partGroup => LANE_DEFINITIONS.filter(lane => lane.partGroup === partGroup).map(lane => lane.partType);

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

  // In the build settings dialog, each part type is mandatory, optional or ignored per bike type:
  // mandatory and optional parts get a lane, ignored parts don't.
  const PART_REQUIREMENTS = ['mandatory', 'optional', 'ignored'];
  const partRequirementFor = (bikeType, partType) =>
    !bikeType.lanePartTypes.includes(partType) ? 'ignored'
      : bikeType.optionalPartTypes.includes(partType) ? 'optional' : 'mandatory';

  // Part types that are ignored on every bike type are skipped without a warning.
  let silentlySkippedPartTypes; // set by applyBikeTypeSettings()
  // =====================================================================
  // Layout (all values in pixels)
  // =====================================================================

  const LANE_WIDTH = 5;
  const LANE_GAP = 1;
  const PART_GROUP_GAP = 3;          // extra space between lanes of different part groups
  const BAR_INNER_PADDING = 5;       // space between the bar edge and the first/last lane
  const MIN_BAR_WIDTH = 100;         // narrower bike bars are widened to this, with their lanes centred
  const RIBBON_TRACK_GAP = 1;        // empty space between the tracks of ribbons leaving a bike together
  const CONNECTOR_GAP_SIZE = 3;      // gap between an arriving ribbon and its new strip
  const DEPARTURE_DOT_SHADE = 0.6;   // departure dot colour: this much of the strip colour, the rest black
  const GAP_BETWEEN_BIKES = 24;
  const GAP_BETWEEN_BIKE_TYPES = 34;
  const YEAR_AXIS_WIDTH = 52;
  const YEAR_LABEL_GAP = 10;         // space between a year label and the year lines
  const YEAR_AXIS_TO_FIRST_BAR = 16; // space between the year axis and the first bike bar
  const RIGHT_PADDING = 24;          // space right of the last bike bar
  const YEAR_LINE_END_PADDING = 8;   // the year lines stop this far before the right edge
  const BIKE_TYPE_LABEL_Y = 18;
  const BIKE_TYPE_RULE_Y = 26;       // the line under a bike type's label
  const BIKE_HEADER_HOVER_PADDING = 4; // a bike header's hover target reaches this far beyond its bar
  const MIN_GAP_BETWEEN_BIKE_HEADERS = 10; // a built period may reach into the gap to the next bike, but not closer than this
  const HEADER_TO_PLOT_GAP = 10;     // space between the bottom of the header and the top of the plot
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

  const SCREEN_LANE_SPACING = { laneWidth: LANE_WIDTH, laneGap: LANE_GAP, partGroupGap: PART_GROUP_GAP, barInnerPadding: BAR_INNER_PADDING, minBarWidth: MIN_BAR_WIDTH };
  let screenLaneLayoutByBikeType; // set by applyBikeTypeSettings()
  // Left x of a lane of a placed bike on the chart, or null for a hidden bike (not placed).
  const laneLeftXOf = (bike, laneIndex) =>
    bike.barLeftX == null ? null : bike.barLeftX + screenLaneLayoutByBikeType[bike.type].laneOffsetsX[laneIndex];

  // Recomputes everything that depends on the lanes of each bike type. Call it after changing
  // lanePartTypes or optionalPartTypes, then rebuild the model.
  function applyBikeTypeSettings() {
    screenLaneLayoutByBikeType = Object.fromEntries(
      BIKE_TYPES.map(bikeType => [bikeType.type, computeLaneLayout(LANE_DEFINITIONS, bikeType.lanePartTypes, SCREEN_LANE_SPACING)]));
    silentlySkippedPartTypes = new Set(partTypesIgnoredOnEveryBikeType(BIKE_TYPES, PART_TYPES));
  }
  applyBikeTypeSettings();

  // =====================================================================
  // DOM helpers (the helpers that don't need the page are in utils.js)
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
  let pinnedHighlightKey = null; // 'part:<id>' or 'bike:<id>', set by clicking; its popup is open
  let hoveredHighlightKey = null; // set by hovering with a mouse; a pinned highlight wins
  const hiddenBikeIds = new Set(); // bikes whose checkbox is unchecked: not drawn on screen or in print

  // =====================================================================
  // Data errors (found by validateData() in utils.js)
  // =====================================================================

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
      // Keep the mountings that are drawn, merge back-to-back ones on the same bike, and link each one
      // to its part and bike.
      const drawnMountings = part.mountings.filter(mounting => {
        const bike = bikesById[mounting.bikeId];
        if (!bike) return false; // reported by validateData()
        if (!BIKE_TYPES_BY_KEY[bike.type].lanePartTypes.includes(part.type)) {
          console.warn(`${bike.name} (${bike.type}) has no "${part.type}" lane, so "${part.description}" is not shown on it`);
          return false;
        }
        return true;
      });
      // Every part type has exactly one lane. Two parts of the same type on one bike at the same time
      // are a data problem: they're reported by validateData() and drawn on top of each other.
      const laneIndex = laneIndexByPartType[part.type];
      part.mountings = mergeBackToBackMountings(drawnMountings).map(mounting => ({ ...mounting, part, laneIndex }));
      part.mountings.forEach(mounting => bikesById[mounting.bikeId].mountings.push(mounting));
    }
    const shownParts = parts.filter(part => part.mountings.length > 0);

    for (const bike of bikes) {
      bike.builtPeriods = computeBuiltPeriods(bike.mountings, requiredPartTypesFor(BIKE_TYPES_BY_KEY[bike.type]));
      bike.partsEverMounted = [...new Set(bike.mountings.map(mounting => mounting.part))];
      bike.sortTimestamp = bike.builtPeriods.length
        ? bike.builtPeriods[0].startTimestamp
        : (bike.mountings.length ? Math.min(...bike.mountings.map(mounting => mounting.startTimestamp)) : TODAY_TIMESTAMP);
    }

    // Group bikes by type, chronologically within each group.
    const bikeTypeGroups = BIKE_TYPES
      .map(entry => ({
        ...entry,
        bikes: bikes.filter(bike => bike.type === entry.type).sort((first, second) => first.sortTimestamp - second.sortTimestamp),
      }))
      .filter(group => group.bikes.length > 0);

    const allTimestamps = shownParts.flatMap(part => part.mountings.flatMap(mounting => [mounting.startTimestamp, mounting.endTimestamp]));
    const earliestYear = new Date(Math.min(...allTimestamps, TODAY_TIMESTAMP)).getUTCFullYear();

    return { bikes, bikesById, parts: shownParts, bikeTypeGroups, earliestYear };
  }

  // =====================================================================
  // Rendering
  // =====================================================================

  function renderChart() {
    const chartContainer = document.getElementById('chart-container');
    chartContainer.innerHTML = '';

    const timelineStartTimestamp = Date.UTC(timelineModel.earliestYear, 0, 1);
    const timelineEndTimestamp = Date.UTC(CURRENT_YEAR + 1, 0, 1);

    // Horizontal position of every shown bike bar. Hidden bikes get no position, so nothing is drawn on them and no ribbon goes to or from them.
    const shownBikeTypeGroups = timelineModel.bikeTypeGroups
      .map(group => ({ ...group, bikes: group.bikes.filter(bike => !hiddenBikeIds.has(bike.id)) }))
      .filter(group => group.bikes.length > 0);
    const barWidthOf = bike => screenLaneLayoutByBikeType[bike.type].barWidth;
    const columns = layoutBikeColumns(shownBikeTypeGroups, YEAR_AXIS_WIDTH + YEAR_AXIS_TO_FIRST_BAR, GAP_BETWEEN_BIKES, GAP_BETWEEN_BIKE_TYPES, barWidthOf);
    timelineModel.bikes.forEach(bike => { bike.barLeftX = null; });
    for (const group of shownBikeTypeGroups) {
      Object.assign(group, columns.xRangeByGroup.get(group));
      for (const bike of group.bikes) {
        bike.barLeftX = columns.barLeftXByBikeId[bike.id];
        bike.barWidth = barWidthOf(bike);
      }
    }
    const svgWidth = columns.rightX + RIGHT_PADDING;

    // Header lines of every shown bike; the plot starts below the tallest header.
    const headerLinesByBikeId = {};
    for (const group of shownBikeTypeGroups) {
      group.bikes.forEach((bike, bikeIndex) => {
        const isLastBikeOfGroup = bikeIndex === group.bikes.length - 1;
        const columnWidth = bike.barWidth + (isLastBikeOfGroup ? 0 : GAP_BETWEEN_BIKES - MIN_GAP_BETWEEN_BIKE_HEADERS);
        headerLinesByBikeId[bike.id] = bikeHeaderLines(bike, columnWidth);
      });
    }
    const headerBottomY = Math.max(HEADER_HEIGHT, ...Object.values(headerLinesByBikeId).map(({ nameLines, builtPeriodLines }) =>
      BIKE_NAME_FIRST_LINE_Y + (nameLines.length - 1) * BIKE_NAME_LINE_HEIGHT + NAME_TO_BUILT_PERIODS_MIN_GAP
      + builtPeriodLines.length * BUILT_PERIOD_LINE_HEIGHT + BUILT_PERIODS_BOTTOM_PADDING));
    const plotTopY = headerBottomY + HEADER_TO_PLOT_GAP;
    const timestampToY = timestamp => plotTopY + (timelineEndTimestamp - timestamp) / MILLISECONDS_PER_YEAR * pixelsPerYear;
    const svgHeight = timestampToY(timelineStartTimestamp) + BOTTOM_PADDING;

    const svg = createSvgElement('svg', {
      width: svgWidth, height: svgHeight, viewBox: `0 0 ${svgWidth} ${svgHeight}`,
      preserveAspectRatio: 'xMinYMin meet', // in print, scaled to fit the page from the top left
      role: 'img', 'aria-label': 'Timeline of bikes and the parts moved between them',
    }, chartContainer);

    renderYearGrid(svg, svgWidth, timestampToY);
    renderBuiltBars(svg, timestampToY);
    const departureDots = renderPartRibbons(svg, timestampToY);
    const partLabelLayer = renderPartSegments(svg, timestampToY);
    renderDepartureDots(svg, departureDots);
    svg.appendChild(partLabelLayer); // on top of the dots

    svg.addEventListener('click', event => { if (event.target === svg) closePopup(); });
    renderChartHeader(chartContainer, shownBikeTypeGroups, headerLinesByBikeId, headerBottomY, svgWidth, svgHeight, plotTopY);
    applyHighlight();
    positionPopup(); // closes it: its part or bike was drawn again
  }

  // The bike type labels, bike names and built periods are drawn in their own SVG, laid over the empty
  // space the chart leaves at its top (same coordinates). On screen it stays at the top of the chart
  // while it scrolls down (position: sticky) and scrolls sideways with it; in print it is scaled
  // like the chart (see styles.css, which gets the chart's proportions from --chart-aspect-ratio).
  function renderChartHeader(chartContainer, bikeTypeGroups, headerLinesByBikeId, headerBottomY, svgWidth, svgHeight, plotTopY) {
    const chartHeaderHeight = plotTopY - 2; // leaves the line of next year at the top of the plot visible
    const chartHeader = document.createElement('div');
    chartHeader.className = 'chart-header';
    chartContainer.style.setProperty('--chart-aspect-ratio', svgWidth / svgHeight);
    const headerSvg = createSvgElement('svg', {
      width: svgWidth, height: chartHeaderHeight, viewBox: `0 0 ${svgWidth} ${chartHeaderHeight}`,
    }, chartHeader);
    const headerBackground = createSvgElement('rect', { class: 'chart-header-background', x: 0, y: 0, width: svgWidth, height: chartHeaderHeight }, headerSvg);
    headerBackground.addEventListener('click', () => closePopup());
    createSvgElement('line', { class: 'chart-header-edge', x1: 0, x2: svgWidth, y1: chartHeaderHeight - 0.5, y2: chartHeaderHeight - 0.5 }, headerSvg);
    renderBikeHeaders(headerSvg, bikeTypeGroups, headerLinesByBikeId, headerBottomY);
    chartContainer.prepend(chartHeader);

    // the edge line shows only once the chart has been scrolled down
    const showEdgeWhenScrolled = () => chartContainer.classList.toggle('is-scrolled-down', chartContainer.scrollTop > 0);
    chartContainer.onscroll = () => { showEdgeWhenScrolled(); positionPopup(); };
    showEdgeWhenScrolled();
  }

  function renderYearGrid(svg, svgWidth, timestampToY) {
    const yearGrid = createSvgElement('g', { class: 'year-grid' }, svg);
    for (let year = timelineModel.earliestYear; year <= CURRENT_YEAR + 1; year++) {
      const yearStartY = timestampToY(Date.UTC(year, 0, 1));
      createSvgElement('line', { x1: YEAR_AXIS_WIDTH, x2: svgWidth - YEAR_LINE_END_PADDING, y1: yearStartY, y2: yearStartY }, yearGrid);
      if (year <= CURRENT_YEAR) {
        const midYearY = timestampToY(Date.UTC(year, 6, 1));
        // the label's baseline 4px below the middle of the year centres the text on it
        const yearLabel = createSvgElement('text', { x: YEAR_AXIS_WIDTH - YEAR_LABEL_GAP, y: midYearY + 4, 'text-anchor': 'end' }, yearGrid);
        yearLabel.textContent = year;
      }
    }
  }

  // A bike's name (wrapped to the width of its bar) and its built periods. A built period is one line
  // ("2002–2007 · 5.3 y": years only, but the duration from the full dates) when it fits the column (bar plus the gap to the next bike),
  // otherwise the duration goes on a line of its own.
  function bikeHeaderLines(bike, columnWidth) {
    const maxCharactersPerLine = Math.floor(bike.barWidth / BIKE_NAME_AVERAGE_CHARACTER_WIDTH);
    const nameLines = wrapTextIntoLines(bike.name, maxCharactersPerLine, BIKE_NAME_MAX_LINES);
    const builtPeriodLines = bike.builtPeriods.flatMap(period => {
      const dates = formatPeriodYears(period);
      const duration = formatDuration(period.endTimestamp - period.startTimestamp);
      const oneLine = `${dates} · ${duration}`;
      return measureTextWidth(oneLine, BUILT_PERIOD_FONT_SIZE) <= columnWidth ? [oneLine] : [dates, duration];
    });
    return { nameLines, builtPeriodLines };
  }

  function renderBikeHeaders(svg, bikeTypeGroups, headerLinesByBikeId, headerBottomY) {
    const headerLayer = createSvgElement('g', {}, svg);
    for (const group of bikeTypeGroups) {
      const typeLabel = createSvgElement('text', { class: 'bike-type-label', x: group.leftX, y: BIKE_TYPE_LABEL_Y }, headerLayer);
      typeLabel.textContent = group.label;
      createSvgElement('line', { class: 'bike-type-rule', x1: group.leftX, x2: group.rightX, y1: BIKE_TYPE_RULE_Y, y2: BIKE_TYPE_RULE_Y }, headerLayer);

      for (const bike of group.bikes) {
        const bikeHeader = createSvgElement('g', { class: 'bike-header', 'data-bike-id': bike.id }, headerLayer);
        // transparent rect = larger hover target, from below the bike type's line to just below the header
        createSvgElement('rect', {
          x: bike.barLeftX - BIKE_HEADER_HOVER_PADDING, y: BIKE_TYPE_RULE_Y + BIKE_HEADER_HOVER_PADDING,
          width: bike.barWidth + 2 * BIKE_HEADER_HOVER_PADDING, height: headerBottomY - BIKE_TYPE_RULE_Y, fill: 'transparent',
        }, bikeHeader);

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

        attachHighlightHandlers(bikeHeader, 'bike:' + bike.id);
      }
    }
  }

  function renderBuiltBars(svg, timestampToY) {
    const barLayer = createSvgElement('g', {}, svg);
    for (const bike of timelineModel.bikes) {
      if (bike.barLeftX == null) continue; // hidden bike: not placed
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
      const laneLeftX = laneLeftXOf(timelineModel.bikesById[bikeId], laneIndex);
      return laneLeftX == null ? null : laneLeftX + LANE_WIDTH / 2;
    };

    for (const part of timelineModel.parts) {
      for (const [previousMounting, nextMounting] of consecutivePairs(part.mountings)) {
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

    const { ribbons, departureDots } = computeTransferRibbons(timestampToY, laneCenterX);
    for (const transfer of ribbons) {
      const ribbon = createSvgElement('path', {
        class: 'part-ribbon', 'data-part-id': transfer.part.id,
        stroke: `var(--part-group-${transfer.part.partGroup})`, 'stroke-width': LANE_WIDTH,
        d: transfer.pathData,
      }, ribbonLayer);
      attachHighlightHandlers(ribbon, 'part:' + transfer.part.id);
    }
    return departureDots;
  }

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
  // Returns the ribbons, plus one departure dot ({ part, x, y }) per ribbon. laneCenterX(bikeId, laneIndex)
  // is null for a hidden bike: no ribbon goes to or from it.
  function computeTransferRibbons(timestampToY, laneCenterX) {
    const ribbonWidth = LANE_WIDTH;
    const trackSpacing = LANE_WIDTH + RIBBON_TRACK_GAP;
    // Group departures by (old bike, date): everything leaving a bike together shares one set of tracks.
    const departureGroups = new Map();
    for (const part of timelineModel.parts) {
      for (const [previousMounting, nextMounting] of consecutivePairs(part.mountings)) {
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
          const ribbonEndY = Math.min(newStripBottomY + CONNECTOR_GAP_SIZE, departureY);

          departureDots.push({ part: transfer.part, x: transfer.startX, y: departureY });
          // If the new strip starts at (or below) the ribbon's height, there is no room for the 90° turn:
          // the vertical leg would be shorter than half the ribbon's width, and its corner would show as a
          // small notch beside the strip. The ribbon then runs straight across the lane to its far edge.
          const arrivesStraight = departureY - ribbonEndY < ribbonWidth / 2;
          const direction = transfer.endX > transfer.startX ? 1 : -1;
          ribbons.push({
            ...transfer,
            pathData: arrivesStraight
              ? `M${transfer.startX},${departureY} H${transfer.endX + direction * ribbonWidth / 2}`
              : `M${transfer.startX},${departureY} H${transfer.endX} V${ribbonEndY}`,
          });
        });
      }
    }

    return { ribbons, departureDots };
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
        const laneLeftX = laneLeftXOf(bike, mounting.laneIndex);
        const segment = createSvgElement('rect', {
          class: 'part-segment', 'data-part-id': part.id, 'data-bike-id': bike.id,
          x: laneLeftX, y: topY,
          width: LANE_WIDTH, height: Math.max(1.5, bottomY - topY), rx: LANE_WIDTH / 2, // fully round ends
          style: `--part-color: var(--part-group-${part.partGroup})`,
        }, segmentLayer);
        attachHighlightHandlers(segment, 'part:' + part.id);

        const labelText = fitTextIntoLength(part.description, bottomY - topY - 2 * PART_LABEL_END_PADDING, text => measureTextWidth(text, PART_LABEL_FONT_SIZE));
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

  // Width of a text in the chart's font: for the built periods in the bike headers and the part labels in print.
  const textMeasuringContext = document.createElement('canvas').getContext('2d');
  const chartFontFamily = getComputedStyle(document.querySelector('.viz-root')).fontFamily;
  function measureTextWidth(text, fontSize) {
    textMeasuringContext.font = `${fontSize}px ${chartFontFamily}`;
    return textMeasuringContext.measureText(text).width;
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
      attachHighlightHandlers(dotElement, 'part:' + dot.part.id);
    }
  }

  // =====================================================================
  // Interaction: tooltip and highlighting
  // =====================================================================

  // A click (or tap) on a part or a bike name highlights it and pins its popup at the click; another click
  // on it, on the popup, on an empty spot or anywhere outside the chart closes both. Hovering with a mouse
  // highlights a part or bike too and shows its popup next to the cursor, while no popup is pinned.
  const tooltip = document.getElementById('tooltip');
  let popupAnchor = null; // { element, offsetX, offsetY }: the click point, relative to the clicked element

  function attachHighlightHandlers(element, highlightKey) {
    element.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'mouse') return; // a tap also sends pointerenter: the click opens the popup
      hoveredHighlightKey = highlightKey;
      if (!popupAnchor) showHoverPopup(highlightKey, event);
      applyHighlight();
    });
    element.addEventListener('pointermove', event => {
      if (hoveredHighlightKey === highlightKey && !popupAnchor) placePopupNextTo(event.clientX, event.clientY);
    });
    element.addEventListener('pointerleave', () => {
      if (hoveredHighlightKey !== highlightKey) return;
      hoveredHighlightKey = null;
      if (!popupAnchor) hidePopup();
      applyHighlight();
    });
    element.addEventListener('click', event => {
      event.stopPropagation();
      if (pinnedHighlightKey === highlightKey && popupAnchor) closePopup();
      else openPopup(highlightKey, element, event);
    });
  }

  function fillPopup(highlightKey) {
    const [highlightKind, highlightedId] = highlightKey.split(/:(.+)/);
    tooltip.innerHTML = highlightKind === 'part'
      ? partPopupHtml(timelineModel.parts.find(candidate => candidate.id === highlightedId))
      : bikePopupHtml(timelineModel.bikesById[highlightedId]);
    tooltip.style.display = 'block';
    tooltip.style.visibility = '';
  }

  // follows the mouse, and lets clicks through to the chart under it
  function showHoverPopup(highlightKey, event) {
    fillPopup(highlightKey);
    tooltip.classList.add('is-hover-popup');
    placePopupNextTo(event.clientX, event.clientY);
  }

  function openPopup(highlightKey, element, event) {
    pinnedHighlightKey = highlightKey;
    fillPopup(highlightKey);
    tooltip.classList.remove('is-hover-popup');
    const elementBounds = element.getBoundingClientRect();
    popupAnchor = { element, offsetX: event.clientX - elementBounds.left, offsetY: event.clientY - elementBounds.top };
    positionPopup();
    applyHighlight();
  }

  function closePopup() {
    pinnedHighlightKey = null;
    hidePopup();
    applyHighlight();
  }

  function hidePopup() {
    popupAnchor = null;
    tooltip.style.display = 'none';
  }

  // Keeps a pinned popup next to its click point when the page or the chart scrolls. It is hidden while
  // the click point is scrolled out of the chart's view.
  function positionPopup() {
    if (!popupAnchor) return;
    if (!popupAnchor.element.isConnected) { hidePopup(); return; } // the chart was drawn again
    const elementBounds = popupAnchor.element.getBoundingClientRect();
    const anchorX = elementBounds.left + popupAnchor.offsetX;
    const anchorY = elementBounds.top + popupAnchor.offsetY;
    const chartBounds = document.getElementById('chart-container').getBoundingClientRect();
    const anchorIsInBikeHeader = popupAnchor.element.closest('.chart-header');
    const chartHeaderBottom = document.querySelector('.chart-header > svg').getBoundingClientRect().bottom;
    const visibleTop = anchorIsInBikeHeader ? chartBounds.top : chartHeaderBottom; // the bike header covers the top of the chart
    const anchorIsVisible = anchorX >= chartBounds.left && anchorX <= chartBounds.right && anchorY >= visibleTop && anchorY <= chartBounds.bottom;
    tooltip.style.visibility = anchorIsVisible ? '' : 'hidden';
    placePopupNextTo(anchorX, anchorY);
  }

  // Puts the popup next to a point, on the side where it fits.
  function placePopupNextTo(anchorX, anchorY) {
    const pointOffset = 10;
    const viewportMargin = 8;
    const tooltipBounds = tooltip.getBoundingClientRect();
    let left = anchorX + pointOffset;
    let top = anchorY + pointOffset;
    if (left + tooltipBounds.width > innerWidth - viewportMargin) left = anchorX - tooltipBounds.width - pointOffset;
    if (top + tooltipBounds.height > innerHeight - viewportMargin) top = anchorY - tooltipBounds.height - pointOffset;
    tooltip.style.left = Math.max(viewportMargin, Math.min(left, innerWidth - viewportMargin - tooltipBounds.width)) + 'px';
    tooltip.style.top = Math.max(viewportMargin, top) + 'px';
  }

  tooltip.addEventListener('click', closePopup);
  addEventListener('scroll', positionPopup, { passive: true });
  addEventListener('resize', positionPopup);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && popupAnchor) closePopup(); });
  document.addEventListener('click', event => {
    if (!popupAnchor || event.target.closest('#chart-container, #tooltip')) return;
    closePopup();
  });

  // A row of a popup's table: what the period is (a bike's name, or "built"), its dates and its duration.
  const popupPeriodRowHtml = (labelHtml, period) => `<tr>
        <td>${labelHtml}</td>
        <td>${formatPeriodDates(period)}</td>
        <td>${formatDuration(period.endTimestamp - period.startTimestamp)}</td>
      </tr>`;

  function partPopupHtml(part) {
    const bikeName = bikeId => escapeHtml(timelineModel.bikesById[bikeId].name);
    const mountingRows = part.mountings.map(mounting => popupPeriodRowHtml(bikeName(mounting.bikeId), mounting)).join('');

    return `
      <h4><span class="color-swatch" style="background:var(--part-group-${part.partGroup})"></span>${escapeHtml(part.description)}</h4>
      <div class="tooltip-meta">${escapeHtml(part.type)}</div>
      <table>${mountingRows}</table>`;
  }

  function bikePopupHtml(bike) {
    const builtPeriodRows = bike.builtPeriods.map(period => popupPeriodRowHtml('built', period)).join('');

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

    return `
      <h4>${escapeHtml(bike.name)}</h4>
      <table>${builtPeriodRows || '<tr><td>never had the full minimum set</td></tr>'}</table>
      ${bikesPartsCameFrom.size ? `<div class="tooltip-meta tooltip-parts-from">Parts from: ${listNames(bikesPartsCameFrom)}</div>` : ''}
      ${bikesPartsWentTo.size ? `<div class="tooltip-meta tooltip-parts-to">Parts passed to: ${listNames(bikesPartsWentTo)}</div>` : ''}`;
  }

  // Highlights the pinned (or else hovered) part or bike and dims everything else.
  function applyHighlight() {
    const svg = document.querySelector('#chart-container > svg');
    if (!svg) return;
    svg.querySelectorAll('.is-highlighted').forEach(element => element.classList.remove('is-highlighted'));

    const activeHighlightKey = pinnedHighlightKey || hoveredHighlightKey;
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
  // Legend, bike checkboxes and table view
  // =====================================================================

  // The legend follows the bike checkboxes and the build settings, so it is drawn again with the chart
  // when they change (but not when only the zoom changes).
  function renderLegendAndChart() {
    renderPartGroupLegend();
    renderChart();
  }

  // The legend lists only the part types that have a lane on at least one checked bike, so it follows
  // the bike checkboxes and the build settings. A part group with none of them is left out.
  function renderPartGroupLegend() {
    const shownLanePartTypes = new Set(timelineModel.bikes
      .filter(bike => !hiddenBikeIds.has(bike.id))
      .flatMap(bike => BIKE_TYPES_BY_KEY[bike.type].lanePartTypes));
    document.getElementById('part-group-legend').innerHTML = Object.entries(PART_GROUPS)
      .map(([groupKey, group]) => [groupKey, group, partTypesOfGroup(groupKey).filter(partType => shownLanePartTypes.has(partType))])
      .filter(([, , groupPartTypes]) => groupPartTypes.length > 0)
      .map(([groupKey, group, groupPartTypes]) => `<span>
          <span class="color-swatch" style="background:var(--part-group-${groupKey})"></span><span class="part-group-legend-name">${group.label}</span>${escapeHtml(describePartTypes(groupPartTypes))}
        </span>`)
      .join('');
  }

  // One checkbox per bike, grouped by bike type: an unchecked bike is not drawn (on screen or in print).
  // Clicking a group's name checks all its bikes, or unchecks them all if they're all checked.
  function renderBikeToggles() {
    const bikeToggles = document.getElementById('bike-toggles');
    bikeToggles.innerHTML = timelineModel.bikeTypeGroups.map(group => `<div class="bike-toggle-group">
        <div><button type="button" class="bike-toggle-group-name" title="Show or hide all ${escapeHtml(group.name)} bikes">${escapeHtml(group.label)}</button></div>
        <div class="bike-toggle-group-bikes">${group.bikes.map(bike => `<label><input type="checkbox" value="${escapeHtml(bike.id)}"${hiddenBikeIds.has(bike.id) ? '' : ' checked'}>${escapeHtml(bike.name)}</label>`).join('')}</div>
      </div>`).join('');
  }
  document.getElementById('bike-toggles').addEventListener('click', event => {
    const groupNameButton = event.target.closest('.bike-toggle-group-name');
    if (!groupNameButton) return;
    const groupCheckboxes = [...groupNameButton.closest('.bike-toggle-group').querySelectorAll('input[type=checkbox]')];
    const showAll = groupCheckboxes.some(checkbox => !checkbox.checked);
    for (const checkbox of groupCheckboxes) {
      checkbox.checked = showAll;
      if (showAll) hiddenBikeIds.delete(checkbox.value);
      else hiddenBikeIds.add(checkbox.value);
    }
    renderLegendAndChart();
  });
  document.getElementById('bike-toggles').addEventListener('change', event => {
    const checkbox = event.target;
    if (checkbox.checked) hiddenBikeIds.delete(checkbox.value);
    else hiddenBikeIds.add(checkbox.value);
    renderLegendAndChart();
  });

  function renderPartsTable() {
    const partsInTableOrder = [...timelineModel.parts].sort((first, second) =>
      laneIndexByPartType[first.type] - laneIndexByPartType[second.type]
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

  // On a small screen the legend and the bike checkboxes start closed, so the chart comes first.
  const SMALL_SCREEN_QUERY = '(max-width: 600px)'; // same width as the small-screen rules in styles.css
  if (matchMedia(SMALL_SCREEN_QUERY).matches) {
    document.getElementById('timeline-legend-section').open = false;
    document.getElementById('shown-bikes-section').open = false;
  }

  function loadData(data) {
    rawData = data;
    const { errors, validBikes, validParts, note } = validateData(data, BIKE_TYPES, PART_TYPES);
    showDataErrors(errors, note);
    timelineModel = buildTimelineModel({ bikes: validBikes, parts: validParts });
    pinnedHighlightKey = null;
    renderBikeToggles();
    renderPartsTable();
    renderLegendAndChart();
  }

  const zoomSlider = document.getElementById('zoom-slider');
  zoomSlider.addEventListener('input', () => {
    pixelsPerYear = Number(zoomSlider.value);
    renderChart();
  });

  const jsonFileInput = document.getElementById('json-file-input');
  document.getElementById('import-json-button').addEventListener('click', () => jsonFileInput.click());
  jsonFileInput.addEventListener('change', async event => {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;
    try {
      loadData(JSON.parse(await selectedFile.text()));
    } catch (error) {
      showDataErrors(['Could not read JSON: ' + error.message], 'The data that was loaded before is still shown.');
    }
  });

  // Export saves the loaded data as bikes.json, in the same format that Import reads.
  document.getElementById('export-json-button').addEventListener('click', () => {
    const jsonBlob = new Blob([JSON.stringify(rawData, null, 2) + '\n'], { type: 'application/json' });
    const downloadUrl = URL.createObjectURL(jsonBlob);
    const downloadLink = document.createElement('a');
    downloadLink.href = downloadUrl;
    downloadLink.download = 'bikes.json';
    document.body.append(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
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
        return `<tbody class="settings-part-group" style="--group-color:var(--part-group-${groupKey})">
            <tr class="settings-part-group-heading"><th colspan="${PART_REQUIREMENTS.length + 1}" scope="rowgroup">
              <span class="color-swatch"></span>${escapeHtml(group.label)}</th></tr>
            ${partTypesOfGroup(groupKey).map(partRow).join('')}
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
      bikeType.lanePartTypes = PART_TYPES.filter(partType => requirementOf(partType) !== 'ignored');
      bikeType.optionalPartTypes = PART_TYPES.filter(partType => requirementOf(partType) === 'optional');
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
  // Use "Import" to show your own data.
  const DEFAULT_DATA_FILE = 'test-bikes.json';
  async function loadDefaultData() {
    let data;
    try {
      const response = await fetch(DEFAULT_DATA_FILE);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      data = await response.json();
    } catch (error) {
      showDataErrors([`Could not load ${DEFAULT_DATA_FILE}: ${error.message}`],
        'Open the page through a local web server (see README.md), or use "Import".');
      return;
    }
    loadData(data);
  }
  loadDefaultData();
})();
