import * as d3 from "d3";

// Era accent colors
const ERA_COLORS = {
  original: "#9a958a",
  louisiana: "#a85a4a",
  redriver: "#5d8a87",
  florida: "#758556",
  texas: "#b07a3e",
  oregon: "#637592",
  mexican: "#8b5a4a",
  gadsden: "#6b7a5a",
  alaska: "#4a7c7a",
  pacific: "#5a6b8a",
  modern: "#8b4a4a",
};

// Map step definitions (GeoJSON files)
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

const CATEGORY_CLASS = {
  state: "map-state",
  territory: "map-territory",
  other_country: "map-other",
  disputed: "map-disputed",
  none: "map-none",
};

const DESKTOP_BREAKPOINT = 900;

// State
let geoDataByStep = [];
let currentPage = 0;
let totalPages = 0;
let pageElements = [];
let touchStartX = 0;
let touchStartY = 0;

// D3 setup
const projection = d3.geoAlbersUsa();
const path = d3.geoPath().projection(projection);

// ─────────────────────────────────────────────────────────────
// Responsive helpers
// ─────────────────────────────────────────────────────────────

function isDesktop() {
  return window.innerWidth >= DESKTOP_BREAKPOINT;
}

// Get pages that should be navigable (desktop skips transition pages)
function getNavigablePages() {
  if (isDesktop()) {
    // Desktop: only intro and story pages
    return pageElements.filter((el) => {
      const type = el.dataset.type;
      return type === "intro" || type === "story";
    });
  }
  // Mobile: all pages
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

// ─────────────────────────────────────────────────────────────
// Map rendering
// ─────────────────────────────────────────────────────────────

// Store base dimensions for viewBox
let baseWidth = 0;
let baseHeight = 0;

function fitProjection(svg, geoData) {
  const container = svg.node().parentNode;
  // Always use full viewport size for projection (not thumbnail size)
  const width = window.innerWidth;
  const height = window.innerHeight;

  // Store base dimensions for viewBox
  baseWidth = width;
  baseHeight = height;

  const finalData = geoData[geoData.length - 1];
  const allFeatures = Object.values(finalData).flat();
  const collection = { type: "FeatureCollection", features: allFeatures };

  projection.fitSize([width, height], collection);
  path.projection(projection);

  // Set viewBox so SVG scales when container shrinks (thumbnail mode)
  svg.attr("viewBox", `0 0 ${width} ${height}`);
  svg.attr("preserveAspectRatio", "xMidYMid meet");
}

function renderMap(svg, geoData, stepIndex, options = {}) {
  const { opacity = 1, duration = 800 } = options;
  const data = geoData[stepIndex];
  if (!data) return;

  const era = MAP_STEPS[stepIndex].era;
  const eraColor = ERA_COLORS[era] || ERA_COLORS.original;
  const categories = ["other_country", "none", "disputed", "territory", "state"];

  for (const cat of categories) {
    const features = data[cat] || [];
    const className = CATEGORY_CLASS[cat] || "map-none";

    const sel = svg.selectAll(`.${className}`).data(features, (d, i) => `${cat}-${i}`);

    sel
      .enter()
      .append("path")
      .attr("class", className)
      .attr("d", path)
      .attr("opacity", 0)
      .attr("fill", (cat === "state" || cat === "territory") ? eraColor : null)
      .attr("stroke", "#f8f5f0")
      .transition()
      .duration(duration)
      .attr("opacity", opacity);

    sel.transition().duration(duration).attr("d", path).attr("opacity", opacity);
    sel.exit().transition().duration(duration / 2).attr("opacity", 0).remove();
  }
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

  // Update page visibility
  pageElements.forEach((el, i) => {
    el.classList.toggle("is-active", i === newPage);
  });

  // Get new page info
  const pageEl = pageElements[newPage];
  const { type, step } = getPageInfo(pageEl);

  // Update map based on page type
  if (type === "intro") {
    mapLayer.classList.remove("is-thumbnail");
    renderMap(svg, geoDataByStep, 0, { opacity: 0.15, duration: 600 });
  } else if (type === "transition") {
    mapLayer.classList.remove("is-thumbnail");
    renderMap(svg, geoDataByStep, step, { opacity: 1, duration: 800 });
  } else if (type === "story") {
    // On desktop: keep map full size with side panel
    // On mobile: thumbnail mode
    if (desktop) {
      mapLayer.classList.remove("is-thumbnail");
    } else {
      mapLayer.classList.add("is-thumbnail");
    }
    renderMap(svg, geoDataByStep, step, { opacity: 1, duration: desktop ? 800 : 400 });
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
  const navigableIndices = getNavigableIndices();

  pageElements.forEach((pageEl, i) => {
    const { type } = getPageInfo(pageEl);

    // On desktop, skip transition pages in timeline (except intro)
    if (desktop && type === "transition") {
      return;
    }

    const bar = document.createElement("button");
    bar.className = "timeline-bar";
    bar.dataset.page = i;

    if (type === "intro") {
      bar.classList.add("timeline-bar--intro");
    }
    // On mobile, transition pages are taller
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
// Click navigation (click sides of screen)
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

// ─────────────────────────────────────────────────────────────
// Resize handling
// ─────────────────────────────────────────────────────────────

let lastWasDesktop = null;

function handleResize() {
  const svg = d3.select("#map");
  const desktop = isDesktop();

  // Refit projection
  fitProjection(svg, geoDataByStep);

  // If viewport mode changed, rebuild timeline and adjust current page
  if (lastWasDesktop !== desktop) {
    // If switching to desktop and on a transition page, move to next story page
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

  // Re-render current map state
  const pageEl = pageElements[currentPage];
  const { type, step } = getPageInfo(pageEl);
  const mapLayer = document.getElementById("map-layer");

  svg.selectAll("path").remove();

  if (type === "intro") {
    mapLayer.classList.remove("is-thumbnail");
    renderMap(svg, geoDataByStep, 0, { opacity: 0.15, duration: 0 });
  } else if (step !== null) {
    if (desktop || type === "transition") {
      mapLayer.classList.remove("is-thumbnail");
    } else {
      mapLayer.classList.add("is-thumbnail");
    }
    renderMap(svg, geoDataByStep, step, { opacity: 1, duration: 0 });
  }

  updateEdgeNav();
}

// ─────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────

async function init() {
  geoDataByStep = await loadAllGeoJSON();

  pageElements = Array.from(document.querySelectorAll(".page"));
  totalPages = pageElements.length;
  lastWasDesktop = isDesktop();

  const svg = d3.select("#map");
  fitProjection(svg, geoDataByStep);

  renderMap(svg, geoDataByStep, 0, { opacity: 0.15 });

  buildTimeline();
  setupEdgeNav();
  setupSwipe();
  setupKeyboard();
  setupClickNav();

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
