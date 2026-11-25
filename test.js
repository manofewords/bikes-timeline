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

const summary = document.getElementById('summary');
summary.textContent = `${passedCount} passed, ${failedCount} failed`;
summary.className = failedCount ? 'fail' : 'pass';
