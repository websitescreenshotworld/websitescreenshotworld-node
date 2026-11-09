// The package is "type": "module", so the CommonJS build needs its own marker to load as CommonJS.
import { writeFileSync } from "node:fs";

writeFileSync(
  new URL("../dist/cjs/package.json", import.meta.url),
  `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`,
);
