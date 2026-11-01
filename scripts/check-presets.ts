/** G-PRESETS: validates every built-in preset (schema + semantics). See src/presets/validate.ts. */
import { validateAllBuiltInPresets } from "../src/presets/validate";

const res = validateAllBuiltInPresets();
if (!res.ok) {
  console.error(`Preset validation failed (${res.errors.length}):`);
  for (const e of res.errors) console.error("  " + e);
  process.exit(1);
}
console.log(`check:presets: ${res.count} presets valid`);
