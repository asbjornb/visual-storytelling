import * as d3 from "d3";
import { clamp, fmt1, COLORS } from "./colors.js";

let animFrame = null;

export function init() {
  const container = document.getElementById("response-stack");
  const switchBtn = document.getElementById("power-switch");
  const freqEl = document.getElementById("freq-value");
  const freqStatus = document.getElementById("freq-status");
  const statusEl = document.getElementById("demand-status");
  const timerEl = document.getElementById("cascade-timer");

  if (!container || !switchBtn) return;

  const SURGE_GW = 25;

  const generators = [
    { name: "Batteries", speed: "50 ms", color: "#10b981", maxGW: 6, type: "storage" },
    { name: "Hydro", speed: "5 sec", color: "#22d3ee", maxGW: 12, type: "generator" },
    { name: "Gas Turbine", speed: "2 min", color: "#f59e0b", maxGW: 25, type: "generator" },
    { name: "Gas CCGT", speed: "10 min", color: "#fb923c", maxGW: 20, type: "generator" },
    { name: "Coal", speed: "30 min", color: "#94a3b8", maxGW: 15, type: "generator" },
    { name: "Nuclear", speed: "Baseload", color: "#a78bfa", maxGW: 12, type: "baseload" },
  ];

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

  const defs = svg.append("defs");
  const filter = defs.append("filter").attr("id", "bar-glow").attr("x", "-20%").attr("y", "-20%").attr("width", "140%").attr("height", "140%");
  filter.append("feGaussianBlur").attr("stdDeviation", "3").attr("result", "blur");
  filter.append("feMerge").selectAll("feMergeNode").data(["blur", "SourceGraphic"]).join("feMergeNode").attr("in", d => d);

  gEl.append("g")
    .attr("transform", `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(d => `${d} GW`))
    .call(g => g.select(".domain").attr("stroke", COLORS.axisLine))
    .call(g => g.selectAll(".tick line").attr("stroke", COLORS.axisTick))
    .call(g => g.selectAll(".tick text").attr("fill", COLORS.axis).attr("font-size", 11));

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

  gEl.selectAll(".cap-bar").data(generators).join("rect")
    .attr("class", "cap-bar")
    .attr("x", 0).attr("y", d => y(d.name))
    .attr("width", d => x(d.maxGW)).attr("height", y.bandwidth())
    .attr("rx", 4).attr("fill", COLORS.capBarFill)
    .attr("stroke", COLORS.capBarStroke).attr("stroke-width", 1);

  const activeBars = gEl.selectAll(".active-bar").data(generators).join("rect")
    .attr("class", "active-bar")
    .attr("x", 0).attr("y", d => y(d.name)).attr("height", y.bandwidth())
    .attr("rx", 4).attr("fill", d => d.color).attr("opacity", 0.1);

  const glowBars = gEl.selectAll(".glow-bar").data(generators).join("rect")
    .attr("class", "glow-bar")
    .attr("x", 0).attr("y", d => y(d.name)).attr("height", y.bandwidth())
    .attr("rx", 4).attr("fill", d => d.color).attr("opacity", 0).attr("filter", "url(#bar-glow)");

  const barLabels = gEl.selectAll(".bar-label").data(generators).join("text")
    .attr("class", "bar-label")
    .attr("y", d => y(d.name) + y.bandwidth() / 2).attr("dy", "0.35em")
    .attr("fill", COLORS.label).attr("font-size", 11).attr("font-weight", 600);

  const statusLabels = gEl.selectAll(".status-label").data(generators).join("text")
    .attr("class", "status-label")
    .attr("y", d => y(d.name) + y.bandwidth() / 2).attr("dy", "0.35em")
    .attr("font-size", 9).attr("font-weight", 700).attr("letter-spacing", "0.05em");

  let animState = generators.map(() => 0);
  let targetState = generators.map(() => 0);
  let currentFreq = 50.0;
  let targetFreq = 50.0;
  let switchOn = false;
  let switchTime = 0;
  let offSnapshot = null;

  function computeOnTargets(t) {
    let otherGen = 0;
    const targets = new Array(generators.length).fill(0);

    for (let i = 0; i < generators.length; i++) {
      const gen = generators[i];
      if (gen.type === "storage") continue;

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

    const gap = SURGE_GW - otherGen;
    let battOutput;

    if (gap > 0.5) {
      battOutput = Math.min(6, gap);
    } else if (t > 6 && otherGen >= SURGE_GW + 0.5) {
      battOutput = -Math.min(3, otherGen - SURGE_GW);
    } else {
      battOutput = 0;
    }
    targets[0] = battOutput;

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

    for (let i = 0; i < generators.length; i++) {
      const speed = generators[i].type === "storage" ? 0.2 : 0.12;
      animState[i] += (targetState[i] - animState[i]) * speed;
    }

    currentFreq += (targetFreq - currentFreq) * 0.08;
    currentFreq += (Math.random() - 0.5) * 0.003;
    currentFreq = clamp(currentFreq, 49.0, 50.1);

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

    animFrame = requestAnimationFrame(tick);
  }

  switchBtn.addEventListener("click", () => {
    switchOn = !switchOn;
    switchTime = performance.now();
    switchBtn.setAttribute("aria-checked", String(switchOn));

    if (!switchOn) {
      offSnapshot = [...animState];
    }
  });

  tick();
}

export function destroy() {
  if (animFrame) {
    cancelAnimationFrame(animFrame);
    animFrame = null;
  }
}
