# -*- coding: utf-8 -*-
"""给一张衣服照片生成两张图：
A) recipe + 贴纸小衣服卡片
B) 香水成分拼贴（基于配方原料，复用植物拼贴引擎）
输出直接放到 Downloads。
"""
import base64
import io
import json
import math
import os
import random
import re
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

INPUT_IMGS = [
    Path(r"C:\Users\janic\Downloads\Weixin Image_20261118001017_4606_6.jpg"),
    Path(r"C:\Users\janic\Downloads\香味测试 - 服装.png"),
]
OUT_DIR = Path(r"C:\Users\janic\Downloads")
ROOT = Path(__file__).resolve().parents[1]


def _load_api_key() -> str:
    """API Key 不入库：优先环境变量 OPENAI_API_KEY，其次读被 .gitignore 的 js/apikey.js。"""
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if key:
        return key
    apikey = ROOT / "js" / "apikey.js"
    if apikey.exists():
        m = re.search(r"sk-[A-Za-z0-9_-]+", apikey.read_text(encoding="utf-8"))
        if m:
            return m.group(0)
    return ""


API_KEY = _load_api_key()

# ---- 复用植物拼贴引擎 ----
import importlib.util
_spec = importlib.util.spec_from_file_location("g", ROOT / "tools" / "generate_recipe_collages_from_layout.py")
G = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(G)

FONT_PATH = ROOT / "assets" / "fonts" / "biroscriptplus.otf"
FONT_FALLBACKS = ("MTCORSVA.TTF", "segoesc.ttf", "Inkfree.ttf")


def openai(path, body):
    req = urllib.request.Request(
        "https://api.openai.com/v1" + path,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + API_KEY},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


# ---- 1. 分析衣服 ----
ANALYZE_PROMPT = """Analyse this clothing photo. Output ONE JSON object with exactly these fields:
{"gar":"<garment>","fabric":"<fabric>","pattern":"<pattern>","collar":"<collar>","colors":[{"name":"<colour name>","hex":"<#rrggbb>"},{"name":"<colour name>","hex":"<#rrggbb>"},{"name":"<colour name>","hex":"<#rrggbb>"}],"style":"<style>"}
Hard rules:
- Fill every field from what is actually in the photo. Never copy or reuse the example values above (they are only field placeholders).
- colors = the 3 dominant colours OF THE GARMENT itself, largest area first. Background, hair, skin and surroundings never count as garment colours.
- Every hex must be a colour that genuinely appears on the garment in the photo (never invent one).
- name must be exactly one of: black|dark grey|grey|light grey|white|beige|cream|camel|khaki|brown|dark brown|navy|dark blue|blue|sky blue|light blue|denim blue|dark green|olive|army green|deep olive|green|light green|wine red|red|rose red|pink|light pink|orange|yellow|purple|deep purple|lilac
- gar must be exactly one of: dress|top|shirt|coat|jacket|sweatshirt|sweater|tee|tank|trousers|shorts|skirt|long dress|short skirt|denim|other
- Garment rule: if it is a dress or any one-piece (even if only the top half is visible), always answer "dress". Only answer "top" when top and bottom are clearly separate garments.
- fabric must be exactly one of: cotton|silk/satin|linen|knit/sweater|fleece|denim|leather|tech/sport fabric|other
- pattern must be exactly one of: solid|stripe|check|polka dot|floral|leopard/animal print|tie-dye|print|none
- collar must be exactly one of: crew|V-neck|turtleneck|square|lapel|shirt collar|collarless
- style must be exactly one of: wild|sweet|sporty|office|natural/home|evening
- Output JSON only. No explanation, no comments."""

