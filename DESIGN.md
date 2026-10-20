# Shipyard — Design System (DESIGN.md)

## Visual Direction & Mode
- **Surface Mode**: **Operate** — precision engineering instrument. Familiarity, scanability, density, and immediate state comprehension outrank decorative expression.
- **Anti-Slop Commitments**:
  - **No side-tab accent borders**: Active list items and callouts use subtle tinted surface fills and crisp `1px` borders, never thick `3px–4px` left/right accent stripes.
  - **No cards nested in cards**: Group related telemetry with hairline dividers (`1px solid var(--border)`), whitespace, and inline strips rather than stacking `.stat-card` boxes inside `.card-panel` containers.
  - **No decorative icon tiles**: Icons clarify navigation, status, or action; they do not sit inside oversized pastel rounded-square badges above every heading.
  - **Tinted neutrals**: Dark and light neutrals carry a subtle naval-slate tint rather than dead pure black (`#000`) or untinted gray.
  - **Browser surfaces & tabular data**: All numbers, percentages, currencies (VND/USD), and durations use `font-variant-numeric: tabular-nums`. Focus rings, text selection (`::selection`), caret color, and scrollbars are explicitly themed.

## Typography
- **UI Sans (`--font`)**: `'Inter Variable'`, system-ui sans — tight scale (`11px`, `12px`, `13px`, `14px`, `16px`, `18px`, `20px`) with clear weight hierarchy (`400`, `500`, `600`, `700`).
- **Technical Mono (`--mono`)**: `'JetBrains Mono Variable'` — reserved strictly for slugs, paths, Git branches, environment snippets, logs, diffs, and tabular telemetry.

## Color & Surface Hierarchy
- **Dark Theme (Default)**:
  - `--bg`: `#0b0d11` (deep naval carbon canvas)
  - `--bg-subtle`: `#101319` (secondary chrome / sidebar / table header)
  - `--panel`: `#151921` (primary interactive surface)
  - `--panel-hover`: `#1c212c` (hover state)
  - `--border`: `#232936` (hairline structural divider)
  - `--border-strong`: `#31394a` (interactive control border)
  - `--accent`: `#4f86f7` (precision cobalt blue for primary actions & active indicators)
- **Light Theme**:
  - `--bg`: `#f8f9fb` (cool paper canvas)
  - `--bg-subtle`: `#f1f4f8` (sidebar / subtle strip)
  - `--panel`: `#ffffff` (elevated surface)
  - `--panel-hover`: `#eef2f7`
  - `--border`: `#e2e7f0`
  - `--border-strong`: `#cbd4e1`
  - `--accent`: `#2563eb`
