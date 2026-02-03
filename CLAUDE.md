# CLAUDE.md

## Project structure

- `index.html` / `style.css` - Landing page listing all visualizations
- `src/<name>/` - Each visualization is a self-contained folder with its own `index.html`
- `vite.config.js` - Auto-discovers visualization folders for multi-page build

## Commands

- `npm run dev` - Start dev server
- `npm run build` - Build to `dist/`
- `npm run preview` - Preview production build locally

## Deployment

- Pushes to `main` deploy to Cloudflare Pages at visual-storytelling.pages.dev
- Pull requests get a preview URL posted as a comment
- Secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) are in GitHub repo settings

## Conventions

- Each visualization is independent - pick whatever libraries fit (Canvas, SVG, Three.js, D3, plain DOM, etc.)
- Keep shared/global styles minimal; each viz should own its styles
- Dark background theme (`#0a0a0a`) as default

## Visualizations

### US Territorial Expansion (`src/us-territorial-expansion/`)

Scroll-driven visual story of how the United States grew from 1776 to present day.

**Source material:** `reference/timeline-research.pdf` - timeline covering each major acquisition from the 1783 Treaty of Paris through modern-era expansion rhetoric (2025-26).

**Timeline entries (in order):**
1. 1776 - Declaration of Independence (prologue/starting point)
2. 1783 - Treaty of Paris (original states + land to Mississippi)
3. 1803 - Louisiana Purchase
4. 1818 - Red River Basin (British cession)
5. 1819 - Florida (Adams-Onis Treaty)
6. 1845 - Texas annexation
7. 1846 - Oregon Treaty
8. 1848 - Mexican Cession (Treaty of Guadalupe Hidalgo)
9. 1853 - Gadsden Purchase
10. 1867 - Alaska Purchase
11. 1898 - Hawaii annexation
12. 1898 - Spanish-American War (Puerto Rico, Guam, Philippines)
13. 1899 - American Samoa
14. 1917 - US Virgin Islands
15. 1947 - Pacific Trust Territories / Northern Mariana Islands
16. 2025-26 - Modern expansion rhetoric (epilogue with disclaimer)

**Tech approach:**
- Scrollytelling format (scroll-driven transitions between sections)
- D3.js + TopoJSON for animated territory maps
- Historical boundary GeoJSON from Michael Porath's US History Maps dataset (poezn.github.io/us-history-maps, CC BY-SA 3.0)
- Nano Banana API (Google Gemini image gen) for consistent-style editorial illustrations
- Image specs stored in JSONL, generated via local script for iterability

**Design notes:**
- The map is the hero element - persistent and animating as user scrolls
- Each acquisition gets a distinct color, building up a "quilt" of territory
- Text panels with narrative, quotes, and data callouts (price, area) per section
- Illustrations supplement the map, showing the human element (treaty signings, etc.)
