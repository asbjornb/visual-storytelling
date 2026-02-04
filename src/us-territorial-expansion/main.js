import * as d3 from "d3";
import * as topojson from "topojson-client";

// ─────────────────────────────────────────────────────────────
// Colors
// ─────────────────────────────────────────────────────────────

// Established US territory color - cool blue-gray
const ESTABLISHED_COLOR = "#b8c4d0";

// Non-US context countries - dim warm gray
const CONTEXT_COLOR = "#e8e4dc";

// Per-acquisition "candy" colors - highlight color for current step
const ERA_COLORS = {
  original: "#e63946",   // Red
  louisiana: "#f4a261",  // Orange
  redriver: "#e9c46a",   // Yellow
  florida: "#2a9d8f",    // Teal
  texas: "#264653",      // Dark blue
  oregon: "#8338ec",     // Purple
  mexican: "#ff006e",    // Pink
  gadsden: "#fb5607",    // Bright orange
  alaska: "#3a86ff",     // Blue
  hawaii: "#06d6a0",     // Green
  pacific: "#06d6a0",    // Green (same as Hawaii)
  modern: ESTABLISHED_COLOR,
};

// Inlay configuration
const INLAY_CONFIG = {
  pacific: {
    label: "Pacific Territories",
    // Bounds to show Hawaii and surrounding area
    center: [-157, 20],  // Center on Hawaii
    scale: 2000,
  },
  caribbean: {
    label: "Caribbean Territories",
    center: [-66, 18],  // Center on Puerto Rico
    scale: 4000,
  },
};

// Ocean/background - handled by CSS

// ─────────────────────────────────────────────────────────────
// Map step definitions
// ─────────────────────────────────────────────────────────────

const MAP_STEPS = [
  { year: "1783", file: "1789-original-states.geojson", era: "original" },
  { year: "1803", file: "1803-louisiana-purchase.geojson", era: "louisiana" },
  { year: "1818", file: "1818-red-river-basin.geojson", era: "redriver" },
  { year: "1819", file: "1819-florida.geojson", era: "florida" },
  { year: "1845", file: "1845-texas.geojson", era: "texas" },
  { year: "1846", file: "1846-oregon.geojson", era: "oregon" },
  { year: "1848", file: "1848-mexican-cession.geojson", era: "mexican" },
  { year: "1853", file: "1853-gadsden.geojson", era: "gadsden" },
  { year: "1867", file: "1867-alaska.geojson", era: "alaska" },
  { year: "1898", file: "1898-spanish-american-war.geojson", era: "hawaii" },
  { year: "1899–1959", file: "1900-samoa.geojson", era: "pacific" },
  { year: "2025–26", file: "1959-final.geojson", era: "modern" },
];

// Modern expansion rhetoric targets - coordinates for question mark labels
// These appear on the final "Modern Rhetoric" slide (step 11)
const RHETORIC_TARGETS = [
  { name: "Greenland", lat: 72, lon: -40 },
  { name: "Canada", lat: 56, lon: -106 },
  { name: "Panama", lat: 9, lon: -80 },
];

// Context country IDs from Natural Earth (for filtering TopoJSON)
const CONTEXT_COUNTRY_IDS = [
  // North America
  124, // Canada
  484, // Mexico
  304, // Greenland
  // Central America
  84,  // Belize
  320, // Guatemala
  340, // Honduras
  222, // El Salvador
  558, // Nicaragua
  188, // Costa Rica
  591, // Panama
  // Caribbean
  44,  // Bahamas
  192, // Cuba
  388, // Jamaica
  332, // Haiti
  214, // Dominican Republic
];

const CATEGORY_CLASS = {
  state: "map-state",
  territory: "map-territory",
  other_country: "map-other",
  disputed: "map-disputed",
  none: "map-none",
  seceded_state: "map-seceded",
};

const DESKTOP_BREAKPOINT = 900;

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

let geoDataByStep = [];
let acquisitionsData = null;
let contextCountries = null;
let overseasTerritories = null;
let currentPage = 0;
let totalPages = 0;
let pageElements = [];
let touchStartX = 0;
let touchStartY = 0;
let currentMapStep = -1;

