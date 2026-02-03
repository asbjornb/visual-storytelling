/**
 * Build acquisition polygons by dissolving US states by their acquisition era.
 *
 * This approach guarantees no gaps or overlaps because US state boundaries
 * tile perfectly - they share exact vertices at borders.
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
// Based on historical acquisition dates
const STATE_TO_ERA = {
  // Original 13 colonies + territory from Treaty of Paris 1783
  CT: "original", DE: "original", GA: "original", MD: "original",
  MA: "original", NH: "original", NJ: "original", NY: "original",
  NC: "original", PA: "original", RI: "original", SC: "original",
  VA: "original", VT: "original", KY: "original", TN: "original",
  OH: "original", ME: "original", WV: "original",
  // Parts of these were original territory
  IN: "original", IL: "original", MI: "original", WI: "original",
  AL: "original", MS: "original",

  // Louisiana Purchase 1803
  LA: "louisiana", AR: "louisiana", MO: "louisiana", IA: "louisiana",
  MN: "louisiana", // Eastern MN was Louisiana Purchase
  ND: "louisiana", SD: "louisiana", NE: "louisiana", KS: "louisiana",
  OK: "louisiana", // Most of OK was Louisiana Purchase
  CO: "louisiana", // Eastern CO
  WY: "louisiana", // Eastern WY
  MT: "louisiana", // Eastern MT

  // Florida 1819 (Adams-Onis Treaty)
  FL: "florida",

  // Texas Annexation 1845
  TX: "texas",

  // Oregon Treaty 1846
  OR: "oregon", WA: "oregon", ID: "oregon",

  // Mexican Cession 1848
  CA: "mexican", NV: "mexican", UT: "mexican",
  AZ: "mexican", // Northern AZ
  NM: "mexican", // Northern NM

  // Gadsden Purchase 1853
  // Southern parts of AZ and NM - but we'll assign whole states to Mexican Cession
  // since state boundaries don't match Gadsden exactly

  // Alaska Purchase 1867
  AK: "alaska",

  // Hawaii Annexation 1898
  HI: "hawaii",
};

// Era metadata for output
const ERA_INFO = {
  original: { step: 0, label: "Original States (1783)" },
  louisiana: { step: 1, label: "Louisiana Purchase (1803)" },
  florida: { step: 3, label: "Florida (1819)" },
  texas: { step: 4, label: "Texas (1845)" },
  oregon: { step: 5, label: "Oregon Territory (1846)" },
  mexican: { step: 6, label: "Mexican Cession (1848)" },
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

function main() {
  console.log("Building acquisitions from state boundaries...\n");

  // Create temp directory
  if (existsSync(TEMP_DIR)) {
    rmSync(TEMP_DIR, { recursive: true });
  }
  mkdirSync(TEMP_DIR, { recursive: true });

  // Load the 1959 final state data
  const statesFile = join(DATA_DIR, "1959-final.geojson");
  const statesData = JSON.parse(readFileSync(statesFile, "utf-8"));

  console.log(`Loaded ${statesData.features.length} features from 1959-final.geojson`);

  // Add era property to each state
  let unknownStates = [];
  statesData.features.forEach(feature => {
    const stateCode = feature.properties.STATE;
    const era = STATE_TO_ERA[stateCode];
    if (era) {
      feature.properties.era = era;
    } else if (feature.properties.CATEGORY === "state" || feature.properties.CATEGORY === "territory") {
      unknownStates.push(stateCode);
    }
  });

  if (unknownStates.length > 0) {
    console.log(`Warning: Unknown states: ${[...new Set(unknownStates)].join(", ")}`);
  }

  // Write tagged states to temp file
  const taggedFile = join(TEMP_DIR, "states-tagged.geojson");
  writeFileSync(taggedFile, JSON.stringify(statesData));

  // Dissolve by era using mapshaper
  const acquisitions = [];

  for (const [era, info] of Object.entries(ERA_INFO)) {
    console.log(`Processing ${era}...`);

    const eraFile = join(TEMP_DIR, `${era}.geojson`);

    // Filter to this era and dissolve
    const cmd = `mapshaper "${taggedFile}" -filter 'era === "${era}"' -dissolve -o "${eraFile}" force`;

    if (!run(cmd)) {
      console.log(`  Failed to process ${era}`);
      continue;
    }

    // Load result
    try {
      const result = JSON.parse(readFileSync(eraFile, "utf-8"));
      let geometry = null;

      if (result.type === "FeatureCollection" && result.features?.length > 0) {
        geometry = result.features[0].geometry;
      } else if (result.type === "GeometryCollection" && result.geometries?.length > 0) {
        geometry = result.geometries[0];
      } else if (result.type === "Feature") {
        geometry = result.geometry;
      } else if (result.type === "Polygon" || result.type === "MultiPolygon") {
        geometry = result;
      }

      if (geometry && geometry.coordinates?.length > 0) {
        // Rewind for D3 spherical geometry
        geometry = rewindGeometry(geometry);

        acquisitions.push({
          type: "Feature",
          properties: {
            era,
            step: info.step,
            label: info.label,
          },
          geometry,
        });
        console.log(`  Added ${era}`);
      } else {
        console.log(`  No geometry for ${era}`);
      }
    } catch (e) {
      console.log(`  Error reading ${era}: ${e.message}`);
    }
  }

  // Sort by step
  acquisitions.sort((a, b) => a.properties.step - b.properties.step);

  // Build output
  const output = {
    type: "FeatureCollection",
    features: acquisitions,
  };

  // Write output
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
