# Statblock Creator

Statblock Creator is a local-first D&D 5.5e creature editor with a live
statblock preview. It imports and exports YAML for the Obsidian Fantasy
Statblocks plugin and can export the rendered statblock as a PNG.

Live site: https://statblock-creator.pages.dev/

## Current features

- Form and YAML editing modes
- Fantasy Statblocks Basic 5e Layout compatibility
- Independently scrolling live preview with zoom and parchment/dark styles
- Website-wide light and dark modes
- Collapsible, grouped editor sections and quick navigation
- Pick lists with custom values for creature details, defenses, senses, and languages
- Speed builder, calculated saves and skills, CR experience, and proficiency bonus
- Structured spellcasting editor with the SRD 5.2.1 spell list and custom spells
- Reorderable traits, actions, bonus actions, reactions, legendary actions, and regional effects
- Multiple locally saved creatures with search, duplication, and deletion
- Batch ZIP export with YAML, Markdown, PNG images, and a JSON backup
- Local portrait uploads
- IndexedDB autosave and undo/redo
- Fenced `statblock` YAML copy and PNG export
- Cleanup of Initiative Tracker fields when importing
- Tabbed YAML and 5etools-compatible JSON imports

## Development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Validate a production build with:

```bash
npm run lint
npm test
```

## Static hosting

The production build is a static SPA:

```bash
npm run build
```

### Optional 5etools website-link import

Website-link importing is disabled by default. Self-hosted builds can enable the
5etools link tab at build time:

```bash
VITE_ENABLE_5ETOOLS_URL_IMPORT=true npm run build
```

Local YAML and 5etools-compatible JSON imports remain available when this flag
is disabled. The link importer only accepts standard 5e.tools bestiary links and
contacts the external 5etools GitHub mirror from the browser.

### Optional 2024 encounter calculator

The CR-and-quantity encounter calculator is disabled by default. Enable its
toolbar button at build time with:

```bash
VITE_ENABLE_ENCOUNTER_CALCULATOR=true npm run build
```

The calculator uses the 2024 XP budgets and stores its latest setup only in the
current browser.

Deploy the generated `dist/` folder to any static host, including Cloudflare
Pages, GitHub Pages, Netlify, or Vercel static hosting.
