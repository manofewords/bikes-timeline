# Bike timeline

A single self-contained HTML page that shows the history of my bikes and how parts moved between them. Open `index.html` in a browser; there is no build step and nothing to install.

## What it shows

- **One column per bike**, grouped by type (BMX, MTB, DH, gravel, commuter) and in chronological order within each group. Time runs upwards in years, with the newest dates at the top.
- **One lane per part type** inside each bike's bar. Each bike type has its own set of lanes, so bar widths differ. Part strips are coloured by part group: chassis, wheels, brakes, cockpit, drivetrain and seat.
- **Built periods**: the outlined grey bar is drawn only while every lane of the bike's type is filled (dark border in the light theme, light border in the dark theme). See [Bike types, lanes and "built"](#bike-types-lanes-and-built).
- **Part moves**: right-angled "L" ribbons connect a part that moved from one bike to another. A dotted line marks a part that went back on the same bike after a break. See [Ribbons](#ribbons).
- **Interaction**: hover a part or a bike name for a tooltip and highlight, and click to pin it. Summary stats, a parts table and data warnings are shown below the chart.
- **Poster**: "Print A2 poster" (or Ctrl/Cmd+P) prints an A2 landscape version (594×420 mm). It has each part's description written vertically along its strip (no dates) and the built periods under each bike name.

## Data

The page comes with sample data embedded in a `<script id="bike-data">` tag. The current data is fake, and the real data is still being collected. Use **Load JSON…** to open your own file and **Copy JSON** to copy the data that's loaded.

- `bikes: [{ id: uuid, type: "bmx" | "mtb" | "dh" | "gravel" | "commuter", name: string }]`
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

Some parts are skipped:

- Front tire, rear tire, grips, seat clamp, headset and pedals are skipped without a message.
- A part with a `null` date in any usage is skipped and logged with `console.log`.
- A part type that is neither a lane type nor one of the skipped types above is logged with `console.error` and listed above the parts table.
- A valid part type that has no lane on that bike's type is skipped with `console.warn`.

## Bike types, lanes and "built"

Lanes per bike type (fixed order inside a bar, one lane per part type):

- **bmx**: frame, fork, stem, handlebars, front rim, front hub, rear rim, rear hub, sprocket, cranks, rear brake, rear brake lever
- **dh**: bmx + shock, front brake, front brake lever, front disc, rear disc, gears
- **mtb**: dh + seatpost, seat
- **gravel**: mtb without shock
- **commuter**: bmx + front brake, front brake lever, gears

A bike is "built" while every lane of its type is filled. Optional lanes: rear brake and rear brake lever on BMX (brakeless BMX allowed), shock on MTB (hardtails allowed), and all four brake lanes (front/rear brake and lever) on a commuter. There is no bike or part status anywhere (no active/sold/dismantled/in use).

## Ribbons

Parts moving between bikes are connected by right-angled "L" ribbons: horizontal from the old strip, then up into the bottom of the new strip.

- Parts leaving a bike on the same date get their own track each, 1px apart (`RIBBON_TRACK_GAP`), leaving one step earlier per track. A small gap is cut into the old strip right above the departure, with a stub up to the real end date.
- A part leaving alone leaves flush with the top of its strip.
- Ribbons stop a small gap (`CONNECTOR_GAP_SIZE`) below the new strip so its bottom edge marks the start date. A part being replaced in that lane is cut short below the incoming ribbon.
- A part returning to the same bike after a break gets a dotted line.

## Repository

`index.html` is the current version of the page. Each older commit of it is one earlier version, and the oldest commit is the first version. Instructions for AI agents working on this project are in `AGENTS.md`.
