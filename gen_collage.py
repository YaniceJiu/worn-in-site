# -*- coding: utf-8 -*-
"""生成拼贴素材：不规则底布 + 3 个香料填充图（不修改源文件夹，只读取）"""
import os, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from collections import deque

FABRIC_DIR = r'C:\Users\janic\Downloads\精油布料正方形图片\精油布料正方形图片'
OUTLINE_DIR = r'C:\Users\janic\Downloads\香料手绘轮廓_纯白透明PNG\香料手绘轮廓_纯白透明PNG\单张PNG'
OUT_DIR = r'C:\Users\janic\Downloads\编程project\Worn-In小网站\assets\collage'

random.seed(7)


def outline_to_solid_mask(outline_path, dilate=9):
    im = Image.open(outline_path).convert('RGBA')
    alpha = im.getchannel('A')
    alpha = alpha.filter(ImageFilter.MaxFilter(dilate))
    arr = np.array(alpha) > 32
    h, w = arr.shape
    visited = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        if not arr[0, x] and not visited[0, x]: visited[0, x] = True; q.append((0, x))
        if not arr[h-1, x] and not visited[h-1, x]: visited[h-1, x] = True; q.append((h-1, x))
    for y in range(h):
        if not arr[y, 0] and not visited[y, 0]: visited[y, 0] = True; q.append((y, 0))
        if not arr[y, w-1] and not visited[y, w-1]: visited[y, w-1] = True; q.append((y, w-1))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not arr[ny, nx] and not visited[ny, nx]:
                visited[ny, nx] = True
                q.append((ny, nx))
    solid = arr | ~visited
    return Image.fromarray((solid * 255).astype(np.uint8), 'L')


def fill_outline(outline_path, fabric_path, out_path, line_darken=0.55):
    """香料轮廓填充布料，并保留内部手绘分隔线（用布料颜色加深画出）。"""
    im = Image.open(outline_path).convert('RGBA')
    raw_line = np.array(im.getchannel('A')) > 64          # 原始线条（外轮廓 + 内部分隔）
    solid = outline_to_solid_mask(outline_path)           # 实心 mask
    solid_arr = np.array(solid) > 128
    fabric = Image.open(fabric_path).convert('RGB').resize(solid.size, Image.LANCZOS)
    filled = Image.new('RGB', solid.size, (255, 255, 255))
    filled.paste(fabric, (0, 0), solid)
    # 线条加深：原始线条在实心内的像素，亮度压暗
    arr = np.array(filled, dtype=np.float32)
    dark = raw_line & solid_arr
    arr[dark] *= line_darken
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    out = Image.new('RGBA', solid.size, (0, 0, 0, 0))
    out.paste(Image.fromarray(arr, 'RGB'), (0, 0), solid)
    out.save(out_path)
    print('  ->', os.path.basename(out_path))


def irregular_base(fabric_path, out_path, size=1000, jitter=0.04):
    """把方形布料剪成不规则多边形（顶点随机抖动，边缘微糊，像手撕，但仍是完整一整块）。"""
    fabric = Image.open(fabric_path).convert('RGB').resize((size, size), Image.LANCZOS)
    m = size / 2
    # 8 个顶点按顺时针：左上 → 上中 → 右上 → 右中 → 右下 → 下中 → 左下 → 左中
    base_pts = [(-1, -1), (0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0)]
    pts = []
    for bx, by in base_pts:
        pts.append((m + bx * m * 0.98 + random.uniform(-jitter, jitter) * size,
                    m + by * m * 0.98 + random.uniform(-jitter, jitter) * size))
    mask = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.polygon(pts, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1.5))
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(fabric, (0, 0), mask)
    out.save(out_path)
    print('  ->', os.path.basename(out_path))


os.makedirs(OUT_DIR, exist_ok=True)

print('生成底布（乌龙布料，不规则裁剪）:')
irregular_base(os.path.join(FABRIC_DIR, '乌龙 + 暖茶褐色纯亚麻.jpg'),
               os.path.join(OUT_DIR, 'base_oolong.png'))

print('生成香料填充图:')
fill_outline(os.path.join(OUTLINE_DIR, '15_香根草（岩兰草）.png'),
             os.path.join(FABRIC_DIR, '橡木 + 蜂蜜木棕宽条灯芯绒.jpg'),
             os.path.join(OUT_DIR, 'spice_vetiver.png'))
fill_outline(os.path.join(OUTLINE_DIR, '28_肉豆蔻.png'),
             os.path.join(FABRIC_DIR, '肉豆蔻 + 肉豆蔻棕磨毛棉斜纹.jpg'),
             os.path.join(OUT_DIR, 'spice_nutmeg.png'))
fill_outline(os.path.join(OUTLINE_DIR, '33_小苍兰.png'),
             os.path.join(FABRIC_DIR, '玫瑰净油 + 深玫瑰红弹力天鹅绒.jpg'),
             os.path.join(OUT_DIR, 'spice_freesia.png'))

print('完成 ->', OUT_DIR)
