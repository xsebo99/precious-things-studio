---
title: Six homepages behind one name
description: How the Precious Things Studio site switches between six hand-built backgrounds — particles, photo trails, a nebula, split-flaps and an ASCII field — without loading any of them twice.
date: 2026-11-08
tags: [astro, canvas, webgl, typescript]
repo: https://github.com/xsebo99/precious-things-studio
live: https://xsebo99.github.io/precious-things-studio/
status: in progress
---

The studio homepage is one line of type — **Precious Things Studio** — sitting on top of whatever background is currently switched on. The arrows (or ← / →) cycle through six of them:

| design   | what it is                                                   |
| -------- | ------------------------------------------------------------ |
| `night`  | drifting particles with a light beam through the name        |
| `sun`    | matte yellow; dragging the cursor leaves a trail of photos   |
| `mosaic` | a Webb telescope mosaic floating in front of a live nebula   |
| `tiles`  | a grid of telescope images that flip on hover                |
| `flip`   | an airport split-flap board with world clocks                |
| `ascii`  | faint characters on paper that react to the cursor and clicks |

## Only build what's on screen

Every design is a small factory that returns the same two-method interface. Nothing starts until a design is shown for the first time, and switching away pauses it instead of tearing it down:

```ts
type Scene = { pause(): void; resume(): void };

const scenes = new Map<Design, Scene | null>();
function scene(design: Design) {
  if (!scenes.has(design)) {
    try {
      scenes.set(design, factories[design]());
    } catch (err) {
      // e.g. no WebGL — the name still stands on its own.
      scenes.set(design, null);
    }
  }
  return scenes.get(design);
}
```

A failing design (no WebGL, an old browser) stores `null`, so the page quietly falls back to the plain wordmark instead of breaking.

## The ASCII field

The newest design draws roughly 20,000 monospace characters on a canvas every frame. Two things keep that cheap:

- **A glyph atlas.** Each character is rendered once into an offscreen canvas, in grey and in blue. A frame is then only `drawImage` calls with a per-cell `globalAlpha`, never `fillText`.
- **A cached noise field.** The soft regions of denser text come from two octaves of value noise. They drift slowly, so the field is recomputed every fourth frame and reused in between.

A click sends out a blue ripple and grows an eight-ray asterisk made of symbols. The ripple stays where you clicked; the asterisk follows the cursor and spins when you move past it.

## Hosting

The site is static Astro output deployed to GitHub Pages by an Actions workflow on every push to `main`. Because it lives in a subfolder, every asset path goes through `import.meta.env.BASE_URL`.
