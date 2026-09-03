# Brand system of record

`Powerking_Nepal_Brand_System.pptx` is the owner-supplied brand system. It is
the source the site is built against — when it and the code disagree, the deck
is right and the code is the bug.

## What the site implements from it

| Deck | Where it lives |
|---|---|
| Cut-corner plate, six-sided | `platePath()` / `plateClip()` in `src/templates/brand.js` |
| Perforated faceplate grille, one bar live | `grille()` — geometry read from the deck's shape offsets |
| POWERKING, Archivo caps at +0.1em | `lockup()` and `.mark__word` |
| ELECTRONICS, letter-justified beneath | `lockup()` and `.mark__sub` |
| Icon: primary / reversed / outline / coarse | `icon()` |
| Safety Yellow #F4C400, Ink #101010, White | `BRAND` and the `--volt` / `--ink` tokens |
| Caution stripe, header and footer only | `.stripe` |
| Chamfered buttons | `.btn` clip-path, `--cut` |

## Re-reading it

LibreOffice in this environment cannot open the deck, and it embeds no
rasterised previews, so the geometry was read out of the OOXML directly:

```sh
python3 -c "
import zipfile, re
z = zipfile.ZipFile('brand/Powerking_Nepal_Brand_System.pptx')
xml = z.read('ppt/slides/slide2.xml').decode('utf8')
for m in re.finditer(r'<a:off x=\"(-?\d+)\" y=\"(-?\d+)\"/>', xml):
    print(int(m.group(1)) / 914400, int(m.group(2)) / 914400)   # EMU -> inches
"
```

Type sizes are on the runs as `sz` (hundredths of a point) and `spc`
(letter-spacing, hundredths of a point): POWERKING is `sz=5250 spc=525`, so the
tracking is exactly a tenth of the size.

## Not from the deck

`LOCKUP.wordToFont` in `brand.js` is POWERKING's advance width as a multiple of
its font size, measured in a browser in Archivo 800 at +0.1em. Re-measure it if
the face or the tracking ever changes; do not adjust it by eye.
