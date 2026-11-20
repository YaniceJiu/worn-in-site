# -*- coding: utf-8 -*-
"""逆向恢复被 PowerShell 用 Windows-1252 误读的 UTF-8 文件。

乱码过程：UTF-8 字节 → 每个字节按 cp1252 解码成字符 → 再 UTF-8 编码写盘。
逆向：UTF-8 读盘 → 每个字符映射回原始字节 → UTF-8 解码。
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ED = ROOT / "editors"

# cp1252 的 0x80-0x9F 特殊字符 → 字节
CP1252_SPECIAL = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
    0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
    0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
    0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
    0x017E: 0x9E, 0x0178: 0x9F,
}


def char_to_byte(ch: str) -> int:
    o = ord(ch)
    if o <= 0xFF:
        return o
    if o in CP1252_SPECIAL:
        return CP1252_SPECIAL[o]
    raise ValueError("unmappable U+%04X" % o)


def reverse(path: Path) -> bool:
    raw = path.read_bytes()
    s = raw.decode("utf-8-sig")  # 去掉 BOM
    try:
        original_bytes = bytes(char_to_byte(ch) for ch in s)
        original = original_bytes.decode("utf-8")
    except Exception as e:
        print(f"FAIL {path.name}: {e}")
        return False
    if original != s:
        path.write_text(original, encoding="utf-8")
        return True
    return False


def main():
    fixed = 0
    for p in sorted(ED.rglob("*")):
        if p.is_file() and p.suffix.lower() in (".html", ".js", ".css"):
            if reverse(p):
                fixed += 1
                print(f"recovered {p.name}")
    print(f"done, {fixed} files recovered")


if __name__ == "__main__":
    main()
