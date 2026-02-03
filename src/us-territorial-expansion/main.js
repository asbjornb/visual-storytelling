import * as d3 from "d3";

// Era accent colors - matches CSS custom properties
const ERA_COLORS = {
  original: "#9a958a",    // Warm gray for original states
  louisiana: "#a85a4a",   // Oxide red
  redriver: "#5d8a87",    // Dusty teal
  florida: "#758556",     // Olive
  texas: "#b07a3e",       // Burnt ochre
  oregon: "#637592",      // Slate blue
  mexican: "#8b5a4a",     // Muted oxide
  gadsden: "#6b7a5a",     // Muted olive
  alaska: "#4a7c7a",      // Deep teal
  pacific: "#5a6b8a",     // Slate
  modern: "#8b4a4a",      // Muted warning red
};

// Timeline steps: maps to GeoJSON files
const STEPS = [
  { year: "1783", file: "1789-original-states.geojson", label: "Treaty of Paris", era: "original" },
  { year: "1803", file: "1803-louisiana-purchase.geojson", label: "Louisiana Purchase", era: "louisiana" },
  { year: "1818", file: "1818-red-river-basin.geojson", label: "Red River Basin", era: "redriver" },
  { year: "1819", file: "1819-florida.geojson", label: "Florida", era: "florida" },
  { year: "1845", file: "1845-texas.geojson", label: "Texas", era: "texas" },
  { year: "1846", file: "1846-oregon.geojson", label: "Oregon", era: "oregon" },
  { year: "1848", file: "1848-mexican-cession.geojson", label: "Mexican Cession", era: "mexican" },
  { year: "1853", file: "1853-gadsden.geojson", label: "Gadsden Purchase", era: "gadsden" },
  { year: "1867", file: "1867-alaska.geojson", label: "Alaska", era: "alaska" },
  { year: "1898", file: "1898-spanish-american-war.geojson", label: "Spanish-American War", era: "pacific" },
  { year: "1899–1959", file: "1900-samoa.geojson", label: "Pacific & Caribbean", era: "pacific" },
  { year: "2025–26", file: "1959-final.geojson", label: "Modern Rhetoric", era: "modern" },
];

const CATEGORY_CLASS = {
  state: "map-state",
  territory: "map-territory",
  other_country: "map-other",
  disputed: "map-disputed",
  none: "map-none",
};

const MOBILE_BREAKPOINT = 768;

let geoDataByStep = [];
// currentPage: -1 = intro, 0-11 = map steps
let currentPage = -1;
const TOTAL_PAGES = STEPS.length + 1; // intro + 12 steps
let isCollapsed = false;

// Projection: Albers USA handles Alaska/Hawaii insets
const projection = d3.geoAlbersUsa();
const path = d3.geoPath().projection(projection);

function isMobile() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

