# -*- coding: utf-8 -*-
"""
watercolor.py — 把 assets/spices/_photo/ 里的照片批量水彩化，输出到 assets/spices/。

用的是 AUTOMATIC1111 WebUI 的 img2img API（本地、免费、不限量）。
WebUI 启动时要带 --api：
    webui-user.bat 里加  set COMMANDLINE_ARGS=--api   （顺手加 --xformers 更快）

流程：  assets/spices/_photo/柑橘.png  →  [img2img]  →  assets/spices/柑橘.png
照片母版不会被覆盖，随时可以重跑不同参数对比。

先试一张：
    python tools/watercolor.py --only 柑橘
满意了再全跑：
    python tools/watercolor.py
换风格（更靠近原图/更水彩）：
    python tools/watercolor.py --denoise 0.35
    python tools/watercolor.py --denoise 0.55 --seed 777

提示词在 tools/watercolor_prompt.txt 里，改那个文件即可。
"""
import argparse
import base64
import io
import json
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
PHOTO = ROOT / "assets" / "spices" / "_photo"
OUT = ROOT / "assets" / "spices"
PROMPT_FILE = ROOT / "tools" / "watercolor_prompt.txt"

FALLBACK_POS = ("watercolor and ink botanical illustration, hand-painted, soft washes, "
                "paper texture, thin ink outline, muted earthy palette, cream paper background, "
                "single object centred, no text")
FALLBACK_NEG = ("photograph, photorealistic, 3d render, glossy, digital painting, vector, "
                "text, watermark, frame, blurry, lowres, multiple objects")


def read_prompt():
    """从 watercolor_prompt.txt 读 positive/negative，读不到就用内置默认。"""
    pos, neg = FALLBACK_POS, FALLBACK_NEG
    if PROMPT_FILE.exists():
        for line in PROMPT_FILE.read_text(encoding="utf-8").splitlines():
            s = line.strip()
            if s.lower().startswith("positive:"):
                pos = s.split(":", 1)[1].strip() or pos
            elif s.lower().startswith("negative:"):
                neg = s.split(":", 1)[1].strip() or neg
    return pos, neg


def b64(img):
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def img2img(png_bytes, a, pos, neg):
    payload = {
        "init_images": [base64.b64encode(png_bytes).decode("ascii")],
        "prompt": pos,
        "negative_prompt": neg,
        "denoising_strength": a.denoise,
        "steps": a.steps,
        "cfg_scale": a.cfg,
        "sampler_name": "DPM++ 2M Karras",
        "seed": a.seed,
        "width": a.size,
        "height": a.size,
        "resize_mode": 0,                     # 0 = 只调整尺寸
        "restore_faces": False,
        "include_init_images": False,
    }
    if a.cn_weight > 0:                       # 可选：ControlNet 锁住轮廓
        payload["alwayson_scripts"] = {
            "ControlNet": {"args": [{
                "enabled": True,
                "image": payload["init_images"][0],
                "module": a.cn_module,
                "model": a.cn_model,
                "weight": a.cn_weight,
                "resize_mode": "Crop and Resize",
                "control_mode": "Balanced",
            }]}
        }
    req = urllib.request.Request(
        a.api.rstrip("/") + "/sdapi/v1/img2img",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=a.timeout) as r:
        return base64.b64decode(json.loads(r.read())["images"][0])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://127.0.0.1:7860")
    ap.add_argument("--only", default="", help="只跑指定中文名，逗号分隔")
    ap.add_argument("--out", default="", help="输出目录；默认写回 assets/spices（覆盖板子图片）")
    ap.add_argument("--denoise", type=float, default=0.45, help="重绘幅度，最关键的参数")
    ap.add_argument("--steps", type=int, default=30)
    ap.add_argument("--cfg", type=float, default=7.0)
    ap.add_argument("--seed", type=int, default=1234, help="固定种子 → 40 张风格一致")
    ap.add_argument("--size", type=int, default=768)
    ap.add_argument("--timeout", type=int, default=600)
    ap.add_argument("--cn-weight", type=float, default=0.0,
                    help="ControlNet 权重；>0 才启用，用来锁住物体轮廓（0.4~0.6 比较合适）")
    ap.add_argument("--cn-module", default="canny")
    ap.add_argument("--cn-model", default="control_v11p_sd15_canny [d14c016b]")
    ap.add_argument("--dry-run", action="store_true", help="只打印参数和文件清单")
    a = ap.parse_args()

    pos, neg = read_prompt()
    files = sorted(PHOTO.glob("*.png"))
    if a.only:
        want = {s.strip() for s in a.only.split(",") if s.strip()}
        files = [f for f in files if f.stem in want]
    if not files:
        print("没有找到输入图。先跑：python tools/crop_spices.py --write")
        print("（照片应该放在 %s）" % PHOTO)
        return

    print("后端      %s" % a.api)
    print("输入      %s（%d 张）" % (PHOTO, len(files)))
    out_dir = Path(a.out) if a.out else OUT
    print("输出      %s" % out_dir)
    print("重绘幅度  %.2f   步数 %d   CFG %.1f   种子 %d   %d×%d"
          % (a.denoise, a.steps, a.cfg, a.seed, a.size, a.size))
    print("提示词    %s" % (PROMPT_FILE if PROMPT_FILE.exists() else "（内置默认）"))
    if a.cn_weight > 0:
        print("ControlNet %s / %s 权重 %.2f" % (a.cn_module, a.cn_model, a.cn_weight))
    if a.dry_run:
        print("\n将要处理：%s" % "、".join(f.stem for f in files))
        return

    out_dir.mkdir(parents=True, exist_ok=True)
    ok = fail = 0
    for i, f in enumerate(files, 1):
        print("[%2d/%d] %-8s 处理中…" % (i, len(files), f.stem), flush=True)
        try:
            raw = img2img(f.read_bytes(), a, pos, neg)
            img = Image.open(io.BytesIO(raw)).convert("RGB")
            if img.size != (a.size, a.size):
                img = img.resize((a.size, a.size), Image.LANCZOS)
            img.save(out_dir / (f.stem + ".png"), "PNG", optimize=True)
            print("        -> %s.png" % f.stem, flush=True)
            ok += 1
        except Exception as e:
            print("        !! 失败: %s" % str(e)[:180], flush=True)
            fail += 1
        time.sleep(0.3)

    print("\n完成 %d / 失败 %d" % (ok, fail))
    if ok:
        print("刷新 board-spices.html 就能看到水彩版。照片母版仍在 %s。" % PHOTO)


if __name__ == "__main__":
    main()
