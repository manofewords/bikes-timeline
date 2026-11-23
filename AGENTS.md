# Instructions for AI agents

- Never commit changes. Make your changes in the working tree and leave them uncommitted so Manu can review and commit them.
- `README.md` describes how the page works and the JSON format. The code is the source of truth: `index.html` (the page), `test-bikes.json` (the test data it loads), `styles.css`, `utils.js` and `timeline.js`. The page is served by a local web server (`python3 -m http.server`); there is no build step: plain script tags, no ES modules. Keep everything that wasn't asked to change, and keep `README.md` up to date with your changes.
- `test.html` and `test.js` hold the unit tests for `utils.js`. Add or update tests when you change `utils.js`, and open `test.html` to check that they all pass.
- `test.html` also shows the visual test: the chart drawn from `test-bikes.json` over the reference image `visual-reference.png`. After changing the drawing, compare the two, and say which differences are expected.
- Ask if something is unclear and don't make non-obvious assumptions.
- Use descriptive variable names.
- Render and check the result before handing it back.
