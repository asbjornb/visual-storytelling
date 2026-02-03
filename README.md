# Visual Storytelling

Interactive visualizations and visual essays. Built with Vite.

## Development

```bash
npm install
npm run dev
```

## Adding a visualization

Each visualization lives in its own folder under `src/`:

```
src/
  my-viz/
    index.html
    main.js
    style.css
```

Vite auto-discovers any `src/<name>/index.html` at build time. No config changes needed.

## Deployment

Pushes to `main` deploy to [visual-storytelling.pages.dev](https://visual-storytelling.pages.dev). Pull requests get a preview URL posted as a comment.

## Data Credits & Licensing

### US Territorial Expansion

- **Historical boundary GeoJSON:** [US History Maps](https://github.com/poezn/us-history-maps) by Michael Porath, licensed under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). This dataset provides historical US territorial boundaries used to visualize expansion over time.
