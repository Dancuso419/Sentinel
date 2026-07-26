// tests/pageScripts.test.js
//
// Guards a failure mode that per-file linting cannot see.
//
// The front end is classic <script> tags, not modules, so every script on a page
// shares ONE global scope. Two files each declaring `const ROLE_LABEL` is a
// SyntaxError — and the browser stops executing the second file entirely, silently.
// Each file is valid on its own; only the combination is broken.
//
// That is exactly what happened: account.html loaded both rail.js and account.js,
// both declared ROLE_LABEL, and the whole account page stopped working while every
// individual file still passed `node --check`.
//
// So this parses each page's scripts the way the browser does: concatenated, in
// document order.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function pagesWithScripts() {
  return fs.readdirSync(PUBLIC_DIR)
    .filter((f) => f.endsWith('.html'))
    .map((file) => {
      const html = fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8');
      const scripts = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)]
        .map((m) => m[1]);
      return { file, scripts };
    })
    .filter((p) => p.scripts.length > 0);
}

const pages = pagesWithScripts();

test('every page loads at least one script and the list is discoverable', () => {
  expect(pages.length).toBeGreaterThan(0);
  // api.js defines escapeHtml/apiRequest that the others rely on, so it must come
  // first wherever it appears.
  for (const { file, scripts } of pages) {
    if (scripts.includes('js/api.js')) {
      expect(`${file}: ${scripts[0]}`).toBe(`${file}: js/api.js`);
    }
  }
});

describe.each(pages.map((p) => [p.file, p.scripts]))(
  '%s',
  (file, scripts) => {
    test(`scripts share a global scope without collision (${scripts.join(' + ')})`, () => {
      const source = scripts
        .map((s) => fs.readFileSync(path.join(PUBLIC_DIR, s), 'utf8'))
        .join('\n;\n');

      // Compiling is enough: a duplicate top-level `const` across the bundle throws
      // here exactly as it would in the browser, with no DOM required.
      expect(() => new vm.Script(source, { filename: `${file} (bundle)` })).not.toThrow();
    });
  }
);
