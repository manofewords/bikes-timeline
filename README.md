# Bike timeline

An HTML page that shows the history of my bikes and how parts moved between them. Open `index.html` in a browser, straight from disk; there is no build step, no server and nothing to install.

## Files

- `index.html`: the page itself, with the embedded sample data.
- `styles.css`: all styles, including the dark theme and the print styles for the poster.
- `utils.js`: small helpers with no state of their own: date formatting (`formatMonthYear`, `formatPeriodDates`, `formatDuration`, …), `escapeHtml`, text wrapping, `displayNameOf` and `mixWithWhite`.
- `timeline.js`: everything else: configuration, validation, the model, the screen chart, the A2 poster and the controls.
- `test.html` and `test.js`: unit tests for `utils.js`. Open `test.html` to run them; it lists every test as passed or failed, with a summary line at the top.

The scripts are loaded with plain `<script>` tags (no modules, no `fetch`), so the page works when opened from `file://`. `utils.js` is loaded first and its helpers are global; `timeline.js` keeps its own code inside a function.

## What it shows

- **One column per bike**, grouped by type (BMX, MTB, DH, gravel, commuter, road) and in chronological order within each group. Time runs upwards in years, with the newest dates at the top.
- **One lane per part type** inside each bike's bar. Each bike type has its own set of lanes, so bar widths differ. Part strips have fully round ends and are coloured by part group: chassis, wheels, brakes, cockpit, drivetrain and seat.
- **Built periods**: the outlined grey bar is drawn only while every mandatory lane of the bike's type is filled (dark border in the light theme, light border in the dark theme). See [Bike types, lanes and "built"](#bike-types-lanes-and-built).
- **Part moves**: right-angled "L" ribbons connect a part that moved from one bike to another. A dotted line marks a part that went back on the same bike after a break. See [Ribbons](#ribbons).
- **Dates** are shown as month and year, `MM.YYYY` (for example `03.2014`), in the tooltips and on the poster (data errors keep the full ISO date). A period that is still ongoing ends in "now".
- **Interaction**: hover a part or a bike name for a tooltip and highlight, and click to pin it. Summary stats and a parts table are shown below the chart.
- **Poster**: "Print A2 poster" (or Ctrl/Cmd+P) prints an A2 landscape version (594×420 mm). It has each part's description written vertically along its strip (no dates) and the built periods under each bike name (the duration moves to its own line when the column is too narrow). The strips are plain pale tints of the group colour (no darker edge), as wide as the ribbons and departure dots. A departure dot uses the full group colour, and a label never runs through a dot. All strip labels use one font size, the one that fits across a strip; a label that is too long is shortened with "…".

## Data

The page comes with sample data embedded in a `<script id="bike-data">` tag. The current data is fake, and the real data is still being collected. Use **Load JSON…** to open your own file and **Copy JSON** to copy the data that's loaded.

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

The gear button next to "Print A2 poster" opens the build settings: one table per bike type with one row per part type, grouped and coloured by part group like the legend (frame, fork, stem, handlebars, front rim, front hub, rear rim, rear hub, sprocket, cranks, rear brake, rear brake lever, front brake, front brake lever, gears, shock, front disc, rear disc, seat post, seat, pedals, seat clamp, headset, front tire, rear tire, grips, front spokes, rear spokes, bottom bracket). Closing the dialog applies the settings to the timeline. They are not saved: reloading the page goes back to the defaults.

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

## Repository

`index.html` (with `styles.css`, `utils.js` and `timeline.js`) is the current version of the page. Each older commit is one earlier version, and the oldest commit is the first version. Up to the split into separate files, the page was a single self-contained `index.html`. Instructions for AI agents working on this project are in `AGENTS.md`.
