/**
 * Extract acquisition boundaries using mapshaper for robust geometric differencing,
 * supplemented with manually-created polygons for territories that can't be
 * reliably extracted from the source data.
 *
 * Usage: node scripts/extract-acquisitions.js
 *
 * Prerequisites: npm install -g mapshaper
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ─────────────────────────────────────────────────────────────
// Geometry utilities
// ─────────────────────────────────────────────────────────────

/**
 * Ensure polygon rings have correct winding order for D3's SPHERICAL geometry.
 *
 * IMPORTANT: D3's spherical interpretation differs from planar GeoJSON!
 * For polygons smaller than a hemisphere (all our acquisitions):
 * - Exterior rings: CLOCKWISE (CW) - opposite of planar GeoJSON convention
 * - Holes: counterclockwise (CCW)
 *
 * Uses the shoelace formula to calculate signed area.
 * Positive area = CW, Negative area = CCW
 */
function rewindRing(ring, shouldBeCW) {
  // Calculate signed area using shoelace formula
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1]);
  }
  const isCW = area > 0;

  if (isCW !== shouldBeCW) {
    return ring.slice().reverse();
  }
  return ring;
}

function rewindPolygon(coords) {
  return coords.map((ring, i) => {
    // For D3 spherical: exterior ring (i=0) should be CW, holes should be CCW
    return rewindRing(ring, i === 0);
  });
}

function rewindGeometry(geometry) {
  if (geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: rewindPolygon(geometry.coordinates),
    };
  } else if (geometry.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geometry.coordinates.map((poly) => rewindPolygon(poly)),
    };
  }
  return geometry;
}

// ─────────────────────────────────────────────────────────────
// Manual acquisition polygons for territories that can't be extracted
// from the source data via geometric differencing.
// ─────────────────────────────────────────────────────────────

const MANUAL_ACQUISITIONS = {
  // Florida (1819) - Adams-Onis Treaty
  // Peninsula + panhandle, bounded by Georgia/Alabama to the north
  florida: {
    type: "Feature",
    properties: { era: "florida", step: 3, label: "Florida (1819)" },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [-87.6, 30.99], [-87.6, 30.4], [-86.5, 30.4], [-85.5, 29.7],
        [-84.0, 29.5], [-83.0, 29.0], [-82.8, 27.5], [-82.0, 26.5],
        [-81.5, 25.2], [-80.2, 25.2], [-80.0, 26.5], [-80.0, 27.5],
        [-80.5, 28.5], [-80.5, 30.0], [-81.0, 30.5], [-81.5, 30.7],
        [-82.0, 30.5], [-83.0, 30.6], [-84.0, 30.7], [-85.0, 31.0],
        [-87.6, 30.99],
      ]]
    }
  },

  // Texas (1845) - Republic of Texas boundaries at annexation
  texas: {
    type: "Feature",
    properties: { era: "texas", step: 4, label: "Texas (1845)" },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [-106.5, 32.0], [-106.5, 31.8], [-105.0, 30.0], [-104.0, 29.5],
        [-103.0, 29.0], [-101.5, 29.5], [-100.0, 28.0], [-99.0, 26.5],
        [-97.5, 26.0], [-97.0, 26.0], [-97.0, 27.5], [-96.5, 28.5],
        [-95.0, 29.0], [-94.5, 29.5], [-94.0, 29.5], [-94.0, 30.0],
        [-94.0, 31.0], [-94.0, 32.0], [-94.0, 33.5], [-94.5, 33.9],
        [-96.0, 33.9], [-100.0, 36.5], [-103.0, 36.5], [-103.0, 32.0],
        [-106.5, 32.0],
      ]]
    }
  },

  // Oregon Territory (1846) - Oregon Treaty with Britain
  oregon: {
    type: "Feature",
    properties: { era: "oregon", step: 5, label: "Oregon Territory (1846)" },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [-124.5, 42.0], [-120.0, 42.0], [-117.0, 42.0], [-117.0, 44.0],
        [-117.0, 46.0], [-116.0, 46.0], [-116.0, 49.0], [-123.0, 49.0],
        [-123.0, 48.5], [-124.5, 48.5], [-124.5, 46.0], [-124.0, 44.0],
        [-124.5, 42.0],
      ]]
    }
  },

  // Hawaii (1898) - Annexed as territory
  hawaii: {
    type: "Feature",
    properties: { era: "hawaii", step: 9, label: "Hawaii (1898)" },
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        [[[-155.0, 19.0], [-156.0, 19.5], [-156.0, 20.0], [-155.0, 20.2], [-154.8, 19.5], [-155.0, 19.0]]],
        [[[-156.0, 20.5], [-156.5, 20.8], [-156.5, 21.0], [-156.0, 20.9], [-156.0, 20.5]]],
        [[[-157.7, 21.3], [-158.2, 21.5], [-158.2, 21.7], [-157.7, 21.7], [-157.7, 21.3]]],
        [[[-159.3, 21.9], [-159.8, 22.0], [-159.8, 22.2], [-159.3, 22.2], [-159.3, 21.9]]],
      ]
    }
  },
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../public/data/us-territorial-expansion");
const TEMP_DIR = join(__dirname, "../.temp-acquisitions");

