# Instructions for AI agents

- Never commit changes. Make your changes in the working tree and leave them uncommitted so Manu can review and commit them.
- `README.md` describes how the page works and the JSON format. The code is the source of truth: `index.html` (page and sample data), `styles.css`, `utils.js` and `timeline.js`. Keep it working when `index.html` is opened from disk (`file://`): plain script tags, no ES modules, no `fetch` of the code. Keep everything that wasn't asked to change, and keep `README.md` up to date with your changes.
- `test.html` and `test.js` hold the unit tests for `utils.js`. Add or update tests when you change `utils.js`, and open `test.html` to check that they all pass.
- Ask if something is unclear and don't make non-obvious assumptions.
- Use descriptive variable names.
- Render and check the result before handing it back.
