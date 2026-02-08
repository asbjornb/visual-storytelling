import * as d3 from "d3";
import * as turf from "@turf/turf";

// ─────────────────────────────────────────────────────────────
// Available GeoJSON files (relative to /data/us-territorial-expansion/)
// ─────────────────────────────────────────────────────────────

const DATA_DIR = "/data/us-territorial-expansion";

const FILES = [
  { value: "1789-original-states.geojson", label: "1783 — Original States" },
  {
    value: "1803-louisiana-purchase.geojson",
    label: "1803 — Louisiana Purchase",
  },
  { value: "1818-red-river-basin.geojson", label: "1818 — Red River Basin" },
  { value: "1819-florida.geojson", label: "1819 — Florida" },
  { value: "1845-texas.geojson", label: "1845 — Texas" },
  { value: "1846-oregon.geojson", label: "1846 — Oregon" },
  { value: "1848-mexican-cession.geojson", label: "1848 — Mexican Cession" },
  { value: "1853-gadsden.geojson", label: "1853 — Gadsden Purchase" },
  { value: "1867-alaska.geojson", label: "1867 — Alaska" },
  {
    value: "1898-spanish-american-war.geojson",
    label: "1898 — Spanish-American War",
  },
  { value: "1900-samoa.geojson", label: "1899–1959 — Samoa" },
  { value: "1959-final.geojson", label: "1959 — Final" },
  { value: "acquisitions.geojson", label: "Acquisitions (overview)" },
];

// ─────────────────────────────────────────────────────────────
// DOM references
// ─────────────────────────────────────────────────────────────

const selectA = document.getElementById("file-a");
const selectB = document.getElementById("file-b");
const infoA = document.getElementById("info-a");
const infoB = document.getElementById("info-b");
const btnDiff = document.getElementById("btn-diff");
const btnUnion = document.getElementById("btn-union");
const btnCompute = document.getElementById("btn-compute");
const btnDownload = document.getElementById("btn-download");
const filterUS = document.getElementById("filter-us");
const statusEl = document.getElementById("status");

let operation = "diff"; // "diff" or "union"
let resultGeoJSON = null;

// ─────────────────────────────────────────────────────────────
// Populate selects
// ─────────────────────────────────────────────────────────────

FILES.forEach((f, i) => {
  const optA = new Option(f.label, f.value);
  const optB = new Option(f.label, f.value);
  selectA.appendChild(optA);
  selectB.appendChild(optB);
});

// Default: consecutive files for diffing acquisitions
selectA.selectedIndex = 1; // 1803 Louisiana
selectB.selectedIndex = 0; // 1783 Original

// ─────────────────────────────────────────────────────────────
// Operation toggle
// ─────────────────────────────────────────────────────────────

btnDiff.addEventListener("click", () => {
  operation = "diff";
  btnDiff.classList.add("active");
  btnUnion.classList.remove("active");
});

btnUnion.addEventListener("click", () => {
  operation = "union";
  btnUnion.classList.add("active");
  btnDiff.classList.remove("active");
});

// ─────────────────────────────────────────────────────────────
// Map rendering
// ─────────────────────────────────────────────────────────────

const FILL_A = "#4a90d9";
const FILL_B = "#d94a4a";
const FILL_RESULT = "#2a9d8f";
const FILL_CONTEXT = "#2a2a2a";
const STROKE = "#0a0a0a";

function createMap(containerId) {
  const container = document.getElementById(containerId);
  const width = container.clientWidth;
  const height = container.clientHeight;

  const svg = d3
    .select(`#${containerId}`)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const projection = d3
    .geoConicEqualArea()
    .parallels([20, 50])
    .rotate([90, 0])
    .center([0, 35])
    .fitSize([width, height], {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-180, 10],
            [-180, 75],
            [-50, 75],
            [-50, 10],
            [-180, 10],
          ],
        ],
      },
    });

  const path = d3.geoPath().projection(projection);

  return { svg, path, projection, width, height };
}