// Inlay projections and paths
const inlayProjections = {};
const inlayPaths = {};

// ─────────────────────────────────────────────────────────────
// D3 setup - North America projection
// ─────────────────────────────────────────────────────────────

// Use Conic Equal Area projection that can show North America,
// Central America, Caribbean, and Greenland
const projection = d3.geoConicEqualArea()
  .parallels([20, 50])      // Wider parallels for extended latitude range
  .rotate([90, 0])          // Center longitude (shifted east to include Caribbean)
  .center([0, 35]);         // Center latitude (shifted south for Central America)

const path = d3.geoPath().projection(projection);

// Store base dimensions for viewBox
let baseWidth = 0;
let baseHeight = 0;

// ─────────────────────────────────────────────────────────────
// Responsive helpers
// ─────────────────────────────────────────────────────────────

function isDesktop() {
  return window.innerWidth >= DESKTOP_BREAKPOINT;
}

function getNavigablePages() {
  if (isDesktop()) {
    return pageElements.filter((el) => {
      const type = el.dataset.type;
      return type === "intro" || type === "story";
    });
  }
  return pageElements;
}

function getNavigableIndices() {
  const navigable = getNavigablePages();
  return navigable.map((el) => pageElements.indexOf(el));
}

// ─────────────────────────────────────────────────────────────
// Data loading
// ─────────────────────────────────────────────────────────────

async function loadAllGeoJSON() {
  const promises = MAP_STEPS.map((s) =>
    d3.json(`/data/us-territorial-expansion/${s.file}`).then((geojson) => {
      const byCategory = {};
      for (const feature of geojson.features) {
        const cat = feature.properties.CATEGORY || "none";
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(feature);
      }
      return byCategory;
    })
  );
  return Promise.all(promises);
}

async function loadContextCountries() {
  const topo = await d3.json("/data/us-territorial-expansion/world-countries-50m.json");

  // Convert TopoJSON to GeoJSON and filter to just the countries we want
  const allCountries = topojson.feature(topo, topo.objects.countries);

  const filtered = {
    type: "FeatureCollection",
    features: allCountries.features.filter(f =>
      CONTEXT_COUNTRY_IDS.includes(parseInt(f.id))
    )
  };

  return filtered;
}

async function loadAcquisitions() {
  return d3.json("/data/us-territorial-expansion/acquisitions.geojson");
}

async function loadOverseasTerritories() {
  return d3.json("/data/us-territorial-expansion/overseas-territories.geojson");
}

// ─────────────────────────────────────────────────────────────
// Map rendering
// ─────────────────────────────────────────────────────────────

function fitProjection(svg, geoData) {
  const width = window.innerWidth;
  const height = window.innerHeight;

  baseWidth = width;
  baseHeight = height;

  // Use the final US territory data plus context countries for bounds
  const finalData = geoData[geoData.length - 1];
  const usFeatures = Object.values(finalData).flat();

  // Combine US features with context countries for fitting
  const allFeatures = contextCountries
    ? [...usFeatures, ...contextCountries.features]
    : usFeatures;

  const collection = { type: "FeatureCollection", features: allFeatures };

  // On desktop, offset map to the right to leave room for side panel
  if (isDesktop()) {
    const panelWidth = 480;
    const mapWidth = width - panelWidth;
    projection.fitSize([mapWidth, height * 0.95], collection);
    const [tx, ty] = projection.translate();
    projection.translate([tx + panelWidth, ty]);
  } else {
    projection.fitSize([width, height * 0.95], collection);
  }

  path.projection(projection);

  svg.attr("viewBox", `0 0 ${width} ${height}`);
  svg.attr("preserveAspectRatio", "xMidYMid meet");
}

