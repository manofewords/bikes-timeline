# Bike timeline

A single self-contained HTML page that shows the history of my bikes and how parts moved between them. Open `index.html` in a browser; there is no build step and nothing to install.

## What it shows

- **One column per bike**, grouped by type (BMX, MTB, DH, gravel, commuter) and in chronological order within each group. Time runs upwards in years, with the newest dates at the top.
- **One lane per part type** inside each bike's bar. Each bike type has its own set of lanes, so bar widths differ. Part strips are coloured by part group: chassis, wheels, brakes, cockpit, drivetrain and seat.
- **Built periods**: the outlined grey bar is drawn only while every lane of the bike's type is filled. Some lanes are optional: rear brake and lever on BMX, shock on MTB, and all brakes on a commuter.
- **Part moves**: right-angled "L" ribbons connect a part that moved from one bike to another. A dotted line marks a part that went back on the same bike after a break.
- **Interaction**: hover a part or a bike name for a tooltip and highlight, and click to pin it. Summary stats, a parts table and data warnings are shown below the chart.
- **Poster**: "Print A2 poster" (or Ctrl/Cmd+P) prints an A2 landscape version. It has each part's details written along its strip and the built periods under each bike name.

## Data

The page comes with sample data embedded in a `<script id="bike-data">` tag. The current data is fake, and the real data is still being collected. Use **Load JSON…** to open your own file and **Copy JSON** to copy the data that's loaded.

```json
{
  "bikes": [{ "id": "uuid", "type": "bmx | mtb | dh | gravel | commuter", "name": "Haro Backtrail X1" }],
  "parts": [{
    "id": "uuid", "type": "frame", "details": "Haro Backtrail frame",
    "usage": [{ "bikeId": "uuid", "dateFrom": "2008-11-15", "dateTo": "now" }]
  }]
}
```

Some parts are skipped:

- Tires, grips, seat clamp, headset and pedals are skipped without a message.
- A part with a `null` date is logged to the console.
- A part type the page doesn't know is logged as an error and listed above the parts table.
- A part type that has no lane on that bike's type is logged as a warning.

## Repository

Only `index.html` is tracked. Each commit is one version of the page, and the oldest commit is the first version. The full spec is in `project-instructions.md`.
