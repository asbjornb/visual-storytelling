import * as d3 from "d3";

/* ── Helpers ───────────────────────────────────────── */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fmt0 = d3.format(",.0f");
const fmt1 = d3.format(",.1f");

/* ── Light-theme palette ──────────────────────────── */
const COLORS = {
  axis: "#94a3b8",
  axisLine: "rgba(0,0,0,0.1)",
  axisTick: "rgba(0,0,0,0.06)",
  label: "#1e293b",
  labelDim: "#94a3b8",
  labelInside: "#fff",
  capBarFill: "rgba(0,0,0,0.03)",
  capBarStroke: "rgba(0,0,0,0.06)",
  accent: "#6366f1",
  accentGlow: "rgba(99,102,241,0.2)",
  green: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
};

/* ── Boot ──────────────────────────────────────────── */
initResponseStack();
initMeritOrder();
initGridMap();
initTrading();
initGenStack();
initScenarioButtons();

/* ================================================================
   CH 1 — Response Stack (Light Switch + Time-Based Cascade)
   Flip the switch → 25 GW demand surge.
   Batteries fire instantly, hand off to hydro, then gas.
   Once gas carries the load, batteries recharge.
   ================================================================ */
function initResponseStack() {
  const container = document.getElementById("response-stack");
  const switchBtn = document.getElementById("power-switch");
  const freqEl = document.getElementById("freq-value");
  const freqStatus = document.getElementById("freq-status");
  const statusEl = document.getElementById("demand-status");
  const timerEl = document.getElementById("cascade-timer");

  const SURGE_GW = 25;

  const generators = [
    { name: "Batteries", speed: "50 ms", color: "#10b981", maxGW: 6, type: "storage" },
    { name: "Hydro", speed: "5 sec", color: "#22d3ee", maxGW: 12, type: "generator" },
    { name: "Gas Turbine", speed: "2 min", color: "#f59e0b", maxGW: 25, type: "generator" },
    { name: "Gas CCGT", speed: "10 min", color: "#fb923c", maxGW: 20, type: "generator" },
    { name: "Coal", speed: "30 min", color: "#94a3b8", maxGW: 15, type: "generator" },
    { name: "Nuclear", speed: "Baseload", color: "#a78bfa", maxGW: 12, type: "baseload" },
  ];

  // Response curves: delay (s), ramp duration (s), steady-state output (GW)
  const responseCurves = {
    Hydro:         { delay: 0.4, ramp: 2.0, steady: 8 },
    "Gas Turbine": { delay: 1.8, ramp: 3.0, steady: 10 },
    "Gas CCGT":    { delay: 3.5, ramp: 3.5, steady: 6 },
    Coal:          { delay: 6.0, ramp: 3.0, steady: 2 },
    Nuclear:       { delay: 0,   ramp: 0,   steady: 0 },
  };

  const totalCapacity = generators.reduce((s, g) => s + g.maxGW, 0);
  const margin = { top: 30, right: 30, bottom: 40, left: 120 };

  const svg = d3.select(container).append("svg")
    .attr("viewBox", "0 0 700 380")
    .attr("preserveAspectRatio", "xMidYMid meet");

  const w = 700 - margin.left - margin.right;
  const h = 380 - margin.top - margin.bottom;
  const gEl = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([0, totalCapacity]).range([0, w]);
  const y = d3.scaleBand().domain(generators.map(d => d.name)).range([0, h]).padding(0.22);

  // Soft glow filter
  const defs = svg.append("defs");
  const filter = defs.append("filter").attr("id", "bar-glow").attr("x", "-20%").attr("y", "-20%").attr("width", "140%").attr("height", "140%");
  filter.append("feGaussianBlur").attr("stdDeviation", "3").attr("result", "blur");
  filter.append("feMerge").selectAll("feMergeNode").data(["blur", "SourceGraphic"]).join("feMergeNode").attr("in", d => d);

  // x-axis
  gEl.append("g")
    .attr("transform", `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(d => `${d} GW`))
    .call(g => g.select(".domain").attr("stroke", COLORS.axisLine))
    .call(g => g.selectAll(".tick line").attr("stroke", COLORS.axisTick))
    .call(g => g.selectAll(".tick text").attr("fill", COLORS.axis).attr("font-size", 11));

  // Generator labels
  generators.forEach(gen => {
    const yPos = y(gen.name) + y.bandwidth() / 2;
    gEl.append("text")
      .attr("x", -8).attr("y", yPos).attr("dy", "0.35em")
      .attr("text-anchor", "end").attr("fill", COLORS.label)
      .attr("font-size", 13).attr("font-weight", 600)
      .text(gen.name);
    gEl.append("text")
      .attr("x", -8).attr("y", yPos + 16)
      .attr("text-anchor", "end").attr("fill", COLORS.labelDim).attr("font-size", 10)
      .text(gen.speed);
  });

  // Background bars (capacity)
  gEl.selectAll(".cap-bar").data(generators).join("rect")
    .attr("class", "cap-bar")
    .attr("x", 0).attr("y", d => y(d.name))
    .attr("width", d => x(d.maxGW)).attr("height", y.bandwidth())
    .attr("rx", 4).attr("fill", COLORS.capBarFill)
    .attr("stroke", COLORS.capBarStroke).attr("stroke-width", 1);

  // Active bars
  const activeBars = gEl.selectAll(".active-bar").data(generators).join("rect")
    .attr("class", "active-bar")
    .attr("x", 0).attr("y", d => y(d.name)).attr("height", y.bandwidth())
    .attr("rx", 4).attr("fill", d => d.color).attr("opacity", 0.1);

  // Glow bars
  const glowBars = gEl.selectAll(".glow-bar").data(generators).join("rect")
    .attr("class", "glow-bar")
    .attr("x", 0).attr("y", d => y(d.name)).attr("height", y.bandwidth())
    .attr("rx", 4).attr("fill", d => d.color).attr("opacity", 0).attr("filter", "url(#bar-glow)");

  // Bar labels
  const barLabels = gEl.selectAll(".bar-label").data(generators).join("text")
    .attr("class", "bar-label")
    .attr("y", d => y(d.name) + y.bandwidth() / 2).attr("dy", "0.35em")
    .attr("fill", COLORS.label).attr("font-size", 11).attr("font-weight", 600);

  // Status labels (DISCHARGING / RECHARGING / RAMPING)
  const statusLabels = gEl.selectAll(".status-label").data(generators).join("text")
    .attr("class", "status-label")
    .attr("y", d => y(d.name) + y.bandwidth() / 2).attr("dy", "0.35em")
    .attr("font-size", 9).attr("font-weight", 700).attr("letter-spacing", "0.05em");

  // ── Animation state ──
  let animState = generators.map(() => 0);
  let targetState = generators.map(() => 0);
  let currentFreq = 50.0;
  let targetFreq = 50.0;
  let switchOn = false;
  let switchTime = 0;
  let offSnapshot = null; // captures animState at moment of switch-off

  /** Compute target dispatch for each generator at time t (seconds since switch-on) */
  function computeOnTargets(t) {
    // First compute all non-battery generation at time t
    let otherGen = 0;
    const targets = new Array(generators.length).fill(0);

    for (let i = 0; i < generators.length; i++) {
      const gen = generators[i];
      if (gen.type === "storage") continue; // handle battery last

      const curve = responseCurves[gen.name];
      if (!curve || curve.steady === 0) continue;

      let output = 0;
      if (t >= curve.delay) {
        const elapsed = t - curve.delay;
        output = Math.min(curve.steady, curve.steady * (elapsed / curve.ramp));
      }
      targets[i] = output;
      otherGen += output;
    }

    // Battery fills whatever gap remains, then recharges once gas carries load
    const gap = SURGE_GW - otherGen;
    let battOutput;

    if (gap > 0.5) {
      // Grid still short — battery discharges to cover gap
      battOutput = Math.min(6, gap);
    } else if (t > 6 && otherGen >= SURGE_GW + 0.5) {
      // Surplus generation available — battery recharges
      battOutput = -Math.min(3, otherGen - SURGE_GW);
    } else {
      battOutput = 0;
    }
    targets[0] = battOutput;

    // Frequency based on supply shortfall
    const totalSupply = otherGen + Math.max(0, battOutput);
    const deficit = Math.max(0, SURGE_GW - totalSupply);
    targetFreq = 50.0 - deficit * 0.06;

    return targets;
  }

  function tick() {
    const now = performance.now();

    if (switchOn) {
      const t = Math.min((now - switchTime) / 1000, 10);
      targetState = computeOnTargets(t);
      timerEl.textContent = `${t.toFixed(1)}s elapsed`;

      if (t < 0.5) {
        statusEl.textContent = "Demand surging! +25 GW";
        statusEl.style.color = COLORS.red;
      } else if (t < 2) {
        statusEl.textContent = "Batteries absorbing shock...";
        statusEl.style.color = COLORS.green;
      } else if (t < 4.5) {
        statusEl.textContent = "Hydro ramping, gas spinning up...";
        statusEl.style.color = COLORS.amber;
      } else if (t < 7) {
        statusEl.textContent = "Gas carrying load, batteries easing off";
        statusEl.style.color = COLORS.accent;
      } else {
        statusEl.textContent = "Grid stable — batteries recharging";
        statusEl.style.color = COLORS.green;
      }
    } else if (offSnapshot) {
      // Decay from snapshot to zero
      const t = (now - switchTime) / 1000;
      const decay = Math.max(0, 1 - t / 2.5);

      for (let i = 0; i < generators.length; i++) {
        targetState[i] = offSnapshot[i] * decay;
      }
      targetFreq = 50.0;

      if (decay < 0.01) {
        targetState = generators.map(() => 0);
        offSnapshot = null;
        statusEl.textContent = "Flip the switch to add demand";
        statusEl.style.color = "";
        timerEl.textContent = "";
      } else {
        statusEl.textContent = "Load removed — generators backing off";
        statusEl.style.color = COLORS.accent;
        timerEl.textContent = "Ramping down...";
      }
    }

    // Smooth interpolation toward targets
    for (let i = 0; i < generators.length; i++) {
      const speed = generators[i].type === "storage" ? 0.2 : 0.12;
      animState[i] += (targetState[i] - animState[i]) * speed;
    }

    // Frequency with jitter
    currentFreq += (targetFreq - currentFreq) * 0.08;
    currentFreq += (Math.random() - 0.5) * 0.003;
    currentFreq = clamp(currentFreq, 49.0, 50.1);

    // ── Render frequency display ──
    freqEl.textContent = currentFreq.toFixed(2);
    const deviation = Math.abs(currentFreq - 50.0);
    if (deviation > 0.2) {
      freqEl.style.color = COLORS.red;
      freqStatus.textContent = "Critical";
      freqStatus.style.color = COLORS.red;
      freqStatus.style.background = "rgba(239,68,68,0.1)";
    } else if (deviation > 0.08) {
      freqEl.style.color = COLORS.amber;
      freqStatus.textContent = "Tense";
      freqStatus.style.color = COLORS.amber;
      freqStatus.style.background = "rgba(245,158,11,0.1)";
    } else {
      freqEl.style.color = COLORS.green;
      freqStatus.textContent = "Stable";
      freqStatus.style.color = COLORS.green;
      freqStatus.style.background = "rgba(16,185,129,0.1)";
    }

    // ── Render bars ──
    activeBars.data(animState)
      .attr("width", d => Math.max(0, x(Math.abs(d))))
      .attr("fill", (d, i) => {
        if (generators[i].type === "storage" && d < -0.2) return COLORS.amber;
        return generators[i].color;
      })
      .attr("opacity", d => Math.abs(d) > 0.1 ? 0.85 : 0.1);

    glowBars.data(animState)
      .attr("width", d => Math.max(0, x(Math.abs(d))))
      .attr("fill", (d, i) => {
        if (generators[i].type === "storage" && d < -0.2) return COLORS.amber;
        return generators[i].color;
      })
      .attr("opacity", d => Math.abs(d) > 0.1 ? 0.18 : 0);

    barLabels.data(animState)
      .attr("x", d => {
        const barW = x(Math.abs(d));
        return barW > 55 ? barW - 8 : barW + 6;
      })
      .attr("text-anchor", d => x(Math.abs(d)) > 55 ? "end" : "start")
      .attr("fill", (d, i) => {
        if (x(Math.abs(d)) > 55) return COLORS.labelInside;
        if (generators[i].type === "storage" && d < -0.2) return COLORS.amber;
        return generators[i].color;
      })
      .text(d => Math.abs(d) > 0.2 ? `${fmt1(Math.abs(d))} GW` : "");

    statusLabels.data(animState)
      .attr("x", d => x(Math.abs(d)) + 50)
      .attr("fill", (d, i) => {
        const gen = generators[i];
        if (gen.type === "storage") {
          if (d > 0.3) return COLORS.green;
          if (d < -0.3) return COLORS.amber;
        }
        if (gen.type === "generator" && d > 0.3) return generators[i].color;
        return "transparent";
      })
      .text((d, i) => {
        const gen = generators[i];
        if (gen.type === "storage") {
          if (d > 0.3) return "DISCHARGING";
          if (d < -0.3) return "RECHARGING";
        }
        if (gen.type === "generator" && d > 0.3) return "RAMPING";
        return "";
      });

    requestAnimationFrame(tick);
  }

  switchBtn.addEventListener("click", () => {
    switchOn = !switchOn;
    switchTime = performance.now();
    switchBtn.setAttribute("aria-checked", String(switchOn));

    if (!switchOn) {
      // Capture current visual state for decay
      offSnapshot = [...animState];
    }
  });

  tick();
}

/* ================================================================
   CH 2 — Merit Order
   ================================================================ */
function initMeritOrder() {
  const container = document.getElementById("merit-chart");
  const priceEl = document.getElementById("merit-price");
  const solarSlider = document.getElementById("solar-slider");
  const windSlider = document.getElementById("wind-slider");
  const demandSlider = document.getElementById("demand-merit");

  const sources = [
    { name: "Solar", baseCap: 25, cost: 0, color: "#fbbf24" },
    { name: "Wind", baseCap: 30, cost: 0, color: "#22d3ee" },
    { name: "Nuclear", baseCap: 14, cost: 12, color: "#a78bfa" },
    { name: "Hydro", baseCap: 12, cost: 22, color: "#34d399" },
    { name: "Coal", baseCap: 16, cost: 55, color: "#94a3b8" },
    { name: "Gas CCGT", baseCap: 22, cost: 78, color: "#fb923c" },
    { name: "Gas Peaker", baseCap: 12, cost: 130, color: "#f472b6" },
    { name: "Oil", baseCap: 6, cost: 190, color: "#ef4444" },
  ];

  const margin = { top: 30, right: 20, bottom: 60, left: 50 };
  const svg = d3.select(container).append("svg")
    .attr("viewBox", "0 0 760 400").attr("preserveAspectRatio", "xMidYMid meet");

  const w = 760 - margin.left - margin.right;
  const h = 400 - margin.top - margin.bottom;
  const gEl = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const xScale = d3.scaleLinear().range([0, w]);
  const yScale = d3.scaleLinear().domain([0, 220]).range([h, 0]);

  const xAxisG = gEl.append("g").attr("class", "x-axis").attr("transform", `translate(0,${h})`);
  const yAxisG = gEl.append("g").attr("class", "y-axis");

  const defs = svg.append("defs");
  const glowFilter = defs.append("filter").attr("id", "merit-glow").attr("x", "-30%").attr("y", "-30%").attr("width", "160%").attr("height", "160%");
  glowFilter.append("feGaussianBlur").attr("stdDeviation", "5").attr("result", "blur");
  glowFilter.append("feMerge").selectAll("feMergeNode").data(["blur", "SourceGraphic"]).join("feMergeNode").attr("in", d => d);

  const demandLineG = gEl.append("g");

  function update() {
    const solarPct = +solarSlider.value;
    const windPct = +windSlider.value;
    const demand = +demandSlider.value;

    const stack = sources.map(s => {
      let cap = s.baseCap;
      if (s.name === "Solar") cap = (solarPct / 100) * s.baseCap;
      if (s.name === "Wind") cap = (windPct / 100) * s.baseCap;
      return { ...s, cap };
    });

    let cumX = 0;
    let marginalSource = null;
    let clearingPrice = 0;
    const blocks = stack.map(s => {
      const x0 = cumX;
      cumX += s.cap;
      const dispatched = demand > x0;
      const isMarginal = demand > x0 && demand <= cumX;
      if (isMarginal) { marginalSource = s; clearingPrice = s.cost; }
      if (demand > cumX && !marginalSource) clearingPrice = s.cost;
      return { ...s, x0, x1: cumX, dispatched, isMarginal };
    });

    if (demand > cumX) { clearingPrice = 300; }
    if (!marginalSource && demand <= cumX) {
      for (let i = blocks.length - 1; i >= 0; i--) {
        if (blocks[i].dispatched) { blocks[i].isMarginal = true; clearingPrice = blocks[i].cost; break; }
      }
    }

    const totalCap = cumX;
    xScale.domain([0, Math.max(totalCap, demand + 5)]);

    xAxisG.transition().duration(300)
      .call(d3.axisBottom(xScale).ticks(8).tickFormat(d => `${d} GW`))
      .call(g => g.select(".domain").attr("stroke", COLORS.axisLine))
      .call(g => g.selectAll(".tick line").attr("stroke", COLORS.axisTick))
      .call(g => g.selectAll(".tick text").attr("fill", COLORS.axis).attr("font-size", 11));

    yAxisG.transition().duration(300)
      .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => `\u20AC${d}`))
      .call(g => g.select(".domain").attr("stroke", COLORS.axisLine))
      .call(g => g.selectAll(".tick line").attr("stroke", COLORS.axisTick))
      .call(g => g.selectAll(".tick text").attr("fill", COLORS.axis).attr("font-size", 11));

    const sel = gEl.selectAll(".merit-block").data(blocks, d => d.name);
    const enter = sel.enter().append("g").attr("class", "merit-block");
    enter.append("rect").attr("class", "block-bg");
    enter.append("rect").attr("class", "block-glow");
    enter.append("text").attr("class", "block-label");
    const merged = enter.merge(sel);

    merged.select(".block-bg").transition().duration(400)
      .attr("x", d => xScale(d.x0) + 1).attr("y", d => yScale(d.cost))
      .attr("width", d => Math.max(0, xScale(d.x1) - xScale(d.x0) - 2))
      .attr("height", d => h - yScale(d.cost)).attr("rx", 4)
      .attr("fill", d => d.dispatched ? d.color : COLORS.capBarFill)
      .attr("stroke", d => d.dispatched ? d.color : COLORS.capBarStroke)
      .attr("stroke-width", 1)
      .attr("opacity", d => d.dispatched ? (d.isMarginal ? 1 : 0.75) : 0.3);

    merged.select(".block-glow").transition().duration(400)
      .attr("x", d => xScale(d.x0) + 1).attr("y", d => yScale(d.cost))
      .attr("width", d => Math.max(0, xScale(d.x1) - xScale(d.x0) - 2))
      .attr("height", d => h - yScale(d.cost)).attr("rx", 4)
      .attr("fill", d => d.isMarginal ? d.color : "none")
      .attr("opacity", d => d.isMarginal ? 0.3 : 0)
      .attr("filter", "url(#merit-glow)");

    merged.select(".block-label")
      .attr("x", d => xScale((d.x0 + d.x1) / 2))
      .attr("y", d => (h - yScale(d.cost)) > 30 ? yScale(d.cost) + 18 : yScale(d.cost) - 8)
      .attr("text-anchor", "middle")
      .attr("fill", d => (h - yScale(d.cost)) > 30 ? COLORS.labelInside : d.color)
      .attr("font-size", d => (xScale(d.x1) - xScale(d.x0)) > 40 ? 11 : 9)
      .attr("font-weight", 600)
      .attr("opacity", d => d.cap > 0.5 ? 1 : 0)
      .text(d => d.name);

    sel.exit().remove();

    // Demand line — indigo accent
    demandLineG.selectAll("*").remove();
    demandLineG.append("line")
      .attr("x1", xScale(demand)).attr("x2", xScale(demand))
      .attr("y1", -10).attr("y2", h + 10)
      .attr("stroke", COLORS.accent).attr("stroke-width", 2).attr("stroke-dasharray", "6 4");

    if (clearingPrice > 0 && clearingPrice <= 220) {
      demandLineG.append("line")
        .attr("x1", 0).attr("x2", xScale(demand))
        .attr("y1", yScale(clearingPrice)).attr("y2", yScale(clearingPrice))
        .attr("stroke", COLORS.accent).attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "4 3").attr("opacity", 0.5);
    }

    const displayPrice = clearingPrice > 220 ? "300+" : fmt0(clearingPrice);
    priceEl.textContent = `\u20AC${displayPrice}`;
    priceEl.style.color = clearingPrice > 150 ? COLORS.red : clearingPrice > 80 ? COLORS.amber : COLORS.green;
  }

  solarSlider.addEventListener("input", update);
  windSlider.addEventListener("input", update);
  demandSlider.addEventListener("input", update);
  update();
}

/* ================================================================
   CH 3 — Grid Map
   ================================================================ */
function initGridMap() {
  const container = document.getElementById("grid-map");

  const nodes = {
    NO: { x: 200, y: 70, label: "Norway" },
    SE: { x: 310, y: 100, label: "Sweden" },
    DK: { x: 310, y: 185, label: "Denmark" },
    UK: { x: 120, y: 260, label: "UK" },
    NL: { x: 310, y: 265, label: "Netherlands" },
    DE: { x: 400, y: 230, label: "Germany" },
    BE: { x: 280, y: 310, label: "Belgium" },
    FR: { x: 230, y: 370, label: "France" },
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

  const scenarios = {
    wind: {
      prices: { NO: 45, SE: 52, DK: 95, UK: 130, NL: 155, DE: 175, BE: 160, FR: 140 },
      flows: { "NO-SE": 0.6, "NO-DK": 0.7, "SE-DK": 0.5, "DK-DE": 0.95, "NO-UK": 0.5, "NO-DE": 0.85, "UK-NL": 0.4, "UK-BE": 0.3, "UK-FR": 0.2, "NL-DE": 0.7, "NL-BE": 0.5, "DE-BE": 0.6, "DE-FR": 0.5, "FR-BE": 0.3 },
      congested: ["DK-DE", "NO-DE"],
    },
    cold: {
      prices: { NO: 80, SE: 90, DK: 220, UK: 280, NL: 310, DE: 350, BE: 320, FR: 300 },
      flows: { "NO-SE": 0.7, "NO-DK": 0.8, "SE-DK": 0.6, "DK-DE": 0.98, "NO-UK": 0.6, "NO-DE": 0.9, "UK-NL": 0.55, "UK-BE": 0.5, "UK-FR": 0.45, "NL-DE": 0.95, "NL-BE": 0.85, "DE-BE": 0.9, "DE-FR": 0.88, "FR-BE": 0.5 },
      congested: ["DK-DE", "NL-DE", "DE-BE", "DE-FR"],
    },
    drought: {
      prices: { NO: 130, SE: 140, DK: 170, UK: 190, NL: 210, DE: 230, BE: 215, FR: 200 },
      flows: { "NO-SE": 0.4, "NO-DK": 0.3, "SE-DK": 0.35, "DK-DE": 0.6, "NO-UK": 0.25, "NO-DE": 0.4, "UK-NL": 0.45, "UK-BE": 0.4, "UK-FR": 0.35, "NL-DE": 0.5, "NL-BE": 0.45, "DE-BE": 0.4, "DE-FR": 0.5, "FR-BE": 0.35 },
      congested: ["NO-SE"],
    },
    nuclear: {
      prices: { NO: 70, SE: 85, DK: 180, UK: 200, NL: 260, DE: 280, BE: 290, FR: 420 },
      flows: { "NO-SE": 0.5, "NO-DK": 0.6, "SE-DK": 0.55, "DK-DE": 0.75, "NO-UK": 0.4, "NO-DE": 0.7, "UK-NL": 0.5, "UK-BE": 0.55, "UK-FR": 0.8, "NL-DE": 0.6, "NL-BE": 0.7, "DE-BE": 0.8, "DE-FR": 0.95, "FR-BE": 0.92 },
      congested: ["DE-FR", "FR-BE", "UK-FR"],
    },
  };

  const svg = d3.select(container).append("svg")
    .attr("viewBox", "0 0 540 440").attr("preserveAspectRatio", "xMidYMid meet");

  const defs = svg.append("defs");
  const nodeGlow = defs.append("filter").attr("id", "node-glow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
  nodeGlow.append("feGaussianBlur").attr("stdDeviation", "6").attr("result", "blur");
  nodeGlow.append("feMerge").selectAll("feMergeNode").data(["blur", "SourceGraphic"]).join("feMergeNode").attr("in", d => d);

  const edgeG = svg.append("g");
  const nodeG = svg.append("g");

  const priceColor = d3.scaleLinear().domain([40, 150, 350]).range([COLORS.green, COLORS.amber, COLORS.red]).clamp(true);

  function renderScenario(key) {
    const sc = scenarios[key];
    if (!sc) return;

    const edgeSel = edgeG.selectAll(".flow-line").data(edges, d => `${d.from}-${d.to}`);
    const edgeEnter = edgeSel.enter().append("g").attr("class", "flow-line");
    edgeEnter.append("line").attr("class", "flow-bg");
    edgeEnter.append("line").attr("class", "flow-dash");

    edgeEnter.merge(edgeSel).each(function(d) {
      const k = `${d.from}-${d.to}`;
      const flow = sc.flows[k] ?? 0.2;
      const congested = sc.congested.includes(k);
      const from = nodes[d.from], to = nodes[d.to];
      const color = congested ? COLORS.red : "rgba(0,0,0,0.08)";
      const width = 1.5 + flow * 5;
      const sel = d3.select(this);
      sel.select(".flow-bg").transition().duration(500)
        .attr("x1", from.x).attr("y1", from.y).attr("x2", to.x).attr("y2", to.y)
        .attr("stroke", color).attr("stroke-width", width).attr("stroke-opacity", 0.25);
      sel.select(".flow-dash")
        .attr("x1", from.x).attr("y1", from.y).attr("x2", to.x).attr("y2", to.y)
        .attr("stroke", congested ? COLORS.red : COLORS.accent)
        .attr("stroke-width", Math.max(1.5, width * 0.6))
        .attr("stroke-opacity", congested ? 0.9 : 0.4 + flow * 0.4)
        .attr("stroke-dasharray", "8 6")
        .style("animation", `flowDash ${(2 - flow * 0.8).toFixed(1)}s linear infinite`);
    });

    const nodeSel = nodeG.selectAll(".grid-node").data(Object.entries(nodes), d => d[0]);
    const nodeEnter = nodeSel.enter().append("g").attr("class", "grid-node")
      .attr("transform", d => `translate(${d[1].x},${d[1].y})`);
    nodeEnter.append("circle").attr("class", "node-glow-circle").attr("r", 28).attr("filter", "url(#node-glow)");
    nodeEnter.append("circle").attr("class", "node-bg").attr("r", 24).attr("fill", "rgba(255,255,255,0.9)").attr("stroke-width", 2.5);
    nodeEnter.append("text").attr("class", "node-code").attr("y", -5).attr("text-anchor", "middle").attr("font-size", 14).attr("font-weight", 700);
    nodeEnter.append("text").attr("class", "node-price").attr("y", 12).attr("text-anchor", "middle").attr("font-size", 10).attr("font-weight", 600);

    nodeEnter.merge(nodeSel).each(function(d) {
      const [code] = d;
      const price = sc.prices[code] ?? 100;
      const c = priceColor(price);
      const sel = d3.select(this);
      sel.select(".node-glow-circle").transition().duration(500).attr("fill", c).attr("opacity", 0.18);
      sel.select(".node-bg").transition().duration(500).attr("stroke", c);
      sel.select(".node-code").attr("fill", c).text(code);
      sel.select(".node-price").attr("fill", "#475569").text(`\u20AC${price}`);
    });
  }

  const style = document.createElement("style");
  style.textContent = `@keyframes flowDash { to { stroke-dashoffset: -28; } }`;
  document.head.appendChild(style);

  renderScenario("wind");
  container._renderScenario = renderScenario;
}

function initScenarioButtons() {
  const bar = document.getElementById("scenario-bar");
  const container = document.getElementById("grid-map");
  const buttons = bar.querySelectorAll(".sc-btn");
  const texts = document.querySelectorAll(".sc-text");

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const sc = btn.dataset.sc;
      buttons.forEach(b => b.classList.toggle("active", b === btn));
      texts.forEach(t => t.classList.toggle("hidden", t.dataset.sc !== sc));
      if (container._renderScenario) container._renderScenario(sc);
    });
  });
}

/* ================================================================
   CH 4 — Trading / Interconnector Capacity
   ================================================================ */
function initTrading() {
  const container = document.getElementById("trade-viz");
  const slider = document.getElementById("trade-slider");
  const output = document.getElementById("trade-val");

  const margin = { top: 50, right: 40, bottom: 55, left: 40 };
  const svg = d3.select(container).append("svg")
    .attr("viewBox", "0 0 700 400").attr("preserveAspectRatio", "xMidYMid meet");

  const w = 700 - margin.left - margin.right;
  const h = 400 - margin.top - margin.bottom;
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const yScale = d3.scaleLinear().domain([0, 200]).range([h, 0]);
  const barWidth = 100;
  const norwayX = w * 0.2 - barWidth / 2;
  const germanyX = w * 0.8 - barWidth / 2;

  // Headers
  g.append("text").attr("x", w * 0.2).attr("y", -20).attr("text-anchor", "middle")
    .attr("fill", COLORS.label).attr("font-size", 16).attr("font-weight", 700).text("Norway");
  g.append("text").attr("x", w * 0.2).attr("y", -5).attr("text-anchor", "middle")
    .attr("fill", COLORS.labelDim).attr("font-size", 11).text("Hydro: \u20AC35/MWh");
  g.append("text").attr("x", w * 0.8).attr("y", -20).attr("text-anchor", "middle")
    .attr("fill", COLORS.label).attr("font-size", 16).attr("font-weight", 700).text("Germany");
  g.append("text").attr("x", w * 0.8).attr("y", -5).attr("text-anchor", "middle")
    .attr("fill", COLORS.labelDim).attr("font-size", 11).text("Gas: \u20AC180/MWh");

  // Background bars
  g.append("rect").attr("x", norwayX).attr("y", 0).attr("width", barWidth).attr("height", h)
    .attr("rx", 8).attr("fill", COLORS.capBarFill).attr("stroke", COLORS.capBarStroke);
  g.append("rect").attr("x", germanyX).attr("y", 0).attr("width", barWidth).attr("height", h)
    .attr("rx", 8).attr("fill", COLORS.capBarFill).attr("stroke", COLORS.capBarStroke);

  const norwayBar = g.append("rect").attr("x", norwayX).attr("width", barWidth).attr("rx", 8);
  const germanyBar = g.append("rect").attr("x", germanyX).attr("width", barWidth).attr("rx", 8);
  const norwayPrice = g.append("text").attr("x", w * 0.2).attr("text-anchor", "middle").attr("font-size", 22).attr("font-weight", 800);
  const germanyPrice = g.append("text").attr("x", w * 0.8).attr("text-anchor", "middle").attr("font-size", 22).attr("font-weight", 800);
  const flowGroup = g.append("g");
  const savingsText = g.append("text").attr("x", w * 0.5).attr("y", h + 35).attr("text-anchor", "middle").attr("font-size", 13).attr("font-weight", 600);
  const cableLabel = g.append("text").attr("x", w * 0.5).attr("y", h + 48).attr("text-anchor", "middle").attr("font-size", 11);

  const defs = svg.append("defs");
  const marker = defs.append("marker").attr("id", "flow-arrow").attr("viewBox", "0 0 10 10")
    .attr("refX", 10).attr("refY", 5).attr("markerWidth", 8).attr("markerHeight", 8).attr("orient", "auto");
  marker.append("path").attr("d", "M 0 0 L 10 5 L 0 10 Z").attr("fill", COLORS.accent);

  function update() {
    const capacityMW = +slider.value;
    output.textContent = `${fmt0(capacityMW)} MW`;

    const maxCap = 8000;
    const t = capacityMW / maxCap;

    const noBase = 35;
    const deBase = 180;
    const convergence = t * 0.65;
    const midpoint = (noBase + deBase) / 2;
    const noPrice = noBase + (midpoint - noBase) * convergence;
    const dePrice = deBase - (deBase - midpoint) * convergence;
    const flowGW = capacityMW / 1000;

    norwayBar.transition().duration(300)
      .attr("y", yScale(noPrice)).attr("height", h - yScale(noPrice)).attr("fill", COLORS.green);
    norwayPrice.transition().duration(300).attr("y", yScale(noPrice) - 8);
    norwayPrice.attr("fill", COLORS.green).text(`\u20AC${fmt0(noPrice)}`);

    germanyBar.transition().duration(300)
      .attr("y", yScale(dePrice)).attr("height", h - yScale(dePrice)).attr("fill", COLORS.red);
    germanyPrice.transition().duration(300).attr("y", yScale(dePrice) - 8);
    germanyPrice.attr("fill", COLORS.red).text(`\u20AC${fmt0(dePrice)}`);

    flowGroup.selectAll("*").remove();
    if (capacityMW > 100) {
      const numArrows = clamp(Math.ceil(flowGW), 1, 6);
      const arrowY = yScale(midpoint);
      const startX = norwayX + barWidth + 15;
      const endX = germanyX - 15;

      for (let i = 0; i < numArrows; i++) {
        const yOff = (i - (numArrows - 1) / 2) * 18;
        flowGroup.append("line")
          .attr("x1", startX).attr("y1", arrowY + yOff)
          .attr("x2", endX).attr("y2", arrowY + yOff)
          .attr("stroke", COLORS.accent).attr("stroke-width", 2)
          .attr("stroke-opacity", 0.3 + t * 0.5)
          .attr("stroke-dasharray", "8 5")
          .attr("marker-end", "url(#flow-arrow)")
          .style("animation", `flowDash ${(1.5 - t * 0.5).toFixed(1)}s linear infinite`);
      }

      flowGroup.append("text")
        .attr("x", (startX + endX) / 2).attr("y", arrowY - numArrows * 9 - 10)
        .attr("text-anchor", "middle").attr("fill", COLORS.accent)
        .attr("font-size", 12).attr("font-weight", 600)
        .text(`${fmt1(flowGW)} GW flowing \u2192`);
    }

    const saving = (deBase - noBase) * convergence;
    if (capacityMW < 100) {
      savingsText.attr("fill", COLORS.labelDim).text("No cable \u2014 prices reflect local supply only");
      cableLabel.attr("fill", "transparent").text("");
    } else {
      savingsText.attr("fill", COLORS.green)
        .text(`German consumers save \u20AC${fmt0(saving)}/MWh \u00B7 Norway earns \u20AC${fmt0(noPrice - noBase)}/MWh more`);
      cableLabel.attr("fill", COLORS.labelDim)
        .text(`Real cables: NordLink (1,400 MW), NorNed (700 MW) \u2014 you've built ${fmt0(capacityMW)} MW`);
    }
  }

  slider.addEventListener("input", update);
  update();
}