function initializeMap(svg) {
  // Clear any existing content
  svg.selectAll("*").remove();

  // Create layer groups in correct z-order (bottom to top)
  svg.append("g").attr("class", "layer-context");
  svg.append("g").attr("class", "layer-acquisitions");
  svg.append("g").attr("class", "layer-labels");

  // Render context countries (static, never changes)
  if (contextCountries) {
    svg.select(".layer-context")
      .selectAll(".context-country")
      .data(contextCountries.features)
      .enter()
      .append("path")
      .attr("class", "context-country")
      .attr("d", path)
      .attr("fill", CONTEXT_COLOR)
      .attr("stroke", "#f8f5f0")
      .attr("stroke-width", 0.5);
  }

  // Render all acquisition polygons upfront (hidden until their step)
  if (acquisitionsData) {
    svg.select(".layer-acquisitions")
      .selectAll(".acquisition")
      .data(acquisitionsData.features, d => d.properties.era)
      .enter()
      .append("path")
      .attr("class", d => `acquisition acquisition-${d.properties.era}`)
      .attr("d", path)
      .attr("fill", ESTABLISHED_COLOR)
      .attr("stroke", "#f8f5f0")
      .attr("stroke-width", 0.5)
      .attr("opacity", 0);
  }

  // Render question mark labels for modern expansion rhetoric targets
  const labelsLayer = svg.select(".layer-labels");
  RHETORIC_TARGETS.forEach((target) => {
    const [x, y] = projection([target.lon, target.lat]);
    labelsLayer.append("text")
      .attr("class", `rhetoric-label rhetoric-label-${target.name.toLowerCase()}`)
      .attr("x", x)
      .attr("y", y)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", "48px")
      .attr("font-weight", "bold")
      .attr("fill", "#e63946")
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .attr("paint-order", "stroke")
      .attr("opacity", 0)
      .text("?");
  });
}

function renderMapStep(svg, geoData, stepIndex, options = {}) {
  const { opacity = 1, duration = 800 } = options;

  if (!acquisitionsData) return;

  const acqLayer = svg.select(".layer-acquisitions");

  // Animate each acquisition based on whether it's past, current, or future
  acquisitionsData.features.forEach((feature) => {
    const featureStep = feature.properties.step;
    const era = feature.properties.era;
    const sel = acqLayer.select(`.acquisition-${era}`);

    if (sel.empty()) return;

    // Interrupt any existing transition before starting a new one
    sel.interrupt();

    if (featureStep > stepIndex) {
      // Future acquisition - show as context (same color as Canada/Mexico)
      sel.transition()
        .duration(duration / 2)
        .attr("opacity", opacity)
        .attr("fill", CONTEXT_COLOR);
    } else if (featureStep === stepIndex) {
      // Current step - show in candy color
      sel.transition()
        .duration(duration)
        .attr("opacity", opacity)
        .attr("fill", ERA_COLORS[era] || ESTABLISHED_COLOR);
    } else {
      // Past acquisition - show in established color
      sel.transition()
        .duration(duration)
        .attr("opacity", opacity)
        .attr("fill", ESTABLISHED_COLOR);
    }
  });

  // Show/hide question mark labels for modern expansion rhetoric
  // Only visible on the final "modern" step (step 11)
  const MODERN_STEP = MAP_STEPS.length - 1;
  const labelsLayer = svg.select(".layer-labels");
  labelsLayer.selectAll(".rhetoric-label")
    .interrupt()
    .transition()
    .duration(duration)
    .attr("opacity", stepIndex === MODERN_STEP ? opacity : 0);

  // Update inlay maps for overseas territories
  updateInlaysForStep(stepIndex, options);

  currentMapStep = stepIndex;
}

function updateMapOpacity(svg, opacity, duration = 600) {
  // Update opacity of all acquisitions (all are now visible)
  if (acquisitionsData) {
    acquisitionsData.features.forEach((feature) => {
      const era = feature.properties.era;
      const sel = svg.select(".layer-acquisitions").select(`.acquisition-${era}`);

      if (!sel.empty()) {
        sel.transition()
          .duration(duration)
          .attr("opacity", opacity);
      }
    });
  }

  svg.select(".layer-context")
    .selectAll("path")
    .transition()
    .duration(duration)
    .attr("opacity", opacity);

  // Update question mark labels opacity (if visible on modern step)
  const MODERN_STEP = MAP_STEPS.length - 1;
  if (currentMapStep === MODERN_STEP) {
    svg.select(".layer-labels")
      .selectAll(".rhetoric-label")
      .transition()
      .duration(duration)
      .attr("opacity", opacity);
  }

  // Update inlay opacity
  updateInlaysOpacity(opacity, duration);
}