GARMENT_PROMPT = """First identify and isolate the primary outfit worn by the person in the reference image. Ignore and completely remove the person's face, hair, skin, hands, legs, body, pose, accessories unrelated to the clothing, and the original background.

Carefully analyze the clothing and reconstruct the complete garment as a standalone fashion piece. Preserve the recognizable identity of the original outfit as accurately as possible, including its overall silhouette, proportions, neckline, collar, sleeves, cuffs, shoulder shape, front opening, buttons, pockets, waistline, major panels, layering, hemline, patterns, and other distinctive construction details. Infer naturally any portions of the garment that are hidden by the person's body or pose.

Transform the reconstructed clothing into a handmade FLAT washi-tape and decorative-paper fashion collage. The garment must look physically assembled from real pieces of washi tape, Japanese paper, thin decorative paper, translucent paper, and textured craft paper, rather than like fabric with a digital paper texture applied.

Visually simplify and abstract the original garment into a SMALL NUMBER OF RELATIVELY LARGE, CLEAR PAPER SHAPES. Represent one visually continuous area of the garment with one larger piece of paper (bodice as one shape, each sleeve as one shape, collar as one or two shapes, waistband as one strip, a large skirt as one silhouette or a few broad panels). Use the FEWEST paper pieces necessary while preserving the recognizable design. Avoid mosaics made from many tiny fragments and excessive segmentation.

Choose ONE paper material per major shape, translating textile qualities into paper qualities: matte cotton to matte washi; smooth solid fabric to clean solid Japanese paper; plaid to subtle printed plaid washi; stripes to striped decorative paper; floral to restrained botanical washi; denim to fibrous blue-gray paper; wool/tweed to textured fiber paper; silk/satin to thin smooth paper with subtle sheen; lace to patterned translucent paper; chiffon/organza/sheer to translucent Japanese tissue; heavy structured fabric to denser matte craft paper. Reinterpret the textile character through paper texture, not photorealistic fabric.

Preserve the original garment's color identity and important color relationships, translating source colors into slightly softened, natural paper colors. Do not redesign the outfit or introduce unrelated colors, patterns, pleats, bows, ruffles, pockets, or layers. Preserve important plaid, stripe, floral, graphic or woven patterns as simplified printed or textured paper surfaces. Small functional details like buttons or trims may be small simple paper shapes when visually important.

Keep the entire collage FLAT. All paper pieces remain visually flat on the same two-dimensional plane. No 3D paper sculpture, no folds, no curled corners, no floating edges, no accordion folds, no dimensional ruffles. Pleats, gathers, folds and draping are SIMPLIFIED GRAPHICALLY rather than physically constructed.

The garment should read immediately as a handmade paper collage: broad silhouettes, large uninterrupted paper surfaces, subtle flat overlaps, carefully hand-cut slightly imperfect edges, subtle natural paper fibers and faint printed textures. The aesthetic sits between fashion collage, Japanese paper craft, material study, and minimal graphic abstraction.

Present the complete reconstructed outfit alone, without a human body or mannequin, vertically centered. The garment occupies approximately 45-55% of the image height with generous transparent empty space on every side. The entire area outside the garment must be TRUE TRANSPARENCY with a clean alpha channel. No white, ivory, beige, gray, colored or paper background, no floor, wall, table, sketchbook, or canvas texture, no checkerboard or fake transparency.

Use soft, even, neutral illumination only to reveal subtle material qualities. No directional lighting, no dramatic highlights, no dimensional shading, no cast shadows, no halo, glow, outline or border around the garment, no additional objects.

Avoid: human model, mannequin, human body, face, head, hair, skin, arms, hands, legs, feet, person wearing clothes, hanger, clothing rack, realistic fabric clothing, textile photography, 3D paper sculpture, origami, folded or curled paper, many tiny paper pieces, dozens of narrow strips, fragmented mosaic, excessive torn paper, invented patterns or embellishments, digitally painted or watercolor or vector or cartoon or CGI clothing, glossy plastic, perfectly computer-cut or laser-cut edges, white or colored background, cast or drop shadow, scrapbook decorations, flowers, stamps, text, typography, logo, watermark, dramatic lighting, strong saturation, neon colors. Output a clean isolated transparent PNG of the garment only."""

SPICE_EN = {
    "小豆蔻":"spicy cardamom","柑橘":"bright citrus","皮革":"tan leather","焚香":"smoky frankincense",
    "藏红花":"leathery saffron","橡木苔":"damp oakmoss","白茶":"silken white tea","紫罗兰":"powdered violet",
    "青草":"green grass","樱花":"airy cherry blossom","橙花":"zesty orange blossom","野莓":"juicy wild berry",
    "广藿香":"earthy patchouli","依兰":"creamy ylang","郁金香":"wet tulip","白麝香":"skin-soft white musk",
    "小苍兰":"dewy freesia","海水":"salty sea","海洋":"salty sea","仙客来":"soapy cyclamen",
    "乌龙":"tannic oolong","粉红胡椒":"prickly pink pepper","乳香":"charred incense","琥珀":"resinous amber",
    "雪松":"dry cedar","香根草":"dry vetiver","岩兰草":"dry vetiver","蜜桃":"fuzzy peach",
    "栀子花":"buttery gardenia","香草":"burnt vanilla","薄荷":"cool mint","檀木":"milky sandalwood",
    "烟草木":"embered tobacco","棉花糖":"spun-sugar marshmallow","零陵香豆":"honeyed tonka","橡木":"rain-washed oak",
    "无花果叶":"green fig leaf","竹叶":"dewy bamboo","铃兰":"dewy lily of the valley","小黄瓜":"cool cucumber",
    "香葵子":"musk ambrette","松针":"rain-fresh pine needle","苔藓":"velvet moss",
    "黑醋栗芽":"inky blackcurrant bud","佛手柑":"bright bergamot","绿叶":"crushed green leaf",
    "天竺葵":"leafy geranium","龙涎香醚":"suede-soft ambroxan","白木":"pale white wood","鸢尾脂":"buttery orris butter",
    "甜橙":"sunny sweet orange","葡萄柚":"tangy grapefruit","肉豆蔻":"warm nutmeg","玫瑰净油":"velvet rose absolute",
    "木兰":"creamy magnolia","鸢尾根":"powdery orris root","香槟气泡":"fizzing champagne","麝香酮":"sensual muscone",
}


