This project is about my bike timeline: a single self-contained HTML page (`bike-timeline-v7.html` in the project files is the current version) that shows the history of my bikes and how parts moved between them. Treat that file as the source of truth for the code; when you change something, return the complete updated HTML file as a new version (v8, v9, …) and keep everything I didn't ask to change.

## Data (JSON)
- `bikes: [{ id: uuid, type: "bmx" | "mtb" | "dh" | "gravel" | "commuter", name: string }]`
- `parts: [{ id: uuid, type: string, description: string, usage: [{ bikeId: uuid, dateFrom: ISODate, dateTo: ISODate | "now" }] }]`
- Parts with a `null` date in any usage are ignored and logged with `console.log`.
- Ignored part types (skipped silently): front tire, rear tire, grips, seat clamp, headset, pedals.
- Any part type that is neither a lane type nor ignored is logged with `console.error` (and listed above the parts table).
- A valid part type that has no lane on that bike's type is skipped with `console.warn`.
- The current data is fake; I'm collecting the real data. The page can load a JSON file ("Load JSON…").

## Bike types, lanes and "built"
Lanes per bike type (fixed order inside a bar, one lane per part type):
- bmx: frame, fork, stem, handlebars, front rim, front hub, rear rim, rear hub, sprocket, cranks, rear brake, rear brake lever
- dh: bmx + shock, front brake, front brake lever, front disc, rear disc, gears
- mtb: dh + seatpost, seat
- gravel: mtb without shock
- commuter: bmx + front brake, front brake lever, gears

A bike is "built" while every lane of its type is filled. Optional: rear brake and rear brake lever on BMX (brakeless BMX allowed), shock on MTB (hardtails allowed), all four brake lanes (front/rear brake and lever) on commuter. There is no bike or part status anywhere (no active/sold/dismantled/in use).

## Layout
- SVG timeline. x axis: bikes grouped by type (BMX, MTB, DH, gravel, commuter), chronological within each group. y axis: time in years, newest at the top.
- Each bike is a vertical bar whose width depends on its type's lane count; the bar is only drawn while the bike is built, outlined (dark border in light theme, light border in dark theme).
- Part strips are coloured by part group: chassis, wheels, brakes, cockpit, drivetrain, seat.
- Parts moving between bikes are connected by right-angled "L" ribbons: horizontal from the old strip, then up into the bottom of the new strip.
  - Parts leaving a bike on the same date get their own track each, 1px apart (`RIBBON_TRACK_GAP`), leaving one step earlier per track; a small gap is cut into the old strip right above the departure, with a stub up to the real end date.
  - A part leaving alone leaves flush with the top of its strip.
  - Ribbons stop a small gap (`CONNECTOR_GAP_SIZE`) below the new strip so its bottom edge marks the start date; a part being replaced in that lane is cut short below the incoming ribbon.
  - A part returning to the same bike after a break gets a dotted line.
- Hover a part or bike name for a tooltip and highlight; click to pin.
- "Print A2 poster" button: A2 landscape (594×420 mm), every part's description written vertically along its strip (no dates), built periods under each bike name.

## Working style
Ask if something is unclear and don't make non-obvious assumptions. Use descriptive variable names. Render and check the result before handing it back.