// ─────────────────────────────────────────────────────────────
// Inlay maps for overseas territories
// ─────────────────────────────────────────────────────────────

function createInlayContainers() {
  const mapLayer = document.getElementById("map-layer");

  // Create Pacific inlay (left side) - shows Hawaii
  const pacificInlay = document.createElement("div");
  pacificInlay.id = "inlay-pacific";
  pacificInlay.className = "territory-inlay territory-inlay--pacific";
  pacificInlay.innerHTML = `
    <div class="inlay-label">Hawaii</div>
    <svg id="inlay-pacific-svg"></svg>
  `;
  mapLayer.appendChild(pacificInlay);

  // Create Caribbean inlay (right side) - shows Puerto Rico and Virgin Islands
  const caribbeanInlay = document.createElement("div");
  caribbeanInlay.id = "inlay-caribbean";
  caribbeanInlay.className = "territory-inlay territory-inlay--caribbean";
  caribbeanInlay.innerHTML = `
    <div class="inlay-label">Caribbean</div>
    <svg id="inlay-caribbean-svg"></svg>
  `;
  mapLayer.appendChild(caribbeanInlay);
}

function initializeInlayProjections() {
  const inlayWidth = 140;
  const inlayHeight = 100;

  // Pacific inlay projection (centered on Hawaii)
  // Note: Shows only Hawaii; other Pacific territories (Guam, CNMI, American Samoa)
  // are too geographically distant to show in the same view
  inlayProjections.pacific = d3.geoMercator()
    .center([-157.5, 20.5])
    .scale(1200)
    .translate([inlayWidth / 2, inlayHeight / 2]);
  inlayPaths.pacific = d3.geoPath().projection(inlayProjections.pacific);

  // Caribbean inlay projection (centered between Puerto Rico and Virgin Islands)
  inlayProjections.caribbean = d3.geoMercator()
    .center([-65.8, 18.15])
    .scale(5000)
    .translate([inlayWidth / 2, inlayHeight / 2]);
  inlayPaths.caribbean = d3.geoPath().projection(inlayProjections.caribbean);
}

