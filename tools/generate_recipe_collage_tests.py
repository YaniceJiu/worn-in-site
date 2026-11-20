"""Generate two recipe-based botanical collages over the requested fabric.

Source plant PNGs and the fabric JPG are read-only. Outputs go to
assets/botanicals/test_collages/.
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PLANT_DIR = Path(r"C:\Users\janic\Downloads\Botanicals_38_Updated\Botanicals_38_Updated\PNG")
FABRIC_PATH = Path(
    r"C:\Users\janic\Downloads\精油布料正方形图片\精油布料正方形图片\香草 + 香草奶色磨毛棉斜纹.jpg"
)
OUT_DIR = ROOT / "assets" / "botanicals" / "test_collages"
BOTTLE_PATH = ROOT / "assets" / "botanicals" / "perfume-bottle.png"

CANVAS_SIZE = 1000
CENTER = CANVAS_SIZE / 2
BOTTLE_SIZE = 270
RANDOM_SEED = 20261114

# Hierarchical layout: the five plants keep the original 72-degree circle orbit
# (same diagonal angles as before). Only their SIZE and RADIUS shift slightly by
# role, and a few plants are turned 90 degrees so they stand upright / lie level
# instead of following the tangent.
# orientation: 'vertical' keeps the long axis upright, 'horizontal' keeps it
# level (used for the wide moss / resin blocks), 'free' keeps the circle-tangent
# rotation already proven in the earlier layout.
ROLE_SIZE = {"large": 190, "medium": 160, "small": 110}
ROLE_RADIUS = {"large": 208, "medium": 184, "small": 218}
BASE_BEARINGS = [0, 72, 144, 216, 288]
STAGGER = [0, 6, -4, 8, -6]
PLANT_ROLE = {
    # --- 点缀 (small round fruit / nut / pod / small flower) -> corners ---
    "柑橘": ("small", "free"),
    "小豆蔻": ("small", "free"),
    "蜜桃": ("small", "free"),
    "甜橙": ("small", "free"),
    "肉豆蔻": ("small", "free"),
    "佛手柑": ("small", "free"),
    "樱花": ("small", "free"),
    # --- 主角 (big flower / wide shrub / long branch) -> cardinal axes ---
    "铃兰": ("large", "vertical"),
    "苔藓": ("large", "horizontal"),
    "玫瑰净油": ("large", "free"),
    "木兰": ("large", "free"),
    "栀子花": ("large", "free"),
    "皮革": ("large", "free"),
    "藏红花": ("large", "free"),
    "棉花糖": ("large", "free"),
    "竹叶": ("large", "vertical"),
    "松针": ("large", "vertical"),
    "香根草": ("large", "vertical"),
    "白茶": ("large", "vertical"),
    # --- 次角 (everything else fills remaining slots) ---
    "雪松": ("medium", "vertical"),
    "白木": ("medium", "vertical"),
    "小苍兰": ("medium", "vertical"),
    "橙花": ("medium", "vertical"),
    "香草": ("medium", "vertical"),
    "烟草木": ("medium", "free"),
    "檀木": ("medium", "free"),
    "天竺葵": ("medium", "free"),
    "乌龙": ("medium", "free"),
    "依兰": ("medium", "free"),
    "鸢尾根": ("medium", "free"),
    "橡木苔": ("medium", "free"),
    "海水": ("medium", "free"),
    "乳香": ("medium", "free"),
    "焚香": ("medium", "free"),
    "薄荷": ("medium", "free"),
    "橡木": ("medium", "horizontal"),
    "琥珀": ("medium", "horizontal"),
    "白麝香": ("medium", "horizontal"),
}



# The same two style/variant recipes used by copykit.js.
TEST_CASES = [
    {
        "file": "test_wild_biker_leather_jacket.png",
        "garment": "Brown leather jacket",
        "style": "wild",
        "variant": "biker",
        "recipe": ["小豆蔻", "柑橘", "皮革", "焚香", "琥珀", "烟草木", "乳香"],
    },
    {
        "file": "test_natural_after_rain_linen_dress.png",
        "garment": "Olive linen dress",
        "style": "natural/home",
        "variant": "after rain",
        "recipe": ["竹叶", "柑橘", "铃兰", "白茶", "苔藓", "橡木"],
    },
]


def plant_path_by_id(plant_id: str) -> Path:
    matches = sorted(PLANT_DIR.glob(f"{plant_id}_*.png"))
    if len(matches) != 1:
        raise FileNotFoundError(f"Expected one PNG for ingredient id {plant_id}; found {len(matches)}")
    return matches[0]


def load_cropped_plant(name: str) -> tuple[Image.Image, float]:
    plant_id = next(
        (path.name[:2] for path in PLANT_DIR.glob("*.png") if path.stem[3:] == name),
        None,
    )
    if plant_id is None:
        raise FileNotFoundError(f"No source plant PNG matches ingredient: {name}")
    image = Image.open(plant_path_by_id(plant_id)).convert("RGBA")
    alpha = image.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 18 else 0).getbbox()
    if bbox is None:
        raise ValueError(f"Plant image has no visible pixels: {name}")
    cropped = image.crop(bbox)

    # Estimate the illustration's long axis so every plant turns tangent to its orbit.
    alpha_array = np.asarray(cropped.getchannel("A"), dtype=np.uint8)
    ys, xs = np.nonzero(alpha_array > 32)
    coords = np.column_stack((xs, ys)).astype(np.float64)
    coords -= coords.mean(axis=0)
    covariance = coords.T @ coords / max(len(coords), 1)
    eigenvalues, eigenvectors = np.linalg.eigh(covariance)
    axis = eigenvectors[:, int(np.argmax(eigenvalues))]
    image_axis_degrees = math.degrees(math.atan2(axis[1], axis[0]))
    return cropped, image_axis_degrees


def wrap_180(angle: float) -> float:
    value = (angle + 90) % 180 - 90
    return value


def fit_crop(image: Image.Image, size: int) -> Image.Image:
    scale = size / max(image.width, image.height)
    target = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    return image.resize(target, Image.Resampling.LANCZOS)


def assign_slots(chosen: list[str]) -> list[tuple[int, float]]:
    """Keep the original orbit; only nudge radius by role (accents push outward)."""
    slots: list[tuple[int, float]] = []
    for i, name in enumerate(chosen):
        role, _ = PLANT_ROLE.get(name, ("medium", "free"))
        slots.append((BASE_BEARINGS[i], ROLE_RADIUS[role] + STAGGER[i]))
    return slots


def rotation_for(orientation: str, bearing: int, image_axis: float, jitter: float) -> float:
    """Long axis: vertical stays upright, horizontal stays level, free is tangent."""
    if orientation == "vertical":
        return wrap_180(image_axis - 90 + jitter)
    if orientation == "horizontal":
        return wrap_180(image_axis + jitter)
    return wrap_180(image_axis - bearing + jitter)


def draw_case(case: dict, rng: random.Random) -> dict:
    cloth = Image.open(FABRIC_PATH).convert("RGB").resize(
        (CANVAS_SIZE, CANVAS_SIZE), Image.Resampling.LANCZOS
    )
    canvas = cloth.convert("RGBA")
    chosen = rng.sample(case["recipe"], 5)
    slots = assign_slots(chosen)
    details = []

    for name, slot in zip(chosen, slots):
        bearing, radius = slot
        role, orientation = PLANT_ROLE.get(name, ("medium", "free"))
        plant, image_axis = load_cropped_plant(name)
        plant = fit_crop(plant, ROLE_SIZE[role])
        # PIL's positive rotation is counterclockwise, opposite Canvas. Align the
        # illustration's long axis per role orientation, with hand-set jitter.
        rotation = rotation_for(orientation, bearing, image_axis, rng.uniform(-5.5, 5.5))
        rotated = plant.rotate(rotation, resample=Image.Resampling.BICUBIC, expand=True)
        radians = math.radians(bearing)
        x = round(CENTER + radius * math.sin(radians))
        y = round(CENTER - radius * math.cos(radians))
        canvas.alpha_composite(rotated, (x - rotated.width // 2, y - rotated.height // 2))
        details.append({"name": name, "source": plant_path_by_id_for_name(name).name,
                        "role": role, "orientation": orientation,
                        "bearing": bearing, "radius": radius, "size": ROLE_SIZE[role],
                        "rotation": round(rotation, 1)})

    bottle = Image.open(BOTTLE_PATH).convert("RGBA")
    scale = BOTTLE_SIZE / bottle.width
    bottle = bottle.resize(
        (BOTTLE_SIZE, round(bottle.height * scale)), Image.Resampling.LANCZOS
    )
    canvas.alpha_composite(bottle, (round(CENTER - bottle.width / 2), round(CENTER - bottle.height / 2)))

    out_path = OUT_DIR / case["file"]
    canvas.convert("RGB").save(out_path, quality=95)
    return {"garment": case["garment"], "style": case["style"], "variant": case["variant"],
            "recipe": case["recipe"], "selected_ingredients": details, "output": case["file"]}


def plant_path_by_id_for_name(name: str) -> Path:
    for path in PLANT_DIR.glob("*.png"):
        if path.stem[3:] == name:
            return path
    raise FileNotFoundError(f"No source plant PNG matches ingredient: {name}")


def main() -> None:
    if not PLANT_DIR.is_dir():
        raise FileNotFoundError(f"Plant source folder not found: {PLANT_DIR}")
    if not FABRIC_PATH.is_file():
        raise FileNotFoundError(f"Fabric source image not found: {FABRIC_PATH}")
    if not BOTTLE_PATH.is_file():
        raise FileNotFoundError(f"Perfume bottle asset not found: {BOTTLE_PATH}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rng = random.Random(RANDOM_SEED)
    results = [draw_case(case, rng) for case in TEST_CASES]
    manifest = {"seed": RANDOM_SEED, "fabric": str(FABRIC_PATH), "tests": results}
    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    for item in results:
        print(f"{item['garment']} ({item['style']} / {item['variant']})")
        print("  ingredients:", ", ".join(entry["name"] for entry in item["selected_ingredients"]))
        print("  output:", OUT_DIR / item["output"])


if __name__ == "__main__":
    main()