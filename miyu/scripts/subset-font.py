#!/usr/bin/env python3
"""
본문 글꼴(Pretendard, OFL-1.1) 줄이기 — npm 패키지의 가변 글꼴에서 필요한 글자만 남겨 woff2 두 개로 만든다.
- Pretendard-core.woff2: 화면 문구에 실제로 쓰인 글자 + 기본 라틴 + 기호 (첫 화면에서 받는 파일)
- Pretendard-rest.woff2: 사용자 입력 · AI 문장에 나올 수 있는 한글 2,350자(KS X 1001) 중 core에 없는 글자 (필요한 화면에서만 받는다)
- pretendard-subset.css: 위 두 파일의 @font-face (unicode-range로 나눠 받는다). 글꼴 이름은 라이선스(OFL 예약 이름)에 맞춰 "Miyu Sans"로 바꾼다
실행(개발자 PC, 한 번): python3 -m venv /tmp/fontenv && /tmp/fontenv/bin/pip install fonttools brotli && /tmp/fontenv/bin/python scripts/subset-font.py
화면 문구에 새 글자가 많이 늘면 다시 실행한다 (core에 없는 글자는 rest에서 받으므로 빠뜨려도 깨지지는 않는다).
"""
import os

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "node_modules/pretendard/dist/public/variable/PretendardVariable.ttf")
OUT = os.path.join(ROOT, "app/fonts")
os.makedirs(OUT, exist_ok=True)

used = set()
for root in ["app", "components", "lib", "server"]:
    for dp, _, files in os.walk(os.path.join(ROOT, root)):
        for f in files:
            if f.endswith((".ts", ".tsx")):
                used.update(c for c in open(os.path.join(dp, f), encoding="utf-8").read() if ord(c) >= 0x20 and c != "\u007f")

basic = {chr(c) for c in range(0x20, 0x7F)} | set("·…—–‘’“”×→←↑↓※○●■□▲△▼▽◆◇★☆")
ksx = set()
for hi in range(0xB0, 0xC9):
    for lo in range(0xA1, 0xFF):
        try:
            ksx.add(bytes([hi, lo]).decode("euc-kr"))
        except Exception:
            pass
jamo = {chr(c) for c in range(0x3131, 0x3164)}

core = used | basic
rest = (ksx | jamo) - core


def ranges(chars):
    cps = sorted(ord(c) for c in chars)
    out, start, prev = [], None, None
    for cp in cps:
        if start is None:
            start = prev = cp
        elif cp == prev + 1:
            prev = cp
        else:
            out.append((start, prev))
            start = prev = cp
    if start is not None:
        out.append((start, prev))
    return ", ".join(f"U+{a:X}" if a == b else f"U+{a:X}-{b:X}" for a, b in out)


def build(chars, name):
    font = instancer.instantiateVariableFont(TTFont(SRC), {"wght": (400, 700)})
    opts = subset.Options()
    opts.layout_features = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk", "tnum", "pnum", "rlig"]
    opts.flavor = "woff2"
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    opts.notdef_outline = True
    opts.hinting = False
    s = subset.Subsetter(opts)
    s.populate(unicodes=[ord(c) for c in chars])
    s.subset(font)
    # OFL의 예약 글꼴 이름 규칙: 수정한 글꼴은 원래 이름(Pretendard)을 쓰지 않는다 → 이 사이트 전용 이름으로 바꾼다 (저작권 · 라이선스 문구는 그대로 둔다)
    for rec in font["name"].names:
        if rec.nameID in (1, 16):
            rec.string = "Miyu Sans"
        elif rec.nameID in (4, 18):
            rec.string = "Miyu Sans Variable"
        elif rec.nameID == 6:
            rec.string = "MiyuSans-Variable"
        elif rec.nameID == 3:
            rec.string = "MiyuSans-Variable;subset"
    font.flavor = "woff2"
    path = os.path.join(OUT, name)
    font.save(path)
    print(name, len(chars), "글자", os.path.getsize(path) // 1024, "KB")


build(core, "Pretendard-core.woff2")
build(rest, "Pretendard-rest.woff2")
css = f"""/* scripts/subset-font.py가 만든 파일 — 직접 고치지 않는다 (글꼴 라이선스: app/fonts/LICENSE-Pretendard.txt) */
@font-face {{
  font-family: "Miyu Sans";
  src: url("./Pretendard-core.woff2") format("woff2");
  font-weight: 400 700;
  font-style: normal;
  font-display: swap;
  unicode-range: {ranges(core)};
}}
@font-face {{
  font-family: "Miyu Sans";
  src: url("./Pretendard-rest.woff2") format("woff2");
  font-weight: 400 700;
  font-style: normal;
  font-display: swap;
  unicode-range: {ranges(rest)};
}}
"""
open(os.path.join(OUT, "pretendard-subset.css"), "w", encoding="utf-8").write(css)
print("css", len(css), "bytes")