function initializeInlays() {
  if (!overseasTerritories) return;

  createInlayContainers();
  initializeInlayProjections();

  const inlayWidth = 140;
  const inlayHeight = 100;

  // Initialize Pacific inlay
  const pacificSvg = d3.select("#inlay-pacific-svg")
    .attr("viewBox", `0 0 ${inlayWidth} ${inlayHeight}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  // Add background
  pacificSvg.append("rect")
    .attr("class", "inlay-ocean")
    .attr("width", inlayWidth)
    .attr("height", inlayHeight);

  // Add territory group
  pacificSvg.append("g").attr("class", "inlay-territories");

  // Initialize Caribbean inlay
  const caribbeanSvg = d3.select("#inlay-caribbean-svg")
    .attr("viewBox", `0 0 ${inlayWidth} ${inlayHeight}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  // Add background
  caribbeanSvg.append("rect")
    .attr("class", "inlay-ocean")
    .attr("width", inlayWidth)
    .attr("height", inlayHeight);

  // Add territory group
  caribbeanSvg.append("g").attr("class", "inlay-territories");

  // Render territories in each inlay
  renderInlayTerritories();
}

function renderInlayTerritories() {
  if (!overseasTerritories) return;

  // Pacific inlay shows only Hawaii (other Pacific territories are too far away geographically)
  // Guam, CNMI, and American Samoa span from -170° to +145° longitude - impossible to show together
  const pacificTerritories = overseasTerritories.features.filter(
    f => f.properties.region === "pacific" && f.properties.name === "Hawaii"
  );

  // Caribbean inlay shows Puerto Rico and Virgin Islands
  const caribbeanTerritories = overseasTerritories.features.filter(
    f => f.properties.region === "caribbean"
  );

  // Render Pacific territories (Hawaii)
  d3.select("#inlay-pacific-svg .inlay-territories")
    .selectAll(".inlay-territory")
    .data(pacificTerritories, d => d.properties.name)
    .enter()
    .append("path")
    .attr("class", d => `inlay-territory inlay-territory-${d.properties.name.toLowerCase().replace(/\s+/g, "-")}`)
    .attr("d", inlayPaths.pacific)
    .attr("fill", CONTEXT_COLOR)
    .attr("stroke", "#fff")
    .attr("stroke-width", 0.5)
    .attr("opacity", 0)
    .attr("data-step", d => d.properties.step)
    .attr("data-era", d => d.properties.era);

  // Render Caribbean territories (Puerto Rico, Virgin Islands)
  d3.select("#inlay-caribbean-svg .inlay-territories")
    .selectAll(".inlay-territory")
    .data(caribbeanTerritories, d => d.properties.name)
    .enter()
    .append("path")
    .attr("class", d => `inlay-territory inlay-territory-${d.properties.name.toLowerCase().replace(/\s+/g, "-")}`)
    .attr("d", inlayPaths.caribbean)
    .attr("fill", CONTEXT_COLOR)
    .attr("stroke", "#fff")
    .attr("stroke-width", 0.5)
    .attr("opacity", 0)
    .attr("data-step", d => d.properties.step)
    .attr("data-era", d => d.properties.era);
}

function updateInlaysForStep(stepIndex, options = {}) {
  const { opacity = 1, duration = 800 } = options;

  // Determine if inlays should be visible (step 9+ for overseas territories)
  const OVERSEAS_START_STEP = 9; // Hawaii/Spanish-American War
  const shouldShowInlays = stepIndex >= OVERSEAS_START_STEP;

  // Fade in/out inlay containers
  d3.selectAll(".territory-inlay")
    .transition()
    .duration(duration)
    .style("opacity", shouldShowInlays ? 1 : 0)
    .style("pointer-events", shouldShowInlays ? "auto" : "none");

  if (!shouldShowInlays) return;

  // Update individual territories based on their step
  d3.selectAll(".inlay-territory").each(function() {
    const el = d3.select(this);
    const featureStep = parseInt(el.attr("data-step"));
    const era = el.attr("data-era");

    el.interrupt();

    if (featureStep > stepIndex) {
      // Future - show as context color (dimmed)
      el.transition()
        .duration(duration / 2)
        .attr("opacity", opacity)
        .attr("fill", CONTEXT_COLOR);
    } else if (featureStep === stepIndex) {
      // Current step - show in candy color
      el.transition()
        .duration(duration)
        .attr("opacity", opacity)
        .attr("fill", ERA_COLORS[era] || ESTABLISHED_COLOR);
    } else {
      // Past - show in established color
      el.transition()
        .duration(duration)
        .attr("opacity", opacity)
        .attr("fill", ESTABLISHED_COLOR);
    }
  });
}

function updateInlaysOpacity(opacity, duration = 600) {
  // Only update if inlays are visible
  const OVERSEAS_START_STEP = 9;
  if (currentMapStep < OVERSEAS_START_STEP) return;

  d3.selectAll(".inlay-territory")
    .transition()
    .duration(duration)
    .attr("opacity", opacity);
}

// ─────────────────────────────────────────────────────────────
// Page navigation
// ─────────────────────────────────────────────────────────────

function getPageInfo(pageEl) {
  return {
    type: pageEl.dataset.type,
    step: pageEl.dataset.step !== undefined ? parseInt(pageEl.dataset.step) : null,
  };
}

function goToPage(newPage) {
  newPage = Math.max(0, Math.min(newPage, totalPages - 1));
  if (newPage === currentPage) return;

  // Close notes modal if open
  if (window.closeNotesModal) window.closeNotesModal();

  const svg = d3.select("#map");
  const mapLayer = document.getElementById("map-layer");
  const desktop = isDesktop();

  pageElements.forEach((el, i) => {
    el.classList.toggle("is-active", i === newPage);
  });

  const pageEl = pageElements[newPage];
  const { type, step } = getPageInfo(pageEl);

  if (type === "intro") {
    mapLayer.classList.remove("is-thumbnail");
    // Keep current map step, just dim it
    updateMapOpacity(svg, 0.15, 600);
  } else if (type === "transition") {
    mapLayer.classList.remove("is-thumbnail");
    if (step !== currentMapStep) {
      renderMapStep(svg, geoDataByStep, step, { opacity: 1, duration: 800 });
    } else {
      updateMapOpacity(svg, 1, 600);
    }
  } else if (type === "story") {
    if (desktop) {
      mapLayer.classList.remove("is-thumbnail");
    } else {
      mapLayer.classList.add("is-thumbnail");
    }
    if (step !== currentMapStep) {
      renderMapStep(svg, geoDataByStep, step, { opacity: 1, duration: desktop ? 800 : 400 });
    } else {
      updateMapOpacity(svg, 1, desktop ? 800 : 400);
    }
  }

  currentPage = newPage;
  updateTimeline();
  updateEdgeNav();
}

function nextPage() {
  const indices = getNavigableIndices();
  const currentIdx = indices.indexOf(currentPage);
  if (currentIdx < indices.length - 1) {
    goToPage(indices[currentIdx + 1]);
  }
}

function prevPage() {
  const indices = getNavigableIndices();
  const currentIdx = indices.indexOf(currentPage);
  if (currentIdx > 0) {
    goToPage(indices[currentIdx - 1]);
  }
}

// ─────────────────────────────────────────────────────────────
// Edge navigation arrows
// ─────────────────────────────────────────────────────────────

function setupEdgeNav() {
  const prevBtn = document.getElementById("edge-prev");
  const nextBtn = document.getElementById("edge-next");

  prevBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    prevPage();
  });

  nextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    nextPage();
  });

  updateEdgeNav();
}

