// Guards against the production CSS bundle silently dropping rules.
//
// In production, part of app/globals.css was being omitted from the emitted
// CSS bundle (the Style DNA styles at the file tail), so the Style DNA card
// rendered unstyled and collapsed to nothing — with no build error. This
// script asserts that representative selectors from across globals.css survive
// into the built bundle, so any future truncation fails the build loudly
// instead of shipping broken styling.
//
// Runs after `next build` against .next/static/css/*.css. Wired into both the
// Netlify build command and CI.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CSS_DIR = ".next/static/css";

// Selectors that must appear in the built bundle. `sdna-aurora-blob` and
// `sdna-reveal-screen` live at the very end of globals.css (the section that
// was dropped); `sdna-card`/`sdna-cta-card`/`mood-banner` are earlier —
// together they catch a truncated tail at any cut point.
const REQUIRED = [
  "sdna-card",
  "sdna-cta-card",
  "mood-banner",
  "sdna-aurora-blob",
  "sdna-reveal-screen",
];

// Absolute size floor: the truncated bundle was 77,718 bytes vs ~90,000 for a
// healthy one. A bundle that keeps all markers but is suspiciously small still
// fails loudly instead of shipping partially styled CSS.
const SIZE_FLOOR_BYTES = 85_000;

let files;
try {
  files = readdirSync(CSS_DIR).filter((f) => f.endsWith(".css"));
} catch {
  console.error(`verify:css — no ${CSS_DIR} directory. Run \`next build\` first.`);
  process.exit(1);
}

if (files.length === 0) {
  console.error(`verify:css — no CSS files found in ${CSS_DIR}.`);
  process.exit(1);
}

const contents = files.map((f) => readFileSync(join(CSS_DIR, f), "utf8"));
const combined = contents.join("\n");
const totalBytes = contents.reduce((sum, css) => sum + Buffer.byteLength(css, "utf8"), 0);

const missing = REQUIRED.filter((marker) => !combined.includes(marker));

if (missing.length > 0) {
  console.error(
    `verify:css — built CSS bundle is missing expected selectors: ${missing.join(", ")}.\n` +
      `This usually means part of app/globals.css was dropped during the build. ` +
      `Do not deploy this bundle.`,
  );
  process.exit(1);
}

if (totalBytes < SIZE_FLOOR_BYTES) {
  console.error(
    `verify:css — built CSS bundle is only ${totalBytes} bytes (floor: ${SIZE_FLOOR_BYTES}).\n` +
      `This usually means part of app/globals.css was dropped during the build. ` +
      `Do not deploy this bundle.`,
  );
  process.exit(1);
}

console.log(
  `verify:css — OK (checked ${files.length} CSS file(s), ${totalBytes} bytes, for: ${REQUIRED.join(", ")})`,
);
