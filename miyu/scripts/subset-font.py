#!/usr/bin/env python3
"""
본문 글꼴(Pretendard, OFL-1.1) 줄이기 — npm 패키지의 가변 글꼴에서 필요한 글자만 남겨 woff2 두 개로 만든다.
- Pretendard-core.woff2: 화면 문구에 실제로 쓰인 글자 + 기본 라틴 + 기호 (첫 화면에서 받는 파일)
- Pretendard-rest.woff2: 사용자 입력 · AI 문장에 나올 수 있는 한글 2,350자(KS X 1001) 중 core에 없는 글자 (필요한 화면에서만 받는다)
- miyu-fonts.ts: 두 파일을 next/font/local로 불러오는 설정(글자 범위 unicode-range 포함). app/layout.tsx · global-error.tsx가 쓴다
  (next/font가 첫 화면 글꼴을 미리 받아 두고, core는 font-display: optional이라 늦게 도착해도 화면이 흔들리지 않는다)
글꼴 이름은 라이선스(OFL 예약 이름)에 맞춰 파일 안에서 "Miyu Sans"로 바꾼다
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
TEMPLATE = '// scripts/subset-font.py가 만든 파일 — 직접 고치지 않는다 (글꼴 라이선스: app/fonts/LICENSE-Pretendard.txt)\n// 본문 글꼴: Pretendard를 이 사이트에 쓰는 글자만 남긴 파일 두 개.\n// core: 화면 문구에 쓰인 글자. 첫 화면과 함께 미리 받고(preload), 늦게 도착하면 그 화면에서는 시스템 글꼴을 그대로 써서\n//       글자가 바뀌며 화면이 흔들리는 일(레이아웃 이동)이 없다 (font-display: optional). 한 번 받으면 다음 화면부터 계속 쓴다.\n// rest: 사용자 입력 · AI 문장에만 나오는 나머지 한글. 필요한 화면에서만 받는다.\n// next/font는 설정값을 파일 안에 직접 적은 글자(리터럴)로만 받으므로 글자 범위(unicode-range)가 아래에 그대로 들어 있다.\nimport localFont from "next/font/local";\n\nexport const miyuCore = localFont({\n  src: [{ path: "./Pretendard-core.woff2", weight: "400 700", style: "normal" }],\n  display: "optional",\n  variable: "--font-miyu-core",\n  adjustFontFallback: false,\n  declarations: [{ prop: "unicode-range", value: "@@CORE@@" }],\n});\n\nexport const miyuRest = localFont({\n  src: [{ path: "./Pretendard-rest.woff2", weight: "400 700", style: "normal" }],\n  display: "swap",\n  preload: false,\n  variable: "--font-miyu-rest",\n  adjustFontFallback: false,\n  declarations: [{ prop: "unicode-range", value: "@@REST@@" }],\n});\n\n/** <html>에 붙이는 클래스 — 글꼴 변수(--font-miyu-core · --font-miyu-rest)를 정의한다 */\nexport const miyuFontVariables = `${miyuCore.variable} ${miyuRest.variable}`;\n'
ts = TEMPLATE.replace("@@CORE@@", ranges(core)).replace("@@REST@@", ranges(rest))
open(os.path.join(OUT, "miyu-fonts.ts"), "w", encoding="utf-8").write(ts)
print("miyu-fonts.ts", len(ts), "bytes")
