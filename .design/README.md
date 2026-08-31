# Design canvas — PWRKNG × the PowerKing swivel

Working sources for the published canvas:
<https://claude.ai/code/artifact/d5d431ac-5880-45ff-bc50-9c1b90aebd52>

Six artboards: three lockup directions for the torn `pwrkng` wordmark with the
swivel from the charger packaging, a board showing the mark at the sizes it has
to survive, and a board for the four products photographed so far.

## Rebuilding

```sh
node gen.mjs        # the five lockup artboards
node genprod.mjs    # the products artboard
```

Both write `.dc.html` files next to themselves. They are generated, not edited
by hand, and are gitignored — each one embeds the site's Archivo woff2 as a
data: URI (~47 KB) because the artboard iframe has no dependable network.

The wordmark is not redrawn here: `gen.mjs` imports `glitchGeometry()` from
`src/templates/brand.js`, so the canvas always shows the mark the site actually
ships, including the hard-coded slice table.

Then re-seed and republish to the same artifact URL (see the `design` skill).

## The swivel is a stand-in

`ARM` in `gen.mjs` is redrawn from the charger photographs — one arc drawn
twice, turned through 180°, which gives the diagonal split and the square-cut
terminals the box has. It is close, not exact. When the original vector turns
up, replace `ARM` and every artboard picks it up.

## Still open

- Photo files for the four products (they arrived as chat images, not files).
- Pack size / MOQ per carton for each — no box states it.
- The two VGR trimmers are grooming, which none of the eight categories covers.
