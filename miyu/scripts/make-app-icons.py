"""홈 화면 · 브라우저 탭 아이콘을 기존 브랜드 자산(미유 캐릭터 대표 연두, public/miyu/char-main.png)에서 만든다.

- 그림을 다시 그리거나 색을 고치지 않는다. 운영자가 보낸 100px 그림의 내용 부분만 잘라 흰 바탕 정사각형 가운데에 놓고 크기만 맞춘다.
- 원본이 100px이라 512px 아이콘은 확대본이라 조금 흐리다. 원본 고해상도 그림이 오면 public/miyu/char-main.png를 같은 이름으로 덮어쓰고
  `python scripts/make-app-icons.py`를 다시 돌리면 같은 위치에 새로 만들어진다.
- 쓰는 곳: app/apple-icon.png(180, iOS 홈 화면) · app/favicon.ico(16·32·48, 브라우저 탭) · public/miyu/icons/*(manifest, app/manifest.ts).
- 필요: Python 3 + Pillow. 결과 파일은 저장소에 들어 있어서 평소에는 다시 만들 필요가 없다.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "public" / "miyu" / "char-main.png"
WHITE = (255, 255, 255)

src = Image.open(SOURCE).convert("RGB")
# 내용 부분(흰 바탕이 아닌 곳)만 잘라 낸다 — 원본 기준 (12, 9) ~ (85, 90)
box = Image.eval(src, lambda v: 255 if v < 243 else 0).convert("L").point(lambda v: 255 if v else 0).getbbox()
if box is None:
    raise SystemExit("캐릭터 그림에서 내용 부분을 찾지 못했다")
content = src.crop(box)


def icon(size: int, content_height_ratio: float) -> Image.Image:
    """흰 정사각형 가운데에 캐릭터를 놓는다. content_height_ratio는 캐릭터 높이가 한 변에서 차지하는 비율."""
    canvas = Image.new("RGB", (size, size), WHITE)
    target_h = round(size * content_height_ratio)
    scale = target_h / content.height
    target_w = round(content.width * scale)
    resized = content.resize((target_w, target_h), Image.LANCZOS)
    canvas.paste(resized, ((size - target_w) // 2, (size - target_h) // 2 + round(size * 0.01)))
    return canvas


out_dir = ROOT / "public" / "miyu" / "icons"
out_dir.mkdir(parents=True, exist_ok=True)

# iOS 홈 화면(180): OS가 모서리를 둥글게 깎으므로 가장자리에 여유를 둔다
icon(180, 0.60).save(ROOT / "app" / "apple-icon.png", optimize=True)
# manifest: 일반(any) 두 장 + 마스크용(maskable) 한 장 — 마스크용은 가운데 80% 원 안에 들어오게 더 작게
icon(192, 0.62).save(out_dir / "icon-192.png", optimize=True)
icon(512, 0.62).save(out_dir / "icon-512.png", optimize=True)
icon(512, 0.50).save(out_dir / "icon-maskable-512.png", optimize=True)

# 브라우저 탭 아이콘 (기존 favicon.ico는 Next.js 기본 "N" 로고였다)
# Next.js(Turbopack)가 ICO 안의 PNG를 RGBA로만 읽는다 — RGB로 저장하면 빌드가 "The PNG is not in RGBA format"으로 멈춘다
fav = icon(256, 0.80).convert("RGBA")
fav.save(ROOT / "app" / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])

for p in [ROOT / "app" / "apple-icon.png", *sorted(out_dir.glob("*.png")), ROOT / "app" / "favicon.ico"]:
    with Image.open(p) as im:
        print(p.relative_to(ROOT), im.size, p.stat().st_size, "bytes")
