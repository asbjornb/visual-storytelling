/**
 * Build acquisition polygons by dissolving US states by their acquisition era.
 *
 * This approach guarantees no gaps or overlaps because US state boundaries
 * tile perfectly - they share exact vertices at borders.
 *
 * For sub-state acquisitions (Red River Basin, Gadsden Purchase), we extract
 * them via geometric differencing and subtract them from their parent territories.
 *
 * Usage: node scripts/build-acquisitions-from-states.js
 * Prerequisites: npm install -g mapshaper
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../public/data/us-territorial-expansion");
const TEMP_DIR = join(__dirname, "../.temp-acquisitions");

// Map each US state/territory to its acquisition era
const STATE_TO_ERA = {
  // Original 13 colonies + territory from Treaty of Paris 1783
  CT: "original", DE: "original", GA: "original", MD: "original",
  MA: "original", NH: "original", NJ: "original", NY: "original",
  NC: "original", PA: "original", RI: "original", SC: "original",
  VA: "original", VT: "original", KY: "original", TN: "original",
  OH: "original", ME: "original", WV: "original",
  IN: "original", IL: "original", MI: "original", WI: "original",
  AL: "original", MS: "original",

  // Louisiana Purchase 1803
  LA: "louisiana", AR: "louisiana", MO: "louisiana", IA: "louisiana",
  MN: "louisiana", ND: "louisiana", SD: "louisiana", NE: "louisiana",
  KS: "louisiana", OK: "louisiana", CO: "louisiana", WY: "louisiana",
  MT: "louisiana",

  // Florida 1819
  FL: "florida",

  // Texas 1845
  TX: "texas",

  // Oregon 1846
  OR: "oregon", WA: "oregon", ID: "oregon",

  // Mexican Cession 1848
  CA: "mexican", NV: "mexican", UT: "mexican", AZ: "mexican", NM: "mexican",

  // Alaska 1867
  AK: "alaska",

  // Hawaii 1898
  HI: "hawaii",
};

// Era metadata
const ERA_INFO = {
  original: { step: 0, label: "Original States (1783)" },
  louisiana: { step: 1, label: "Louisiana Purchase (1803)" },
  redriver: { step: 2, label: "Red River Basin (1818)" },
  florida: { step: 3, label: "Florida (1819)" },
  texas: { step: 4, label: "Texas (1845)" },
  oregon: { step: 5, label: "Oregon Territory (1846)" },
  mexican: { step: 6, label: "Mexican Cession (1848)" },
  gadsden: { step: 7, label: "Gadsden Purchase (1853)" },
  alaska: { step: 8, label: "Alaska (1867)" },
  hawaii: { step: 9, label: "Hawaii (1898)" },
};

// Winding order utilities for D3 spherical geometry
function rewindRing(ring, shouldBeCW) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1]);
  }
  const isCW = area > 0;
  return isCW !== shouldBeCW ? ring.slice().reverse() : ring;
}

function rewindPolygon(coords) {
  return coords.map((ring, i) => rewindRing(ring, i === 0));
}

function rewindGeometry(geometry) {
  if (geometry.type === "Polygon") {
    return { type: "Polygon", coordinates: rewindPolygon(geometry.coordinates) };
  } else if (geometry.type === "MultiPolygon") {
    return { type: "MultiPolygon", coordinates: geometry.coordinates.map(poly => rewindPolygon(poly)) };
  }
  return geometry;
}

function run(cmd) {
  try {
    execSync(cmd, { encoding: "utf-8", stdio: "pipe" });
    return true;
  } catch (e) {
    console.error("  Command failed:", e.stderr || e.message);
    return false;
  }
}

function loadGeometry(file) {
  try {
    const result = JSON.parse(readFileSync(file, "utf-8"));
    if (result.type === "FeatureCollection" && result.features?.length > 0) {
      return result.features[0].geometry;
    } else if (result.type === "GeometryCollection" && result.geometries?.length > 0) {
      return result.geometries[0];
    } else if (result.type === "Feature") {
      return result.geometry;
    } else if (result.type === "Polygon" || result.type === "MultiPolygon") {
      return result;
    }
  } catch (e) {
    console.error(`  Error loading ${file}: ${e.message}`);
  }
  return null;
}

function main() {
  console.log("Building acquisitions from state boundaries...\n");

  // Create temp directory
  if (existsSync(TEMP_DIR)) {
    rmSync(TEMP_DIR, { recursive: true });
  }
  mkdirSync(TEMP_DIR, { recursive: true });

  const filterExpr = 'CATEGORY == "state" || CATEGORY == "territory"';

  // ─────────────────────────────────────────────────────────────
  // Step 1: Extract sub-state acquisitions via geometric differencing
  // ─────────────────────────────────────────────────────────────

  // Red River Basin (1818) - strip along 49th parallel
  console.log("Extracting Red River Basin (geometric diff)...");
  const redriverFile = join(TEMP_DIR, "redriver.geojson");
  {
    const file1803 = join(DATA_DIR, "1803-louisiana-purchase.geojson");
    const file1818 = join(DATA_DIR, "1818-red-river-basin.geojson");
    const d1803 = join(TEMP_DIR, "d1803.geojson");
    const d1818 = join(TEMP_DIR, "d1818.geojson");

    run(`mapshaper "${file1803}" -filter '${filterExpr}' -dissolve -o "${d1803}" force`);
    run(`mapshaper "${file1818}" -filter '${filterExpr}' -dissolve -o "${d1818}" force`);
    run(`mapshaper "${d1803}" "${d1818}" combine-files -snap interval=0.01 -target 2 ` +
        `-erase target=2 source=1 -filter-slivers min-area=100km2 ` +
        `-clip bbox=-105,48,-90,50 -o "${redriverFile}" force`);
  }

  // Gadsden Purchase (1853) - southern AZ/NM strip
  console.log("Extracting Gadsden Purchase (geometric diff)...");
  const gadsdenFile = join(TEMP_DIR, "gadsden.geojson");
  {
    const file1848 = join(DATA_DIR, "1848-mexican-cession.geojson");
    const file1853 = join(DATA_DIR, "1853-gadsden.geojson");
    const d1848 = join(TEMP_DIR, "d1848.geojson");
    const d1853 = join(TEMP_DIR, "d1853.geojson");

    run(`mapshaper "${file1848}" -filter '${filterExpr}' -dissolve -o "${d1848}" force`);
    run(`mapshaper "${file1853}" -filter '${filterExpr}' -dissolve -o "${d1853}" force`);
    run(`mapshaper "${d1848}" "${d1853}" combine-files -snap interval=0.01 -target 2 ` +
        `-erase target=2 source=1 -filter-slivers min-area=100km2 ` +
        `-clip bbox=-115,31,-106,34 -o "${gadsdenFile}" force`);
  }

  // ─────────────────────────────────────────────────────────────
  // Step 2: Build state-based acquisitions
  // ─────────────────────────────────────────────────────────────

  // Load and tag states
  const statesFile = join(DATA_DIR, "1959-final.geojson");
  const statesData = JSON.parse(readFileSync(statesFile, "utf-8"));
  console.log(`\nLoaded ${statesData.features.length} features from 1959-final.geojson`);

  statesData.features.forEach(feature => {
    const era = STATE_TO_ERA[feature.properties.STATE];
    if (era) feature.properties.era = era;
  });

  const taggedFile = join(TEMP_DIR, "states-tagged.geojson");
  writeFileSync(taggedFile, JSON.stringify(statesData));

  // ─────────────────────────────────────────────────────────────
  // Step 3: Dissolve by era, subtracting sub-state acquisitions
  // ─────────────────────────────────────────────────────────────

  const acquisitions = [];
  const stateBasedEras = ["original", "louisiana", "florida", "texas", "oregon", "mexican", "alaska", "hawaii"];

  for (const era of stateBasedEras) {
    console.log(`Processing ${era}...`);
    const info = ERA_INFO[era];
    const eraFile = join(TEMP_DIR, `${era}-raw.geojson`);
    const eraFinalFile = join(TEMP_DIR, `${era}.geojson`);

    // Dissolve states for this era
    if (!run(`mapshaper "${taggedFile}" -filter 'era === "${era}"' -dissolve -o "${eraFile}" force`)) {
      continue;
    }

    // Subtract sub-state acquisitions from parent territories
    let finalFile = eraFile;
    if (era === "louisiana" && existsSync(redriverFile)) {
      // Subtract Red River Basin from Louisiana
      console.log("  Subtracting Red River Basin...");
      run(`mapshaper "${eraFile}" "${redriverFile}" combine-files -target 1 ` +
          `-erase target=1 source=2 -o "${eraFinalFile}" force`);
      finalFile = eraFinalFile;
    } else if (era === "mexican" && existsSync(gadsdenFile)) {
      // Subtract Gadsden from Mexican Cession
      console.log("  Subtracting Gadsden Purchase...");
      run(`mapshaper "${eraFile}" "${gadsdenFile}" combine-files -target 1 ` +
          `-erase target=1 source=2 -o "${eraFinalFile}" force`);
      finalFile = eraFinalFile;
    }

    const geometry = loadGeometry(finalFile);
    if (geometry && geometry.coordinates?.length > 0) {
      acquisitions.push({
        type: "Feature",
        properties: { era, step: info.step, label: info.label },
        geometry: rewindGeometry(geometry),
      });
      console.log(`  Added ${era}`);
    }
  }

  // Add sub-state acquisitions
  for (const [era, file] of [["redriver", redriverFile], ["gadsden", gadsdenFile]]) {
    const geometry = loadGeometry(file);
    if (geometry && geometry.coordinates?.length > 0) {
      const info = ERA_INFO[era];
      acquisitions.push({
        type: "Feature",
        properties: { era, step: info.step, label: info.label },
        geometry: rewindGeometry(geometry),
      });
      console.log(`Added ${era}`);
    }
  }

  // Sort by step
  acquisitions.sort((a, b) => a.properties.step - b.properties.step);

  // Write output
  const output = { type: "FeatureCollection", features: acquisitions };
  const outputPath = join(DATA_DIR, "acquisitions.geojson");
  writeFileSync(outputPath, JSON.stringify(output));
  console.log(`\nWrote ${acquisitions.length} acquisitions to ${outputPath}`);

  // Cleanup
  rmSync(TEMP_DIR, { recursive: true });

  // Summary
  console.log("\nSummary:");
  acquisitions.forEach(f => {
    const coords = JSON.stringify(f.geometry.coordinates);
    const nums = coords.match(/-?\d+\.?\d*/g)?.map(Number) || [];
    const lons = nums.filter((_, i) => i % 2 === 0);
    const lats = nums.filter((_, i) => i % 2 === 1);
    if (lons.length && lats.length) {
      console.log(
        `  ${f.properties.step}: ${f.properties.label}` +
        ` | lon[${Math.min(...lons).toFixed(0)}, ${Math.max(...lons).toFixed(0)}]` +
        ` lat[${Math.min(...lats).toFixed(0)}, ${Math.max(...lats).toFixed(0)}]`
      );
    }
  });
}

main();
