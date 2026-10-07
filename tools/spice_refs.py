# -*- coding: utf-8 -*-
"""
spice_refs.py — 为「Worn-In 香料板」收集高清单主体参考图。

来源（都免费、免 key）：
  · Wikimedia Commons  —— 用 intitle: 做标题检索（全文检索噪音太大），
                          并只走「标准宽度 1920px 缩略图」下载。
                          ⚠ Wikimedia 对原图直链限流(429)，只有标准尺寸缩略图可用。
  · Openverse API      —— 聚合 Flickr / Rawpixel / StockSnap / Wikimedia，带授权信息。

产出：
  assets/spices/_raw/<中文名>/<序号>.<ext>   候选原图
  assets/spices/_raw/manifest.json           来源 / 作者 / 授权 / 评分
  assets/spices/_raw/review.html             挑选页（缩略图 + 授权 + 评分 + 勾选汇总）

自动排序依据（PIL + numpy，不靠肉眼）：
  clean   背景干净度 —— 四边框像素的中位色当背景，量边框到底多花
  single  单主体度   —— 连通域个数，最好只有 1 个主体块
  rich    是不是照片 —— 灰度熵 + 颜色数；剪贴画/矢量图又平又单调，会被压低
  fill    主体占比   —— 太大(占满/裁切)、太小(远景)都扣分；纹理类(flat)不扣
  shape   画面比例   —— 越接近正方形越适合方块图
另外两道硬过滤：
  · 标题命中 BAD_TITLE（插画/矢量/书籍/建筑/交通工具…）直接丢弃
  · 标题或标签里没出现该香料的词（must 正则）直接丢弃，挡掉无关馆藏

用法：
  python tools/spice_refs.py --only 柑橘,小豆蔻,皮革
  python tools/spice_refs.py                       # 全部 40 种
  python tools/spice_refs.py --prompts             # 只导出 tools/spice_prompts.txt
"""
import argparse
import hashlib
import io
import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "assets" / "spices" / "_raw"
CACHE = RAW / "_cache"
UA = "wornin-spice-board/1.0 (personal art project; python-urllib)"
MIN_W = 1000          # 缩略图最大 1920，低于 1000 就不要
MAX_DL = 8            # 每种最多下载几张候选
MAX_WIKI = 5          # Wikimedia 有配额，每种最多从它那里取几张
THUMB_W = 1920        # Wikimedia 允许的标准宽度，别乱改

STYLE = ("hand-drawn watercolor and ink botanical illustration, single object centred, "
         "cream paper background, thin ink outline, soft muted palette, square composition, "
         "no text, no letters, no border")

