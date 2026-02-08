import * as d3 from "d3";
import * as turf from "@turf/turf";

// ─────────────────────────────────────────────────────────────
// Available GeoJSON files
// ─────────────────────────────────────────────────────────────

const DATA_DIR = "/data/us-territorial-expansion";

const YEAR_FILES = [
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

// Individual states are loaded dynamically from 1959-final.geojson
let STATE_FILES = []; // populated on init

// Categories to exclude when "US territory only" is checked
const NON_US_CATEGORIES = new Set([
  "other_country",
  "none",
  "disputed",
  "seceded_state",
]);

// ─────────────────────────────────────────────────────────────
// DOM references
// ─────────────────────────────────────────────────────────────

const baseSelect = document.getElementById("base-file");
const baseInfo = document.getElementById("base-info");
const opsContainer = document.getElementById("operations");
const btnAddOp = document.getElementById("btn-add-op");
const btnCompute = document.getElementById("btn-compute");
const btnDownload = document.getElementById("btn-download");
const filterUS = document.getElementById("filter-us");
const statusEl = document.getElementById("status");
const mapTitle = document.getElementById("map-title");

let resultGeoJSON = null;

// ─────────────────────────────────────────────────────────────
// File select helpers
// ─────────────────────────────────────────────────────────────

function populateSelect(selectEl, selectedValue) {
  selectEl.innerHTML = "";

  const yearGroup = document.createElement("optgroup");
  yearGroup.label = "Year Maps";
  for (const f of YEAR_FILES) {
    yearGroup.appendChild(new Option(f.label, f.value));
  }
  selectEl.appendChild(yearGroup);

  if (STATE_FILES.length > 0) {
    const stateGroup = document.createElement("optgroup");
    stateGroup.label = "Individual States";
    for (const f of STATE_FILES) {
      stateGroup.appendChild(new Option(f.label, f.value));
    }
    selectEl.appendChild(stateGroup);
  }

  if (selectedValue) selectEl.value = selectedValue;
}

// ─────────────────────────────────────────────────────────────
// Operation row management
// ─────────────────────────────────────────────────────────────

let opCounter = 0;

function addOperationRow(defaultOp = "subtract", defaultFile = null) {
  const id = opCounter++;
  const row = document.createElement("div");
  row.className = "op-row";
  row.dataset.id = id;

  const toggle = document.createElement("button");
  toggle.className = `op-toggle ${defaultOp}`;
  toggle.textContent = defaultOp === "subtract" ? "\u2212" : "+";
  toggle.title =
    defaultOp === "subtract" ? "Subtract (difference)" : "Add (union)";
  toggle.addEventListener("click", () => {
    const isSub = toggle.classList.contains("subtract");
    toggle.classList.toggle("subtract", !isSub);
    toggle.classList.toggle("add", isSub);
    toggle.textContent = isSub ? "+" : "\u2212";
    toggle.title = isSub ? "Add (union)" : "Subtract (difference)";
  });

  const select = document.createElement("select");
  populateSelect(select, defaultFile);

  const removeBtn = document.createElement("button");
  removeBtn.className = "remove-btn";
  removeBtn.textContent = "\u00d7";
  removeBtn.title = "Remove this operation";
  removeBtn.addEventListener("click", () => row.remove());

  row.appendChild(toggle);
  row.appendChild(select);
  row.appendChild(removeBtn);
  opsContainer.appendChild(row);

  return row;
}

function getOperations() {
  const rows = opsContainer.querySelectorAll(".op-row");
  return Array.from(rows).map((row) => ({
    op: row.querySelector(".op-toggle").classList.contains("subtract")
      ? "subtract"
      : "add",
    file: row.querySelector("select").value,
  }));
}

btnAddOp.addEventListener("click", () => addOperationRow());

// ─────────────────────────────────────────────────────────────
// Map rendering
// ─────────────────────────────────────────────────────────────

const FILL_RESULT = "#4a90d9";
const STROKE = "#0a0a0a";

function createMap(containerId) {
  const container = document.getElementById(containerId);
  const rect = container.getBoundingClientRect();
  const width = rect.width || 800;
  const height = rect.height || 600;

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

function renderGeoJSON(mapObj, geojson) {
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
    .attr("fill", FILL_RESULT)
    .attr("stroke", STROKE)
    .attr("stroke-width", 0.5)
    .attr("opacity", 0.85);
}

// ─────────────────────────────────────────────────────────────
// Data loading & filtering
// ─────────────────────────────────────────────────────────────

const geoCache = new Map();

async function loadGeoJSON(filename) {
  if (geoCache.has(filename)) return structuredClone(geoCache.get(filename));

  // Individual state references are like "state:WA"
  if (filename.startsWith("state:")) {
    const stateCode = filename.slice(6);
    const final = await loadGeoJSON("1959-final.geojson");
    const feature = final.features.find(
      (f) => f.properties?.STATE === stateCode
    );
    if (!feature) throw new Error(`State ${stateCode} not found`);
    const fc = { type: "FeatureCollection", features: [feature] };
    geoCache.set(filename, fc);
    return structuredClone(fc);
  }

  const url = `${DATA_DIR}/${filename}`;
  const data = await d3.json(url);
  geoCache.set(filename, data);
  return structuredClone(data);
}

function filterFeatures(geojson, usOnly) {
  if (!usOnly) return geojson;
  return {
    type: "FeatureCollection",
    features: geojson.features.filter(
      (f) => !NON_US_CATEGORIES.has(f.properties?.CATEGORY)
    ),
  };
}

function describeGeoJSON(geojson) {
  const total = geojson.features.length;
  const categories = {};
  for (const f of geojson.features) {
    const cat =
      f.properties?.CATEGORY || f.properties?.era || f.properties?.id || "—";
    categories[cat] = (categories[cat] || 0) + 1;
  }
  const parts = Object.entries(categories)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  return `${total} feature${total !== 1 ? "s" : ""} (${parts})`;
}

// ─────────────────────────────────────────────────────────────
// Geometric operations
// ─────────────────────────────────────────────────────────────

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
      const result = turf.union(turf.featureCollection([merged, polys[i]]));
      if (result) merged = result;
    } catch {
      // Skip features that cause topology errors
    }
  }
  return merged;
}

