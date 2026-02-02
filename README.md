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