function updateEdgeNav() {
  const prevBtn = document.getElementById("edge-prev");
  const nextBtn = document.getElementById("edge-next");
  const indices = getNavigableIndices();
  const currentIdx = indices.indexOf(currentPage);

  prevBtn.classList.toggle("is-hidden", currentIdx <= 0);
  nextBtn.classList.toggle("is-hidden", currentIdx >= indices.length - 1);
}

// ─────────────────────────────────────────────────────────────
// Timeline navigation
// ─────────────────────────────────────────────────────────────

function buildTimeline() {
  const timeline = document.getElementById("timeline");
  timeline.innerHTML = "";

  const desktop = isDesktop();

  pageElements.forEach((pageEl, i) => {
    const { type } = getPageInfo(pageEl);

    if (desktop && type === "transition") {
      return;
    }

    const bar = document.createElement("button");
    bar.className = "timeline-bar";
    bar.dataset.page = i;

    if (type === "intro") {
      bar.classList.add("timeline-bar--intro");
    }
    if (!desktop && (type === "transition" || type === "intro")) {
      bar.classList.add("timeline-bar--tall");
    }

    bar.addEventListener("click", () => goToPage(i));
    timeline.appendChild(bar);
  });

  updateTimeline();
}

function updateTimeline() {
  const bars = document.querySelectorAll(".timeline-bar");
  bars.forEach((bar) => {
    const pageIdx = parseInt(bar.dataset.page);
    bar.classList.toggle("is-active", pageIdx === currentPage);
    bar.setAttribute("aria-current", pageIdx === currentPage ? "page" : "false");
  });
}

// ─────────────────────────────────────────────────────────────
// Swipe navigation
// ─────────────────────────────────────────────────────────────

function setupSwipe() {
  const viewer = document.getElementById("viewer");

  viewer.addEventListener("touchstart", (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  viewer.addEventListener("touchend", (e) => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0) {
        nextPage();
      } else {
        prevPage();
      }
    }
  }, { passive: true });
}

// ─────────────────────────────────────────────────────────────
// Keyboard navigation
// ─────────────────────────────────────────────────────────────

