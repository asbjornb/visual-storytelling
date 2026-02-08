# CLAUDE.md

## Project structure

- `index.html` / `style.css` - Landing page listing all visualizations
- `src/<name>/` - Each visualization is a self-contained folder with its own `index.html`
- `vite.config.js` - Auto-discovers visualization folders for multi-page build
- Per-visualization docs live in each viz's own `CLAUDE.md`

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
- D3 v7 is already a dependency
