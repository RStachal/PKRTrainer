"""Render pages of a chart PDF to PNG so the ranges can actually be read.

    python Agents/solver-input/render-chart-pdf.py <pdf> <outdir> <from> <to> [zoom]

Most of the owner's range material is charts, and a chart is a picture: pulling
text out of `UpSwingPoker - Preflop Guide for RFI v211.pdf` returns the axis
labels and the combination counts, and not one of the 169 cells that says which
hands are actually raised. The ranges were unreadable for that reason alone.

pymupdf rather than poppler: `pdftoppm` needs system binaries that are not on this
machine, and pymupdf installs from pip with no system dependency at all. That is
the whole reason for the choice - it is not better, it is available.

Zoom 1.6 to 2.0 renders a 13x13 matrix large enough to read cell by cell. Below
about 1.4 the labels in the lower-right corner start to blur into each other,
which is exactly where the marginal hands live and where a misread costs the most.
"""
import os
import sys

import pymupdf


def main() -> None:
    if len(sys.argv) < 5:
        print(__doc__)
        raise SystemExit(2)

    source, out_dir = sys.argv[1], sys.argv[2]
    first, last = int(sys.argv[3]), int(sys.argv[4])
    zoom = float(sys.argv[5]) if len(sys.argv) > 5 else 1.8

    os.makedirs(out_dir, exist_ok=True)
    document = pymupdf.open(source)
    for index in range(first, min(last, document.page_count)):
        pixmap = document[index].get_pixmap(matrix=pymupdf.Matrix(zoom, zoom))
        path = os.path.join(out_dir, f"p{index + 1:02d}.png")
        pixmap.save(path)
        print(f"{path}  {pixmap.width}x{pixmap.height}")


if __name__ == "__main__":
    main()