async function loadAllGeoJSON() {
  const promises = STEPS.map((s) =>
    d3.json(`/data/us-territorial-expansion/${s.file}`).then((geojson) => {
      // Separate features by category
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

function fitProjection(svg, geoData) {
  const container = svg.node().parentNode;
  const width = container.clientWidth;
  const height = container.clientHeight;

  // Use the final step (most territory) to fit projection
  const finalData = geoData[geoData.length - 1];
  const allFeatures = Object.values(finalData).flat();
  const collection = { type: "FeatureCollection", features: allFeatures };

  projection.fitSize([width, height], collection);
  path.projection(projection);
}

function renderMap(svg, geoData, stepIndex) {
  const data = geoData[stepIndex];
  if (!data) return;

  const era = STEPS[stepIndex].era;
  const eraColor = ERA_COLORS[era] || ERA_COLORS.original;
  const categories = ["other_country", "none", "disputed", "territory", "state"];

  for (const cat of categories) {
    const features = data[cat] || [];
    const className = CATEGORY_CLASS[cat] || "map-none";

    const sel = svg.selectAll(`.${className}`).data(features, (d, i) => `${cat}-${i}`);

    // Enter - new territories get the current era color
    sel
      .enter()
      .append("path")
      .attr("class", className)
      .attr("d", path)
      .attr("opacity", 0)
      .attr("fill", (cat === "state" || cat === "territory") ? eraColor : null)
      .attr("stroke", "#f8f5f0")
      .transition()
      .duration(800)
      .attr("opacity", 1);

    // Update - keep existing colors, just update path geometry
    sel.transition().duration(800).attr("d", path);

    // Exit
    sel.exit().transition().duration(400).attr("opacity", 0).remove();
  }
}

function updateMapYear(stepIndex) {
  const yearEl = document.getElementById("map-year");
  if (stepIndex >= 0 && stepIndex < STEPS.length) {
    yearEl.textContent = STEPS[stepIndex].year;
    yearEl.style.opacity = "0.2";
  } else {
    yearEl.textContent = "";
    yearEl.style.opacity = "0";
  }
}

function updateNavUI() {
  const currentEl = document.getElementById("nav-current");
  const prevBtn = document.getElementById("btn-prev");
  const nextBtn = document.getElementById("btn-next");

  // Update page counter (1-indexed for display)
  currentEl.textContent = currentPage + 2; // -1 becomes 1, 0 becomes 2, etc.

  // Update button states
  prevBtn.disabled = currentPage <= -1;
  nextBtn.disabled = currentPage >= STEPS.length - 1;
}

function setCollapsed(collapsed) {
  isCollapsed = collapsed;
  const contentPanel = document.getElementById("content-panel");

  if (collapsed) {
    contentPanel.classList.add("is-collapsed");
  } else {
    contentPanel.classList.remove("is-collapsed");
  }
}

function toggleCollapsed() {
  setCollapsed(!isCollapsed);

  // Hide hint after first toggle
  const hint = document.getElementById("hint");
  if (hint) hint.classList.add("is-hidden");
}

function goToPage(newPage) {
  // Clamp to valid range
  newPage = Math.max(-1, Math.min(newPage, STEPS.length - 1));

  if (newPage === currentPage) return;

  const pages = document.querySelectorAll(".page");
  const svg = d3.select("#map");

  // Remove active class from all pages
  pages.forEach((p) => p.classList.remove("is-active"));

  // Find and activate the new page
  const targetPage = document.querySelector(`.page[data-step="${newPage}"]`);
  if (targetPage) {
    targetPage.classList.add("is-active");
  }

  // Update map if we're on a map step (not intro)
  if (newPage >= 0) {
    renderMap(svg, geoDataByStep, newPage);
    updateMapYear(newPage);
  } else {
    // Intro page - show initial state faintly or clear
    updateMapYear(-1);
    // Optionally render step 0 with low opacity for intro
    svg.selectAll("path").transition().duration(400).attr("opacity", 0.15);
  }

  currentPage = newPage;
  updateNavUI();

  // On mobile, collapse content after navigation to show map transition
  // then expand after a short delay
  if (isMobile() && !isCollapsed) {
    setCollapsed(true);
    setTimeout(() => setCollapsed(false), 1200);
  }

  // Hide hint after first navigation
  const hint = document.getElementById("hint");
  if (hint) hint.classList.add("is-hidden");
}

function setupNavigation() {
  const prevBtn = document.getElementById("btn-prev");
  const nextBtn = document.getElementById("btn-next");

  // Button clicks
  prevBtn.addEventListener("click", () => goToPage(currentPage - 1));
  nextBtn.addEventListener("click", () => goToPage(currentPage + 1));

  // Keyboard navigation
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      goToPage(currentPage - 1);
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
      e.preventDefault();
      goToPage(currentPage + 1);
    }
  });

  // Set total pages in UI
  document.getElementById("nav-total").textContent = TOTAL_PAGES;
}

function setupCollapseToggle() {
  // Add click handlers to all page headers
  const headers = document.querySelectorAll("[data-collapse-toggle]");
  headers.forEach((header) => {
    header.addEventListener("click", (e) => {
      // Only toggle on mobile
      if (isMobile()) {
        e.preventDefault();
        toggleCollapsed();
      }
    });
  });
}

function handleResize() {
  const svg = d3.select("#map");
  fitProjection(svg, geoDataByStep);

  // Re-render current step
  if (currentPage >= 0) {
    svg.selectAll("path").remove();
    renderMap(svg, geoDataByStep, currentPage);
  }

  // Reset collapse state when switching between mobile/desktop
  if (!isMobile()) {
    setCollapsed(false);
  }
}

async function init() {
  geoDataByStep = await loadAllGeoJSON();

  const svg = d3.select("#map");
  fitProjection(svg, geoDataByStep);

  // Render initial map (step 0) with low opacity for intro background
  renderMap(svg, geoDataByStep, 0);
  svg.selectAll("path").attr("opacity", 0.15);

  // Set up navigation
  setupNavigation();
  setupCollapseToggle();
  updateNavUI();

  // On mobile, start collapsed to show the map
  if (isMobile()) {
    setCollapsed(true);
  }

  // Handle resize
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
