# Bike timeline

An HTML page that shows the history of my bikes and how parts moved between them. There is no build step and nothing to install, but the page loads its data with `fetch`, so it needs a local web server: run `python3 -m http.server` in this folder and open http://localhost:8000/.

## Files

- `index.html`: the page itself.
- `test-bikes.json`: the test data, shown when the page opens (see [Test data](#test-data)).
- `styles.css`: all styles, including the dark theme and the print styles.
- `utils.js`: small helpers with no state of their own: date formatting (`formatMonthYear`, `formatPeriodDates`, `formatPeriodYears`, `formatDuration`, …), `escapeHtml`, text wrapping, `displayNameOf` and `mixWithWhite`.
- `timeline.js`: everything else: configuration, validation, the model, the chart and the controls.
- `test.html` and `test.js`: unit tests for `utils.js`. `test.html` also runs the visual tests (`visual-test.js`, with the reference images `visual-reference.png` and `visual-reference-print.png`). See [Tests](#tests).

The scripts are loaded with plain `<script>` tags (no modules). `utils.js` is loaded first and its helpers are global; `timeline.js` keeps its own code inside a function.

## What it shows

- **One column per bike**, grouped by type (BMX, MTB, DH, gravel, commuter, road) and in chronological order within each group. Time runs upwards in years, with the newest dates at the top.
- **One lane per part type** inside each bike's bar. Each bike type has its own set of lanes, so bar widths differ. Part strips have fully round ends and are coloured by part group: chassis, wheels, brakes, cockpit, drivetrain and seat.
- **Built periods**: the outlined grey bar is drawn only while every mandatory lane of the bike's type is filled (dark border in the light theme, light border in the dark theme). The built periods are also listed under each bike name, aligned to the bottom of the header, one per line, in years only (`YYYY–YYYY · duration`, the duration from the full dates; the tooltip keeps month and year); the duration moves to its own line when the column is too narrow. See [Bike types, lanes and "built"](#bike-types-lanes-and-built).
- **Part moves**: right-angled "L" ribbons connect a part that moved from one bike to another. A dotted line marks a part that went back on the same bike after a break. See [Ribbons](#ribbons).
- **Dates** are shown as month and year, `MM.YYYY` (for example `03.2014`), in the tooltips (data errors keep the full ISO date). A period that is still ongoing ends in "now".
- **Interaction**: hover a part or a bike name for a tooltip and highlight, and click to pin it. A parts table is shown below the chart.
- **Bike checkboxes**: one checkbox per bike, grouped by bike type, above the chart. Clicking a bike type's name checks all its bikes, or unchecks them all when they're all checked. An unchecked bike is not drawn, on screen or in print, and neither are the ribbons to and from it.
- **Print** (Ctrl/Cmd+P): the same chart, in the same colours, on one page of whatever paper size is chosen in the print dialog, scaled to fit it. Print always uses the light theme and leaves out the zoom slider, the buttons, the bike checkboxes, the data errors and the parts table. The bike checkboxes choose which bikes are printed and the zoom sets the chart's height, so together they decide how big the chart comes out on the page. In print only, each part's description is written along its strip in white, reading upwards, in a small font (`PART_LABEL_FONT_SIZE`) and shortened with "…" when it doesn't fit. The class `print-view` on `<html>` shows the chart as it prints, on screen (the print visual test uses it).

## Data

When the page opens, it loads the test data from `test-bikes.json`. The real data is still being collected. Use **Load JSON…** to open your own file and **Copy JSON** to copy the data that's loaded.

- `bikes: [{ id: uuid, type: "bmx" | "mtb" | "dh" | "gravel" | "commuter" | "road", name: string }]`
- `parts: [{ id: uuid, type: string, description: string, usage: [{ bikeId: uuid, dateFrom: ISODate, dateTo: ISODate | "now" }] }]`

```json
{
  "bikes": [{ "id": "uuid", "type": "bmx", "name": "Haro Backtrail X1" }],
  "parts": [{
    "id": "uuid", "type": "frame", "description": "Haro Backtrail frame",
    "usage": [{ "bikeId": "uuid", "dateFrom": "2008-11-15", "dateTo": "now" }]
  }]
}
```

### Validation

The data is checked when it is loaded, before it is processed. Each error is listed in a "data errors" box above the chart and logged with `console.error`. The checks:

- Every bike has an `id`, `type` and `name`.
- Every part has an `id`, `type`, `description` and a non-empty `usage` list, and every usage entry has a `bikeId`, `dateFrom` and `dateTo`. A date may be `null` (see below), but the field has to be there.
- No two bikes, and no two parts, share an id. A bike and a part may share one.
- No part is on two different bikes at the same time.
- No part has two usage entries on the same bike that overlap in time. A usage ending on the day the next one starts is not an overlap.
- Every bike type is one of the bike types above, and every part type is one of the part types in the build settings.
- Every usage entry's `bikeId` is a bike in the data. A usage on an unknown bike (or on a bike left out for a missing field) is not drawn.
- No bike has two parts of the same type at the same time (each part type has one lane, so they would be drawn on top of each other). Only parts that are drawn are compared: not parts with a `null` date, and not part types that are ignored on that bike's type in the build settings. Back-to-back usages of one part on the same bike count as one.

Bikes and parts with a missing field or an unknown type are left out. Everything else (duplicate ids, overlapping dates, two parts of one type on a bike) is still drawn as it is.

Some parts are skipped without an error:

- A part type that is ignored on every bike type in the build settings is skipped without a message (by default: pedals, seat clamp, headset, front tire, rear tire, grips, front spokes, rear spokes and bottom bracket).
- A part with a `null` date in any usage is skipped and logged with `console.log`.
- A valid part type that is ignored on that bike's type (no lane) is skipped with `console.warn`.

## Bike types, lanes and "built"

Each part type is **mandatory**, **optional** or **ignored** per bike type. Mandatory and optional part types get a lane (in a fixed order inside the bar, one lane per part type); ignored ones get no lane. A bike is "built" while every mandatory lane is filled.

The gear button next to "Copy JSON" opens the build settings: one table per bike type with one row per part type, grouped and coloured by part group like the legend (frame, fork, stem, handlebars, front rim, front hub, rear rim, rear hub, sprocket, cranks, rear brake, rear brake lever, front brake, front brake lever, gears, shock, front disc, rear disc, seat post, seat, pedals, seat clamp, headset, front tire, rear tire, grips, front spokes, rear spokes, bottom bracket). Closing the dialog applies the settings to the timeline. They are not saved: reloading the page goes back to the defaults.

Default lanes per bike type (the `*_LANES` constants in `timeline.js`):

- **bmx**: frame, fork, stem, handlebars, front rim, front hub, rear rim, rear hub, sprocket, cranks, rear brake, rear brake lever
- **dh**: bmx + shock, front brake, front brake lever, front disc, rear disc, gears
- **mtb**: dh + seat post, seat
- **gravel**: mtb without shock
- **commuter**: bmx + front brake, front brake lever, gears
- **road**: same as gravel

Default optional lanes: rear brake and rear brake lever on BMX (brakeless BMX allowed), shock on MTB (hardtails allowed), and all four brake lanes (front/rear brake and lever) on a commuter. Everything else with a lane is mandatory. Pedals, seat clamp, headset, front tire, rear tire, grips, front spokes, rear spokes and bottom bracket are ignored on every bike type by default. There is no bike or part status anywhere (no active/sold/dismantled/in use).

## Ribbons

Parts moving between bikes are connected by right-angled "L" ribbons: horizontal from the old strip, then up into the bottom of the new strip.

- Parts leaving a bike on the same date get their own track each, 1px apart (`RIBBON_TRACK_GAP`), leaving one step earlier per track. The old strip stays unbroken up to its real end date, and a dot in a darker shade of its colour marks where the ribbon leaves it.
- A part leaving alone leaves flush with the top of its strip, also marked with a dot. Every departure has a dot; arrivals have none.
- Ribbons stop a small gap (`CONNECTOR_GAP_SIZE`) below the new strip so its bottom edge marks the start date. A part being replaced in that lane keeps its real end date; the ribbon runs underneath it, so the lane has no gap.
- A part returning to the same bike after a break gets a dotted line.

## Test data

`test-bikes.json` is a small, made-up data set that shows what the timeline can draw and covers its tricky cases. It is what the page shows when it opens, and what the visual test draws. It has to pass the validation without errors. There are four bikes, drawn in this order: three BMX (A, B, C), then a commuter (D). Each part's description names its case by number, so it can be found on the chart and in print:

1. **Wheels lent for a short time**: C is first built with B's four wheel parts (front and rear rim and hub) for two months, then gets its own; B gets its wheels back the same day. B is not built while its wheels are away, so it has two built periods. Four parts leave B together, and later four leave C together: one ribbon track each.
2. **Parts moving to a bike that is not the next one**: A's cranks and handlebars go to C, past B; A's sprocket and fork go to D, past B, C and the gap between bike types; C's rear brake goes back left to A, past B.
3. **A big rebuild**: five parts leave A on the same day (2018-06-01) for three different bikes.
4. **Short stays**: A's handlebars spend two weeks on C before moving on to D. A rear brake lever stays on A for under three weeks without ever moving.
5. **Parts before and after a bike's full build**: C's frame, stem and cranks are on it long before C is built; A's frame stays on A years after A is taken apart, and C's rear brake arrives on that frame afterwards. A's rear brake (optional on a BMX) arrives a year after A is built.
6. **Overlapping ribbons**: on 2018-06-01, B's stem leaves for C on the same day A's parts pass under B to C and D. On 2022-04-01, B and C swap sprockets (two ribbons running opposite ways between the same bikes), and C and D swap handlebars, so C's ribbons go left and right at once.
7. **A part replaced while its replacement's ribbon arrives**: A's stem replaces B's stem on the day B's stem leaves; the ribbon runs underneath B's old stem.
8. **A part leaving and coming back to the same bike**: A's handlebars are off A for seven months (dotted line, and a gap in A's built bar).
9. **A part stored between two bikes**: A's fork leaves A on 2018-06-01 but only goes on D a year later, so its ribbon has a long vertical leg.
10. **Back-to-back usages** on the same bike are merged into one strip (A's fork).
11. **A bike that is never built** (D, which also has fewer lanes as a commuter), and a BMX without a rear brake that still counts as built (B).
12. **Parts that are not drawn**: pedals (ignored on every bike type) and a part with a `null` date.
13. **Text**: C's long name wraps onto two lines and is cut with "…"; in print, the long description of B's front rim is shortened with "…".
14. **Usage entries out of order** (C's rear brake): the timeline sorts them.

## Tests

Open http://localhost:8000/test.html (with the local web server running). It runs:

- **Unit tests** (`test.js`) for the helpers in `utils.js`.
- **Two visual tests** (`visual-test.js`): `index.html` is loaded in a hidden frame and draws `test-bikes.json`, in the light theme and as if today were 2025-09-30 (`index.html?today=2025-09-30`), so the drawing doesn't change from day to day. The chart is drawn twice: as it is shown on screen, compared with `visual-reference.png`, and as it prints (with the class `print-view` on `<html>`, so with the part descriptions), compared with `visual-reference-print.png`. Each drawing is shown over its reference image, with the reference on the left of a red line and the current drawing on the right; drag across the image or use the slider to move the line. Any data errors are listed. When the changes are wanted, **Save as new reference…** saves that drawing as the new reference image (Chrome and Edge open a save dialog, other browsers download the file; it replaces the old one next to `test.html`). The print test checks the chart only, not the page layout of the printout (hidden controls, scaling to the page).

Text is drawn with the fonts of the computer and browser, so a reference image saved on another computer or in another browser differs in all text.

Any page can be drawn as if it were another day with a `today` parameter, for example `index.html?today=2025-09-30`.

## Repository

`index.html` (with `styles.css`, `utils.js` and `timeline.js`) is the current version of the page. Each older commit is one earlier version, and the oldest commit is the first version. Up to the split into separate files, the page was a single self-contained `index.html`. Instructions for AI agents working on this project are in `AGENTS.md`.
