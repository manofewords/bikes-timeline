// Unit tests for utils.js. Open test.html (straight from disk, like index.html) to see the results.

let passedCount = 0,
  failedCount = 0;

function test(name, testFunction) {
  const resultItem = document.createElement('li');
  try {
    testFunction();
    passedCount++;
    resultItem.className = 'pass';
    resultItem.textContent = '✓ ' + name;
  } catch (error) {
    failedCount++;
    resultItem.className = 'fail';
    resultItem.textContent = '✗ ' + name;
    resultItem.append(Object.assign(document.createElement('pre'), { textContent: error.message }));
  }
  document.getElementById('results').append(resultItem);
}

function assertEqual(actual, expected) {
  const actualJson = JSON.stringify(actual),
    expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) throw new Error(`expected ${expectedJson}, got ${actualJson}`);
}

// a period as the timeline builds it from a usage entry
const makePeriod = (dateFrom, dateTo) => ({ startTimestamp: parseDate(dateFrom), endTimestamp: parseDate(dateTo) });
const durationBetween = (dateFrom, dateTo) => parseDate(dateTo) - parseDate(dateFrom);

test('parseDate: ISO dates at midnight UTC, "now" is today', () => {
  assertEqual(parseDate('2014-03-15'), Date.UTC(2014, 2, 15));
  assertEqual(parseDate('2008-11-15'), Date.UTC(2008, 10, 15));
  assertEqual(parseDate('now'), TODAY_TIMESTAMP);
});
test('TODAY_TIMESTAMP and CURRENT_YEAR: today at midnight UTC', () => {
  const today = new Date();
  assertEqual(TODAY_TIMESTAMP, Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  assertEqual(CURRENT_YEAR, today.getFullYear());
});
test('formatIsoDate: back to the ISO date, today as "now"', () => {
  assertEqual(formatIsoDate(Date.UTC(2014, 2, 15)), '2014-03-15');
  assertEqual(formatIsoDate(parseDate('2008-11-05')), '2008-11-05');
  assertEqual(formatIsoDate(parseDate('now')), 'now');
  assertEqual(formatIsoDate(TODAY_TIMESTAMP - MILLISECONDS_PER_DAY), new Date(TODAY_TIMESTAMP - MILLISECONDS_PER_DAY).toISOString().slice(0, 10));
});
test('formatMonthYear: MM.YYYY with a leading zero', () => {
  assertEqual(formatMonthYear(parseDate('2014-03-15')), '03.2014');
  assertEqual(formatMonthYear(parseDate('2008-11-30')), '11.2008');
  assertEqual(formatMonthYear(parseDate('2020-01-01')), '01.2020');
  assertEqual(formatMonthYear(parseDate('2019-12-31')), '12.2019');
});
test('formatPeriodDates: start–end, with an optional separator', () => {
  assertEqual(formatPeriodDates(makePeriod('2002-03-01', '2007-06-30')), '03.2002–06.2007');
  assertEqual(formatPeriodDates(makePeriod('2002-03-01', '2007-06-30'), ' – '), '03.2002 – 06.2007');
  assertEqual(formatPeriodDates(makePeriod('2014-05-01', '2014-05-20')), '05.2014–05.2014');
});
test('formatPeriodDates: an ongoing period ends in "now"', () => {
  assertEqual(formatPeriodDates(makePeriod('2021-04-10', 'now')), '04.2021–now');
  assertEqual(formatPeriodDates(makePeriod('2021-04-10', 'now'), ' – '), '04.2021 – now');
});
test('formatPeriodYears: start and end year, "now", or a single year', () => {
  assertEqual(formatPeriodYears(makePeriod('2002-03-01', '2007-06-30')), '2002–2007');
  assertEqual(formatPeriodYears(makePeriod('2021-04-10', 'now')), '2021–now');
  assertEqual(formatPeriodYears(makePeriod('2014-05-01', '2014-11-20')), '2014');
});
test('formatDuration: years with one decimal from one year on', () => {
  assertEqual(formatDuration(MILLISECONDS_PER_YEAR), '1.0 y');
  assertEqual(formatDuration(durationBetween('2002-03-01', '2007-06-30')), '5.3 y');
  assertEqual(formatDuration(durationBetween('2016-01-01', '2017-01-01')), '1.0 y'); // 366 days
});
test('formatDuration: months under a year, at least 1', () => {
  assertEqual(formatDuration(durationBetween('2014-01-01', '2014-02-15')), '1 mo');
  assertEqual(formatDuration(durationBetween('2014-01-01', '2014-07-01')), '6 mo');
  assertEqual(formatDuration(MILLISECONDS_PER_DAY), '1 mo');
  assertEqual(formatDuration(0), '1 mo');
  // a year is 365.2425 days, so a calendar year that isn't a leap year is just under one
  assertEqual(formatDuration(durationBetween('2014-01-01', '2015-01-01')), '12 mo');
});

// a mounting as the timeline builds it from a usage entry
const makeMounting = (bikeId, dateFrom, dateTo) => ({ bikeId, ...makePeriod(dateFrom, dateTo) });
test('mergeBackToBackMountings: back-to-back and overlapping mountings on one bike become one', () => {
  assertEqual(mergeBackToBackMountings([makeMounting('a', '2014-01-01', '2015-01-01'), makeMounting('a', '2015-01-01', '2016-01-01')]),
    [makeMounting('a', '2014-01-01', '2016-01-01')]);
  assertEqual(mergeBackToBackMountings([makeMounting('a', '2014-01-01', '2016-01-01'), makeMounting('a', '2015-01-01', '2015-06-01')]),
    [makeMounting('a', '2014-01-01', '2016-01-01')]);
});
test('mergeBackToBackMountings: a gap or another bike in between keeps them apart', () => {
  const withGap = [makeMounting('a', '2014-01-01', '2015-01-01'), makeMounting('a', '2015-01-02', '2016-01-01')];
  assertEqual(mergeBackToBackMountings(withGap), withGap);
  const onTwoBikes = [makeMounting('a', '2014-01-01', '2015-01-01'), makeMounting('b', '2015-01-01', '2016-01-01')];
  assertEqual(mergeBackToBackMountings(onTwoBikes), onTwoBikes);
});
test('mergeBackToBackMountings: sorted by date, keeps the first one\'s fields, leaves its input alone', () => {
  const later = { ...makeMounting('a', '2015-01-01', '2016-01-01'), note: 'later' };
  const earlier = { ...makeMounting('a', '2014-01-01', '2015-01-01'), note: 'earlier' };
  const mountings = [later, earlier];
  assertEqual(mergeBackToBackMountings(mountings), [{ ...makeMounting('a', '2014-01-01', '2016-01-01'), note: 'earlier' }]);
  assertEqual(mountings, [later, earlier]);
  assertEqual(earlier.endTimestamp, parseDate('2015-01-01'));
  assertEqual(mergeBackToBackMountings([]), []);
});
test('consecutivePairs', () => {
  assertEqual(consecutivePairs(['a', 'b', 'c']), [['a', 'b'], ['b', 'c']]);
  assertEqual(consecutivePairs(['a']), []);
  assertEqual(consecutivePairs([]), []);
});

// a mounting of a part of the given type, as computeBuiltPeriods() gets it
const mountingOfType = (partType, dateFrom, dateTo) => ({ part: { type: partType }, ...makePeriod(dateFrom, dateTo) });
test('computeBuiltPeriods: built while every required part type is mounted', () => {
  const mountings = [mountingOfType('frame', '2014-01-01', '2016-01-01'), mountingOfType('fork', '2015-01-01', '2017-01-01')];
  assertEqual(computeBuiltPeriods(mountings, ['frame', 'fork']), [makePeriod('2015-01-01', '2016-01-01')]);
  assertEqual(computeBuiltPeriods(mountings, ['frame']), [makePeriod('2014-01-01', '2016-01-01')]);
});
test('computeBuiltPeriods: a part replaced on the same day keeps one period', () => {
  const mountings = [mountingOfType('frame', '2014-01-01', '2016-01-01'),
    mountingOfType('fork', '2014-01-01', '2015-01-01'), mountingOfType('fork', '2015-01-01', '2016-01-01')];
  assertEqual(computeBuiltPeriods(mountings, ['frame', 'fork']), [makePeriod('2014-01-01', '2016-01-01')]);
});
test('computeBuiltPeriods: a missing part splits the period, or there is none', () => {
  const mountings = [mountingOfType('frame', '2014-01-01', '2020-01-01'),
    mountingOfType('fork', '2015-01-01', '2016-01-01'), mountingOfType('fork', '2018-01-01', '2019-01-01')];
  assertEqual(computeBuiltPeriods(mountings, ['frame', 'fork']), [makePeriod('2015-01-01', '2016-01-01'), makePeriod('2018-01-01', '2019-01-01')]);
  assertEqual(computeBuiltPeriods(mountings, ['frame', 'fork', 'stem']), []);
  assertEqual(computeBuiltPeriods([], ['frame']), []);
});

const TEST_LANES = [{ partType: 'frame', partGroup: 'chassis' }, { partType: 'fork', partGroup: 'chassis' }, { partType: 'stem', partGroup: 'cockpit' }];
const TEST_LANE_SPACING = { laneWidth: 5, laneGap: 1, partGroupGap: 3, barInnerPadding: 5, minBarWidth: 0 };
test('computeLaneLayout: lanes one gap apart, a wider gap between part groups', () => {
  assertEqual(computeLaneLayout(TEST_LANES, ['frame', 'fork', 'stem'], TEST_LANE_SPACING), { laneOffsetsX: [5, 11, 20], barWidth: 30 });
});
test('computeLaneLayout: no offset for a lane the bike type doesn\'t have', () => {
  const layout = computeLaneLayout(TEST_LANES, ['frame', 'stem'], TEST_LANE_SPACING);
  assertEqual(layout.laneOffsetsX[0], 5);
  assertEqual(1 in layout.laneOffsetsX, false);
  assertEqual(layout.laneOffsetsX[2], 14);
  assertEqual(layout.barWidth, 24);
});
test('computeLaneLayout: lanes centred in a bar widened to minBarWidth', () => {
  assertEqual(computeLaneLayout(TEST_LANES, ['frame', 'fork', 'stem'], { ...TEST_LANE_SPACING, minBarWidth: 40 }), { laneOffsetsX: [10, 16, 25], barWidth: 40 });
});
test('layoutBikeColumns: bars left to right, a wider gap between bike types', () => {
  const bikeTypeGroups = [{ bikes: [{ id: 'a' }, { id: 'b' }] }, { bikes: [{ id: 'c' }] }];
  const columns = layoutBikeColumns(bikeTypeGroups, 10, 2, 5, bike => bike.id === 'b' ? 20 : 10);
  assertEqual(columns.barLeftXByBikeId, { a: 10, b: 22, c: 47 });
  assertEqual(columns.xRangeByGroup.get(bikeTypeGroups[0]), { leftX: 10, rightX: 42 });
  assertEqual(columns.xRangeByGroup.get(bikeTypeGroups[1]), { leftX: 47, rightX: 57 });
  assertEqual(columns.rightX, 57);
});

test('escapeHtml', () => {
  assertEqual(escapeHtml(`<a href="x">Tom & Jerry</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/a&gt;');
  assertEqual(escapeHtml(`Haro Backtrail X1 frame 20.5" it's`), 'Haro Backtrail X1 frame 20.5&quot; it\'s');
  assertEqual(escapeHtml(42), '42');
});
test('wrapTextIntoLines: wraps at spaces', () => {
  assertEqual(wrapTextIntoLines('Production Privée Shan No.5', 30, 2), ['Production Privée Shan No.5']);
  assertEqual(wrapTextIntoLines('Production Privée Shan No.5', 17, 2), ['Production Privée', 'Shan No.5']);
  assertEqual(wrapTextIntoLines('Kona  Cinder Cone', 12, 2), ['Kona Cinder', 'Cone']);
});
test('wrapTextIntoLines: too many lines end the last one in "…"', () => {
  assertEqual(wrapTextIntoLines('Production Privée Shan No.5', 10, 2), ['Production', 'Privée…']);
  assertEqual(wrapTextIntoLines('Commencal Supreme DH V3', 9, 1), ['Commenca…']);
});
test('wrapTextIntoLines: a word that is too long is cut with "…"', () => {
  assertEqual(wrapTextIntoLines('Stumpjumper', 8, 2), ['Stumpju…']);
  assertEqual(wrapTextIntoLines('Commencal Supreme DH V3', 8, 2), ['Commenc…', 'Supreme…']);
});
test('wrapTextIntoLines: no lines for no text', () => {
  assertEqual(wrapTextIntoLines('', 8, 2), []);
});
test('displayNameOf: the name, or the type label and number', () => {
  const bikeTypesByKey = { mtb: { type: 'mtb', label: 'MTB' }, bmx: { type: 'bmx', label: 'BMX' } };
  assertEqual(displayNameOf({ type: 'mtb', name: 'NS Decade', numberWithinType: 4 }, bikeTypesByKey), 'NS Decade');
  assertEqual(displayNameOf({ type: 'mtb', name: '', numberWithinType: 2 }, bikeTypesByKey), 'MTB 2');
  assertEqual(displayNameOf({ type: 'bmx', numberWithinType: 1 }, bikeTypesByKey), 'BMX 1');
});
test('describePartTypes: part types joined with " · "', () => {
  assertEqual(describePartTypes(['frame', 'shock', 'fork']), 'frame · shock · fork');
  assertEqual(describePartTypes(['stem']), 'stem');
  assertEqual(describePartTypes([]), '');
});
test('describePartTypes: front and rear pairs are named once', () => {
  assertEqual(describePartTypes(['front rim', 'front hub', 'rear rim', 'rear hub']), 'rim · hub, front and rear');
  assertEqual(describePartTypes(['front brake', 'front brake lever', 'front disc', 'rear brake', 'rear brake lever', 'rear disc']),
    'brake · brake lever · disc, front and rear');
});
test('describePartTypes: listed in full when front and rear don\'t pair up', () => {
  assertEqual(describePartTypes(['rear brake', 'rear brake lever']), 'rear brake · rear brake lever');
  assertEqual(describePartTypes(['front brake', 'rear brake', 'rear disc']), 'front brake · rear brake · rear disc');
  assertEqual(describePartTypes(['front rim', 'rear rim', 'seat']), 'front rim · rear rim · seat');
});
test('fitTextIntoLength: text that fits stays as it is', () => {
  const characterCount = text => text.length;
  assertEqual(fitTextIntoLength('Rear rim', 10, characterCount), 'Rear rim');
  assertEqual(fitTextIntoLength('Rear rim', 8, characterCount), 'Rear rim');
});
test('fitTextIntoLength: longer text is shortened with "…", or null when it can\'t be', () => {
  const characterCount = text => text.length;
  assertEqual(fitTextIntoLength('Production Privée', 8, characterCount), 'Product…');
  assertEqual(fitTextIntoLength('Big bike frame', 5, characterCount), 'Big…'); // no space before the "…"
  assertEqual(fitTextIntoLength('Production', 3, characterCount), null);
});

// validateData() with one bike type that has a frame and a fork lane; "seat" is ignored on every bike type.
const TEST_BIKE_TYPES = [{ type: 'bmx', lanePartTypes: ['frame', 'fork'] }];
const TEST_PART_TYPES = ['frame', 'fork', 'seat'];
const validationErrorsOf = data => validateData(data, TEST_BIKE_TYPES, TEST_PART_TYPES).errors;
const testBike = (id, name, type = 'bmx') => ({ id, type, name });
const testPart = (id, type, description, ...usage) => ({ id, type, description, usage });
const testUsage = (bikeId, dateFrom, dateTo) => ({ bikeId, dateFrom, dateTo });
test('validateData: valid data has no errors', () => {
  const data = { bikes: [testBike('b1', 'Haro')], parts: [testPart('p1', 'frame', 'Haro frame', testUsage('b1', '2014-01-01', '2016-01-01'))] };
  assertEqual(validateData(data, TEST_BIKE_TYPES, TEST_PART_TYPES), { errors: [], validBikes: data.bikes, validParts: data.parts });
});
test('validateData: not an object with bikes and parts', () => {
  for (const data of [null, [], { bikes: [] }]) {
    assertEqual(validateData(data, TEST_BIKE_TYPES, TEST_PART_TYPES),
      { errors: ['The JSON has to be an object with a "bikes" list and a "parts" list'], validBikes: [], validParts: [], note: 'Nothing can be shown.' });
  }
});
test('validateData: missing fields leave the bike or part out', () => {
  const result = validateData({
    bikes: [{ id: 'b1', type: 'bmx' }, testBike('b2', 'Haro')],
    parts: [{ id: 'p1', type: 'frame', usage: [] }, testPart('p2', 'fork', 'Fork'),
      testPart('p3', 'frame', 'Frame', { bikeId: 'b2', dateFrom: '2014-01-01' })],
  }, TEST_BIKE_TYPES, TEST_PART_TYPES);
  assertEqual(result.errors, ['Bike #1 (id b1) has no name', 'Part #1 (id p1) has no description',
    'Part "Fork" (id p2) has an empty usage list', 'Part "Frame" (id p3): usage #1 has no dateTo']);
  assertEqual(result.validBikes.map(bike => bike.id), ['b2']);
  assertEqual(result.validParts, []);
});
test('validateData: unknown bike type and part type', () => {
  const result = validateData({
    bikes: [testBike('b1', 'Duo', 'tandem')],
    parts: [testPart('p1', 'bell', 'Bell', testUsage('b1', '2014-01-01', '2016-01-01'))],
  }, TEST_BIKE_TYPES, TEST_PART_TYPES);
  assertEqual(result.errors, ['Bike "Duo" (id b1) has unknown bike type "tandem" (known: bmx)', 'Part "Bell" (id p1) has unknown part type "bell"']);
  assertEqual(result.validParts, []);
});
test('validateData: duplicate ids and unknown bikes', () => {
  assertEqual(validationErrorsOf({
    bikes: [testBike('b1', 'Haro'), testBike('b1', 'Mongoose')],
    parts: [testPart('p1', 'frame', 'Frame', testUsage('b9', '2014-01-01', '2016-01-01'))],
  }), ['2 bikes have the id b1: Bike "Haro", Bike "Mongoose"', 'Part "Frame" references unknown bike b9']);
});
test('validateData: a part on two bikes at once, or twice on one bike', () => {
  assertEqual(validationErrorsOf({
    bikes: [testBike('b1', 'Haro'), testBike('b2', 'Mongoose')],
    parts: [
      testPart('p1', 'frame', 'Frame', testUsage('b1', '2014-01-01', '2016-01-01'), testUsage('b2', '2015-01-01', '2017-01-01')),
      testPart('p2', 'fork', 'Fork', testUsage('b1', '2014-01-01', '2016-01-01'), testUsage('b1', '2015-01-01', '2017-01-01')),
      testPart('p3', 'fork', 'Fork from Mongoose', testUsage('b2', '2014-01-01', '2015-01-01'), testUsage('b1', '2015-01-01', '2016-01-01')),
    ],
  }), [
    'Part "Frame" (id p1) is on two bikes at once: Haro 2014-01-01 → 2016-01-01 and Mongoose 2015-01-01 → 2017-01-01',
    'Part "Fork" (id p2) has overlapping usage dates: Haro 2014-01-01 → 2016-01-01 and Haro 2015-01-01 → 2017-01-01',
    'Haro: two × fork at 2015-01-01 (Fork from Mongoose)',
  ]);
});
test('validateData: two parts of one type on a bike at once, only for drawn parts', () => {
  assertEqual(validationErrorsOf({
    bikes: [testBike('b1', 'Haro')],
    parts: [
      testPart('p1', 'frame', 'First frame', testUsage('b1', '2014-01-01', '2016-01-01')),
      testPart('p2', 'frame', 'Second frame', testUsage('b1', '2015-01-01', '2017-01-01')),
      testPart('p3', 'frame', 'Next frame', testUsage('b1', '2017-01-01', '2018-01-01')), // starts as the second one ends
      testPart('p4', 'frame', 'Frame with a null date', testUsage('b1', '2015-06-01', null)),
      testPart('p5', 'seat', 'First seat', testUsage('b1', '2014-01-01', '2016-01-01')), // seat: ignored on every bike type
      testPart('p6', 'seat', 'Second seat', testUsage('b1', '2015-01-01', '2017-01-01')),
    ],
  }), ['Haro: two × frame at 2015-01-01 (Second frame)']);
});

const summary = document.getElementById('summary');
summary.textContent = `${passedCount} passed, ${failedCount} failed`;
summary.className = failedCount ? 'fail' : 'pass';