function setupKeyboard() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
      e.preventDefault();
      nextPage();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      prevPage();
    }
  });
}

// ─────────────────────────────────────────────────────────────
// Click navigation
// ─────────────────────────────────────────────────────────────

function setupClickNav() {
  const viewer = document.getElementById("viewer");

  viewer.addEventListener("click", (e) => {
    if (e.target.closest(".timeline, .edge-nav, button, a, .page-story")) return;

    const rect = viewer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const threshold = rect.width * 0.25;

    if (x < threshold) {
      prevPage();
    } else if (x > rect.width - threshold) {
      nextPage();
    }
  });
}

function setupNotesModal() {
  const modal = document.getElementById("notes-modal");
  const closeBtn = document.getElementById("notes-modal-close");

  if (!modal) return;

  function openModal() {
    modal.classList.add("is-open");
  }

  function closeModal() {
    modal.classList.remove("is-open");
  }

  // Open modal when clicking "See notes" links
  document.querySelectorAll('a[href="#notes"]').forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      openModal();
    });
  });

  // Close on X button
  if (closeBtn) {
    closeBtn.addEventListener("click", closeModal);
  }

  // Close when clicking backdrop
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Close on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("is-open")) {
      closeModal();
    }
  });

  // Close modal when navigating to another page
  window.closeNotesModal = closeModal;
}

// ─────────────────────────────────────────────────────────────
// Resize handling
// ─────────────────────────────────────────────────────────────

let lastWasDesktop = null;

function handleResize() {
  const svg = d3.select("#map");
  const desktop = isDesktop();

  fitProjection(svg, geoDataByStep);

  if (lastWasDesktop !== desktop) {
    if (desktop) {
      const { type } = getPageInfo(pageElements[currentPage]);
      if (type === "transition") {
        const nextStory = pageElements.findIndex((el, i) =>
          i > currentPage && el.dataset.type === "story"
        );
        if (nextStory !== -1) {
          currentPage = nextStory;
          pageElements.forEach((el, i) => {
            el.classList.toggle("is-active", i === currentPage);
          });
        }
      }
    }

    buildTimeline();
    lastWasDesktop = desktop;
  }

  // Re-render paths with new projection
  const pageEl = pageElements[currentPage];
  const { type, step } = getPageInfo(pageEl);
  const mapLayer = document.getElementById("map-layer");

  // Re-initialize and re-render
  initializeMap(svg);

  // Re-initialize inlays if they don't exist
  if (!document.getElementById("inlay-pacific")) {
    initializeInlays();
  }

  if (type === "intro") {
    mapLayer.classList.remove("is-thumbnail");
    renderMapStep(svg, geoDataByStep, 0, { opacity: 0.15, duration: 0 });
  } else if (step !== null) {
    if (desktop || type === "transition") {
      mapLayer.classList.remove("is-thumbnail");
    } else {
      mapLayer.classList.add("is-thumbnail");
    }
    renderMapStep(svg, geoDataByStep, step, { opacity: 1, duration: 0 });
  }

  updateEdgeNav();
}

// ─────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────

async function init() {
  // Load data in parallel
  [geoDataByStep, contextCountries, acquisitionsData, overseasTerritories] = await Promise.all([
    loadAllGeoJSON(),
    loadContextCountries(),
    loadAcquisitions(),
    loadOverseasTerritories()
  ]);

  pageElements = Array.from(document.querySelectorAll(".page"));
  totalPages = pageElements.length;
  lastWasDesktop = isDesktop();

  const svg = d3.select("#map");
  fitProjection(svg, geoDataByStep);

  // Initialize map layers and render context countries once
  initializeMap(svg);

  // Initialize inlay maps for overseas territories
  initializeInlays();

  // Render initial US state
  renderMapStep(svg, geoDataByStep, 0, { opacity: 0.15, duration: 0 });

  buildTimeline();
  setupEdgeNav();
  setupSwipe();
  setupKeyboard();
  setupClickNav();
  setupNotesModal();

  window.addEventListener("resize", debounce(handleResize, 200));
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

init();