// Step definitions with geographic filters for each acquisition
// The filter bbox clips the diff result to the expected acquisition region
// manual: true means use the manually-created polygon instead of extraction
const STEPS = [
  {
    file: "1789-original-states.geojson",
    era: "original",
    label: "Original States (1783)",
    filter: null, // No filter - first step uses entire territory
  },
  {
    file: "1803-louisiana-purchase.geojson",
    era: "louisiana",
    label: "Louisiana Purchase (1803)",
    filter: "-clip bbox=-115,25,-88,50",
  },
  {
    file: "1818-red-river-basin.geojson",
    era: "redriver",
    label: "Red River Basin (1818)",
    filter: "-clip bbox=-105,48,-90,52",
  },
  {
    file: "1819-florida.geojson",
    era: "florida",
    label: "Florida (1819)",
    manual: true, // Source data doesn't properly show Florida transfer
  },
  {
    file: "1845-texas.geojson",
    era: "texas",
    label: "Texas (1845)",
    manual: true, // Source data has messy Texas/disputed boundaries
  },
  {
    file: "1846-oregon.geojson",
    era: "oregon",
    label: "Oregon Territory (1846)",
    manual: true, // Source data doesn't clearly isolate Oregon Treaty territory
  },
  {
    file: "1848-mexican-cession.geojson",
    era: "mexican",
    label: "Mexican Cession (1848)",
    filter: "-clip bbox=-125,31,-103,43",
  },
  {
    file: "1853-gadsden.geojson",
    era: "gadsden",
    label: "Gadsden Purchase (1853)",
    filter: "-clip bbox=-115,31,-106,34",
  },
  {
    file: "1867-alaska.geojson",
    era: "alaska",
    label: "Alaska (1867)",
    filter: "-clip bbox=-180,50,-130,72",
  },
  {
    file: "1898-spanish-american-war.geojson",
    era: "hawaii",
    label: "Hawaii (1898)",
    manual: true, // Hawaii not in continental source data
  },
];

function run(cmd) {
  try {
    execSync(cmd, { encoding: "utf-8", stdio: "pipe" });
    return true;
  } catch (e) {
    console.error("  Command failed:", e.stderr || e.message);
    return false;
  }
}

function extractUSFeatures(inputFile, outputFile) {
  // Extract state + territory features and dissolve into single polygon
  // Use JS expression syntax that mapshaper understands
  const filterExpr = 'CATEGORY == "state" || CATEGORY == "territory" || CATEGORY == "seceded_state"';
  const cmd = `mapshaper "${inputFile}" -filter '${filterExpr}' -dissolve -o "${outputFile}" force`;
  return run(cmd);
}

function computeDifference(currentFile, previousFile, outputFile, filterCmd) {
  // Combine files, snap vertices, compute erase (difference), filter slivers
  let cmd = `mapshaper "${previousFile}" "${currentFile}" combine-files \
    -snap interval=0.01 \
    -target 2 \
    -erase target=2 source=1 \
    -filter-slivers min-area=1000km2`;

  // Apply geographic filter if specified
  if (filterCmd) {
    cmd += ` ${filterCmd}`;
  }

  cmd += ` -o "${outputFile}" force`;
  return run(cmd);
}