def _plain_name(en: str) -> str:
    """去掉香料英文前的形容词，保留完整多词名。"""
    keep = {
        "white tea", "white musk", "white wood", "sweet orange",
        "pine needle", "lily of the valley", "rose absolute", "orris root",
        "orris butter", "green leaf", "blackcurrant bud", "wild berry",
        "pink pepper", "fig leaf",
    }
    if en in keep:
        return en
    parts = en.split(" ", 1)
    return parts[1] if len(parts) > 1 else en


SPICE_PLAIN = {k: _plain_name(v) for k, v in SPICE_EN.items()}


def _font(sz: int):
    if FONT_PATH.exists():
        return ImageFont.truetype(str(FONT_PATH), sz)
    fdir = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")
    for name in FONT_FALLBACKS:
        p = os.path.join(fdir, name)
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


def _wrap(draw, text: str, font, max_width: int) -> list:
    words = text.split(" ")
    lines, cur = [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if cur and draw.textlength(t, font=font) > max_width:
            lines.append(cur)
            cur = w
        else:
            cur = t
    if cur:
        lines.append(cur)
    return lines


def _wrap_tokens(draw, tokens: list, sep: str, font, max_width: int) -> list:
    """按香料名（整词）换行，复合名如 rose absolute / lily of the valley 不会被拆开。"""
    lines, cur = [], ""
    for tok in tokens:
        part = tok if not cur else cur + sep + tok
        if cur and draw.textlength(part, font=font) > max_width:
            lines.append(cur)
            cur = tok
        else:
            cur = part
    if cur:
        lines.append(cur)
    return lines


def analyze_photo(img_path: Path) -> dict:
    b64 = base64.b64encode(img_path.read_bytes()).decode()
    body = {
        "model": "gpt-4o-mini", "temperature": 0.2, "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": "You are a clothing perfumer. Read the photo and output JSON only."},
            {"role": "user", "content": [
                {"type": "text", "text": ANALYZE_PROMPT},
                {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + b64}},
            ]},
        ],
        "max_tokens": 800,
    }
    j = openai("/chat/completions", body)
    raw = j["choices"][0]["message"]["content"].replace("```json", "").replace("```", "").strip()
    return json.loads(raw)


def pick_variant(style, attrs):
    names = list(G.RECIPES[style].keys())
    c = attrs.get("color", ""); p = attrs.get("print", ""); f = attrs.get("fabric", ""); g = attrs.get("garment", "")
    warm = ["brown","camel","khaki","beige","dark brown","cream","orange","yellow","wine red"]
    light = ["white","light grey","light pink","beige","cream","light blue","sky blue","lilac"]
    dark = ["black","dark grey","navy","dark blue","dark green","deep olive","dark brown","wine red","deep purple"]
    blue = ["blue","sky blue","light blue","navy","dark blue","denim blue"]
    green = ["green","light green","dark green","olive","deep olive","army green"]
    warm_tone = ["brown","camel","khaki","beige","cream","orange","yellow","dark brown"]
    pink = ["pink","light pink","rose red"]
    red = ["red","rose red","wine red"]
    any_v = lambda: random.choice(names)
    if style == "wild":
        if p == "leopard/animal print": return "meadow"
        if f == "leather": return "biker" if c in warm else "nightfall"
        if f == "fleece": return "nightfall" if c in dark else "biker"
        return any_v()
    if style == "office":
        if g in ("shirt", "jacket"): return "coffee" if f == "cotton" else ("weekend" if c in warm else "meeting")
        if c in light: return "weekend"
        return any_v()
    if style == "sweet":
        if c in pink: return "candy"
        if p in ("floral", "polka dot"): return "fruity floral"
        if c in light: return "delicate"
        return any_v()
    if style == "sporty":
        if c in blue: return "sea salt"
        if c in green: return "forest"
        if p == "stripe": return "mint"
        return any_v()
    if style == "natural/home":
        if c in green: return "after rain"
        if f == "linen": return "tea"
        if c in warm_tone: return "warm wood"
        return any_v()
    if style == "evening":
        if c in red: return "rose"
        if c in light: return "champagne"
        if c in dark: return "oriental"
        return any_v()
    return any_v()


