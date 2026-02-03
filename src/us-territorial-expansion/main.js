import * as d3 from "d3";

// Era accent colors - candy-inspired, sophisticated
const ERA_COLORS = {
  original: "#b8a89a",    // Warm taupe anchor
  louisiana: "#e07860",   // Coral
  redriver: "#5fb8a8",    // Seafoam
  florida: "#d4848a",     // Dusty rose
  texas: "#e89860",       // Peachy orange
  oregon: "#7888c0",      // Periwinkle
  mexican: "#c87058",     // Terracotta
  gadsden: "#88a878",     // Sage
  alaska: "#68a8d0",      // Sky blue
  pacific: "#9080b0",     // Soft violet
  modern: "#b85878",      // Berry
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

let geoDataByStep = [];
let currentStep = -1;

// Projection: Albers USA handles Alaska/Hawaii insets
const projection = d3.geoAlbersUsa();
const path = d3.geoPath().projection(projection);

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

function renderPrologueMap(geoData) {
  const container = d3.select("#prologue-map");
  const svg = container.append("svg");
  const width = container.node().clientWidth;
  const height = container.node().clientHeight;

  // Use a separate projection for the prologue
  const prologueProjection = d3.geoAlbersUsa();
  const firstStep = geoData[0];
  const allFeatures = Object.values(firstStep).flat();
  const collection = { type: "FeatureCollection", features: allFeatures };
  prologueProjection.fitSize([width, height], collection);
  const prologuePath = d3.geoPath().projection(prologueProjection);

  // Only render states (the 13 original colonies area)
  const stateFeatures = firstStep["state"] || [];
  svg
    .selectAll("path")
    .data(stateFeatures)
    .enter()
    .append("path")
    .attr("d", prologuePath)
    .attr("fill", ERA_COLORS.original)
    .attr("stroke", "#faf7f5")
    .attr("stroke-width", 0.5)
    .attr("opacity", 0.25);
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
      .attr("stroke", "#faf7f5")
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
  }
}

function updateTimeline(stepIndex) {
  const fill = document.getElementById("timeline-fill");
  const pct = ((stepIndex + 1) / STEPS.length) * 100;
  fill.style.height = `${pct}%`;
}

function setupScrollObserver() {
  const steps = document.querySelectorAll(".step");
  const svg = d3.select("#map");

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const stepEl = entry.target;
        const stepIndex = parseInt(stepEl.dataset.step, 10);

        if (entry.isIntersecting) {
          stepEl.classList.add("is-active");

          if (stepIndex !== currentStep) {
            currentStep = stepIndex;
            renderMap(svg, geoDataByStep, stepIndex);
            updateMapYear(stepIndex);
            updateTimeline(stepIndex);
          }
        } else {
          stepEl.classList.remove("is-active");
        }
      }
    },
    {
      rootMargin: "-30% 0px -30% 0px",
      threshold: 0.1,
    }
  );

  for (const step of steps) {
    observer.observe(step);
  }
}

function handleResize() {
  const svg = d3.select("#map");
  fitProjection(svg, geoDataByStep);

  // Re-render current step
  if (currentStep >= 0) {
    // Remove all paths and re-render
    svg.selectAll("path").remove();
    renderMap(svg, geoDataByStep, currentStep);
  }
}

async function init() {
  geoDataByStep = await loadAllGeoJSON();

  const svg = d3.select("#map");
  fitProjection(svg, geoDataByStep);

  // Render prologue background map
  renderPrologueMap(geoDataByStep);

  // Render initial state (first step)
  renderMap(svg, geoDataByStep, 0);
  currentStep = 0;
  updateMapYear(0);

  // Set up scroll-driven transitions
  setupScrollObserver();

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
