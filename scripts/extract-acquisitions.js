/**
 * Extract acquisition boundaries by computing geometric differences
 * between consecutive historical US territory GeoJSON files.
 *
 * Usage: node scripts/extract-acquisitions.js
 *
 * Output: public/data/us-territorial-expansion/acquisitions.geojson
 */

import * as turf from "@turf/turf";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../public/data/us-territorial-expansion");

// Step definitions - same as in main.js
const MAP_STEPS = [
  { year: "1783", file: "1789-original-states.geojson", era: "original", label: "Original States (1783)" },
  { year: "1803", file: "1803-louisiana-purchase.geojson", era: "louisiana", label: "Louisiana Purchase (1803)" },
  { year: "1818", file: "1818-red-river-basin.geojson", era: "redriver", label: "Red River Basin (1818)" },
  { year: "1819", file: "1819-florida.geojson", era: "florida", label: "Florida (1819)" },
  { year: "1845", file: "1845-texas.geojson", era: "texas", label: "Texas (1845)" },
  { year: "1846", file: "1846-oregon.geojson", era: "oregon", label: "Oregon Territory (1846)" },
  { year: "1848", file: "1848-mexican-cession.geojson", era: "mexican", label: "Mexican Cession (1848)" },
  { year: "1853", file: "1853-gadsden.geojson", era: "gadsden", label: "Gadsden Purchase (1853)" },
  { year: "1867", file: "1867-alaska.geojson", era: "alaska", label: "Alaska (1867)" },
  { year: "1898", file: "1898-spanish-american-war.geojson", era: "hawaii", label: "Hawaii (1898)" },
  { year: "1899–1959", file: "1900-samoa.geojson", era: "pacific", label: "Pacific Territories" },
  { year: "2025–26", file: "1959-final.geojson", era: "modern", label: "Modern Era" },
];

/**
 * Load GeoJSON and merge all US features (state + territory) into a single geometry
 */
function loadAndMerge(filename) {
  const filepath = join(DATA_DIR, filename);
  const geojson = JSON.parse(readFileSync(filepath, "utf-8"));

  // Filter to US features only (state, territory, seceded_state)
  const usCategories = ["state", "territory", "seceded_state"];
  const usFeatures = geojson.features.filter((f) =>
    usCategories.includes(f.properties.CATEGORY)
  );

  if (usFeatures.length === 0) {
    return null;
  }

  // Merge all features into a single multi-polygon
  try {
    const merged = usFeatures.reduce((acc, feature) => {
      if (!acc) return feature;
      return turf.union(turf.featureCollection([acc, feature]));
    }, null);
    return merged;
  } catch (err) {
    console.error(`Error merging ${filename}:`, err.message);
    return null;
  }
}

/**
 * Compute the difference between two geometries (newGeo - oldGeo)
 */
function computeDifference(newGeo, oldGeo) {
  if (!oldGeo) return newGeo;
  if (!newGeo) return null;

  try {
    const diff = turf.difference(turf.featureCollection([newGeo, oldGeo]));
    return diff;
  } catch (err) {
    console.error("Error computing difference:", err.message);
    return null;
  }
}

/**
 * Clean up geometry - simplify and remove small artifacts
 */
function cleanGeometry(feature, tolerance = 0.001) {
  if (!feature) return null;

  try {
    // Simplify to reduce file size
    let cleaned = turf.simplify(feature, { tolerance, highQuality: true });

    // Calculate area to filter out tiny artifacts
    const area = turf.area(cleaned);
    if (area < 1000000) {
      // Less than 1 sq km
      console.log(`  Skipping tiny artifact (${(area / 1000000).toFixed(2)} sq km)`);
      return null;
    }

    return cleaned;
  } catch (err) {
    console.error("Error cleaning geometry:", err.message);
    return feature;
  }
}

/**
 * Main extraction function
 */
function extractAcquisitions() {
  console.log("Extracting acquisition boundaries...\n");

  const acquisitions = [];
  let previousMerged = null;

  for (let i = 0; i < MAP_STEPS.length; i++) {
    const step = MAP_STEPS[i];
    console.log(`Step ${i}: ${step.label}`);

    const currentMerged = loadAndMerge(step.file);

    if (!currentMerged) {
      console.log("  No US features found, skipping\n");
      previousMerged = currentMerged;
      continue;
    }

    let acquisition;
    if (i === 0) {
      // First step - all territory is "new"
      acquisition = currentMerged;
      console.log("  First step - using entire territory");
    } else {
      // Compute difference from previous step
      acquisition = computeDifference(currentMerged, previousMerged);
      if (acquisition) {
        console.log("  Computed difference from previous step");
      } else {
        console.log("  No new territory (or computation failed)");
      }
    }

    // Clean up the geometry
    if (acquisition) {
      acquisition = cleanGeometry(acquisition);
    }

    if (acquisition) {
      // Add metadata
      acquisition.properties = {
        era: step.era,
        step: i,
        year: step.year,
        label: step.label,
      };
      acquisitions.push(acquisition);
      const area = turf.area(acquisition);
      console.log(`  Area: ${(area / 2589988110).toFixed(2)} million sq mi`);
    }

    console.log("");
    previousMerged = currentMerged;
  }

  // Build output GeoJSON
  const output = {
    type: "FeatureCollection",
    features: acquisitions,
  };

  // Write output
  const outputPath = join(DATA_DIR, "acquisitions.geojson");
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${acquisitions.length} acquisitions to ${outputPath}`);

  // Summary
  console.log("\nSummary:");
  acquisitions.forEach((f) => {
    console.log(`  ${f.properties.step}: ${f.properties.label} (${f.properties.era})`);
  });
}

extractAcquisitions();