/* ================================================================
   CH 5 — Generation Stack
   ================================================================ */
function initGenStack() {
  const container = document.getElementById("gen-stack-viz");
  const hourSlider = document.getElementById("hour-slider");
  const solarSlider = document.getElementById("solar-cap");
  const batterySlider = document.getElementById("battery-cap");
  const playBtn = document.getElementById("play-btn");
  const clockHour = document.getElementById("clock-hour");
  const clockPeriod = document.getElementById("clock-period");
  const clockDemand = document.getElementById("clock-demand");
  const clockPrice = document.getElementById("clock-price");
  const clockRenew = document.getElementById("clock-renew");
  const clockCo2 = document.getElementById("clock-co2");

  const genTypes = [
    { name: "Nuclear", color: "#a78bfa", co2: 12 },
    { name: "Wind", color: "#22d3ee", co2: 0 },
    { name: "Solar", color: "#fbbf24", co2: 0 },
    { name: "Hydro", color: "#34d399", co2: 0 },
    { name: "Battery", color: "#10b981", co2: 0 },
    { name: "Gas CCGT", color: "#fb923c", co2: 400 },
    { name: "Gas Peaker", color: "#f472b6", co2: 550 },
    { name: "Coal", color: "#94a3b8", co2: 900 },
  ];

  const margin = { top: 30, right: 20, bottom: 50, left: 50 };
  const svg = d3.select(container).append("svg")
    .attr("viewBox", "0 0 760 400").attr("preserveAspectRatio", "xMidYMid meet");

  const w = 760 - margin.left - margin.right;
  const h = 400 - margin.top - margin.bottom;
  const gEl = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const xScale = d3.scaleBand().domain(d3.range(24)).range([0, w]).padding(0.12);
  const yScale = d3.scaleLinear().domain([0, 110]).range([h, 0]);

  gEl.append("g").attr("class", "x-axis").attr("transform", `translate(0,${h})`)
    .call(d3.axisBottom(xScale).tickFormat(d => `${d}h`))
    .call(g => g.select(".domain").attr("stroke", COLORS.axisLine))
    .call(g => g.selectAll(".tick line").attr("stroke", COLORS.axisTick))
    .call(g => g.selectAll(".tick text").attr("fill", COLORS.axis).attr("font-size", 9));

  const yAxisG = gEl.append("g").attr("class", "y-axis");

  // Subtle day/night background for light theme
  const defs = svg.append("defs");
  const skyGrad = defs.append("linearGradient").attr("id", "sky-bg").attr("x1", "0%").attr("x2", "100%");
  skyGrad.append("stop").attr("offset", "0%").attr("stop-color", "#e8edf5");
  skyGrad.append("stop").attr("offset", "25%").attr("stop-color", "#e8edf5");
  skyGrad.append("stop").attr("offset", "33%").attr("stop-color", "#dbe4f0");
  skyGrad.append("stop").attr("offset", "45%").attr("stop-color", "#bfdbfe");
  skyGrad.append("stop").attr("offset", "50%").attr("stop-color", "#93c5fd");
  skyGrad.append("stop").attr("offset", "55%").attr("stop-color", "#bfdbfe");
  skyGrad.append("stop").attr("offset", "67%").attr("stop-color", "#dbe4f0");
  skyGrad.append("stop").attr("offset", "75%").attr("stop-color", "#e8edf5");
  skyGrad.append("stop").attr("offset", "100%").attr("stop-color", "#e8edf5");

  gEl.insert("rect", ":first-child")
    .attr("x", 0).attr("y", 0).attr("width", w).attr("height", h)
    .attr("fill", "url(#sky-bg)").attr("opacity", 0.25);

  // Demand line
  const demandPath = gEl.append("path")
    .attr("fill", "none").attr("stroke", COLORS.label).attr("stroke-width", 2)
    .attr("stroke-dasharray", "4 3").attr("opacity", 0.4);

  // Hour highlight
  const hourHighlight = gEl.append("rect")
    .attr("fill", COLORS.accent).attr("opacity", 0.1).attr("rx", 3);

  // Legend
  const legend = svg.append("g").attr("transform", `translate(${margin.left},${margin.top + h + 30})`);
  genTypes.forEach((gen, i) => {
    const lg = legend.append("g").attr("transform", `translate(${i * 88}, 0)`);
    lg.append("rect").attr("width", 10).attr("height", 10).attr("rx", 2).attr("fill", gen.color);
    lg.append("text").attr("x", 14).attr("y", 9).attr("fill", "#64748b").attr("font-size", 9).text(gen.name);
  });

  function computeHourlyMix(solarCap, batteryCap) {
    const hours = d3.range(24);
    const demand = hours.map(hr => {
      const morning = 8 * Math.exp(-((hr - 8) ** 2) / 14);
      const evening = 16 * Math.exp(-((hr - 19) ** 2) / 12);
      return 62 + morning + evening + 1.5 * Math.sin(((hr - 3) / 24) * Math.PI * 2);
    });

    const solarOutput = hours.map(hr => {
      const shape = Math.max(0, Math.sin(((hr - 6) / 12) * Math.PI)) ** 1.6;
      return solarCap * shape * 0.9;
    });

    const windOutput = hours.map(hr => 15 + 4 * Math.sin(((hr + 2) / 24) * Math.PI * 2));

    const energyCap = batteryCap * 4;
    const powerCap = batteryCap * 0.6;
    let energy = energyCap * 0.3;
    const batteryOutput = [];

    hours.forEach(hr => {
      const netNeed = demand[hr] - solarOutput[hr] - windOutput[hr] - 12;
      let batt = 0;
      if (netNeed < 30 && energy < energyCap) {
        const charge = Math.min(powerCap, 30 - netNeed, energyCap - energy);
        batt = -charge;
        energy += charge * 0.92;
      } else if (netNeed > 50 && energy > 0) {
        const discharge = Math.min(powerCap, netNeed - 50, energy);
        batt = discharge;
        energy -= discharge / 0.92;
      }
      batteryOutput.push(batt);
    });

    return hours.map(hr => {
      const d = demand[hr];
      let remaining = d;
      const mix = {};

      const nuclear = Math.min(12, remaining);
      mix["Nuclear"] = nuclear; remaining -= nuclear;

      const wind = Math.min(windOutput[hr], remaining);
      mix["Wind"] = wind; remaining -= wind;

      const solar = Math.min(solarOutput[hr], remaining);
      mix["Solar"] = solar; remaining -= solar;

      const hydro = Math.min(12, remaining);
      mix["Hydro"] = hydro; remaining -= hydro;

      const batt = Math.max(0, batteryOutput[hr]);
      const battUsed = Math.min(batt, remaining);
      mix["Battery"] = battUsed; remaining -= battUsed;

      const ccgt = Math.min(22, remaining);
      mix["Gas CCGT"] = ccgt; remaining -= ccgt;

      const peaker = Math.min(12, remaining);
      mix["Gas Peaker"] = peaker; remaining -= peaker;

      const coal = Math.min(15, remaining);
      mix["Coal"] = coal;

      return { hour: hr, demand: d, mix };
    });
  }

  function getPeriodName(hr) {
    if (hr >= 6 && hr < 10) return "Morning";
    if (hr >= 10 && hr < 14) return "Midday";
    if (hr >= 14 && hr < 17) return "Afternoon";
    if (hr >= 17 && hr < 21) return "Evening";
    if (hr >= 21 || hr < 1) return "Night";
    return "Late Night";
  }

  function update() {
    const solarCap = +solarSlider.value;
    const batteryCap = +batterySlider.value;
    const selectedHour = +hourSlider.value;

    const data = computeHourlyMix(solarCap, batteryCap);

    const maxDemand = d3.max(data, d => d.demand);
    yScale.domain([0, Math.max(100, maxDemand + 5)]);

    yAxisG.transition().duration(200)
      .call(d3.axisLeft(yScale).ticks(6).tickFormat(d => `${d} GW`))
      .call(g => g.select(".domain").attr("stroke", COLORS.axisLine))
      .call(g => g.selectAll(".tick line").attr("stroke", COLORS.axisTick))
      .call(g => g.selectAll(".tick text").attr("fill", COLORS.axis).attr("font-size", 10));

    const stackData = data.map(d => {
      let y0 = 0;
      const segments = genTypes.map(gen => {
        const val = d.mix[gen.name] || 0;
        const seg = { name: gen.name, color: gen.color, y0, y1: y0 + val, value: val };
        y0 += val;
        return seg;
      });
      return { hour: d.hour, segments, demand: d.demand };
    });

    const hourGroups = gEl.selectAll(".hour-group").data(stackData, d => d.hour);
    const enterGroups = hourGroups.enter().append("g").attr("class", "hour-group");
    const mergedGroups = enterGroups.merge(hourGroups);

    mergedGroups.each(function(d) {
      const sel = d3.select(this);
      const rects = sel.selectAll("rect").data(d.segments, s => s.name);

      rects.enter().append("rect")
        .attr("x", xScale(d.hour))
        .attr("width", xScale.bandwidth())
        .attr("rx", 3)
        .merge(rects)
        .transition().duration(300)
        .attr("x", xScale(d.hour))
        .attr("width", xScale.bandwidth())
        .attr("y", s => yScale(s.y1))
        .attr("height", s => Math.max(0, yScale(s.y0) - yScale(s.y1)))
        .attr("fill", s => s.color)
        .attr("opacity", () => d.hour === selectedHour ? 1 : 0.6);

      rects.exit().remove();
    });

    hourGroups.exit().remove();

    // Demand line
    const lineGen = d3.line()
      .x(d => xScale(d.hour) + xScale.bandwidth() / 2)
      .y(d => yScale(d.demand))
      .curve(d3.curveCatmullRom);
    demandPath.transition().duration(300).attr("d", lineGen(data));

    // Hour highlight
    hourHighlight.transition().duration(200)
      .attr("x", xScale(selectedHour))
      .attr("y", 0)
      .attr("width", xScale.bandwidth())
      .attr("height", h);

    // Clock display
    const hourData = data[selectedHour];
    clockHour.textContent = `${String(selectedHour).padStart(2, "0")}:00`;
    clockPeriod.textContent = getPeriodName(selectedHour);
    clockDemand.textContent = `${fmt0(hourData.demand)} GW`;

    const coalUsed = hourData.mix["Coal"] || 0;
    let price = 20;
    if (coalUsed > 0) price = 55 + coalUsed * 4;
    else if ((hourData.mix["Gas Peaker"] || 0) > 0) price = 130 + (hourData.mix["Gas Peaker"] || 0) * 5;
    else if ((hourData.mix["Gas CCGT"] || 0) > 0) price = 78 + (hourData.mix["Gas CCGT"] || 0) * 1.5;
    else if ((hourData.mix["Hydro"] || 0) > 5) price = 22;
    else price = 5;
    clockPrice.textContent = `\u20AC${fmt0(price)}/MWh`;
    clockPrice.style.color = price > 150 ? COLORS.red : price > 80 ? COLORS.amber : COLORS.green;

    const totalGen = Object.values(hourData.mix).reduce((s, v) => s + v, 0);
    const renewableGen = (hourData.mix["Solar"] || 0) + (hourData.mix["Wind"] || 0) + (hourData.mix["Hydro"] || 0) + (hourData.mix["Battery"] || 0);
    const renewPct = totalGen > 0 ? (renewableGen / totalGen) * 100 : 0;
    clockRenew.textContent = `${fmt0(renewPct)}%`;
    clockRenew.style.color = renewPct > 70 ? COLORS.green : renewPct > 40 ? COLORS.amber : COLORS.red;

    let totalCo2 = 0;
    genTypes.forEach(gen => { totalCo2 += (hourData.mix[gen.name] || 0) * gen.co2; });
    const co2Intensity = totalGen > 0 ? totalCo2 / totalGen : 0;
    clockCo2.textContent = `${fmt0(co2Intensity)} g/kWh`;
    clockCo2.style.color = co2Intensity > 300 ? COLORS.red : co2Intensity > 150 ? COLORS.amber : COLORS.green;
  }

  hourSlider.addEventListener("input", update);
  solarSlider.addEventListener("input", update);
  batterySlider.addEventListener("input", update);

  let playing = false;
  let playInterval = null;

  playBtn.addEventListener("click", () => {
    if (playing) {
      clearInterval(playInterval);
      playing = false;
      playBtn.textContent = "\u25B6 Play 24h";
      playBtn.classList.remove("playing");
      return;
    }

    playing = true;
    playBtn.textContent = "\u25A0 Stop";
    playBtn.classList.add("playing");
    hourSlider.value = 0;

    playInterval = setInterval(() => {
      let hr = +hourSlider.value + 1;
      if (hr > 23) {
        hr = 0;
        clearInterval(playInterval);
        playing = false;
        playBtn.textContent = "\u25B6 Play 24h";
        playBtn.classList.remove("playing");
      }
      hourSlider.value = hr;
      update();
    }, 600);
  });

  update();
}
