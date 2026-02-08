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
const btnDownload = document.getElementById("btn-download");
const btnCopyDesc = document.getElementById("btn-copy-desc");
const filterUS = document.getElementById("filter-us");
const statusEl = document.getElementById("status");
const mapTitle = document.getElementById("map-title");
const previewStrip = document.getElementById("preview-strip");

let resultGeoJSON = null;
let lastDescription = "";

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

function getLabelForFile(filename) {
  const all = [...YEAR_FILES, ...STATE_FILES];
  const match = all.find((f) => f.value === filename);
  return match ? match.label : filename;
}

// ─────────────────────────────────────────────────────────────
// Shared projection for preview maps
// ─────────────────────────────────────────────────────────────

const PREVIEW_W = 220;
const PREVIEW_H = 150;

function makePreviewProjection() {
  return d3
    .geoConicEqualArea()
    .parallels([20, 50])
    .rotate([90, 0])
    .center([0, 35])
    .fitSize([PREVIEW_W, PREVIEW_H], {
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
}

const previewProjection = makePreviewProjection();
const previewPath = d3.geoPath().projection(previewProjection);

// ─────────────────────────────────────────────────────────────
// Preview strip — shows each selected file as a map tile
// ─────────────────────────────────────────────────────────────

async function updatePreviewStrip() {
  previewStrip.innerHTML = "";

  const usOnly = filterUS.checked;

  // Collect all file references: base + operations
  const items = [{ label: getLabelForFile(baseSelect.value), file: baseSelect.value, role: "base" }];
  const ops = getOperations();
  for (const { op, file } of ops) {
    const symbol = op === "subtract" ? "\u2212" : "+";
    items.push({ label: `${symbol} ${getLabelForFile(file)}`, file, role: op });
  }

  for (const item of items) {
    const tile = document.createElement("div");
    tile.className = `preview-tile ${item.role}`;

    const titleEl = document.createElement("div");
    titleEl.className = "preview-tile-title";
    titleEl.textContent = item.label;
    tile.appendChild(titleEl);

    const mapDiv = document.createElement("div");
    mapDiv.className = "preview-tile-map";
    tile.appendChild(mapDiv);

    tile.style.cursor = "pointer";
    tile.addEventListener("click", () => {
      const svg = tile.querySelector("svg");
      if (svg) openLightbox(svg);
    });

    previewStrip.appendChild(tile);

    // Render async
    try {
      const raw = await loadGeoJSON(item.file);
      const fc = filterFeatures(raw, usOnly);

      const svg = d3
        .select(mapDiv)
        .append("svg")
        .attr("viewBox", `0 0 ${PREVIEW_W} ${PREVIEW_H}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

      if (fc.features.length > 0) {
        svg
          .selectAll("path")
          .data(fc.features)
          .join("path")
          .attr("d", previewPath)
          .attr("fill", item.role === "subtract" ? "#c45555" : item.role === "add" ? "#2a9d8f" : "#5a8abd")
          .attr("stroke", "#0a0a0a")
          .attr("stroke-width", 0.4)
          .attr("opacity", 0.85);
      }
    } catch {
      // silently fail for previews
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Operation row management
// ─────────────────────────────────────────────────────────────

let opCounter = 0;

function updateMoveButtons() {
  const rows = opsContainer.querySelectorAll(".op-row");
  rows.forEach((row, i) => {
    const up = row.querySelector(".move-up");
    const down = row.querySelector(".move-down");
    if (up) up.disabled = i === 0;
    if (down) down.disabled = i === rows.length - 1;
  });
}

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
    scheduleCompute();
  });

  const select = document.createElement("select");
  populateSelect(select, defaultFile);
  select.addEventListener("change", () => scheduleCompute());

  // Move & remove buttons
  const actions = document.createElement("div");
  actions.className = "row-actions";

  const moveUp = document.createElement("button");
  moveUp.className = "move-btn move-up";
  moveUp.textContent = "\u25b2";
  moveUp.title = "Move up";
  moveUp.addEventListener("click", () => {
    const prev = row.previousElementSibling;
    if (prev) {
      opsContainer.insertBefore(row, prev);
      updateMoveButtons();
      scheduleCompute();
    }
  });

  const moveDown = document.createElement("button");
  moveDown.className = "move-btn move-down";
  moveDown.textContent = "\u25bc";
  moveDown.title = "Move down";
  moveDown.addEventListener("click", () => {
    const next = row.nextElementSibling;
    if (next) {
      opsContainer.insertBefore(next, row);
      updateMoveButtons();
      scheduleCompute();
    }
  });

  const removeBtn = document.createElement("button");
  removeBtn.className = "remove-btn";
  removeBtn.textContent = "\u00d7";
  removeBtn.title = "Remove this operation";
  removeBtn.addEventListener("click", () => {
    row.remove();
    updateMoveButtons();
    scheduleCompute();
  });

  actions.appendChild(moveUp);
  actions.appendChild(moveDown);
  actions.appendChild(removeBtn);

  row.appendChild(toggle);
  row.appendChild(select);
  row.appendChild(actions);
  opsContainer.appendChild(row);

  updateMoveButtons();
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

btnAddOp.addEventListener("click", () => {
  addOperationRow();
  scheduleCompute();
});

// ─────────────────────────────────────────────────────────────
// URL hash state persistence
// ─────────────────────────────────────────────────────────────

function encodeState() {
  const state = {
    base: baseSelect.value,
    usOnly: filterUS.checked,
    ops: getOperations().map(
      (o) => `${o.op === "subtract" ? "-" : "+"}${o.file}`
    ),
  };
  return "#" + encodeURIComponent(JSON.stringify(state));
}

function decodeHash() {
  const hash = location.hash.slice(1);
  if (!hash) return null;
  try {
    return JSON.parse(decodeURIComponent(hash));
  } catch {
    return null;
  }
}

function pushState() {
  history.replaceState(null, "", encodeState());
}

const btnShare = document.getElementById("btn-share");
btnShare.addEventListener("click", () => {
  pushState();
  const url = location.href;
  navigator.clipboard.writeText(url).then(
    () => {
      btnShare.textContent = "Copied!";
      setTimeout(() => {
        btnShare.textContent = "Copy Share URL";
      }, 1500);
    },
    () => {
      prompt("Copy this URL:", url);
    }
  );
});

// ─────────────────────────────────────────────────────────────
// Copy description
// ─────────────────────────────────────────────────────────────

btnCopyDesc.addEventListener("click", () => {
  if (!lastDescription) return;
  navigator.clipboard.writeText(lastDescription).then(
    () => {
      btnCopyDesc.textContent = "Copied!";
      setTimeout(() => {
        btnCopyDesc.textContent = "Copy Description";
      }, 1500);
    },
    () => {
      prompt("Copy this description:", lastDescription);
    }
  );
});

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

function renderGeoJSON(mapObj, geojson, { preProject = false } = {}) {
  const { svg, path, projection, width, height } = mapObj;
  svg.selectAll("*").remove();

  if (!geojson || !geojson.features || geojson.features.length === 0) {
    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#555")
      .attr("font-size", "14px")
      .text("No geometry");
    return;
  }

  // For Turf.js output: pre-project coordinates and render with a null
  // (planar) path generator. This avoids D3's spherical winding-order
  // interpretation which renders RFC 7946 polygons as their complement.
  let features = geojson.features;
  let pathGen = path;

  if (preProject) {
    features = features.map((f) => preProjectFeature(f, projection));
    pathGen = d3.geoPath(); // null projection → planar rendering
  }

  svg
    .selectAll("path")
    .data(features)
    .join("path")
    .attr("d", pathGen)
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
      f.properties?.CATEGORY || f.properties?.era || f.properties?.id || "\u2014";
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

/**
 * Dissolve all polygon features in a FeatureCollection into a single
 * geometry. Rewinds each feature to RFC 7946 winding order first —
 * the source data uses D3's clockwise convention which Turf.js
 * misinterprets as the polygon's complement.
 */
function dissolveToSingle(fc) {
  const polys = fc.features.filter(
    (f) =>
      f.geometry &&
      (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")
  );

  if (polys.length === 0) return null;

  // Rewind to RFC 7946 (counter-clockwise exterior rings)
  const rewound = polys.map((f) => turf.rewind(f, { reverse: false }));

  if (rewound.length === 1) return rewound[0];

  let merged = rewound[0];
  for (let i = 1; i < rewound.length; i++) {
    try {
      const result = turf.union(turf.featureCollection([merged, rewound[i]]));
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

/**
 * Pre-project a GeoJSON feature's coordinates through a D3 projection,
 * returning a new feature with [x, y] pixel coordinates. This bypasses
 * D3's spherical winding-order interpretation which conflicts with
 * Turf.js RFC 7946 output.
 */
function preProjectFeature(feature, projection) {
  if (!feature || !feature.geometry) return feature;
  const geom = feature.geometry;

  function projectRing(ring) {
    return ring.map((coord) => projection(coord) || [0, 0]);
  }

  let newCoords;
  if (geom.type === "Polygon") {
    newCoords = geom.coordinates.map(projectRing);
  } else if (geom.type === "MultiPolygon") {
    newCoords = geom.coordinates.map((poly) => poly.map(projectRing));
  } else {
    return feature;
  }

  return {
    type: "Feature",
    properties: feature.properties,
    geometry: { type: geom.type, coordinates: newCoords },
  };
}

// ─────────────────────────────────────────────────────────────
// Human-readable description
// ─────────────────────────────────────────────────────────────

function buildDescription() {
  const baseLabel = getLabelForFile(baseSelect.value);
  const ops = getOperations();
  if (ops.length === 0) return baseLabel;

  const parts = [baseLabel];
  for (const { op, file } of ops) {
    const word = op === "subtract" ? "MINUS" : "PLUS";
    parts.push(`${word} ${getLabelForFile(file)}`);
  }
  return parts.join("\n");
}

// ─────────────────────────────────────────────────────────────
// Auto-compute (debounced)
// ─────────────────────────────────────────────────────────────

const mapMain = createMap("map-main");
let computeTimer = null;
let computeGeneration = 0;

function scheduleCompute() {
  clearTimeout(computeTimer);
  computeTimer = setTimeout(runCompute, 150);
}

async function runCompute() {
  const generation = ++computeGeneration;
  btnDownload.disabled = true;
  resultGeoJSON = null;
  statusEl.textContent = "Computing\u2026";
  statusEl.className = "";

  // Update description and previews immediately
  lastDescription = buildDescription();
  updatePreviewStrip();

  try {
    const usOnly = filterUS.checked;

    // Load and filter base
    const baseRaw = await loadGeoJSON(baseSelect.value);
    const baseFC = filterFeatures(baseRaw, usOnly);

    // Update base info
    baseInfo.textContent = describeGeoJSON(baseFC);

    const ops = getOperations();

    // No operations — just show the base
    if (ops.length === 0) {
      if (generation !== computeGeneration) return;
      resultGeoJSON = baseFC;
      renderGeoJSON(mapMain, baseFC);
      const label =
        baseSelect.options[baseSelect.selectedIndex]?.text || "Base";
      mapTitle.textContent = label;
      statusEl.innerHTML = `<span class="success">${label} \u2014 ${baseFC.features.length} feature${baseFC.features.length !== 1 ? "s" : ""}</span>`;
      btnDownload.disabled = false;
      pushState();
      return;
    }

    // Run chained operations
    let current = dissolveToSingle(baseFC);
    const opDescriptions = [
      baseSelect.options[baseSelect.selectedIndex]?.text || "Base",
    ];

    for (let i = 0; i < ops.length; i++) {
      const { op, file } = ops[i];
      const raw = await loadGeoJSON(file);
      const fc = filterFeatures(raw, usOnly);
      const operand = dissolveToSingle(fc);

      const shortName = file.startsWith("state:")
        ? file.slice(6)
        : file.replace(".geojson", "");

      if (op === "subtract") {
        current = geometricDiff(current, operand);
        opDescriptions.push(`\u2212 ${shortName}`);
      } else {
        current = geometricUnion(current, operand);
        opDescriptions.push(`+ ${shortName}`);
      }
    }

    // Stale check — a newer compute may have started
    if (generation !== computeGeneration) return;

    if (current) {
      current.properties = { operation: opDescriptions.join(" ") };
    }

    resultGeoJSON = toFC(current);

    // Pre-project Turf output to bypass D3's spherical winding interpretation
    renderGeoJSON(mapMain, resultGeoJSON, { preProject: true });

    const featureCount = resultGeoJSON.features.length;
    const desc = opDescriptions.join(" ");
    if (featureCount === 0) {
      statusEl.innerHTML = `<span class="success">${desc} \u2014 empty result</span>`;
      mapTitle.textContent = desc;
    } else {
      const geomType = resultGeoJSON.features[0]?.geometry?.type || "unknown";
      const detail =
        geomType === "MultiPolygon"
          ? `${resultGeoJSON.features[0].geometry.coordinates.length} polygons`
          : geomType;
      statusEl.innerHTML = `<span class="success">${desc} \u2014 ${detail}</span>`;
      mapTitle.textContent = desc;
    }
    btnDownload.disabled = false;
    pushState();
  } catch (err) {
    if (generation !== computeGeneration) return;
    statusEl.innerHTML = `<span class="error">Error: ${err.message}</span>`;
    renderGeoJSON(mapMain, toFC(null));
    mapTitle.textContent = "Error";
  }
}

// ─────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────

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

  // Restore from URL hash or use defaults
  const saved = decodeHash();
  if (saved) {
    populateSelect(baseSelect, saved.base);
    filterUS.checked = saved.usOnly !== false;
    for (const entry of saved.ops || []) {
      const op = entry.startsWith("+") ? "add" : "subtract";
      const file = entry.slice(1);
      addOperationRow(op, file);
    }
  } else {
    populateSelect(baseSelect, "1803-louisiana-purchase.geojson");
    addOperationRow("subtract", "1789-original-states.geojson");
  }

  // Wire up base select & filter
  baseSelect.addEventListener("change", () => scheduleCompute());
  filterUS.addEventListener("change", () => scheduleCompute());

  // Initial compute
  scheduleCompute();
}

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
// Lightbox — click any map to view fullscreen
// ─────────────────────────────────────────────────────────────

const lightbox = document.createElement("div");
lightbox.className = "lightbox-overlay";
lightbox.innerHTML = '<div class="lightbox-content"></div>';
document.body.appendChild(lightbox);

function closeLightbox() {
  lightbox.classList.remove("active");
  lightbox.querySelector(".lightbox-content").innerHTML = "";
}

lightbox.addEventListener("click", closeLightbox);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLightbox();
});

function openLightbox(svgElement) {
  const content = lightbox.querySelector(".lightbox-content");
  const clone = svgElement.cloneNode(true);
  content.innerHTML = "";
  content.appendChild(clone);
  lightbox.classList.add("active");
}

// Main map click
document.getElementById("map-main").style.cursor = "pointer";
document.getElementById("map-main").addEventListener("click", () => {
  const svg = document.querySelector("#map-main svg");
  if (svg) openLightbox(svg);
});

// ─────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────

init();
