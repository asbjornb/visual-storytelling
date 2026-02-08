import * as d3 from "d3";
import { clamp, fmt0, fmt1, COLORS } from "./colors.js";

let animFrameId = null;

export function init() {
  const container = document.getElementById("response-stack");
  const switchBtn = document.getElementById("power-switch");
  const freqEl = document.getElementById("freq-value");
  const freqStatus = document.getElementById("freq-status");
  const statusEl = document.getElementById("demand-status");
  const timerEl = document.getElementById("cascade-timer");
  const thresholdEls = document.querySelectorAll(".freq-marker");
  const btnLabel = switchBtn.querySelector(".halftime-label");

  if (!container || !switchBtn) return;

  const SURGE_MW = 2800;
  const ANIM_DURATION = 15;

  // 8 technology sub-bars grouped into 3 tiers.
  // Each tier relieves the previous: tier 1 frees after tier 2 holds,
  // tier 2 frees after tier 3 holds. Tier 3 alone = 2800 MW (full surge).
  // Brief triple-overlap around t≈7-9 creates surplus → frequency overshoot.
  const tierDefs = [
    {
      label: "First Response", color: "#10b981",
      techs: [
        { name: "Batteries",           maxMW: 600, rampStart: 0.8, rampEnd: 1.8, holdEnd: 8.0,  freeEnd: 11.0 },
        { name: "Generator governors", maxMW: 400, rampStart: 1.0, rampEnd: 2.2, holdEnd: 8.0,  freeEnd: 11.0 },
        { name: "Spinning reserve",    maxMW: 200, rampStart: 1.2, rampEnd: 2.5, holdEnd: 8.0,  freeEnd: 11.0 },
      ],
    },
    {
      label: "Secondary Response", color: "#22d3ee",
      techs: [
        { name: "Pumped hydro",        maxMW: 900, rampStart: 3.0, rampEnd: 5.5, holdEnd: 11.0, freeEnd: 14.0 },
        { name: "Fast gas turbines",    maxMW: 700, rampStart: 3.5, rampEnd: 6.5, holdEnd: 11.0, freeEnd: 14.0 },
      ],
    },
    {
      label: "Backup & Relief", color: "#f59e0b",
      techs: [
        { name: "Standby gas plants", maxMW: 1200, rampStart: 7.0, rampEnd: 10.0, holdEnd: 15.0, freeEnd: 15.0 },
        { name: "Demand reduction",    maxMW: 800, rampStart: 7.5, rampEnd: 10.5, holdEnd: 15.0, freeEnd: 15.0 },
        { name: "Imports",             maxMW: 800, rampStart: 8.0, rampEnd: 11.5, holdEnd: 15.0, freeEnd: 15.0 },
      ],
    },
  ];

  const allTechs = tierDefs.flatMap(g => g.techs.map(t => ({ ...t, color: g.color })));

  function easeOut(t) {
    return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  }

  function computeTechOutput(tech, t) {
    if (t < tech.rampStart) return 0;
    if (t < tech.rampEnd) {
      const p = (t - tech.rampStart) / (tech.rampEnd - tech.rampStart);
      return tech.maxMW * easeOut(p);
    }
    if (t < tech.holdEnd) return tech.maxMW;
    if (t < tech.freeEnd) {
      const p = (t - tech.holdEnd) / (tech.freeEnd - tech.holdEnd);
      return tech.maxMW * (1 - easeOut(p));
    }
    return 0;
  }

  function getTechStatus(tech, t) {
    if (t < tech.rampStart) return "Ready";
    if (t < tech.rampEnd) return "Ramping up";
    if (t < tech.holdEnd) return "Full power";
    if (t < tech.freeEnd) return "Standing down";
    return "Ready";
  }

  // ── SVG setup ──
  const margin = { top: 30, right: 20, bottom: 15, left: 20 };
  const svg = d3.select(container).append("svg")
    .attr("viewBox", "0 0 700 470")
    .attr("preserveAspectRatio", "xMidYMid meet");

  const w = 700 - margin.left - margin.right;
  const gEl = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const defs = svg.append("defs");
  const filter = defs.append("filter").attr("id", "bar-glow").attr("x", "-20%").attr("y", "-20%").attr("width", "140%").attr("height", "140%");
  filter.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "blur");
  filter.append("feMerge").selectAll("feMergeNode").data(["blur", "SourceGraphic"]).join("feMergeNode").attr("in", d => d);

  // Layout
  const barX = 200;
  const barW = w - barX - 10;
  const xScale = d3.scaleLinear().domain([0, SURGE_MW]).range([0, barW]);
  const barH = 22;
  const barGap = 4;
  const tierHeaderH = 20;
  const tierPadding = 8;
  const tierGapBetween = 14;

  // ── Shortfall / Surplus indicator ──
  const shortfallH = 28;
  const shortfallY = 0;

  const shortfallLabelText = gEl.append("text")
    .attr("x", 0).attr("y", shortfallY + shortfallH / 2).attr("dy", "0.35em")
    .attr("fill", COLORS.label).attr("font-size", 12).attr("font-weight", 700)
    .text("SHORTFALL");

  gEl.append("rect")
    .attr("x", barX).attr("y", shortfallY + 4)
    .attr("width", barW).attr("height", shortfallH - 8)
    .attr("rx", 4).attr("fill", COLORS.capBarFill).attr("stroke", COLORS.capBarStroke);

  const shortfallBar = gEl.append("rect")
    .attr("x", barX).attr("y", shortfallY + 4)
    .attr("width", barW).attr("height", shortfallH - 8)
    .attr("rx", 4).attr("fill", COLORS.red).attr("opacity", 0.15);

  const surplusBar = gEl.append("rect")
    .attr("x", barX).attr("y", shortfallY + 4)
    .attr("width", 0).attr("height", shortfallH - 8)
    .attr("rx", 4).attr("fill", COLORS.green).attr("opacity", 0);

  const shortfallLabel = gEl.append("text")
    .attr("y", shortfallY + shortfallH / 2).attr("dy", "0.35em")
    .attr("font-size", 11).attr("font-weight", 700).attr("fill", COLORS.red);

  // ── Build tier groups with sub-bars ──
  let currentY = shortfallH + tierGapBetween;
  const techBarRefs = [];

  tierDefs.forEach((tier) => {
    const tierContentH = tierHeaderH + tier.techs.length * (barH + barGap) + tierPadding;
    const tg = gEl.append("g").attr("transform", `translate(0,${currentY})`);

    tg.append("rect")
      .attr("x", -8).attr("y", -6)
      .attr("width", w + 16).attr("height", tierContentH + 12)
      .attr("rx", 10).attr("fill", "rgba(255,255,255,0.4)")
      .attr("stroke", tier.color).attr("stroke-width", 1).attr("stroke-opacity", 0.15);

    tg.append("text")
      .attr("x", 4).attr("y", 14)
      .attr("fill", tier.color).attr("font-size", 13).attr("font-weight", 700)
      .text(tier.label);

    tier.techs.forEach((tech, j) => {
      const by = tierHeaderH + j * (barH + barGap);

      tg.append("text")
        .attr("x", 8).attr("y", by + barH / 2).attr("dy", "0.35em")
        .attr("fill", COLORS.label).attr("font-size", 10).attr("font-weight", 500)
        .text(tech.name);

      tg.append("rect")
        .attr("x", barX).attr("y", by)
        .attr("width", barW).attr("height", barH)
        .attr("rx", 4).attr("fill", COLORS.capBarFill).attr("stroke", COLORS.capBarStroke);

      const activeBar = tg.append("rect")
        .attr("x", barX).attr("y", by)
        .attr("width", 0).attr("height", barH)
        .attr("rx", 4).attr("fill", tier.color).attr("opacity", 0.8);

      const glowBar = tg.append("rect")
        .attr("x", barX).attr("y", by)
        .attr("width", 0).attr("height", barH)
        .attr("rx", 4).attr("fill", tier.color).attr("opacity", 0).attr("filter", "url(#bar-glow)");

      const mwLabel = tg.append("text")
        .attr("y", by + barH / 2).attr("dy", "0.35em")
        .attr("font-size", 10).attr("font-weight", 700).attr("fill", tier.color);

      const statusBadge = tg.append("text")
        .attr("x", barX + barW + 4).attr("y", by + barH / 2).attr("dy", "0.35em")
        .attr("font-size", 8).attr("font-weight", 700)
        .attr("letter-spacing", "0.04em").attr("fill", COLORS.labelDim);

      techBarRefs.push({ activeBar, glowBar, mwLabel, statusBadge });
    });

    currentY += tierContentH + tierGapBetween;
  });

  // ── Timeline ──
  const tlY = currentY + 6;
  const tlG = gEl.append("g").attr("transform", `translate(0,${tlY})`);

  tlG.append("rect")
    .attr("x", barX).attr("y", 8)
    .attr("width", barW).attr("height", 6)
    .attr("rx", 3).attr("fill", COLORS.capBarFill).attr("stroke", COLORS.capBarStroke);

  const tlScale = d3.scaleLinear().domain([0, ANIM_DURATION]).range([0, barW]);
  const tlSegments = [
    { start: 0.8, end: 4.0, color: tierDefs[0].color, label: "First" },
    { start: 4.0, end: 9.0, color: tierDefs[1].color, label: "Secondary" },
    { start: 9.0, end: 15.0, color: tierDefs[2].color, label: "Backup" },
  ];
  tlSegments.forEach(seg => {
    tlG.append("rect")
      .attr("x", barX + tlScale(seg.start)).attr("y", 8)
      .attr("width", tlScale(seg.end) - tlScale(seg.start)).attr("height", 6)
      .attr("fill", seg.color).attr("opacity", 0.25);
    tlG.append("text")
      .attr("x", barX + tlScale((seg.start + seg.end) / 2)).attr("y", 28)
      .attr("text-anchor", "middle").attr("fill", seg.color)
      .attr("font-size", 9).attr("font-weight", 700)
      .text(seg.label);
  });

  const timeMarks = [
    { t: 0, real: "0s" },
    { t: 0.8, real: "5s" },
    { t: 4, real: "30s" },
    { t: 9, real: "5min" },
    { t: 15, real: "15min" },
  ];
  timeMarks.forEach(m => {
    tlG.append("line")
      .attr("x1", barX + tlScale(m.t)).attr("x2", barX + tlScale(m.t))
      .attr("y1", 5).attr("y2", 17)
      .attr("stroke", COLORS.axisLine).attr("stroke-width", 1);
    tlG.append("text")
      .attr("x", barX + tlScale(m.t)).attr("y", 3)
      .attr("text-anchor", "middle").attr("fill", COLORS.labelDim)
      .attr("font-size", 8).text(m.real);
  });

  const playhead = tlG.append("circle")
    .attr("cx", barX).attr("cy", 11)
    .attr("r", 5).attr("fill", COLORS.accent).attr("opacity", 0);

  tlG.append("text")
    .attr("x", 0).attr("y", 14)
    .attr("fill", COLORS.label).attr("font-size", 11).attr("font-weight", 700)
    .text("TIMELINE");

  // ── Animation state ──
  let running = false;
  let startTime = 0;
  let currentFreq = 50.0;

  function updateThresholds(freq) {
    thresholdEls.forEach(el => {
      const hz = parseFloat(el.dataset.hz);
      const isActive = freq <= hz + 0.02;
      el.classList.toggle("active", isActive && !el.classList.contains("dimmed"));
    });
  }

  function tick() {
    const now = performance.now();
    const t = clamp((now - startTime) / 1000, 0, ANIM_DURATION);
    const done = t >= ANIM_DURATION;

    // Compute reserves first — frequency is derived from the MW balance
    let totalReserve = 0;
    allTechs.forEach(tech => {
      totalReserve += computeTechOutput(tech, t);
    });
    const shortfall = Math.max(0, SURGE_MW - totalReserve);
    const surplus = Math.max(0, totalReserve - SURGE_MW);

    // Frequency derived from imbalance:
    //   2800 MW shortfall → 49.85 Hz, balanced → 50.00, surplus → above 50.00
    // Smoothed with time-based lag (τ ≈ 0.4s) to model grid inertia.
    const imbalance = totalReserve - SURGE_MW;
    let targetFreq;
    if (imbalance <= 0) {
      targetFreq = 50.0 + (imbalance / SURGE_MW) * 0.15;
    } else {
      targetFreq = 50.0 + Math.min(imbalance / SURGE_MW, 1.0) * 0.10;
    }
    const dt = 1 / 60;
    const smoothRate = 1 - Math.exp(-2.5 * dt);
    currentFreq += (targetFreq - currentFreq) * smoothRate;
    currentFreq += (Math.random() - 0.5) * 0.002;
    currentFreq = clamp(currentFreq, 49.0, 50.15);

    freqEl.textContent = currentFreq.toFixed(2);
    const deviation = 50.0 - currentFreq;
    if (deviation > 0.10) {
      freqEl.style.color = COLORS.red;
      freqStatus.textContent = "Falling";
      freqStatus.style.color = COLORS.red;
      freqStatus.style.background = "rgba(239,68,68,0.1)";
    } else if (deviation > 0.03) {
      freqEl.style.color = COLORS.amber;
      freqStatus.textContent = "Recovering";
      freqStatus.style.color = COLORS.amber;
      freqStatus.style.background = "rgba(245,158,11,0.1)";
    } else if (currentFreq > 50.02) {
      freqEl.style.color = "#22d3ee";
      freqStatus.textContent = "Overshoot";
      freqStatus.style.color = "#22d3ee";
      freqStatus.style.background = "rgba(34,211,238,0.1)";
    } else {
      freqEl.style.color = COLORS.green;
      freqStatus.textContent = "Stable";
      freqStatus.style.color = COLORS.green;
      freqStatus.style.background = "rgba(16,185,129,0.1)";
    }

    updateThresholds(currentFreq);

    // Shortfall / Surplus bar
    if (shortfall > 0) {
      shortfallBar.attr("width", xScale(shortfall)).attr("opacity", 0.6).attr("fill", COLORS.red);
      surplusBar.attr("width", 0).attr("opacity", 0);
      shortfallLabelText.text("SHORTFALL");
      shortfallLabel
        .attr("x", barX + xScale(shortfall) > barX + 60 ? barX + xScale(shortfall) - 6 : barX + xScale(shortfall) + 6)
        .attr("text-anchor", xScale(shortfall) > 60 ? "end" : "start")
        .attr("fill", COLORS.red)
        .text(shortfall > 20 ? `${fmt0(shortfall)} MW shortfall` : "");
    } else {
      shortfallBar.attr("width", 0).attr("opacity", 0);
      if (surplus > 20) {
        const surplusW = xScale(Math.min(surplus, SURGE_MW));
        surplusBar.attr("width", surplusW).attr("opacity", 0.5).attr("fill", COLORS.green);
        shortfallLabelText.text("SURPLUS");
        shortfallLabel
          .attr("x", barX + surplusW > barX + 60 ? barX + surplusW - 6 : barX + surplusW + 6)
          .attr("text-anchor", surplusW > 60 ? "end" : "start")
          .attr("fill", COLORS.green)
          .text(`+${fmt0(surplus)} MW surplus`);
      } else {
        surplusBar.attr("width", 0).attr("opacity", 0);
        shortfallLabelText.text("BALANCED");
        shortfallLabel.text("").attr("fill", COLORS.labelDim);
      }
    }

    // Tech bars
    allTechs.forEach((tech, i) => {
      const output = computeTechOutput(tech, t);
      const status = getTechStatus(tech, t);
      const { activeBar, glowBar, mwLabel, statusBadge } = techBarRefs[i];

      const bw = xScale(output);
      activeBar.attr("width", bw).attr("opacity", output > 5 ? 0.8 : 0.1);
      glowBar.attr("width", bw).attr("opacity", status === "Ramping up" || status === "Full power" ? 0.2 : 0);

      mwLabel
        .attr("x", barX + bw > barX + 45 ? barX + bw - 4 : barX + bw + 4)
        .attr("text-anchor", bw > 45 ? "end" : "start")
        .attr("fill", bw > 45 ? "#fff" : tech.color)
        .text(output > 15 ? `${fmt0(output)} MW` : "");

      let statusColor = COLORS.labelDim;
      if (status === "Ramping up") statusColor = tech.color;
      else if (status === "Full power") statusColor = tech.color;
      else if (status === "Standing down") statusColor = COLORS.green;

      statusBadge.attr("fill", statusColor).text(status === "Ready" && t === 0 ? "" : status);
    });

    // Playhead
    playhead.attr("cx", barX + tlScale(t)).attr("opacity", 1);

    // Status messages & timer
    const realMinutes = t / ANIM_DURATION * 15;
    if (t < 0.8) {
      timerEl.textContent = `${fmt1(realMinutes * 60)}s real time`;
      statusEl.textContent = "Kettles on! Frequency dropping...";
      statusEl.style.color = COLORS.red;
    } else if (t < 4) {
      timerEl.textContent = `${fmt0(realMinutes * 60)}s real time`;
      statusEl.textContent = "First responders catching the drop...";
      statusEl.style.color = "#10b981";
    } else if (t < 9) {
      timerEl.textContent = `${fmt1(realMinutes)}min real time`;
      statusEl.textContent = "Hydro & gas restoring frequency...";
      statusEl.style.color = "#22d3ee";
    } else if (t < 14.5) {
      timerEl.textContent = `${fmt1(realMinutes)}min real time`;
      statusEl.textContent = "Backup plants taking over...";
      statusEl.style.color = "#f59e0b";
    } else {
      timerEl.textContent = "15min real time";
      statusEl.textContent = "All clear \u2014 reserves standing down";
      statusEl.style.color = COLORS.green;
    }

    if (done) {
      running = false;
      switchBtn.classList.remove("running");
      switchBtn.classList.add("done");
      btnLabel.textContent = "REPLAY";
      return;
    }

    animFrameId = requestAnimationFrame(tick);
  }

  function reset() {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    animFrameId = null;
    currentFreq = 50.0;
    freqEl.textContent = "50.00";
    freqEl.style.color = COLORS.green;
    freqStatus.textContent = "Stable";
    freqStatus.style.color = COLORS.green;
    freqStatus.style.background = "rgba(16,185,129,0.1)";
    shortfallBar.attr("width", barW).attr("opacity", 0.15);
    surplusBar.attr("width", 0).attr("opacity", 0);
    shortfallLabel.text("");
    shortfallLabelText.text("SHORTFALL");
    playhead.attr("opacity", 0);
    allTechs.forEach((_, i) => {
      techBarRefs[i].activeBar.attr("width", 0).attr("opacity", 0.1);
      techBarRefs[i].glowBar.attr("width", 0).attr("opacity", 0);
      techBarRefs[i].mwLabel.text("");
      techBarRefs[i].statusBadge.text("");
    });
    thresholdEls.forEach(el => el.classList.remove("active"));
    timerEl.textContent = "";
    statusEl.textContent = "Press to trigger the kettle surge";
    statusEl.style.color = "";
    switchBtn.classList.remove("running", "done");
    btnLabel.textContent = "GAME OVER";
  }

  switchBtn.addEventListener("click", () => {
    if (running) return;
    reset();
    running = true;
    startTime = performance.now();
    switchBtn.classList.add("running");
    animFrameId = requestAnimationFrame(tick);
  });
}

export function destroy() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}
