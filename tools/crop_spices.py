# -*- coding: utf-8 -*-
"""
crop_spices.py — 把 `下载\\香料图` 里的图裁成方图，放进 assets/spices/，
板子 board-spices.html 会自动读取。

裁剪逻辑：
  1. 取四边框中位色当背景色，算出「主体」掩膜
  2. 有明确主体  → 以主体外接框为中心，取一个正方形，四周留 12% 余量
     没明确主体（整张都是纹理/没有边界）→ 直接居中裁方
  3. 统一缩放到 1024×1024（板子方块 + 后续 SD img2img 都够用）

用法：
  python tools/crop_spices.py            # 只看报告，不写文件
  python tools/crop_spices.py --write    # 真正写出 assets/spices/*.png
"""
import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(r"C:\Users\janic\Downloads\香料图")
OUT = ROOT / "assets" / "spices"                 # 板子读这里
PHOTO = ROOT / "assets" / "spices" / "_photo"    # 照片母版（SD 的输入）
SIZE = 768           # 输出边长（= SD 1.5 img2img 原生尺寸，省一次缩放）
MARGIN = 0.12        # 主体四周留白比例
MIN_FILL = 0.03      # 主体占比低于此 → 视为「没有主体」
MAX_FILL = 0.97      # 高于此 → 整张都是主体，居中裁

# 源文件名（不含扩展名） -> 板子上的中文名
MAP = {
    "柑橘": "柑橘", "小豆蔻": "小豆蔻", "皮革": "皮革", "藏红花": "藏红花",
    "焚香": "焚香", "乳香": "乳香", "沉香": "沉香",           # 沉香 → 第 7 格
    "烟草木": "烟草木", "白茶": "白茶", "佛手柑": "佛手柑",
    "橡木苔": "橡木苔", "雪松": "雪松", "天竺葵": "天竺葵", "白麝香": "白麝香",
    "鼠尾草": "鼠尾草",                                        # 鼠尾草 → 第 15 格
    "樱花": "樱花", "蜜桃": "蜜桃", "橙花": "橙花", "栀子花": "栀子花",
    "棉花糖": "棉花糖", "香草": "香草", "广藿香": "广藿香", "甜橙": "甜橙",
    "薄荷": "薄荷", "海水": "海水", "依兰": "依兰", "威士忌": "威士忌",
    "松针": "松针", "肉豆蔻": "肉豆蔻",
    "竹子": "竹叶", "铃兰": "铃兰", "橡木": "橡木", "苔藓": "苔藓",
    "小苍兰": "小苍兰", "乌龙": "乌龙",
    "玫瑰": "玫瑰净油", "木兰花": "木兰", "檀木": "檀木",
    "鸢尾花": "鸢尾根", "无花果叶": "无花果叶",
}

# 这些文件名带序号后缀，是重复图，跳过
SKIP = {"橡木苔 1"}


def subject_box(img):
    """返回 (left, top, right, bottom, fill)；没主体时返回 None。"""
    small = np.asarray(img.convert("RGB").resize((160, 160), Image.LANCZOS), dtype=np.float32)
    border = np.concatenate([small[:5].reshape(-1, 3), small[-5:].reshape(-1, 3),
                             small[:, :5].reshape(-1, 3), small[:, -5:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    mask = np.linalg.norm(small - bg, axis=2) > 34
    fill = float(mask.mean())
    if fill < MIN_FILL or fill > MAX_FILL:
        return None, fill

    ys, xs = np.where(mask)
    # 用 2%~98% 分位，避免一两个杂点把框撑大
    x0, x1 = np.percentile(xs, 2), np.percentile(xs, 98)
    y0, y1 = np.percentile(ys, 2), np.percentile(ys, 98)
    k = img.width / 160.0
    return (x0 * k, y0 * k, (x1 + 1) * k, (y1 + 1) * k), fill


def square_crop(img):
    """裁出正方形，返回 (结果图, 说明)。"""
    W, H = img.size
    box, fill = subject_box(img)

    if box is None:                                   # 没主体 → 居中裁方
        side = min(W, H)
        cx, cy = W / 2, H / 2
        how = "居中裁方"
    else:
        l, t, r, b = box
        cx, cy = (l + r) / 2, (t + b) / 2
        side = max(r - l, b - t) * (1 + MARGIN * 2)
        how = "按主体裁"

    side = max(64.0, min(side, W, H))                 # 不能超过原图
    # 以 (cx, cy) 为中心取 side×side，越界就整体推回来
    l = min(max(cx - side / 2, 0), W - side)
    t = min(max(cy - side / 2, 0), H - side)
    l, t = int(round(l)), int(round(t))
    s = int(round(side))

    out = img.crop((l, t, l + s, t + s))
    if out.size != (SIZE, SIZE):
        out = out.resize((SIZE, SIZE), Image.LANCZOS)
    return out, "%s %dpx→%dpx 主体占比%.2f" % (how, s, SIZE, fill)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="写出文件（默认只出报告）")
    a = ap.parse_args()

    if not SRC.is_dir():
        print("找不到源目录：%s" % SRC)
        return

    files = {}
    for p in SRC.iterdir():
        if p.is_file() and p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp", ".bmp"):
            files[p.stem] = p

    if a.write:
        OUT.mkdir(parents=True, exist_ok=True)
        PHOTO.mkdir(parents=True, exist_ok=True)

    done, missing, unused = [], [], []
    for stem in sorted(files):
        if stem in SKIP:
            unused.append((stem, "重复图，跳过"))
            continue
        cn = MAP.get(stem)
        if not cn:
            unused.append((stem, "没有对应的板子格子"))
            continue
        try:
            img = Image.open(files[stem])
            img.load()
            img = img.convert("RGB")
            if img.width < 64 or img.height < 64:
                unused.append((stem, "图太小 %dx%d" % img.size))
                continue
            out, how = square_crop(img)
            if a.write:
                out.save(PHOTO / (cn + ".png"), "PNG", optimize=True)   # 母版留一份
                out.save(OUT / (cn + ".png"), "PNG", optimize=True)     # 板子用
            done.append((cn, stem, img.size, how))
        except Exception as e:
            unused.append((stem, "处理失败: %s" % str(e)[:60]))

    # 板子上应该有、但没找到图的
    for cn in MAP.values():
        if cn not in [d[0] for d in done]:
            missing.append(cn)

    print("%-8s %-10s %-14s %s" % ("板子格", "源文件", "原始尺寸", "裁剪方式"))
    for cn, stem, size, how in done:
        print("%-8s %-10s %-14s %s" % (cn, stem, "%dx%d" % size, how))

    print("\n处理 %d 张" % len(done))
    if missing:
        print("缺图 %d 个：%s" % (len(missing), "、".join(missing)))
    if unused:
        print("未使用：")
        for stem, why in unused:
            print("  %s — %s" % (stem, why))
    if a.write:
        print("\n照片母版 -> %s\n板子图片 -> %s" % (PHOTO, OUT))
    else:
        print("\n（这是预演，加 --write 才会真正写文件）")


if __name__ == "__main__":
    main()
