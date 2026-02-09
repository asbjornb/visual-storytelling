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
  dunkelflaute: {
    timescale: [2, 3, 4],        // Hours, Days, Weeks
    whoActs: [1, 2],             // Intraday repricing, Hedging & imports
    phases: {
      normal: {
        prices: { NO: 42, SE: 45, DK: 48, UK: 50, NL: 52, DE: 55, BE: 51, FR: 49 },
        flows: { ...defaultFlows },
        congested: [],
      },
      shock: {
        // Cold + calm: demand up, wind down, gas sets price on continent
        prices: { NO: 52, SE: 60, DK: 110, UK: 140, NL: 160, DE: 185, BE: 170, FR: 155 },
        flows: {
          "NO-SE": 0.65, "NO-DK": 0.7, "SE-DK": 0.5, "DK-DE": 0.9,
          "NO-UK": 0.55, "NO-DE": 0.85, "UK-NL": 0.4, "UK-BE": 0.3,
          "UK-FR": 0.25, "NL-DE": 0.65, "NL-BE": 0.5, "DE-BE": 0.6,
          "DE-FR": 0.55, "FR-BE": 0.3,
        },
        congested: ["DK-DE", "NO-DE"],
      },
      response: {
        // Gas ramps, imports settle, still elevated but less extreme
        prices: { NO: 55, SE: 62, DK: 90, UK: 115, NL: 125, DE: 145, BE: 135, FR: 120 },
        flows: {
          "NO-SE": 0.6, "NO-DK": 0.6, "SE-DK": 0.45, "DK-DE": 0.8,
          "NO-UK": 0.5, "NO-DE": 0.7, "UK-NL": 0.4, "UK-BE": 0.3,
          "UK-FR": 0.25, "NL-DE": 0.55, "NL-BE": 0.4, "DE-BE": 0.45,
          "DE-FR": 0.4, "FR-BE": 0.25,
        },
        congested: ["DK-DE"],
      },
    },
  },
  drought: {
    timescale: [3, 4, 5],        // Days, Weeks, Months
    whoActs: [2, 3],             // Hedging & imports, Capacity & policy
    phases: {
      normal: {
        prices: { NO: 38, SE: 42, DK: 46, UK: 48, NL: 50, DE: 52, BE: 49, FR: 47 },
        flows: { ...defaultFlows },
        congested: [],
      },
      shock: {
        // Reservoirs low, hydro bids higher, gas fills gap
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
        // Forward hedging adjusts, imports reroute, still elevated
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
    timescale: [0, 1, 2],        // Seconds, Minutes, Hours (single unit trip)
    whoActs: [0, 1],             // Automatic reserves, Intraday repricing
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
        // ~1.3 GW reactor trips: France price spikes, neighbours feel it
        prices: { NO: 48, SE: 55, DK: 85, UK: 120, NL: 145, DE: 160, BE: 180, FR: 280 },
        flows: {
          "NO-SE": 0.4, "NO-DK": 0.45, "SE-DK": 0.4, "DK-DE": 0.55,
          "NO-UK": 0.3, "NO-DE": 0.5, "UK-NL": 0.35, "UK-BE": 0.4,
          "UK-FR": 0.65, "NL-DE": 0.45, "NL-BE": 0.5, "DE-BE": 0.6,
          "DE-FR": 0.8, "FR-BE": 0.75,
        },
        congested: ["DE-FR", "UK-FR"],
      },
      response: {
        // Reserves stabilise frequency, intraday reprices, partial convergence
        prices: { NO: 45, SE: 50, DK: 70, UK: 95, NL: 110, DE: 120, BE: 135, FR: 200 },
        flows: {
          "NO-SE": 0.4, "NO-DK": 0.4, "SE-DK": 0.35, "DK-DE": 0.5,
          "NO-UK": 0.3, "NO-DE": 0.45, "UK-NL": 0.35, "UK-BE": 0.4,
          "UK-FR": 0.6, "NL-DE": 0.4, "NL-BE": 0.45, "DE-BE": 0.55,
          "DE-FR": 0.7, "FR-BE": 0.65,
        },
        congested: ["DE-FR"],
      },
    },
  },
  windsurplus: {
    timescale: [2, 3],           // Hours, Days
    whoActs: [1, 2],             // Intraday repricing, Hedging & imports
    phases: {
      normal: {
        // Mild spring baseline — lower prices than winter
        prices: { NO: 28, SE: 30, DK: 32, UK: 35, NL: 38, DE: 40, BE: 36, FR: 33 },
        flows: { ...defaultFlows },
        congested: [],
      },
      shock: {
        // Wind surges + weekend low demand: DK/DE deeply negative
        prices: { NO: 10, SE: -15, DK: -55, UK: 18, NL: -20, DE: -70, BE: 5, FR: 12 },
        flows: {
          "NO-SE": 0.15, "NO-DK": 0.1, "SE-DK": 0.15, "DK-DE": 0.9,
          "NO-UK": 0.1, "NO-DE": 0.15, "UK-NL": 0.15, "UK-BE": 0.1,
          "UK-FR": 0.1, "NL-DE": 0.85, "NL-BE": 0.6, "DE-BE": 0.7,
          "DE-FR": 0.8, "FR-BE": 0.2,
        },
        congested: ["DK-DE", "NL-DE", "DE-FR"],
      },
      response: {
        // Curtailment kicks in, some thermal shuts down, still depressed
        prices: { NO: 12, SE: 5, DK: -10, UK: 22, NL: 8, DE: -15, BE: 15, FR: 20 },
        flows: {
          "NO-SE": 0.15, "NO-DK": 0.1, "SE-DK": 0.15, "DK-DE": 0.7,
          "NO-UK": 0.1, "NO-DE": 0.15, "UK-NL": 0.15, "UK-BE": 0.1,
          "UK-FR": 0.1, "NL-DE": 0.6, "NL-BE": 0.45, "DE-BE": 0.55,
          "DE-FR": 0.6, "FR-BE": 0.2,
        },
        congested: ["DK-DE"],
      },
    },
  },
};