function renderGeoJSON(mapObj, geojson, fillColor) {
  const { svg, path } = mapObj;
  svg.selectAll("*").remove();

  if (!geojson || !geojson.features || geojson.features.length === 0) {
    svg
      .append("text")
      .attr("x", mapObj.width / 2)
      .attr("y", mapObj.height / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#555")
      .attr("font-size", "14px")
      .text("No geometry");
    return;
  }

  svg
    .selectAll("path")
    .data(geojson.features)
    .join("path")
    .attr("d", path)
    .attr("fill", (d) => {
      if (d.properties?.CATEGORY === "other_country") return FILL_CONTEXT;
      return fillColor;
    })
    .attr("stroke", STROKE)
    .attr("stroke-width", 0.5)
    .attr("opacity", (d) => {
      if (d.properties?.CATEGORY === "other_country") return 0.4;
      return 0.85;
    });
}

// ─────────────────────────────────────────────────────────────
// Data loading & filtering
// ─────────────────────────────────────────────────────────────

const geoCache = new Map();

async function loadGeoJSON(filename) {
  if (geoCache.has(filename)) return geoCache.get(filename);
  const url = `${DATA_DIR}/${filename}`;
  const data = await d3.json(url);
  geoCache.set(filename, data);
  return data;
}

function filterFeatures(geojson, usOnly) {
  if (!usOnly) return geojson;
  return {
    type: "FeatureCollection",
    features: geojson.features.filter(
      (f) => f.properties?.CATEGORY !== "other_country"
    ),
  };
}

function describeGeoJSON(geojson) {
  const total = geojson.features.length;
  const categories = {};
  for (const f of geojson.features) {
    const cat = f.properties?.CATEGORY || f.properties?.era || "unknown";
    categories[cat] = (categories[cat] || 0) + 1;
  }
  const parts = Object.entries(categories)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  return `${total} features (${parts})`;
}

// ─────────────────────────────────────────────────────────────
// Geometric operations
// ─────────────────────────────────────────────────────────────

/**
 * Merge all polygons in a FeatureCollection into a single MultiPolygon.
 * This is needed because turf.difference / turf.union work on individual
 * polygon features, not collections.
 */
function dissolveToSingle(fc) {
  const polys = fc.features.filter(
    (f) =>
      f.geometry &&
      (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")
  );

  if (polys.length === 0) return null;
  if (polys.length === 1) return polys[0];

  let merged = polys[0];
  for (let i = 1; i < polys.length; i++) {
    try {
      const result = turf.union(
        turf.featureCollection([merged, polys[i]])
      );
      if (result) merged = result;
    } catch {
      // Skip features that cause topology errors
    }
  }
  return merged;
}

function computeDiff(fcA, fcB) {
  const mergedA = dissolveToSingle(fcA);
  const mergedB = dissolveToSingle(fcB);

  if (!mergedA) return emptyFC();
  if (!mergedB) return singleFC(mergedA, "diff-result");

  try {
    const result = turf.difference(
      turf.featureCollection([mergedA, mergedB])
    );
    if (!result) return emptyFC();
    result.properties = { operation: "difference" };
    return singleFC(result, "diff-result");
  } catch (err) {
    throw new Error(`Difference failed: ${err.message}`);
  }
}

function computeUnion(fcA, fcB) {
  const mergedA = dissolveToSingle(fcA);
  const mergedB = dissolveToSingle(fcB);

  if (!mergedA && !mergedB) return emptyFC();
  if (!mergedA) return singleFC(mergedB, "union-result");
  if (!mergedB) return singleFC(mergedA, "union-result");

  try {
    const result = turf.union(
      turf.featureCollection([mergedA, mergedB])
    );
    if (!result) return emptyFC();
    result.properties = { operation: "union" };
    return singleFC(result, "union-result");
  } catch (err) {
    throw new Error(`Union failed: ${err.message}`);
  }
}

function emptyFC() {
  return { type: "FeatureCollection", features: [] };
}

function singleFC(feature, id) {
  feature.properties = { ...feature.properties, id };
  return { type: "FeatureCollection", features: [feature] };
}

// ─────────────────────────────────────────────────────────────
// Main compute handler
// ─────────────────────────────────────────────────────────────

const mapA = createMap("map-a");
const mapResult = createMap("map-result");
const mapB = createMap("map-b");

async function updatePreview(selectEl, infoEl, mapObj, fillColor) {
  const filename = selectEl.value;
  try {
    const raw = await loadGeoJSON(filename);
    const usOnly = filterUS.checked;
    const filtered = filterFeatures(raw, usOnly);
    infoEl.textContent = describeGeoJSON(filtered);
    renderGeoJSON(mapObj, filtered, fillColor);
    return filtered;
  } catch (err) {
    infoEl.textContent = `Error: ${err.message}`;
    return null;
  }
}

// Auto-preview on file change
selectA.addEventListener("change", () => updatePreview(selectA, infoA, mapA, FILL_A));
selectB.addEventListener("change", () => updatePreview(selectB, infoB, mapB, FILL_B));
filterUS.addEventListener("change", () => {
  updatePreview(selectA, infoA, mapA, FILL_A);
  updatePreview(selectB, infoB, mapB, FILL_B);
});

// Initial preview
updatePreview(selectA, infoA, mapA, FILL_A);
updatePreview(selectB, infoB, mapB, FILL_B);

btnCompute.addEventListener("click", async () => {
  btnCompute.disabled = true;
  btnDownload.disabled = true;
  resultGeoJSON = null;
  statusEl.textContent = "Computing...";
  statusEl.className = "";

  try {
    const rawA = await loadGeoJSON(selectA.value);
    const rawB = await loadGeoJSON(selectB.value);
    const usOnly = filterUS.checked;
    const fcA = filterFeatures(rawA, usOnly);
    const fcB = filterFeatures(rawB, usOnly);

    // Update side previews
    renderGeoJSON(mapA, fcA, FILL_A);
    renderGeoJSON(mapB, fcB, FILL_B);

    let result;
    if (operation === "diff") {
      result = computeDiff(fcA, fcB);
    } else {
      result = computeUnion(fcA, fcB);
    }

    resultGeoJSON = result;
    renderGeoJSON(mapResult, result, FILL_RESULT);

    const opLabel = operation === "diff" ? "Difference" : "Union";
    const featureCount = result.features.length;
    if (featureCount === 0) {
      statusEl.innerHTML = `<span class="success">${opLabel} computed — empty result (geometries may be identical or non-overlapping)</span>`;
    } else {
      const geomType = result.features[0]?.geometry?.type || "unknown";
      const coords =
        geomType === "MultiPolygon"
          ? result.features[0].geometry.coordinates.length + " polygons"
          : geomType;
      statusEl.innerHTML = `<span class="success">${opLabel} computed — ${featureCount} feature(s), ${coords}</span>`;
    }
    btnDownload.disabled = false;
  } catch (err) {
    statusEl.innerHTML = `<span class="error">Error: ${err.message}</span>`;
    renderGeoJSON(mapResult, emptyFC(), FILL_RESULT);
  } finally {
    btnCompute.disabled = false;
  }
});

// ─────────────────────────────────────────────────────────────
// Download
// ─────────────────────────────────────────────────────────────

btnDownload.addEventListener("click", () => {
  if (!resultGeoJSON) return;

  const opLabel = operation === "diff" ? "diff" : "union";
  const nameA = selectA.value.replace(".geojson", "");
  const nameB = selectB.value.replace(".geojson", "");
  const filename = `${opLabel}_${nameA}_${nameB}.geojson`;

  const blob = new Blob([JSON.stringify(resultGeoJSON, null, 2)], {
    type: "application/geo+json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
});
