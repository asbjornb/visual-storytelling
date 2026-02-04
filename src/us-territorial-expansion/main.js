import * as d3 from "d3";
import * as topojson from "topojson-client";

// ─────────────────────────────────────────────────────────────
// Colors
// ─────────────────────────────────────────────────────────────

// US territory color - cool blue-gray
const US_COLOR = "#b8c4d0";

// Non-US context countries - dim warm gray
const CONTEXT_COLOR = "#e8e4dc";

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
  { year: "1898", file: "1898-spanish-american-war.geojson", era: "pacific" },
  { year: "1899–1959", file: "1900-samoa.geojson", era: "pacific" },
  { year: "2025–26", file: "1959-final.geojson", era: "modern" },
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
let contextCountries = null;
let currentPage = 0;
let totalPages = 0;
let pageElements = [];
let touchStartX = 0;
let touchStartY = 0;
let currentMapStep = -1;

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
  svg.append("g").attr("class", "layer-us");

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
}

function renderMapStep(svg, geoData, stepIndex, options = {}) {
  const { opacity = 1, duration = 800 } = options;
  const data = geoData[stepIndex];
  if (!data) return;

  const categories = ["other_country", "none", "disputed", "territory", "state", "seceded_state"];
  const isUSCategory = (cat) => cat === "state" || cat === "territory" || cat === "seceded_state";

  const usLayer = svg.select(".layer-us");

  for (const cat of categories) {
    const features = data[cat] || [];
    const className = CATEGORY_CLASS[cat] || "map-none";

    const sel = usLayer.selectAll(`.${className}`).data(features, (d, i) => `${cat}-${i}`);

    const fillColor = isUSCategory(cat) ? US_COLOR : CONTEXT_COLOR;

    // Enter: new DOM elements
    sel
      .enter()
      .append("path")
      .attr("class", className)
      .attr("d", path)
      .attr("opacity", 0)
      .attr("stroke", "#f8f5f0")
      .attr("stroke-width", 0.5)
      .attr("fill", fillColor)
      .transition()
      .duration(duration)
      .attr("opacity", opacity);

    // Update: existing DOM elements
    sel
      .transition()
      .duration(duration)
      .attr("d", path)
      .attr("opacity", opacity)
      .attr("fill", fillColor);

    sel.exit().transition().duration(duration / 2).attr("opacity", 0).remove();
  }

  currentMapStep = stepIndex;
}

function updateMapOpacity(svg, opacity, duration = 600) {
  svg.select(".layer-us")
    .selectAll("path")
    .transition()
    .duration(duration)
    .attr("opacity", opacity);

  svg.select(".layer-context")
    .selectAll("path")
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

function setupExpandableNote() {
  // Handle click on expandable note toggle in intro
  const toggle = document.querySelector(".page-note-toggle");
  const content = document.getElementById("intro-note");

  if (toggle && content) {
    toggle.addEventListener("click", () => {
      const isExpanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", !isExpanded);
      content.hidden = isExpanded;
    });
  }
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
  [geoDataByStep, contextCountries] = await Promise.all([
    loadAllGeoJSON(),
    loadContextCountries()
  ]);

  pageElements = Array.from(document.querySelectorAll(".page"));
  totalPages = pageElements.length;
  lastWasDesktop = isDesktop();

  const svg = d3.select("#map");
  fitProjection(svg, geoDataByStep);

  // Initialize map layers and render context countries once
  initializeMap(svg);

  // Render initial US state
  renderMapStep(svg, geoDataByStep, 0, { opacity: 0.15, duration: 0 });

  buildTimeline();
  setupEdgeNav();
  setupSwipe();
  setupKeyboard();
  setupClickNav();
  setupExpandableNote();

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
