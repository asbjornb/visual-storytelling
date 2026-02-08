# How the Power Grid Really Works

Interactive 5-chapter visual storybook explaining how electricity grids, markets, and trading work.

## Source material

- `docs/POWER_GRID_GUIDE.md` - content script
- `docs/Refining the Visual Storybook Concept and Implementation Plan.pdf` - detailed implementation guidance with citations

## Architecture

- **Page-based navigation** (click/keyboard/swipe, no scrolling) — similar pattern to the US territorial expansion story
- Each chapter is a self-contained module: slides are separate HTML files, JS logic is in separate chapter modules
- `main.js` — orchestrator: loads slides, manages navigation (arrow keys, edge buttons, timeline, swipe)
- `slides/*.html` — one HTML fragment per slide (hero, ch1–ch5, conclusion), imported as raw strings via Vite
- `chapters/*.js` — one JS module per chapter, each exporting `init()` and `destroy()` functions
- `chapters/colors.js` — shared color palette and formatting helpers
- Chapters are lazy-initialized on first visit and `destroy()` is called when navigating away (to stop animation loops)

## Design

- Modern glass morphism: white/light background (#FAFBFF), frosted glass cards with backdrop-blur
- Bright candy color palette for data (yellow solar, cyan wind, violet nuclear, mint hydro, pink gas peaker, etc.)
- Typography: Outfit (headings) + Inter (body)
- Indigo (#6366F1) as primary accent, indigo→pink gradients for decorative elements
- Vanilla JS + D3.js, no framework

## Chapters

1. **The Balancing Act** (`slides/ch1-balance.html` + `chapters/ch1-balance.js`) - Supply must equal demand every second. Football button triggers a 2,800 MW kettle surge (1990 World Cup scenario); 8 technology sub-bars in 3 tiers (First Response → Secondary Response → Backup & Relief) animate a reserve cascade. Frequency derived from MW imbalance with exponential smoothing. Shortfall/surplus indicator flips from red to green. Plain-English labels throughout, no jargon.
2. **The Merit Order** (`slides/ch2-merit.html` + `chapters/ch2-merit.js`) - D3 supply curve showing generators stacked by cost, with solar/wind/demand sliders and live clearing price readout. The marginal plant glows.
3. **Grid Pressures** (`slides/ch3-grid.html` + `chapters/ch3-grid.js`) - Node-link European grid map (8 regions) with 4 scenario buttons (wind drought, cold snap, Nordic dry spell, French nuclear outage). Shows price divergence, congested lines, animated power flows.
4. **Enter the Traders** (`slides/ch4-traders.html` + `chapters/ch4-traders.js`) - Two-region visualization (Norway vs Germany). Interconnector capacity slider shows spatial arbitrage: price convergence, consumer savings, flow arrows.
5. **The Green Transition** (`slides/ch5-green.html` + `chapters/ch5-green.js`) - 24-hour generation stack chart with hour/solar/battery sliders and Play 24h button. Shows how the mix shifts through a day, battery charge/discharge logic, CO2 intensity, renewables %.

## Assets

- `assets/energy-icons-color.png` - Colored energy source illustrations (wind, solar, hydro, nuclear, gas, coal, battery, grid)
- `assets/energy-icons-bw-simple.png` - B&W simple version
- `assets/energy-icons-bw-detailed.png` - B&W detailed line art version