# cn 中文名 | sd 作图模型用的主体描述 | q 检索短语 | must 标题/标签必须命中的正则 | flat 纹理类
ITEMS = [
    dict(cn="柑橘",     sd="a single mandarin orange with two leaves",
         must=r"(mandarin|tangerine|citrus)",
         q=["mandarin orange fruit", "tangerine fruit", "Citrus reticulata fruit",
            "mandarin orange close up"]),
    dict(cn="小豆蔻",   sd="a small cluster of green cardamom pods",
         must=r"cardamom",
         q=["cardamom", "cardamom pods", "green cardamom", "Elettaria cardamomum"]),
    dict(cn="皮革",     sd="a folded piece of tan leather", flat=True,
         must=r"(leather|cowhide|hides?)",
         q=["leather", "leather texture", "cowhide leather", "leather grain"]),
    dict(cn="藏红花",   sd="a small pile of saffron threads",
         must=r"saffron",
         q=["saffron threads", "saffron spice", "Crocus sativus", "saffron stigmas"]),
    dict(cn="焚香",     sd="a burning incense stick with a curl of smoke",
         must=r"incense",
         q=["incense stick", "incense burning", "incense smoke", "joss stick"]),
    dict(cn="乳香",     sd="lumps of frankincense resin",
         must=r"(frankincense|boswellia)",
         q=["frankincense resin", "frankincense", "Boswellia sacra", "frankincense gum"]),
    dict(cn="沉香",     sd="a few chips of agarwood with soft smoke",
         must=r"(agarwood|oud|aquilaria)",
         q=["agarwood", "Aquilaria", "oud wood", "agarwood chips"]),
    dict(cn="烟草木",   sd="dried tobacco leaves",
         must=r"(tobacco|nicotiana)",
         q=["tobacco leaves", "tobacco plant", "Nicotiana tabacum", "dried tobacco leaf"]),
    dict(cn="白茶",     sd="a small pile of loose white tea leaves",
         must=r"white tea",
         q=["white tea leaves", "white tea", "Bai Mudan tea", "silver needle tea"]),
    dict(cn="佛手柑",   sd="a single bergamot fruit with a leaf",
         must=r"(bergamot|citrus bergamia)",
         q=["bergamot fruit", "bergamot citrus", "Citrus bergamia", "bergamot"]),
    dict(cn="橡木苔",   sd="oakmoss growing on a twig",
         must=r"(oakmoss|oak moss|evernia)",
         q=["oakmoss", "Evernia prunastri", "oak moss lichen", "oakmoss on tree"]),
    dict(cn="雪松",     sd="cedar wood shavings with a sprig of cedar",
         must=r"(cedar|cedrus)",
         q=["cedar wood", "cedar branch", "Cedrus", "cedar cones"]),
    dict(cn="天竺葵",   sd="a single geranium flower",
         must=r"(geranium|pelargonium)",
         q=["geranium flower", "Pelargonium", "pelargonium flower", "cranesbill flower"]),
    dict(cn="白麝香",   sd="a single white musk mallow flower",
         must=r"(musk mallow|abelmoschus)",
         q=["Abelmoschus moschatus", "musk mallow flower", "musk mallow"]),
    dict(cn="鼠尾草",   sd="a sprig of clary sage",
         must=r"(sage|salvia)",
         q=["clary sage", "Salvia sclarea", "sage leaves", "sage plant"]),
    dict(cn="樱花",     sd="a single cherry blossom sprig",
         must=r"(cherry blossom|sakura|prunus)",
         q=["cherry blossom", "sakura flower", "Prunus serrulata", "cherry blossom branch"]),
    dict(cn="蜜桃",     sd="a single peach with a leaf",
         must=r"(peach|prunus persica)",
         q=["peach fruit", "peach tree fruit", "Prunus persica", "ripe peach"]),
    dict(cn="橙花",     sd="a sprig of orange blossom",
         must=r"(orange blossom|neroli|citrus aurantium)",
         q=["orange blossom", "neroli", "Citrus aurantium flower", "orange flower"]),
    dict(cn="栀子花",   sd="a single white gardenia flower",
         must=r"gardenia",
         q=["gardenia flower", "Gardenia jasminoides", "white gardenia", "cape jasmine"]),
    dict(cn="棉花糖",   sd="a small stack of white marshmallows",
         must=r"marshmallow",
         q=["marshmallow", "marshmallows", "marshmallow candy"]),
    dict(cn="香草",     sd="a bundle of vanilla pods",
         must=r"vanilla",
         q=["vanilla pods", "vanilla beans", "Vanilla planifolia", "vanilla pod"]),
    dict(cn="广藿香",   sd="dried patchouli leaves with a sprig",
         must=r"patchouli",
         q=["patchouli leaves", "Pogostemon cablin", "patchouli", "dried patchouli"]),
    dict(cn="甜橙",     sd="a single sweet orange with a leaf",
         must=r"(orange|citrus sinensis)",
         q=["orange fruit", "sweet orange", "Citrus sinensis", "orange with leaf"]),
    dict(cn="薄荷",     sd="a sprig of fresh mint",
         must=r"(mint|mentha)",
         q=["mint leaves", "Mentha spicata", "peppermint leaves", "fresh mint"]),
    dict(cn="海水",     sd="a splash of sea water", flat=True,
         must=r"(sea|ocean|water)",
         q=["sea water", "ocean water surface", "sea surface", "water waves close up"]),
    dict(cn="依兰",     sd="a single ylang-ylang flower",
         must=r"(ylang|cananga)",
         q=["ylang ylang flower", "Cananga odorata", "ylang ylang"]),
    dict(cn="威士忌",   sd="a glass of whisky with a splash of amber spirit",
         must=r"(whisk|whisky|bourbon|scotch)",
         q=["whisky glass", "whiskey", "whisky", "bourbon whiskey"]),
    dict(cn="松针",     sd="a sprig of pine needles",
         must=r"(pine|pinus)",
         q=["pine needles", "pine twig", "Pinus needles", "pine branch needles"]),
    dict(cn="肉豆蔻",   sd="a whole nutmeg with mace",
         must=r"(nutmeg|myristica)",
         q=["nutmeg", "nutmeg seed", "Myristica fragrans", "whole nutmeg"]),
    dict(cn="竹叶",     sd="a sprig of bamboo leaves",
         must=r"bamboo",
         q=["bamboo leaves", "bamboo leaf", "bamboo foliage"]),
    dict(cn="铃兰",     sd="a sprig of lily of the valley",
         must=r"(lily of the valley|convallaria)",
         q=["lily of the valley", "Convallaria majalis", "lily of the valley flower"]),
    dict(cn="橡木",     sd="an oak branch with an acorn",
         must=r"(oak|quercus)",
         q=["oak acorn", "oak branch", "Quercus", "oak leaves acorn"]),
    dict(cn="苔藓",     sd="a patch of green moss", flat=True,
         must=r"moss",
         q=["green moss", "moss close up", "moss texture", "moss on stone"]),
    dict(cn="小苍兰",   sd="a single freesia flower",
         must=r"freesia",
         q=["freesia flower", "Freesia", "freesia blossom"]),
    dict(cn="乌龙",     sd="a small pile of loose oolong tea leaves",
         must=r"oolong",
         q=["oolong tea", "oolong tea leaves", "oolong tea dry"]),
    dict(cn="玫瑰净油", sd="a single dark red rose",
         must=r"(rose|rosa)",
         q=["dark red rose", "red rose flower", "Rosa", "red rose close up"]),
    dict(cn="木兰",     sd="a single magnolia flower",
         must=r"magnolia",
         q=["magnolia flower", "Magnolia grandiflora", "magnolia blossom"]),
    dict(cn="檀木",     sd="a piece of sandalwood",
         must=r"(sandalwood|santalum)",
         q=["sandalwood", "sandalwood wood", "Santalum album", "sandalwood pieces"]),
    dict(cn="鸢尾根",   sd="an iris flower with a piece of orris root",
         must=r"(iris|orris)",
         q=["iris flower", "Iris germanica", "orris root", "bearded iris flower"]),
    dict(cn="无花果叶", sd="a single fig leaf",
         must=r"(fig|ficus)",
         q=["fig leaf", "Ficus carica leaf", "fig leaves", "fig tree leaf"]),
]