const PHASE_ORDER = ["normal", "shock", "response", "aftermath"];
const PHASE_DURATION = 2800;  // ms per phase during auto-play

/* ── Module state ─────────────────────────────────── */

let currentScenario = "dunkelflaute";
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

  /* ── Background geography (land vs water) ─── */

  const geoG = svg.append("g").attr("class", "geo-bg");

  // Sea first so coastlines/land sit on top
  geoG.append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", 540)
    .attr("height", 460)
    .attr("fill", "#e9eef9")
    .attr("opacity", 0.45);

  const landStyle = {
    fill: "#cbd5e1",
    fillOpacity: 0.3,
    stroke: "#94a3b8",
    strokeOpacity: 0.35,
    strokeWidth: 1.2,
  };

  const landShapes = [
    // Great Britain
    "M90,170 L105,145 L128,125 L145,140 L150,170 L145,205 L130,232 L110,250 L93,240 L84,215 Z",
    // Ireland
    "M62,178 L72,162 L85,166 L89,186 L81,208 L66,213 L56,198 Z",
    // Norway + Sweden (Scandinavian peninsula)
    "M180,58 L205,44 L230,48 L250,70 L265,100 L276,135 L280,170 L266,197 L246,214 L230,194 L226,156 L220,122 L208,95 L192,82 L174,80 Z",
    // Denmark / Jutland
    "M265,178 L281,182 L287,197 L276,212 L261,206 L257,192 Z",
    // Continental Europe (NL, BE, DE, FR, west-central mass)
    "M190,240 L224,224 L265,226 L303,218 L350,206 L398,206 L430,232 L432,269 L410,303 L372,330 L330,345 L279,349 L238,338 L206,320 L182,296 L176,270 Z",
    // Southern Norway coast hint
    "M180,82 L194,89 L202,104 L198,124 L186,126 L176,108 Z",
    // Baltic/eastern coast hint (Finland/west Baltic rim)
    "M302,86 L328,86 L350,98 L358,122 L352,150 L330,168 L312,155 L305,127 Z",
  ];

  geoG.selectAll(".land-shape")
    .data(landShapes)
    .join("path")
    .attr("class", "land-shape")
    .attr("d", d => d)
    .attr("fill", landStyle.fill)
    .attr("fill-opacity", landStyle.fillOpacity)
    .attr("stroke", landStyle.stroke)
    .attr("stroke-opacity", landStyle.strokeOpacity)
    .attr("stroke-width", landStyle.strokeWidth);

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
    .domain([-80, 0, 40, 150, 350])
    .range([COLORS.cyan, "#60a5fa", COLORS.green, COLORS.amber, COLORS.red])
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
      sel.select(".node-price").attr("fill", "#475569")
        .text(price < 0 ? `\u2212\u20AC${Math.abs(price)}` : `\u20AC${price}`);
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

    // Always show aftermath card for current scenario; highlight on aftermath phase
    document.querySelectorAll(".aftermath-card").forEach(card => {
      const isCurrentScenario = card.dataset.sc === currentScenario;
      card.classList.toggle("hidden", !isCurrentScenario);
      card.classList.toggle("aftermath-highlight", isCurrentScenario && phase === "aftermath");
    });

    // Update stress label in SVG
    const stressTexts = {
      normal: "",
      shock: phase === "shock" ? (currentScenario === "windsurplus" ? "SURPLUS" : "STRESS") : "",
      response: "RECOVERING",
      aftermath: "AFTERMATH",
    };
    stressLabel
      .transition().duration(300)
      .attr("opacity", stressTexts[phase] ? 0.6 : 0)
      .text(stressTexts[phase] || "")
      .attr("fill", phase === "shock"
        ? (currentScenario === "windsurplus" ? COLORS.cyan : COLORS.red)
        : phase === "response" ? COLORS.amber : "#94a3b8");

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

    // Start at shock phase (goToPhase handles aftermath visibility)
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

  // Start on the shock phase of dunkelflaute scenario to show immediate impact
  goToPhase("shock");
  updateTimescale(scenarios.dunkelflaute);
  updateWhoActs(scenarios.dunkelflaute);
}

export function destroy() {
  // Clean up autoplay if navigating away
  if (autoplayTimer) {
    clearInterval(autoplayTimer);
    autoplayTimer = null;
  }
  isPlaying = false;
}
