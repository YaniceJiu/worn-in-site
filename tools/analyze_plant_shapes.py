# -*- coding: utf-8 -*-
"""Print shape stats for all 38 botanical PNGs to support main/accent/small layout."""

import math
from pathlib import Path

import numpy as np
from PIL import Image

PLANT_DIR = Path(r"C:\Users\janic\Downloads\Botanicals_38_Updated\Botanicals_38_Updated\PNG")


def analyze(path: Path) -> dict:
    image = Image.open(path).convert("RGBA")
    alpha = np.asarray(image.getchannel("A"), dtype=np.uint8)
    mask = alpha > 32
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return {"name": path.stem, "w": 0, "h": 0, "ratio": 0, "axis": 0, "area": 0}

    width = int(xs.max() - xs.min() + 1)
    height = int(ys.max() - ys.min() + 1)
    ratio = width / height

    coords = np.column_stack((xs, ys)).astype(np.float64)
    coords -= coords.mean(axis=0)
    covariance = coords.T @ coords / len(coords)
    eigenvalues, eigenvectors = np.linalg.eigh(covariance)
    axis_vec = eigenvectors[:, int(np.argmax(eigenvalues))]
    # Angle of the long axis, measured from the vertical (0 = upright).
    axis_from_vertical = math.degrees(math.atan2(axis_vec[0], axis_vec[1]))

    area = float(mask.sum()) / (alpha.shape[0] * alpha.shape[1])
    return {"name": path.stem, "w": width, "h": height, "ratio": round(ratio, 2),
            "axis": round(axis_from_vertical, 1), "area": round(area, 4)}


def main():
    rows = []
    for path in sorted(PLANT_DIR.glob("*.png")):
        info = analyze(path)
        info["name"] = info["name"][3:]
        rows.append(info)

    out = []
    out.append(f"{'plant':<12} {'w':>4} {'h':>4} {'ratio':>7} {'axis':>7} {'area%':>7}")
    for row in sorted(rows, key=lambda r: r["ratio"]):
        out.append(f"{row['name']:<12} {row['w']:>4} {row['h']:>4} {row['ratio']:>7} "
                   f"{row['axis']:>7} {row['area']*100:>6.2f}%")
    print("\n".join(out))


if __name__ == "__main__":
    main()