function loadGeoJSON(file) {
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function geoJSONToFeature(geojson, properties) {
  // Convert mapshaper output (GeometryCollection) to a proper Feature
  if (!geojson) return null;

  let geometry;
  if (geojson.type === "GeometryCollection" && geojson.geometries?.length > 0) {
    geometry = geojson.geometries[0];
  } else if (geojson.type === "FeatureCollection" && geojson.features?.length > 0) {
    geometry = geojson.features[0].geometry;
  } else if (geojson.type === "Feature") {
    geometry = geojson.geometry;
  } else if (geojson.type === "Polygon" || geojson.type === "MultiPolygon") {
    geometry = geojson;
  } else {
    return null;
  }

  // Skip empty geometries
  if (!geometry || !geometry.coordinates || geometry.coordinates.length === 0) {
    return null;
  }

  // Ensure correct winding order for D3's spherical interpretation
  geometry = rewindGeometry(geometry);

  return {
    type: "Feature",
    properties,
    geometry,
  };
}

function main() {
  console.log("Extracting acquisition boundaries...\n");

  // Create temp directory
  if (existsSync(TEMP_DIR)) {
    rmSync(TEMP_DIR, { recursive: true });
  }
  mkdirSync(TEMP_DIR, { recursive: true });

  const acquisitions = [];

  // Process each step
  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    console.log(`Step ${i}: ${step.label}`);

    const inputFile = join(DATA_DIR, step.file);
    const dissolvedFile = join(TEMP_DIR, `step${i}-dissolved.geojson`);

    // Always extract dissolved features (needed for subsequent step diffs)
    if (!extractUSFeatures(inputFile, dissolvedFile)) {
      console.log("  Failed to extract US features\n");
      continue;
    }

    // Check if this step uses a manual polygon
    if (step.manual) {
      const manualFeature = MANUAL_ACQUISITIONS[step.era];
      if (manualFeature) {
        // Rewind geometry for D3 compatibility
        const rewoundFeature = {
          ...manualFeature,
          geometry: rewindGeometry(manualFeature.geometry),
        };
        acquisitions.push(rewoundFeature);
        console.log("  Using manual polygon\n");
      } else {
        console.log("  ERROR: Manual polygon not found for " + step.era + "\n");
      }
      continue;
    }

    let acquisitionFile;
    if (i === 0) {
      // First step - use entire territory
      acquisitionFile = dissolvedFile;
      console.log("  Using entire territory (first step)");
    } else {
      // Compute difference from previous step
      const prevFile = join(TEMP_DIR, `step${i - 1}-dissolved.geojson`);
      acquisitionFile = join(TEMP_DIR, `step${i}-acquisition.geojson`);

      if (!computeDifference(dissolvedFile, prevFile, acquisitionFile, step.filter)) {
        console.log("  Failed to compute difference\n");
        continue;
      }
      console.log("  Computed difference from previous step");
    }

    // Load and convert to feature
    const geojson = loadGeoJSON(acquisitionFile);
    const feature = geoJSONToFeature(geojson, {
      era: step.era,
      step: i,
      label: step.label,
    });

    if (feature) {
      acquisitions.push(feature);
      console.log("  Added to output\n");
    } else {
      console.log("  No geometry (skipped)\n");
    }
  }

  // Build output FeatureCollection
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
  acquisitions.forEach((f) => {
    const coords = JSON.stringify(f.geometry.coordinates);
    const nums = coords.match(/-?\d+\.?\d*/g).map(Number);
    const lons = nums.filter((_, i) => i % 2 === 0);
    const lats = nums.filter((_, i) => i % 2 === 1);
    console.log(
      `  ${f.properties.step}: ${f.properties.label}` +
        ` | lon[${Math.min(...lons).toFixed(0)}, ${Math.max(...lons).toFixed(0)}]` +
        ` lat[${Math.min(...lats).toFixed(0)}, ${Math.max(...lats).toFixed(0)}]`
    );
  });
}

main();
