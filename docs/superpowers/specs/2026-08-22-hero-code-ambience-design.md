# Hero Code Ambience — Design

**Date:** 2026-08-22
**Status:** Approved

## Goal

Add a craft signal to the hero that demonstrates the owner is a real engineer, without the
performance cost of 3D/WebGL effects (lanyards, particles, etc.). A faint column of
realistic code scrolling down the hero's right edge, rendered with CSS-only animation.

## Placement

- One narrow column of scrolling code along the **far-right edge** of the hero.
- Absolutely positioned, outside the text flow — never competes with reading.

## Content

- A `<pre>` of realistic TypeScript/JS syntax: `import`, `export`, function signatures,
  `await`, `return`, braces, and comments.
- JetBrains Mono (`var(--font-mono)`), heavily dimmed (`--color-faint`-level opacity) so it
  reads as texture, not content.
- An accent `▍` cursor block near the bottom of the column to echo the terminal-cursor favicon.

## Motion

- Pure CSS `@keyframes` translating the column downward in a seamless loop.
- Two stacked copies of the same snippet (or matched-height content) so the scroll wraps
  without a visible jump.
- Vertical fade mask at top and bottom so lines dissolve instead of hard-cutting.
- Slow speed (~30–60s per full loop) for a calm, premium feel.

## Performance & Accessibility

- Uses only `transform` animation (GPU-composited) — no per-frame JS, no layout thrash.
- Honors `prefers-reduced-motion` via the existing `no-motion` class (pauses animation).
- Rendered only within the hero, so it is short-lived.
- Faint + right-edge placement keeps text contrast and readability intact.

## Files

- New: `src/components/HeroCodeAmbience.astro` — the ambience markup + content.
- Edit: `src/components/Hero.astro` — mount the ambience behind the content.
- Edit: `src/styles/global.css` — keyframes, mask, and positioning utilities.
- Uses existing `--font-mono`, `--color-faint`, `--color-line`, `--color-accent` tokens
  (dark/light aware automatically).
