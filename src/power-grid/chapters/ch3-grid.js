import * as d3 from "d3";
import { COLORS } from "./colors.js";

/* ── Node & Edge topology ─────────────────────────── */

const nodes = {
  NO: { x: 200, y: 85, label: "Norway" },
  SE: { x: 310, y: 110, label: "Sweden" },
  DK: { x: 310, y: 195, label: "Denmark" },
  UK: { x: 120, y: 260, label: "UK" },
  NL: { x: 310, y: 270, label: "Netherlands" },
  DE: { x: 400, y: 240, label: "Germany" },
  BE: { x: 280, y: 320, label: "Belgium" },
  FR: { x: 230, y: 380, label: "France" },
};

const edges = [
  { from: "NO", to: "SE" }, { from: "NO", to: "DK" },
  { from: "SE", to: "DK" }, { from: "DK", to: "DE" },
  { from: "NO", to: "UK" }, { from: "NO", to: "DE" },
  { from: "UK", to: "NL" }, { from: "UK", to: "BE" },
  { from: "UK", to: "FR" }, { from: "NL", to: "DE" },
  { from: "NL", to: "BE" }, { from: "DE", to: "BE" },
  { from: "DE", to: "FR" }, { from: "FR", to: "BE" },
];

/* ── Scenario data: each has normal / shock / response phases ── */

const defaultFlows = {
  "NO-SE": 0.3, "NO-DK": 0.3, "SE-DK": 0.25, "DK-DE": 0.35,
  "NO-UK": 0.2, "NO-DE": 0.3, "UK-NL": 0.2, "UK-BE": 0.15,
  "UK-FR": 0.15, "NL-DE": 0.25, "NL-BE": 0.2, "DE-BE": 0.2,
  "DE-FR": 0.25, "FR-BE": 0.15,
};

const scenarios = {
  wind: {
    timescale: [0, 1, 2],        // Seconds, Minutes, Hours
    whoActs: [0, 1],             // Grid operators, Intraday markets
    phases: {
      normal: {
        prices: { NO: 42, SE: 45, DK: 48, UK: 50, NL: 52, DE: 55, BE: 51, FR: 49 },
        flows: { ...defaultFlows },
        congested: [],
      },
      shock: {
        prices: { NO: 45, SE: 52, DK: 95, UK: 130, NL: 155, DE: 175, BE: 160, FR: 140 },
        flows: {
          "NO-SE": 0.6, "NO-DK": 0.7, "SE-DK": 0.5, "DK-DE": 0.95,
          "NO-UK": 0.5, "NO-DE": 0.85, "UK-NL": 0.4, "UK-BE": 0.3,
          "UK-FR": 0.2, "NL-DE": 0.7, "NL-BE": 0.5, "DE-BE": 0.6,
          "DE-FR": 0.5, "FR-BE": 0.3,
        },
        congested: ["DK-DE", "NO-DE"],
      },
      response: {
        prices: { NO: 48, SE: 54, DK: 78, UK: 100, NL: 115, DE: 130, BE: 120, FR: 108 },
        flows: {
          "NO-SE": 0.55, "NO-DK": 0.6, "SE-DK": 0.45, "DK-DE": 0.8,
          "NO-UK": 0.45, "NO-DE": 0.7, "UK-NL": 0.4, "UK-BE": 0.3,
          "UK-FR": 0.25, "NL-DE": 0.55, "NL-BE": 0.4, "DE-BE": 0.45,
          "DE-FR": 0.4, "FR-BE": 0.25,
        },
        congested: ["DK-DE"],
      },
    },
  },
  drought: {
    timescale: [3, 4, 5],        // Days, Weeks, Months
    whoActs: [2, 3],             // Traders & hedging, Policy & investment
    phases: {
      normal: {
        prices: { NO: 38, SE: 42, DK: 46, UK: 48, NL: 50, DE: 52, BE: 49, FR: 47 },
        flows: { ...defaultFlows },
        congested: [],
      },
      shock: {
        prices: { NO: 130, SE: 140, DK: 170, UK: 190, NL: 210, DE: 230, BE: 215, FR: 200 },
        flows: {
          "NO-SE": 0.4, "NO-DK": 0.3, "SE-DK": 0.35, "DK-DE": 0.6,
          "NO-UK": 0.25, "NO-DE": 0.4, "UK-NL": 0.45, "UK-BE": 0.4,
          "UK-FR": 0.35, "NL-DE": 0.5, "NL-BE": 0.45, "DE-BE": 0.4,
          "DE-FR": 0.5, "FR-BE": 0.35,
        },
        congested: ["NO-SE"],
      },
      response: {
        prices: { NO: 110, SE: 120, DK: 150, UK: 165, NL: 180, DE: 195, BE: 185, FR: 175 },
        flows: {
          "NO-SE": 0.35, "NO-DK": 0.3, "SE-DK": 0.3, "DK-DE": 0.55,
          "NO-UK": 0.25, "NO-DE": 0.35, "UK-NL": 0.4, "UK-BE": 0.35,
          "UK-FR": 0.35, "NL-DE": 0.45, "NL-BE": 0.4, "DE-BE": 0.4,
          "DE-FR": 0.45, "FR-BE": 0.3,
        },
        congested: [],
      },
    },
  },
  nuclear: {
    timescale: [1, 2, 3, 4, 5],  // Minutes through Months
    whoActs: [0, 1, 2, 3],       // Everyone
    phases: {
      normal: {
        prices: { NO: 40, SE: 44, DK: 46, UK: 48, NL: 50, DE: 52, BE: 50, FR: 45 },
        flows: {
          ...defaultFlows,
          "DE-FR": 0.15, "FR-BE": 0.2, "UK-FR": 0.1,  // France exports in normal
        },
        congested: [],
      },
      shock: {
        prices: { NO: 70, SE: 85, DK: 180, UK: 200, NL: 260, DE: 280, BE: 290, FR: 420 },
        flows: {
          "NO-SE": 0.5, "NO-DK": 0.6, "SE-DK": 0.55, "DK-DE": 0.75,
          "NO-UK": 0.4, "NO-DE": 0.7, "UK-NL": 0.5, "UK-BE": 0.55,
          "UK-FR": 0.8, "NL-DE": 0.6, "NL-BE": 0.7, "DE-BE": 0.8,
          "DE-FR": 0.95, "FR-BE": 0.92,
        },
        congested: ["DE-FR", "FR-BE", "UK-FR"],
      },
      response: {
        prices: { NO: 65, SE: 78, DK: 155, UK: 175, NL: 220, DE: 240, BE: 250, FR: 350 },
        flows: {
          "NO-SE": 0.5, "NO-DK": 0.55, "SE-DK": 0.5, "DK-DE": 0.7,
          "NO-UK": 0.4, "NO-DE": 0.65, "UK-NL": 0.45, "UK-BE": 0.5,
          "UK-FR": 0.75, "NL-DE": 0.55, "NL-BE": 0.65, "DE-BE": 0.7,
          "DE-FR": 0.88, "FR-BE": 0.85,
        },
        congested: ["DE-FR", "UK-FR"],
      },
    },
  },
};