# ─────────────────────────── 网络（带重试，429 退避） ───────────────────────────
def fetch(url, tries=3, timeout=25):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:
            last = e
            code = getattr(e, "code", 0) or 0
            if code == 429:
                time.sleep(2.5 * (i + 1))          # Wikimedia 限流，等一下再试
            elif code in (403, 404, 410, 424):
                break                              # 明确拿不到，换下一个地址
            else:
                time.sleep(0.8 * (i + 1))
    raise last


def get_json(url, **kw):
    return json.loads(fetch(url, **kw).decode("utf-8", "replace"))


def strip_html(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()


# 实测：这几家在这台机器上取不到图，直接跳过，别浪费时间
BAD_HOST = re.compile(r"(stocksnap\.io|cdn\.pixabay|i\.pinimg)", re.I)
# 优先抓这些站的图（活的）
GOOD_HOST = re.compile(r"(live\.staticflickr\.com|upload\.wikimedia\.org)", re.I)


def candidate_urls(c):
    """按优先级给出可尝试的下载地址：原图 → Flickr 加大尺寸 → Openverse 缩略图兜底。"""
    u = c["img"]
    urls = [u]
    m = re.match(r"(https://live\.staticflickr\.com/\d+/[0-9a-f]+_)[a-z](\.[a-zA-Z]+)$", u)
    if m:                                   # Flickr 的 _b(1024) 通常还能升到 _k(2048)
        for suf in ("k", "h", "c"):
            urls.append(m.group(1) + suf + m.group(2))
    if c.get("thumb"):
        urls.append(c["thumb"])
    return urls


# 标题里出现这些词的，基本不是我们要的「实物照片」：
# 插画/矢量/版画/书籍/地图（不是实物）、建筑/交通工具（intitle 会误命中地名）
BAD_TITLE = re.compile(
    r"(clip-?art|illustration|vector|line art|drawing|sketch|lithograph|engraving|etching|"
    r"woodcut|mezzotint|painting|watercolou?r|poster|cartoon|icon|silhouette|stencil|logo|"
    r"coat of arms|badge|seal|stamp|diagram|svg|map|chart|"
    r"manuscript|incunabula|book|booklet|pamphlet|newspaper|magazine|journal|plate|page|"
    r"advertisement|catalog|postcard|"
    r"museum|library|gallery|building|exchange|house|street|square|church|chapel|castle|"
    r"station|bridge|factory|warehouse|dock|harbour|harbor|"
    r"car|automobile|truck|motorcycle|locomotive|railway|aircraft|airplane|ship|boat|"
    r"statue|sculpture|monument|tomb|mosaic|fresco|"
    r"diagram|schematic|infographic)", re.I)


def title_ok(title):
    return not BAD_TITLE.search(title or "")


def _phrase(q):
    return '"%s"' % q if " " in q else q


def search_commons(query, limit=20):
    """只取标准宽度缩略图；原图直链会被 Wikimedia 限流。"""
    url = ("https://commons.wikimedia.org/w/api.php?"
           + urllib.parse.urlencode({
               "action": "query", "format": "json",
               "generator": "search", "gsrnamespace": 6,
               "gsrsearch": "intitle:" + _phrase(query) + " filetype:bitmap",
               "gsrlimit": limit,
               "prop": "imageinfo",
               "iiprop": "url|size|extmetadata",
               "iiurlwidth": THUMB_W,
           }))
    out = []
    for page in (get_json(url).get("query", {}).get("pages", {}) or {}).values():
        ii = (page.get("imageinfo") or [{}])[0]
        thumb = ii.get("thumburl")
        if not thumb or "unscaled" in thumb:
            continue
        meta = ii.get("extmetadata", {})
        out.append({
            "src": "commons",
            "img": thumb,
            "page": ii.get("descriptionurl", ""),
            "title": page.get("title", ""),
            "tags": "",
            "author": strip_html(meta.get("Artist", {}).get("value") or "unknown")[:80],
            "license": strip_html(meta.get("LicenseShortName", {}).get("value") or "unknown"),
            "w": ii.get("thumbwidth") or ii.get("width") or 0,
            "h": ii.get("thumbheight") or ii.get("height") or 0,
        })
    return out


def search_openverse(query, limit=20, strict=True):
    url = ("https://api.openverse.org/v1/images/?"
           + urllib.parse.urlencode({
               "q": query,
               "license_type": "commercial,modification" if strict else "commercial",
               "size": "large",
               "page_size": limit,
           }))
    out = []
    for r in get_json(url).get("results", []):
        if not r.get("url"):
            continue
        out.append({
            "src": "openverse",
            "img": r["url"],
            "page": r.get("foreign_landing_url", ""),
            "title": r.get("title") or "",
            "tags": " ".join(t.get("name", "") for t in (r.get("tags") or [])),
            "thumb": r.get("thumbnail") or "",
            "author": strip_html(r.get("creator") or "unknown")[:80],
            "license": ((r.get("license") or "").upper() + " " + (r.get("license_version") or "")).strip(),
            "w": r.get("width") or 0,
            "h": r.get("height") or 0,
        })
    return out


# ─────────────────────────── 图像打分 ───────────────────────────
def _blob_sizes(mask):
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    sizes = []
    for y in range(h):
        row = mask[y]
        for x in range(w):
            if row[x] and not seen[y, x]:
                stack = [(y, x)]
                seen[y, x] = True
                n = 0
                while stack:
                    cy, cx = stack.pop()
                    n += 1
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            stack.append((ny, nx))
                sizes.append(n)
    sizes.sort(reverse=True)
    return sizes


def analyze(img, flat=False):
    W, H = img.size
    rgb = img.convert("RGB")
    a = np.asarray(rgb.resize((128, 128), Image.LANCZOS), dtype=np.float32)

    border = np.concatenate([a[:4].reshape(-1, 3), a[-4:].reshape(-1, 3),
                             a[:, :4].reshape(-1, 3), a[:, -4:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    bg_spread = float(np.median(np.linalg.norm(border - bg, axis=1)))

    mask = np.linalg.norm(a - bg, axis=2) > 30
    fill = float(mask.mean())
    blobs = _blob_sizes(mask)
    n_big = sum(1 for s in blobs if s > mask.size * 0.01)

    # 「是不是照片」：剪贴画/矢量图色阶极平、灰度熵很低；实拍照片两者都高
    gray = np.asarray(rgb.convert("L").resize((128, 128), Image.LANCZOS))
    hist = np.histogram(gray, bins=32, range=(0, 256))[0].astype(np.float64)
    p = hist / max(hist.sum(), 1)
    gray_ent = float(-(p[p > 0] * np.log2(p[p > 0])).sum()) / 5.0        # ~1 = 照片
    q = (np.asarray(rgb.resize((64, 64), Image.LANCZOS), dtype=np.uint16) // 32)
    n_col = len(np.unique(q.reshape(-1, 3), axis=0)) / 512.0             # 8^3 / 512
    rich = min(1.0, 0.55 * gray_ent + 0.45 * n_col)

    clean = math.exp(-bg_spread / 14.0)
    single = math.exp(-max(0, n_big - 1) / 1.4)
    size_ok = 1.0 if flat or 0.06 <= fill <= 0.72 else 0.35
    ar = (W / H) if H else 1
    shape = 1.0 if 0.72 <= ar <= 1.38 else (0.6 if 0.5 <= ar <= 2.0 else 0.3)

    return {
        "w": W, "h": H, "ar": round(ar, 2),
        "clean": round(clean, 2), "single": round(single, 2), "rich": round(rich, 2),
        "fill": round(fill, 2), "n_big": n_big,
        "score": round(0.26 * clean + 0.22 * single + 0.26 * rich
                       + 0.12 * size_ok + 0.14 * shape, 3),
    }


# ─────────────────────────── 主流程 ───────────────────────────
def collect(item, max_dl=MAX_DL, verbose=True):
    cn, flat = item["cn"], item.get("flat", False)
    out_dir = RAW / cn
    out_dir.mkdir(parents=True, exist_ok=True)

    seen, cands = set(), []
    for q in item["q"]:
        for fn in (search_commons, search_openverse):
            try:
                hits = fn(q)
            except Exception as e:
                if verbose:
                    print("   ! %s(%s): %s" % (fn.__name__, q, str(e)[:90]))
                time.sleep(1.0)
                continue
            for c in hits:
                if c["img"] in seen or max(c["w"], c["h"]) < MIN_W:
                    continue
                if not title_ok(c.get("title", "")):              # 丢插画/矢量/书籍/建筑
                    continue
                if BAD_HOST.search(c["img"]):                     # 这台机器取不到的图床
                    continue
                # 标题里必须真的出现这个香料。只看标题不看标签：
                # 否则「浮标 / 量谷篮」这类皮革制品会靠标签混进来。
                hay = c.get("title") or c.get("tags") or ""
                if item.get("must") and not re.search(item["must"], hay, re.I):
                    continue
                seen.add(c["img"])
                cands.append(c)
            time.sleep(0.5)

    if verbose:
        print("  %s：命中 %d 张 >= %dpx" % (cn, len(cands), MIN_W))

    # Flickr 最稳，Wikimedia 次之（有配额），其余（如 stocksnap）已在上面剔除
    def rank(c):
        return (0 if GOOD_HOST.search(c["img"]) else 1, -(c["w"] * c["h"]))
    picked = sorted(cands, key=rank)[:max_dl * 3]

    CACHE.mkdir(parents=True, exist_ok=True)
    kept, idx, t0 = [], 0, time.time()
    for c in picked:
        if len(kept) >= max_dl or time.time() - t0 > 240:   # 单种最多耗 4 分钟
            break
        data, used = None, c["img"]
        for u in candidate_urls(c):               # 原图 → Flickr 大图 → 缩略图兜底
            ext = (Path(urllib.parse.urlparse(u).path).suffix or ".jpg").lower()
            if ext not in (".jpg", ".jpeg", ".png", ".webp"):
                ext = ".jpg"
            blob = CACHE / (hashlib.sha1(u.encode("utf-8")).hexdigest()[:16] + ext)
            try:
                if blob.exists():                 # 按 URL 缓存，重跑不用重新下载
                    data = blob.read_bytes()
                else:
                    data = fetch(u, tries=2)
                    blob.write_bytes(data)
                    if "wikimedia.org" in u:
                        time.sleep(1.5)           # Wikimedia 必须放慢
                used = u
                break
            except Exception:
                data = None
                continue
        if data is None:
            if verbose:
                print("   ! 取不到 %s" % c["img"][-58:])
            continue

        idx += 1
        ext = (Path(urllib.parse.urlparse(used).path).suffix or ".jpg").lower()
        if ext not in (".jpg", ".jpeg", ".png", ".webp"):
            ext = ".jpg"
        dest = out_dir / ("%02d%s" % (idx, ext))
        try:
            img = Image.open(io.BytesIO(data))
            img.load()
            if min(img.size) < MIN_W * 0.55:
                continue
            m = analyze(img, flat)
        except Exception as e:
            if verbose:
                print("   ! 解码失败 %s: %s" % (c["img"][-60:], str(e)[:70]))
            continue

        dest.write_bytes(data)
        rec = dict(c)
        rec.update(m)
        rec["via"] = "thumb" if used != c["img"] else "origin"
        rec["file"] = str(dest.relative_to(ROOT)).replace("\\", "/")
        rec["rel"] = urllib.parse.quote(str(dest.relative_to(RAW)).replace("\\", "/"))
        rec["cn"] = cn
        kept.append(rec)
        if verbose:
            print("   + %-10s %4dx%-5d clean=%.2f single=%.2f rich=%.2f -> %.3f"
                  % (dest.name, m["w"], m["h"], m["clean"], m["single"], m["rich"], m["score"]))

    kept.sort(key=lambda r: r["score"], reverse=True)
    return kept


CARD = """<figure class="c" data-f="{file}">
  <img src="{rel}" loading="lazy" alt="{cn}">
  <input type="checkbox" class="pick" value="{file}">
  <figcaption>
    <b>{cn}</b> <span class="sc">{score}</span>
    <div class="meta">{w}×{h} · 干净{clean} 单体{single} 照片{rich} 占比{fill} 块{n_big}</div>
    <div class="lic">{license} · {author}</div>
    <a href="{page}" target="_blank" rel="noopener">来源 ↗</a>
  </figcaption>
</figure>"""

PAGE = """<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>香料参考图 · 挑选</title><style>
body{margin:0;background:#22201d;color:#eee;font:14px/1.5 system-ui,"Microsoft YaHei",sans-serif}
header{position:sticky;top:0;background:#181614;padding:12px 18px;z-index:5;border-bottom:1px solid #3a3632}
h1{margin:0 0 4px;font-size:17px} .sub{color:#8b857c;font-size:12px;margin-bottom:8px}
textarea{width:100%;height:70px;background:#0f0e0d;color:#9f8;border:1px solid #3a3632;
         border-radius:6px;padding:8px;font-family:monospace;font-size:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;padding:16px}
figure{margin:0;background:#2b2825;border-radius:10px;overflow:hidden;position:relative;
       border:2px solid transparent;cursor:pointer}
figure.on{border-color:#7fd67f;background:#2f3a2c}
figure img{width:100%;aspect-ratio:1/1;object-fit:contain;background:#c9c4bb;display:block}
figcaption{padding:8px 10px;font-size:12px;color:#bbb}
figcaption b{color:#fff;font-size:14px} .sc{float:right;color:#9f8;font-family:monospace}
.meta,.lic{color:#8b857c;font-size:11px;margin-top:2px} .lic{color:#c9a86a}
figcaption a{color:#6cf;font-size:11px;text-decoration:none}
.pick{position:absolute;top:8px;left:8px;width:20px;height:20px;accent-color:#7fd67f}
</style></head><body>
<header>
  <h1>香料参考图 · 挑选</h1>
  <div class="sub">按评分从高到低排；点格子勾选（可多选），路径自动汇总到下面。授权已标注，仅供挑选参考。</div>
  <textarea id="out" readonly placeholder="勾选后这里列出文件路径…"></textarea>
</header>
<div class="grid"><!--GRID--></div>
<script>
const out=document.getElementById('out');
document.querySelectorAll('.c').forEach(f=>{
  const box=f.querySelector('.pick');
  box.checked=f.dataset.on==='1';
  f.addEventListener('click',e=>{
    if(e.target.tagName==='A')return;
    if(e.target!==box)box.checked=!box.checked;
    f.classList.toggle('on',box.checked);dump();
  });
});
function dump(){out.value=[...document.querySelectorAll('.pick:checked')].map(b=>b.value).join('\\n');}
</script></body></html>"""


def build_review(records, path):
    rows = "\n".join(CARD.format(**r) for r in records)
    path.write_text(PAGE.replace("<!--GRID-->", rows), encoding="utf-8")


def write_prompts(path):
    lines = ["# Worn-In 香料板 · 40 条作图提示词",
             "# 每行一条，直接喂 SD / Stable Horde / 任意图像 API；换风格只改下面的 STYLE 前缀。",
             "# 主体描述已按「单主体 / 方块构图 / 无文字」调好。", ""]
    for it in ITEMS:
        lines.append("%s, %s" % (STYLE, it["sd"]))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("已写出 %s（%d 条）" % (path.relative_to(ROOT), len(ITEMS)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="只跑指定中文名，逗号分隔")
    ap.add_argument("--max-dl", type=int, default=MAX_DL)
    ap.add_argument("--prompts", action="store_true", help="只导出提示词文件")
    args = ap.parse_args()

    if args.prompts:
        write_prompts(ROOT / "tools" / "spice_prompts.txt")
        return

    want = [s.strip() for s in args.only.split(",") if s.strip()]
    items = [it for it in ITEMS if not want or it["cn"] in want]
    if not items:
        print("没有匹配的香料名，可用：", "、".join(i["cn"] for i in ITEMS))
        return

    RAW.mkdir(parents=True, exist_ok=True)
    all_recs = []
    for it in items:
        print("[%s]" % it["cn"])
        try:
            all_recs += collect(it, args.max_dl)
        except Exception as e:
            print("  !! 整体失败: %s" % e)

    if not all_recs:
        print("一张都没拿到。")
        return

    (RAW / "manifest.json").write_text(
        json.dumps(all_recs, ensure_ascii=False, indent=2), encoding="utf-8")
    build_review(all_recs, RAW / "review.html")
    print("\n共 %d 张 -> 挑选页 %s" % (len(all_recs), (RAW / "review.html").relative_to(ROOT)))


if __name__ == "__main__":
    main()