function geometricDiff(featureA, featureB) {
  if (!featureA) return null;
  if (!featureB) return featureA;
  try {
    return turf.difference(turf.featureCollection([featureA, featureB]));
  } catch (err) {
    throw new Error(`Difference failed: ${err.message}`);
  }
}

function geometricUnion(featureA, featureB) {
  if (!featureA) return featureB;
  if (!featureB) return featureA;
  try {
    return turf.union(turf.featureCollection([featureA, featureB]));
  } catch (err) {
    throw new Error(`Union failed: ${err.message}`);
  }
}

function toFC(feature) {
  if (!feature) return { type: "FeatureCollection", features: [] };
  return { type: "FeatureCollection", features: [feature] };
}

// ─────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────

const mapMain = createMap("map-main");

async function init() {
  // Load individual states for the dropdowns
  try {
    const final = await loadGeoJSON("1959-final.geojson");
    STATE_FILES = final.features
      .filter((f) => f.properties?.STATE)
      .map((f) => ({
        value: `state:${f.properties.STATE}`,
        label: `${f.properties.LABEL} (${f.properties.STATE})`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  } catch {
    // Non-critical — just won't have individual state options
  }

  populateSelect(baseSelect, "1803-louisiana-purchase.geojson");
  updateBaseInfo();

  // Start with one subtract operation pre-filled
  addOperationRow("subtract", "1789-original-states.geojson");
}

async function updateBaseInfo() {
  try {
    const raw = await loadGeoJSON(baseSelect.value);
    const usOnly = filterUS.checked;
    const filtered = filterFeatures(raw, usOnly);
    baseInfo.textContent = describeGeoJSON(filtered);
    renderGeoJSON(mapMain, filtered);
    mapTitle.textContent = "Base";
  } catch (err) {
    baseInfo.textContent = `Error: ${err.message}`;
  }
}

baseSelect.addEventListener("change", updateBaseInfo);
filterUS.addEventListener("change", updateBaseInfo);

// ─────────────────────────────────────────────────────────────
// Compute
// ─────────────────────────────────────────────────────────────

btnCompute.addEventListener("click", async () => {
  btnCompute.disabled = true;
  btnDownload.disabled = true;
  resultGeoJSON = null;
  statusEl.textContent = "Computing...";
  statusEl.className = "";

  try {
    const usOnly = filterUS.checked;

    // Load and filter base
    const baseRaw = await loadGeoJSON(baseSelect.value);
    const baseFC = filterFeatures(baseRaw, usOnly);
    let current = dissolveToSingle(baseFC);

    const ops = getOperations();
    const opDescriptions = [baseSelect.options[baseSelect.selectedIndex].text];

    for (let i = 0; i < ops.length; i++) {
      const { op, file } = ops[i];
      const raw = await loadGeoJSON(file);
      const fc = filterFeatures(raw, usOnly);
      const operand = dissolveToSingle(fc);

      if (op === "subtract") {
        current = geometricDiff(current, operand);
        opDescriptions.push(
          `\u2212 ${file.startsWith("state:") ? file.slice(6) : file.replace(".geojson", "")}`
        );
      } else {
        current = geometricUnion(current, operand);
        opDescriptions.push(
          `+ ${file.startsWith("state:") ? file.slice(6) : file.replace(".geojson", "")}`
        );
      }
    }

    resultGeoJSON = toFC(current);

    if (current) {
      current.properties = { operation: opDescriptions.join(" ") };
    }

    renderGeoJSON(mapMain, resultGeoJSON);

    const featureCount = resultGeoJSON.features.length;
    if (featureCount === 0) {
      statusEl.innerHTML = `<span class="success">Computed — empty result (geometries may cancel out)</span>`;
      mapTitle.textContent = "Result (empty)";
    } else {
      const geomType = resultGeoJSON.features[0]?.geometry?.type || "unknown";
      const detail =
        geomType === "MultiPolygon"
          ? `${resultGeoJSON.features[0].geometry.coordinates.length} polygons`
          : geomType;
      statusEl.innerHTML = `<span class="success">Computed — ${detail}</span>`;
      mapTitle.textContent = `Result: ${opDescriptions.join(" ")}`;
    }
    btnDownload.disabled = false;
  } catch (err) {
    statusEl.innerHTML = `<span class="error">Error: ${err.message}</span>`;
    renderGeoJSON(mapMain, toFC(null));
    mapTitle.textContent = "Error";
  } finally {
    btnCompute.disabled = false;
  }
});

// ─────────────────────────────────────────────────────────────
// Download
// ─────────────────────────────────────────────────────────────

btnDownload.addEventListener("click", () => {
  if (!resultGeoJSON) return;

  const ops = getOperations();
  const baseName = baseSelect.value.startsWith("state:")
    ? baseSelect.value.slice(6)
    : baseSelect.value.replace(".geojson", "");
  const parts = [baseName];
  for (const { op, file } of ops) {
    const name = file.startsWith("state:")
      ? file.slice(6)
      : file.replace(".geojson", "");
    parts.push(`${op === "subtract" ? "minus" : "plus"}_${name}`);
  }
  const filename = parts.join("_") + ".geojson";

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

// ─────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────

init();