const PHASE_ORDER = ["normal", "shock", "response", "aftermath"];
const PHASE_DURATION = 2800;  // ms per phase during auto-play

/* ── Module state ─────────────────────────────────── */

let currentScenario = "wind";
let currentPhase = "normal";
let autoplayTimer = null;
let isPlaying = false;

/* ── init ─────────────────────────────────────────── */

export function init() {
  const container = document.getElementById("grid-map");
  if (!container) return;

  /* ── SVG setup ───────────────────────────── */

  const svg = d3.select(container).append("svg")
    .attr("viewBox", "0 0 540 460")
    .attr("preserveAspectRatio", "xMidYMid meet");

  const defs = svg.append("defs");

  // Node glow filter
  const nodeGlow = defs.append("filter")
    .attr("id", "node-glow").attr("x", "-50%").attr("y", "-50%")
    .attr("width", "200%").attr("height", "200%");
  nodeGlow.append("feGaussianBlur").attr("stdDeviation", "6").attr("result", "blur");
  nodeGlow.append("feMerge").selectAll("feMergeNode")
    .data(["blur", "SourceGraphic"]).join("feMergeNode").attr("in", d => d);

  // Subtle water filter
  const waterFilter = defs.append("filter").attr("id", "water-blur");
  waterFilter.append("feGaussianBlur").attr("stdDeviation", "8");

  /* ── Background geography hints ──────────── */

  const geoG = svg.append("g").attr("class", "geo-bg").attr("opacity", 0.08);

  // North Sea — between UK, NO, DK, NL
  geoG.append("path")
    .attr("d", "M80,40 Q160,20 230,50 L340,120 Q360,160 340,210 L340,280 Q300,300 260,290 L140,280 Q80,260 60,200 Z")
    .attr("fill", "#6366f1").attr("filter", "url(#water-blur)");

  // Baltic hints
  geoG.append("ellipse")
    .attr("cx", 370).attr("cy", 150).attr("rx", 40).attr("ry", 60)
    .attr("fill", "#6366f1").attr("filter", "url(#water-blur)");

  // English Channel / Bay of Biscay hint
  geoG.append("path")
    .attr("d", "M60,300 Q120,340 180,370 Q160,400 100,410 Q40,380 40,340 Z")
    .attr("fill", "#6366f1").attr("filter", "url(#water-blur)");

  /* ── Stress type label (in SVG) ──────────── */

  const stressLabel = svg.append("text")
    .attr("class", "stress-label")
    .attr("x", 270).attr("y", 28)
    .attr("text-anchor", "middle")
    .attr("font-size", 11).attr("font-weight", 600)
    .attr("fill", "#94a3b8").attr("opacity", 0);

  /* ── Edge & node layers ──────────────────── */

  const edgeG = svg.append("g");
  const nodeG = svg.append("g");

  const priceColor = d3.scaleLinear()
    .domain([40, 150, 350])
    .range([COLORS.green, COLORS.amber, COLORS.red])
    .clamp(true);

  /* ── Render a phase state ───────────────── */

  function renderPhaseState(phaseData, transitionMs = 600) {
    const { prices, flows, congested } = phaseData;

    // Edges
    const edgeSel = edgeG.selectAll(".flow-line").data(edges, d => `${d.from}-${d.to}`);
    const edgeEnter = edgeSel.enter().append("g").attr("class", "flow-line");
    edgeEnter.append("line").attr("class", "flow-bg");
    edgeEnter.append("line").attr("class", "flow-dash");

    edgeEnter.merge(edgeSel).each(function (d) {
      const k = `${d.from}-${d.to}`;
      const flow = flows[k] ?? 0.2;
      const isCongested = congested.includes(k);
      const from = nodes[d.from], to = nodes[d.to];
      const width = 1.5 + flow * 5;
      const sel = d3.select(this);

      sel.select(".flow-bg").transition().duration(transitionMs)
        .attr("x1", from.x).attr("y1", from.y).attr("x2", to.x).attr("y2", to.y)
        .attr("stroke", isCongested ? COLORS.red : "rgba(0,0,0,0.08)")
        .attr("stroke-width", width).attr("stroke-opacity", 0.25);

      sel.select(".flow-dash")
        .attr("x1", from.x).attr("y1", from.y).attr("x2", to.x).attr("y2", to.y)
        .attr("stroke", isCongested ? COLORS.red : COLORS.accent)
        .attr("stroke-width", Math.max(1.5, width * 0.6))
        .attr("stroke-opacity", isCongested ? 0.9 : 0.4 + flow * 0.4)
        .attr("stroke-dasharray", "8 6")
        .style("animation", `flowDash ${(2 - flow * 0.8).toFixed(1)}s linear infinite`);
    });

    // Nodes
    const nodeSel = nodeG.selectAll(".grid-node").data(Object.entries(nodes), d => d[0]);
    const nodeEnter = nodeSel.enter().append("g").attr("class", "grid-node")
      .attr("transform", d => `translate(${d[1].x},${d[1].y})`);
    nodeEnter.append("circle").attr("class", "node-glow-circle").attr("r", 28).attr("filter", "url(#node-glow)");
    nodeEnter.append("circle").attr("class", "node-bg").attr("r", 24).attr("fill", "rgba(255,255,255,0.9)").attr("stroke-width", 2.5);
    nodeEnter.append("text").attr("class", "node-code").attr("y", -5).attr("text-anchor", "middle").attr("font-size", 14).attr("font-weight", 700);
    nodeEnter.append("text").attr("class", "node-price").attr("y", 12).attr("text-anchor", "middle").attr("font-size", 10).attr("font-weight", 600);

    nodeEnter.merge(nodeSel).each(function (d) {
      const [code] = d;
      const price = prices[code] ?? 100;
      const c = priceColor(price);
      const sel = d3.select(this);
      sel.select(".node-glow-circle").transition().duration(transitionMs).attr("fill", c).attr("opacity", 0.18);
      sel.select(".node-bg").transition().duration(transitionMs).attr("stroke", c);
      sel.select(".node-code").attr("fill", c).text(code);
      sel.select(".node-price").attr("fill", "#475569").text(`\u20AC${price}`);
    });
  }

  /* ── Phase management ───────────────────── */

  function goToPhase(phase) {
    currentPhase = phase;
    const sc = scenarios[currentScenario];

    // Update phase pills
    document.querySelectorAll(".phase-pill").forEach(p => {
      p.classList.toggle("active", p.dataset.phase === phase);
    });

    // Show/hide aftermath cards
    document.querySelectorAll(".aftermath-card").forEach(card => {
      const isVisible = phase === "aftermath" && card.dataset.sc === currentScenario;
      card.classList.toggle("hidden", !isVisible);
    });

    // Update stress label in SVG
    const stressTexts = {
      normal: "",
      shock: phase === "shock" ? "STRESS" : "",
      response: "RECOVERING",
      aftermath: "AFTERMATH",
    };
    stressLabel
      .transition().duration(300)
      .attr("opacity", stressTexts[phase] ? 0.6 : 0)
      .text(stressTexts[phase] || "")
      .attr("fill", phase === "shock" ? COLORS.red : phase === "response" ? COLORS.amber : "#94a3b8");

    // Render the appropriate data
    if (phase === "aftermath") {
      // Aftermath freezes on the response state but dims
      renderPhaseState(sc.phases.response, 400);
      // Dim the SVG slightly
      svg.transition().duration(600).attr("opacity", 0.55);
    } else {
      svg.transition().duration(400).attr("opacity", 1);
      renderPhaseState(sc.phases[phase], 600);
    }

    // Update timescale highlights
    updateTimescale(sc);
    updateWhoActs(sc);
  }

  function switchScenario(key) {
    currentScenario = key;
    stopAutoplay();

    // Update scenario buttons
    document.querySelectorAll("#scenario-bar .sc-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.sc === key);
    });

    // Update scenario text panels
    document.querySelectorAll(".sc-text").forEach(t => {
      t.classList.toggle("hidden", t.dataset.sc !== key);
    });

    // Hide all aftermath cards
    document.querySelectorAll(".aftermath-card").forEach(c => c.classList.add("hidden"));

    // Start at shock phase (for quick comparison)
    goToPhase("shock");
  }

  function startAutoplay() {
    isPlaying = true;
    updatePlayButton();
    goToPhase("normal");

    let phaseIdx = 0;
    autoplayTimer = setInterval(() => {
      phaseIdx++;
      if (phaseIdx >= PHASE_ORDER.length) {
        stopAutoplay();
        return;
      }
      goToPhase(PHASE_ORDER[phaseIdx]);
    }, PHASE_DURATION);
  }

  function stopAutoplay() {
    isPlaying = false;
    updatePlayButton();
    if (autoplayTimer) {
      clearInterval(autoplayTimer);
      autoplayTimer = null;
    }
  }

  function updatePlayButton() {
    const btn = document.getElementById("phase-play");
    if (!btn) return;
    btn.classList.toggle("playing", isPlaying);
    btn.innerHTML = isPlaying
      ? '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="1" width="4" height="12"/><rect x="9" y="1" width="4" height="12"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><polygon points="2,0 14,7 2,14"/></svg>';
  }

  /* ── Timescale & Who Acts ───────────────── */

  function updateTimescale(sc) {
    document.querySelectorAll(".ts-seg").forEach(seg => {
      const idx = parseInt(seg.dataset.idx);
      seg.classList.toggle("lit", sc.timescale.includes(idx));
    });
  }

  function updateWhoActs(sc) {
    document.querySelectorAll(".wa-seg").forEach(seg => {
      const idx = parseInt(seg.dataset.idx);
      seg.classList.toggle("lit", sc.whoActs.includes(idx));
    });
  }

  /* ── Inject flow animation keyframe ─────── */

  if (!document.getElementById("flow-dash-style")) {
    const style = document.createElement("style");
    style.id = "flow-dash-style";
    style.textContent = `@keyframes flowDash { to { stroke-dashoffset: -28; } }`;
    document.head.appendChild(style);
  }

  /* ── Wire up controls ───────────────────── */

  // Scenario buttons
  document.querySelectorAll("#scenario-bar .sc-btn").forEach(btn => {
    btn.addEventListener("click", () => switchScenario(btn.dataset.sc));
  });

  // Phase pills
  document.querySelectorAll(".phase-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      stopAutoplay();
      goToPhase(pill.dataset.phase);
    });
  });

  // Play button
  const playBtn = document.getElementById("phase-play");
  if (playBtn) {
    playBtn.addEventListener("click", () => {
      if (isPlaying) {
        stopAutoplay();
      } else {
        startAutoplay();
      }
    });
  }

  /* ── Initial render ─────────────────────── */

  // Start on the shock phase of wind scenario to show immediate impact
  goToPhase("shock");
  updateTimescale(scenarios.wind);
  updateWhoActs(scenarios.wind);
}

export function destroy() {
  // Clean up autoplay if navigating away
  if (autoplayTimer) {
    clearInterval(autoplayTimer);
    autoplayTimer = null;
  }
  isPlaying = false;
}
