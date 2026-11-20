# -*- coding: utf-8 -*-
"""Pick 3 random recipes and render a 5-plant collage for each, reusing the
hand-tuned positions saved in plant-layout.json.

Recipe ingredient names come from js/copykit.js. Both 岩兰草 and 香根草 refer to
the same plant file 香根草（岩兰草）, so they are aliased. Hidden plants
(白麝香 / 玫瑰净油, which the user did not place) are skipped when sampling.
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
LAYOUT_PATH = ROOT / "assets" / "botanicals" / "plant-layout.json"
FABRIC_PATH = ROOT / "assets" / "botanicals" / "fabric-vanilla.jpg"
BOTTLE_PATH = ROOT / "assets" / "botanicals" / "perfume-bottle.png"
PLANT_SRC = ROOT / "assets" / "botanicals" / "plants"
OUT_DIR = ROOT / "assets" / "botanicals" / "test_collages"

CANVAS = 1000
BOTTLE_SIZE = 270

ALIASES = {"岩兰草": "香根草（岩兰草）", "香根草": "香根草（岩兰草）"}

RECIPES = {
    "wild": {
        "meadow": {"top": ["柑橘", "小豆蔻"], "mid": ["藏红花", "皮革"], "base": ["烟草木", "乳香", "琥珀"]},
        "biker": {"top": ["小豆蔻", "柑橘"], "mid": ["皮革", "焚香"], "base": ["琥珀", "烟草木", "乳香"]},
        "nightfall": {"top": ["柑橘", "小豆蔻"], "mid": ["焚香", "藏红花"], "base": ["乳香", "琥珀", "烟草木"]},
    },
    "office": {
        "meeting": {"top": ["白茶", "佛手柑"], "mid": ["雪松", "橡木苔"], "base": ["白麝香", "香根草"]},
        "coffee": {"top": ["佛手柑", "白茶"], "mid": ["天竺葵", "雪松"], "base": ["白麝香", "香根草"]},
        "weekend": {"top": ["白茶", "佛手柑"], "mid": ["天竺葵", "橡木苔"], "base": ["香根草", "白麝香"]},
    },
    "sweet": {
        "candy": {"top": ["蜜桃", "橙花", "樱花"], "mid": ["棉花糖", "栀子花"], "base": ["香草", "白木"]},
        "fruity floral": {"top": ["樱花", "橙花", "蜜桃"], "mid": ["栀子花", "棉花糖"], "base": ["白木", "香草"]},
        "delicate": {"top": ["樱花", "蜜桃"], "mid": ["栀子花", "棉花糖"], "base": ["香草", "白木"]},
    },
    "sporty": {
        "sea salt": {"top": ["薄荷", "甜橙"], "mid": ["海水", "依兰"], "base": ["岩兰草", "松针"]},
        "forest": {"top": ["甜橙", "薄荷"], "mid": ["依兰", "海水"], "base": ["松针", "肉豆蔻"]},
        "mint": {"top": ["薄荷", "甜橙"], "mid": ["海水", "依兰"], "base": ["岩兰草", "松针"]},
    },
    "natural/home": {
        "after rain": {"top": ["竹叶", "柑橘"], "mid": ["铃兰", "白茶"], "base": ["苔藓", "橡木"]},
        "warm wood": {"top": ["柑橘", "竹叶"], "mid": ["白茶", "松针"], "base": ["橡木", "苔藓"]},
        "tea": {"top": ["竹叶", "柑橘"], "mid": ["白茶", "铃兰"], "base": ["橡木", "苔藓"]},
    },
    "evening": {
        "rose": {"top": ["小苍兰", "乌龙"], "mid": ["玫瑰净油", "木兰"], "base": ["檀木", "鸢尾根"]},
        "champagne": {"top": ["乌龙", "小苍兰"], "mid": ["木兰", "玫瑰净油"], "base": ["鸢尾根", "檀木"]},
        "oriental": {"top": ["小苍兰", "乌龙"], "mid": ["玫瑰净油", "木兰"], "base": ["檀木", "鸢尾根"]},
    },
}


def plant_file(name: str) -> Path:
    matches = [p for p in PLANT_SRC.glob("*.png") if p.stem[3:] == name]
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


def wrap180(angle: float) -> float:
    value = ((angle + 180) % 360) - 180
    if value <= -180:
        value += 360
    return value


def prepare(items: list[dict]) -> list[dict]:
    prepared = []
    for item in items:
        plant = load_cropped(item["name"])
        plant = fit_to_size(plant, item["size"])
        w, h = plant.size
        base_radius = math.hypot(item["x"] - CANVAS / 2, item["y"] - CANVAS / 2)
        prepared.append({
            "name": item["name"], "size": item["size"],
            "x": item["x"], "y": item["y"], "rotate": item["rotate"], "w": w, "h": h,
            "base_radius": base_radius,
        })
    return prepared


def aabb(w: float, h: float, rotate: float) -> tuple[float, float]:
    theta = math.radians(-rotate)
    c = abs(math.cos(theta))
    s = abs(math.sin(theta))
    return w * c + h * s, w * s + h * c


def overlap_ratio(a: dict, b: dict) -> float:
    aw, ah = aabb(a["w"], a["h"], a["rotate"])
    bw, bh = aabb(b["w"], b["h"], b["rotate"])
    x1 = max(a["x"] - aw / 2, b["x"] - bw / 2)
    y1 = max(a["y"] - ah / 2, b["y"] - bh / 2)
    x2 = min(a["x"] + aw / 2, b["x"] + bw / 2)
    y2 = min(a["y"] + ah / 2, b["y"] + bh / 2)
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    union = aw * ah + bw * bh - inter
    return inter / union if union > 0 else 0.0


def worst_pair(prepared: list[dict]):
    worst = None
    for i in range(len(prepared)):
        for j in range(i + 1, len(prepared)):
            ratio = overlap_ratio(prepared[i], prepared[j])
            if worst is None or ratio > worst[2]:
                worst = (prepared[i], prepared[j], ratio)
    return worst


def resolve_overlaps(prepared: list[dict]) -> list[dict]:
    # 阶段一：重叠 ≥60% 的“大重叠”，把较大的一株绕香水中心旋转 180° 搬到对侧
    for _ in range(100):
        worst = worst_pair(prepared)
        if worst is None or worst[2] < 0.6:
            break
        a, b, _ = worst
        target = a if a["size"] >= b["size"] else b
        target["x"] = CANVAS - target["x"]
        target["y"] = CANVAS - target["y"]
        target["rotate"] = wrap180(target["rotate"] + 180)

    # 阶段二：残留重叠，优先微调较小一株的旋转；旋转无效再沿中心连线外推（目标 <5%）
    for _ in range(400):
        worst = worst_pair(prepared)
        if worst is None or worst[2] <= 0.05:
            break
        a, b, _ = worst
        target = a if a["size"] <= b["size"] else b
        other = b if target is a else a

        # 1) 连续旋转（±4° 步进，最多约 96°）
        for _inner in range(24):
            cur = overlap_ratio(a, b)
            if cur <= 0.05:
                break
            best = cur
            best_rotate = target["rotate"]
            for delta in (4, -4):
                target["rotate"] = wrap180(target["rotate"] + delta)
                trial = overlap_ratio(a, b)
                if trial < best:
                    best = trial
                    best_rotate = target["rotate"]
                target["rotate"] = wrap180(target["rotate"] - delta)
            if best >= cur:  # 旋转无改善
                break
            target["rotate"] = best_rotate

        # 2) 旋转后仍超标 → 沿两株中心连线把较小株向外推
        if overlap_ratio(a, b) > 0.05:
            dx = target["x"] - other["x"]
            dy = target["y"] - other["y"]
            dist = math.hypot(dx, dy) or 1.0
            step_x = dx / dist * 6
            step_y = dy / dist * 6
            base_r = target.get("base_radius", math.hypot(target["x"] - CANVAS / 2, target["y"] - CANVAS / 2))
            for _inner in range(16):
                if overlap_ratio(a, b) <= 0.05:
                    break
                nx = max(40.0, min(CANVAS - 40.0, target["x"] + step_x))
                ny = max(40.0, min(CANVAS - 40.0, target["y"] + step_y))
                if math.hypot(nx - CANVAS / 2, ny - CANVAS / 2) > base_r + 30:
                    break
                target["x"], target["y"] = nx, ny

    return prepared


def rebalance(prepared: list[dict]) -> list[dict]:
    """阶段三：找一圈里最大的角度空洞，若某方位太空且另一方位拥挤，把拥挤处
    对环绕度影响最小的一株搬到空洞中央（保持半径，只换角度）。"""
    def angle(item: dict) -> float:
        return (math.degrees(math.atan2(item["y"] - CANVAS / 2, item["x"] - CANVAS / 2)) + 360) % 360

    for _ in range(len(prepared)):
        n = len(prepared)
        angs = sorted(((angle(it), it) for it in prepared), key=lambda pair: pair[0])
        angles = [a for a, _ in angs]
        gaps = [(angles[(i + 1) % n] - angles[i]) % 360 for i in range(n)]

        gap_max_idx = max(range(n), key=lambda i: gaps[i])
        gap_min_idx = min(range(n), key=lambda i: gaps[i])
        # 空洞超过理想间隔(360/n)的 1.35 倍 = 明显空，才搬
        if gaps[gap_max_idx] <= (360.0 / n) * 1.35:
            break

        empty_ang = (angles[gap_max_idx] + gaps[gap_max_idx] / 2) % 360
        gap_min_idx = min(range(n), key=lambda i: gaps[i])
        candidates = [angs[gap_min_idx][1], angs[(gap_min_idx + 1) % n][1]]

        # 选搬走后整体角度间隔方差最小的 = 对环绕度影响最小
        best_item = None
        best_var = float("inf")
        for it in candidates:
            rest = [a for (a, other) in angs if other is not it]
            trial = sorted(rest + [empty_ang])
            trial_gaps = [(trial[(i + 1) % n] - trial[i]) % 360 for i in range(n)]
            mean = 360 / n
            var = sum((g - mean) ** 2 for g in trial_gaps) / n
            if var < best_var:
                best_var = var
                best_item = it

        old_x, old_y = best_item["x"], best_item["y"]
        radius = math.hypot(best_item["x"] - CANVAS / 2, best_item["y"] - CANVAS / 2)
        best_item["x"] = CANVAS / 2 + radius * math.cos(math.radians(empty_ang))
        best_item["y"] = CANVAS / 2 + radius * math.sin(math.radians(empty_ang))

        # 最大空洞没变小就回滚并停止，避免来回搬
        new_angs = sorted((angle(o) for o in prepared), key=float)
        new_gaps = [(new_angs[(i + 1) % n] - new_angs[i]) % 360 for i in range(n)]
        if max(new_gaps) >= gaps[gap_max_idx] - 0.5:
            best_item["x"], best_item["y"] = old_x, old_y
            break

        # 搬迁后只旋转微调（保持半径，不向外推，避免离瓶太远）
        others = [o for o in prepared if o is not best_item]
        for _inner in range(24):
            worst = max((overlap_ratio(best_item, o) for o in others), default=0.0)
            if worst <= 0.05:
                break
            best = worst
            best_r = best_item["rotate"]
            for delta in (4, -4):
                best_item["rotate"] = wrap180(best_item["rotate"] + delta)
                trial = max((overlap_ratio(best_item, o) for o in others), default=0.0)
                if trial < best:
                    best = trial
                    best_r = best_item["rotate"]
                best_item["rotate"] = wrap180(best_item["rotate"] - delta)
            if best >= worst:
                break
            best_item["rotate"] = best_r

    return prepared


def compose(prepared: list[dict], out_path: Path) -> None:
    cloth = Image.open(FABRIC_PATH).convert("RGB").resize(
        (CANVAS, CANVAS), Image.Resampling.LANCZOS
    )
    canvas = cloth.convert("RGBA")

    # 瓶子先画，香料画在上层
    bottle = Image.open(BOTTLE_PATH).convert("RGBA")
    scale = BOTTLE_SIZE / bottle.width
    bottle = bottle.resize(
        (BOTTLE_SIZE, round(bottle.height * scale)), Image.Resampling.LANCZOS
    )
    canvas.alpha_composite(
        bottle, (CANVAS // 2 - bottle.width // 2, CANVAS // 2 - bottle.height // 2)
    )

    for item in prepared:
        plant = load_cropped(item["name"])
        plant = fit_to_size(plant, item["size"])
        rotated = plant.rotate(-item["rotate"], resample=Image.Resampling.BICUBIC, expand=True)
        x = round(item["x"]) - rotated.width // 2
        y = round(item["y"]) - rotated.height // 2
        canvas.alpha_composite(rotated, (x, y))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(out_path, quality=95)


def recipe_ingredients(recipe: dict) -> list[str]:
    pool: list[str] = []
    for key in ("top", "mid", "base"):
        for name in recipe[key]:
            if name not in pool:
                pool.append(name)
    return pool


def main() -> None:
    layout = {p["name"]: p for p in json.loads(LAYOUT_PATH.read_text(encoding="utf-8"))["plants"]}

    all_recipes = [
        (style, variant, recipe)
        for style, variants in RECIPES.items()
        for variant, recipe in variants.items()
    ]
    chosen = random.sample(all_recipes, 2)

    for style, variant, recipe in chosen:
        pool = [ALIASES.get(n, n) for n in recipe_ingredients(recipe)]
        visible = [n for n in pool if n in layout and not layout[n].get("hidden")]
        pick = random.sample(visible, min(4, len(visible)))
        items = [layout[n] for n in pick]
        prepared = prepare(items)
        rebalance(prepared)
        resolve_overlaps(prepared)

        file_name = f"recipe_{style.replace('/', '-')}_{variant.replace(' ', '_')}.png"
        out_path = OUT_DIR / file_name
        compose(prepared, out_path)
        residual = worst_pair(prepared)
        residual_text = "无重叠" if residual is None else f"最大重叠 {residual[2]*100:.0f}%"
        print(f"[{style} / {variant}] 抽取 {len(pick)} 种: {', '.join(pick)}")
        print(f"  调整后 -> {residual_text}")
        print(f"  -> {out_path}")


if __name__ == "__main__":
    main()
