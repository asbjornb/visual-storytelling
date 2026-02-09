# How the Power Grid Really Works
### A visual storybook for consumers wondering where their money goes

> **Format note:** This document is a content guide for an interactive visual
> story in five chapters. Each chapter is a scroll-driven section with a
> two-column layout: an interactive visualization on one side and explanatory
> narrative on the other. The story builds from physical reality up to markets,
> trading, and the green transition — giving the reader enough understanding to
> form their own opinion on whether energy trading benefits them.

---

## Design

Modern glass morphism on a white/light background (#FAFBFF). Frosted glass
cards with `backdrop-filter: blur(20px)`. Bright candy-colored data palette:

| Source | Color | Hex |
|--------|-------|-----|
| Solar | Yellow | #FBBF24 |
| Wind | Cyan | #22D3EE |
| Nuclear | Violet | #A78BFA |
| Hydro | Mint | #34D399 |
| Battery | Green | #10B981 |
| Gas CCGT | Orange | #FB923C |
| Gas Peaker | Pink | #F472B6 |
| Coal | Slate | #94A3B8 |
| Oil | Red | #EF4444 |

Typography: **Outfit** for headings, **Inter** for body text. Indigo (#6366F1)
as primary accent color, indigo→pink gradients for decorative elements (slider
tracks, active buttons, body background orbs).

Tech: Vanilla JS + D3.js (v7). No framework. Vite for dev/build.

---

## Chapter 1: The Balancing Act

**Concept:** Supply must equal demand every second. There is no warehouse for
electricity.

**Visual:** A horizontal bar chart showing six generator types (Batteries,
Hydro, Gas Turbine, Gas CCGT, Coal, Nuclear) with a real-time frequency display
above. A physical light switch triggers a 25 GW demand surge.

**Interactive element:** A wall-plate light switch (3D CSS rocker that tilts
on click). Flipping it ON triggers a time-based cascade:

1. **Batteries** fire instantly (~50 ms), covering up to 6 GW of the gap
2. **Hydro** ramps over ~2 seconds (0.4 s delay), reaching 8 GW steady state
3. **Gas Turbines** ramp over ~3 seconds (1.8 s delay), reaching 10 GW
4. **Gas CCGT** ramps over ~3.5 seconds (3.5 s delay), reaching 6 GW
5. **Coal** ramps over ~3 seconds (6 s delay), reaching 2 GW
6. As thermal generation takes over, **batteries recharge** (shown as amber bar, negative output)

The frequency display shows real-time Hz: dips when demand exceeds supply,
recovers as generators ramp. Color-coded status: green (stable), amber (tense),
red (critical). A timer shows elapsed seconds since the switch was flipped.

Flipping the switch OFF decays all generation smoothly over ~2.5 seconds.

**Key narrative points:**
- The grid's single non-negotiable constraint: supply = demand, every second
- Frequency (50 Hz in Europe) as the measure of balance
- Everything that follows — markets, trading, pricing — exists to solve this one problem
- Reference: 2021 Texas freeze as a real-world cascade failure

---

## Chapter 2: The Merit Order — Who Gets to Sell?

**Concept:** Generators bid into daily auctions. The most expensive generator
still needed sets the price for everyone (marginal pricing).

**Visual:** A D3 bar chart with generators stacked left-to-right by cost. Each
bar's height represents marginal cost (€/MWh), width represents capacity (GW).
A vertical demand line slides across; everything to its left is dispatched. The
marginal plant (price setter) glows with a soft filter effect.

**Interactive elements:** Three sliders:
- ☀️ **Solar** (0–100%) — scales solar capacity
- 💨 **Wind** (0–100%) — scales wind capacity
- 📈 **Demand** (20–110 GW) — shifts the demand line

A prominent clearing price display updates in real time (green < €80, amber
€80–150, red > €150).

**Generator stack (left to right):**

| Source | Base capacity | Marginal cost |
|--------|-------------|--------------|
| Solar | 25 GW | €0/MWh |
| Wind | 30 GW | €0/MWh |
| Nuclear | 14 GW | €12/MWh |
| Hydro | 12 GW | €22/MWh |
| Coal | 16 GW | €55/MWh |
| Gas CCGT | 22 GW | €78/MWh |
| Gas Peaker | 12 GW | €130/MWh |
| Oil | 6 GW | €190/MWh |

**Key narrative points:**
- How marginal pricing works — why wind farms earning €0 get paid €70
- Investment signal: the spread between cost and marginal price repays investment
- Reader *feels* how a sunny windy day crashes the price, while a calm evening spikes it

---

## Chapter 3: Grid Pressures — When Physics Gets in the Way

**Concept:** Electricity doesn't just need to be generated — it needs to get
to where it's needed. Transmission constraints create price divergence.

**Visual:** An SVG node-link diagram of 8 northern European pricing zones
(Norway, Sweden, Denmark, UK, Netherlands, Germany, Belgium, France) connected
by 14 interconnector edges. Each node shows a two-letter country code and
current price. Edges animate with dashed flow lines; congested lines glow red.

**Interactive element:** Four scenario pill buttons that instantly reconfigure
the network state:

1. **Wind Dies Down** — North Sea wind drops from 15 to 8 GW. Norwegian hydro
   flows south. DK→DE and NO→DE lines congest. Continental prices spike.

2. **Cold Snap** — Polar vortex hits Central Europe. Germany +15% demand.
   France also tight. Multiple lines congest. Prices decouple: Nordics stay
   moderate, continent surges to €200–400/MWh.

3. **Nordic Dry Spell** — Low rainfall empties Scandinavian reservoirs.
   Norwegian hydro bids higher. Gas fills the gap. Persists for weeks/months.

4. **French Nuclear Surprise** — Stress corrosion sidelines French reactors.
   France flips from exporter to importer. FR→BE and DE→FR lines congest.
   French prices hit €420/MWh; shockwave felt continent-wide.

Each scenario has a dedicated text panel that appears alongside the map.

**Key narrative points:**
- Transmission bottlenecks cause prices to diverge between regions
- Some crises are hours (wind drop), others last months (drought)
- The 2022 French nuclear corrosion crisis as a real-world example

---

## Chapter 4: Enter the Traders

**Concept:** Traders buy where power is cheap and sell where it's expensive.
Spatial arbitrage narrows price gaps — but the trader captures the spread.

**Visual:** A two-region comparison (Norway vs Germany) with vertical price
bars, animated flow arrows between them, and a prominent savings readout.
Norway starts at €35/MWh (hydro), Germany at €180/MWh (gas).

**Interactive element:** A single slider for interconnector capacity (0–8,000
MW). As the reader increases capacity:
- Flow arrows appear and multiply (1–6 arrows depending on GW)
- Norwegian prices rise (exporting pushes local price up)
- German prices fall (imports push price down)
- Prices converge toward a midpoint (65% convergence at max capacity)
- Savings readout shows: "German consumers save €X/MWh · Norway earns €Y/MWh more"
- Real cable reference: NordLink (1,400 MW, Norway–Germany)

**Key narrative points:**
- Hedging: genuine insurance, locks in stable prices
- Spatial arbitrage: moves power to where it's needed, but traders capture the spread
- Speculation: adds liquidity but can amplify volatility
- The honest answer: some trading benefits consumers, some is a wealth transfer

---

## Chapter 5: The Green Transition — New Pressures

**Concept:** As renewables grow, the generation mix shifts dramatically through
a single day. The duck curve emerges, and batteries are needed to flatten it.

**Visual:** A 24-hour stacked bar chart showing the generation mix at each
hour. Eight generation types stacked in merit order (Nuclear at bottom, Coal
at top). A dashed demand line traces the daily load shape. A subtle sky gradient
in the background hints at day/night. A clock display shows current hour,
demand, spot price, renewables %, and CO₂ intensity.

**Interactive elements:**
- **Hour of Day** slider (0–23) — highlights one hour, updates the clock stats
- **Solar Capacity** slider (0–100 GW) — scales solar generation
- **Battery Storage** slider (0–100 GW) — adds battery charge/discharge logic
- **Play 24h** button — auto-advances hour slider at 600 ms intervals

Battery logic:
- Charges (absorbs surplus) when net demand after solar/wind/nuclear is low
- Discharges (feeds grid) when net demand is high
- 4-hour energy capacity, 60% power-to-energy ratio, 92% round-trip efficiency

**Key narrative points:**
- The duck curve: midday solar floods the grid, sunset creates violent ramp
- Solar cannibalization: success depresses own revenue
- Gas peakers become more important with more renewables, not less
- Storage can flatten the duck, but enormous capacity is needed
- The green transition makes the grid more volatile — managing that volatility
  is the central engineering challenge

---

## Conclusion

A brief closing section reinforcing the core message: the generation mix and
grid infrastructure matter far more than the financial trading layer. But the
trading layer isn't nothing — and now you know enough to judge for yourself.

---

## Production Notes

### Format
A scroll-driven web-based storybook. Each chapter is a two-column section:
interactive visualization on the left/top, explanatory text on the right/bottom.
The layout uses glass morphism cards on a light background with decorative
gradient orbs. IntersectionObserver triggers entrance animations.

### Tech stack
- **Vanilla JS + D3.js v7** — no framework
- **Vite** — dev server and production build
- **CSS** — glass morphism (backdrop-blur), CSS custom properties for palette, 3D transforms for light switch

### Data
Stylized/representative data, not real wholesale prices. The goal is to build
intuition about mechanisms, not model specific markets. Generator capacities,
costs, and response times are realistic order-of-magnitude values.

### Tone
Informative but not preachy. The goal is to give readers enough understanding
to form their own opinion. Acknowledge that the answer to "does trading help?"
is genuinely complex and that reasonable people disagree.

### Audience
Consumers and interested non-specialists. No assumed knowledge of electricity
markets. The physical grid explanations (Chapters 1, 3) build intuition before
introducing financial complexity (Chapters 4–5).
