# -*- coding: utf-8 -*-
"""Render the hand-tuned plant layout (plant-layout.json) over the fabric.

The editor's canvas convention is: rotation clockwise-positive, plant center at
(x, y), size = longest side in px. PIL rotates counterclockwise-positive, so we
negate the rotation. Plants marked "hidden" are skipped.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
LAYOUT_PATH = ROOT / "assets" / "botanicals" / "plant-layout.json"
FABRIC_PATH = ROOT / "assets" / "botanicals" / "fabric-vanilla.jpg"
BOTTLE_PATH = ROOT / "assets" / "botanicals" / "perfume-bottle.png"
OUT_PATH = ROOT / "assets" / "botanicals" / "test_collages" / "final_hand_tuned.png"

CANVAS_SIZE = 1000
BOTTLE_SIZE = 270


def plant_file(name: str) -> Path:
    src_dir = ROOT / "assets" / "botanicals" / "plants"
    matches = [p for p in src_dir.glob("*.png") if p.stem[3:] == name]
    if len(matches) != 1:
        raise FileNotFoundError(f"Plant source not found for: {name}")
    return matches[0]


def load_cropped(name: str) -> Image.Image:
    image = Image.open(plant_file(name)).convert("RGBA")
    alpha = image.getchannel("A")
    bbox = alpha.point(lambda v: 255 if v > 18 else 0).getbbox()
    if bbox is None:
        raise ValueError(f"Plant has no visible pixels: {name}")
    return image.crop(bbox)


def fit_to_size(image: Image.Image, size: float) -> Image.Image:
    scale = size / max(image.width, image.height)
    target = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    return image.resize(target, Image.Resampling.LANCZOS)


def main() -> None:
    layout = json.loads(LAYOUT_PATH.read_text(encoding="utf-8"))
    plants = layout["plants"]

    cloth = Image.open(FABRIC_PATH).convert("RGB").resize(
        (CANVAS_SIZE, CANVAS_SIZE), Image.Resampling.LANCZOS
    )
    canvas = cloth.convert("RGBA")

    for item in plants:
        if item.get("hidden"):
            continue
        plant = load_cropped(item["name"])
        plant = fit_to_size(plant, item["size"])
        # Canvas rotates clockwise-positive; PIL rotates counterclockwise-positive.
        rotated = plant.rotate(-item["rotate"], resample=Image.Resampling.BICUBIC, expand=True)
        x = round(item["x"]) - rotated.width // 2
        y = round(item["y"]) - rotated.height // 2
        canvas.alpha_composite(rotated, (x, y))

    bottle = Image.open(BOTTLE_PATH).convert("RGBA")
    scale = BOTTLE_SIZE / bottle.width
    bottle = bottle.resize(
        (BOTTLE_SIZE, round(bottle.height * scale)), Image.Resampling.LANCZOS
    )
    canvas.alpha_composite(
        bottle, (CANVAS_SIZE // 2 - bottle.width // 2, CANVAS_SIZE // 2 - bottle.height // 2)
    )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(OUT_PATH, quality=95)
    visible = sum(1 for p in plants if not p.get("hidden"))
    print(f"Rendered {visible} plants over fabric -> {OUT_PATH}")


if __name__ == "__main__":
    main()