def generate_sticker(img_path: Path) -> Image.Image:
    b64 = base64.b64encode(img_path.read_bytes()).decode()
    body = {
        "model": "gpt-image-1.5", "prompt": GARMENT_PROMPT,
        "images": [{"image_url": "data:image/jpeg;base64," + b64}],
        "background": "transparent", "output_format": "png", "size": "1024x1536", "quality": "medium",
    }
    j = openai("/images/edits", body)
    data = j["data"][0]
    if "b64_json" in data:
        return Image.open(io.BytesIO(base64.b64decode(data["b64_json"]))).convert("RGBA")
    raise RuntimeError("gpt-image 未返回 b64_json")


# ---- 手工排好的 2:3 小卡版式（来自 editors/recipe-card-editor.html，坐标/字号以 1000×1500 画布为准） ----
CARD_LAYOUT = {
    "W": 1000,
    "H": 1500,
    "bg": (250, 232, 202),                       # #fae8ca
    "garment": {"x": 191, "y": 158, "w": 620, "h": 929},
    "title": {"x": 495, "y": 113, "size": 110, "text": "Worn-In", "color": (92, 72, 52)},   # #5c4834
    "notes": {"x": 495, "y": 1209, "size": 83, "gap": 62, "max_width": 880, "color": (92, 72, 52)},
}


def compose_recipe_card(garment: Image.Image, style: str, variant: str, recipe: dict, out: Path) -> None:
    """2:3 竖版小卡，按 CARD_LAYOUT 手工版式：#fae8ca 底 + 衣服贴纸 + Biro Script Plus 手写配方（无前中后调、无形容词）。"""
    L = CARD_LAYOUT
    page = Image.new("RGB", (L["W"], L["H"]), L["bg"])
    draw = ImageDraw.Draw(page)

    # 衣服贴纸：直接按排好的位置/尺寸贴（保留透明边，与编辑器一致）
    card = garment.convert("RGBA")
    g = L["garment"]
    card = card.resize((g["w"], g["h"]), Image.Resampling.LANCZOS)
    page.paste(card, (g["x"], g["y"]), card)

    # 配方香料名（去掉形容词，按前中后顺序去重）
    names = []
    for key in ("top", "mid", "base"):
        for n in recipe[key]:
            en = SPICE_PLAIN.get(n, n)
            if en not in names:
                names.append(en)

    # 标题
    t = L["title"]
    draw.text((t["x"], t["y"]), t["text"], font=_font(t["size"]), fill=t["color"], anchor="mm")

    # 香料文字（自动换行，居中）
    n = L["notes"]
    spice_font = _font(n["size"])
    lines = _wrap_tokens(draw, names, " · ", spice_font, n["max_width"])
    total_h = (len(lines) - 1) * n["gap"]
    for i, ln in enumerate(lines):
        draw.text((n["x"], n["y"] - total_h / 2 + i * n["gap"]), ln, font=spice_font, fill=n["color"], anchor="mm")

    page.save(out, quality=95)


def compose_ingredient_collage(recipe: dict, out: Path) -> None:
    layout = {p["name"]: p for p in json.loads(
        (ROOT / "assets" / "botanicals" / "plant-layout.json").read_text(encoding="utf-8"))["plants"]}
    pool = []
    for key in ("top", "mid", "base"):
        for n in recipe[key]:
            n = G.ALIASES.get(n, n)
            if n not in pool and n in layout and not layout[n].get("hidden"):
                pool.append(n)
    pick = random.sample(pool, min(4, len(pool)))
    items = [layout[n] for n in pick]
    prepared = G.prepare(items)
    G.rebalance(prepared)
    G.resolve_overlaps(prepared)
    G.compose(prepared, out)
    print("成分拼贴抽取:", "、".join(pick))


def main():
    for i, img_path in enumerate(INPUT_IMGS, 1):
        print(f"\n===== 第 {i} 张：{img_path.name} =====")
        print("① 分析衣服…")
        info = analyze_photo(img_path)
        style = (info.get("style") or "office").strip()
        attrs = {
            "color": (info.get("colors") or [{}])[0].get("name", ""),
            "print": info.get("pattern", ""), "fabric": info.get("fabric", ""),
            "garment": info.get("gar", ""),
        }
        variant = pick_variant(style, attrs)
        recipe = G.RECIPES[style][variant]
        print(f"识别: style={style}, variant={variant}, garment={attrs['garment']}, fabric={attrs['fabric']}, pattern={attrs['print']}")
        print("配方:", json.dumps(recipe, ensure_ascii=False))

        print("② 生成纸艺拼贴衣服…")
        sticker = generate_sticker(img_path)
        sticker.save(OUT_DIR / f"garment_sticker_{i}.png")
        if i == 1:
            sticker.save(ROOT / "assets" / "garment-sticker.png")
        print(f"②.5 衣服贴纸已存: garment_sticker_{i}.png")

        card = OUT_DIR / f"recipe_card_{i}.png"
        compose_recipe_card(sticker, style, variant, recipe, card)
        print(f"③ 小卡: {card}")


if __name__ == "__main__":
    main()
