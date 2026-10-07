# -*- coding: utf-8 -*-
"""
gen_spices.py — 把 40 条提示词批量变成 40 张方图，直接落到 assets/spices/。

board-spices.html 会自动读取 assets/spices/<中文名>.png，跑完刷新板子即可。

后端（--api）：
  a1111   本地 Stable Diffusion WebUI（免费、不限量、最快；本机需以 --api 启动）
  horde   Stable Horde 众包算力（免费、不用显卡；匿名 key 排队很慢，注册免费账号会快很多）
  openai  OpenAI 图像 API（要花钱但最省事；需环境变量 OPENAI_API_KEY）

用法：
  python tools/gen_spices.py --api a1111                      # 全部 40 张
  python tools/gen_spices.py --api horde --only 柑橘,小豆蔻     # 先试两张
  python tools/gen_spices.py --api openai --force             # 覆盖重跑
"""
import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image
import io

from spice_refs import ITEMS, STYLE

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "spices"
NEG = ("ugly, blurry, jpeg artifacts, text, letters, watermark, signature, logo, frame, "
       "border, multiple objects, cluttered background, photorealistic 3d render")

HORDE = "https://stablehorde.net/api/v2"


# ─────────────────────────── 后端 ───────────────────────────
def gen_a1111(prompt, a):
    """本地 AUTOMATIC1111 WebUI。启动方式：webui.bat --api"""
    body = json.dumps({
        "prompt": prompt, "negative_prompt": NEG,
        "width": a.size, "height": a.size, "steps": a.steps,
        "cfg_scale": 6.5, "seed": a.seed, "sampler_name": "DPM++ 2M Karras",
    }).encode("utf-8")
    req = urllib.request.Request(
        a.a1111.rstrip("/") + "/sdapi/v1/txt2img", data=body,
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=900) as r:
        return base64.b64decode(json.loads(r.read())["images"][0])


def gen_openai(prompt, a):
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("没找到环境变量 OPENAI_API_KEY")
    body = json.dumps({
        "model": a.model, "prompt": prompt + ". Avoid: " + NEG,
        "size": "%dx%d" % (a.size, a.size), "n": 1,
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.openai.com/v1/images/generations", data=body,
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + key})
    with urllib.request.urlopen(req, timeout=600) as r:
        d = json.loads(r.read())["data"][0]
    return base64.b64decode(d["b64_json"]) if d.get("b64_json") else _get(d["url"])


def gen_horde(prompt, a):
    """Stable Horde：先提交拿 id，再轮询，最后下载结果。"""
    body = json.dumps({
        "prompt": prompt + " ### " + NEG,
        "params": {"width": a.size, "height": a.size, "steps": a.steps,
                   "n": 1, "seed": str(a.seed), "sampler_name": "k_euler_a",
                   "cfg_scale": 7.0},
        "nsfw": False, "r2": True, "models": [],
    }).encode("utf-8")
    hdr = {"Content-Type": "application/json", "apikey": a.horde_key,
           "Client-Agent": "wornin-spice-board:1.0:local"}
    req = urllib.request.Request(HORDE + "/generate/async", data=body, headers=hdr)
    with urllib.request.urlopen(req, timeout=120) as r:
        job = json.loads(r.read())["id"]

    t0, last = time.time(), ""
    while time.time() - t0 < a.timeout:
        time.sleep(10)
        try:
            with urllib.request.urlopen(
                    urllib.request.Request(HORDE + "/generate/check/" + job,
                                           headers={"apikey": a.horde_key}), timeout=60) as r:
                st = json.loads(r.read())
        except Exception:
            continue
        if st.get("done"):
            break
        msg = "排队 %s / 生成中 %s" % (st.get("waiting"), st.get("processing"))
        if msg != last:
            print("      %s" % msg, flush=True)
            last = msg
    else:
        raise RuntimeError("等待超时（%ds），可加大 --timeout" % a.timeout)

    with urllib.request.urlopen(
            urllib.request.Request(HORDE + "/generate/status/" + job,
                                   headers={"apikey": a.horde_key}), timeout=120) as r:
        gens = json.loads(r.read()).get("generations") or []
    if not gens:
        raise RuntimeError("Horde 没有返回图片")
    return _get(gens[0]["img"])


def _get(url, timeout=180):
    req = urllib.request.Request(url, headers={"User-Agent": "wornin-spice-board/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


BACKENDS = {"a1111": gen_a1111, "horde": gen_horde, "openai": gen_openai}


# ─────────────────────────── 主流程 ───────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", choices=sorted(BACKENDS), default="a1111")
    ap.add_argument("--only", default="", help="只跑指定中文名，逗号分隔")
    ap.add_argument("--size", type=int, default=768)
    ap.add_argument("--steps", type=int, default=25)
    ap.add_argument("--seed", type=int, default=1234, help="固定种子 → 40 张风格一致")
    ap.add_argument("--model", default="gpt-image-1", help="openai 后端用的模型")
    ap.add_argument("--a1111", default="http://127.0.0.1:7860")
    ap.add_argument("--horde-key", default="0000000000",
                    help="匿名 key；在 stablehorde.net 免费注册可换真 key，排队快很多")
    ap.add_argument("--timeout", type=int, default=3600, help="单张最长等待秒数")
    ap.add_argument("--force", action="store_true", help="覆盖已存在的图片")
    a = ap.parse_args()

    want = [s.strip() for s in a.only.split(",") if s.strip()]
    items = [it for it in ITEMS if not want or it["cn"] in want]
    if not items:
        print("没有匹配的香料名，可用：", "、".join(i["cn"] for i in ITEMS))
        return

    OUT.mkdir(parents=True, exist_ok=True)
    gen = BACKENDS[a.api]
    ok = skip = fail = 0

    for i, it in enumerate(items, 1):
        dest = OUT / (it["cn"] + ".png")
        if dest.exists() and not a.force:
            print("[%2d/%d] %-6s 已存在，跳过" % (i, len(items), it["cn"]))
            skip += 1
            continue

        prompt = "%s, %s" % (STYLE, it["sd"])
        print("[%2d/%d] %-6s 生成中…" % (i, len(items), it["cn"]), flush=True)
        try:
            data = gen(prompt, a)
            img = Image.open(io.BytesIO(data)).convert("RGB")
            if img.width != img.height:                      # 统一成方图
                s = min(img.size)
                img = img.crop(((img.width - s) // 2, (img.height - s) // 2,
                                (img.width + s) // 2, (img.height + s) // 2))
            img.save(dest, "PNG")
            print("        -> %s  %dx%d  %.0fKB" % (dest.name, img.width, img.height,
                                                    dest.stat().st_size / 1024), flush=True)
            ok += 1
        except Exception as e:
            print("        !! 失败: %s" % str(e)[:200], flush=True)
            fail += 1
        time.sleep(1.0)

    print("\n完成 %d / 跳过 %d / 失败 %d  →  %s" % (ok, skip, fail, OUT))
    if ok:
        print("打开 board-spices.html 刷新即可看到成品。")


if __name__ == "__main__":
    main()
