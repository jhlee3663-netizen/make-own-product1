"""실기기·시뮬레이터에서 찍은 스크린샷을 스토어 규격으로 맞추고 문구를 얹는다.

쓰는 법:
    python3 scripts/make_store_screenshots.py store/raw

store/raw 안의 파일 이름 앞에 번호를 붙여 순서를 정한다. 번호에 맞는 문구가 붙는다.
    1-home.png  2-diet.png  3-workout.png  4-analysis.png  5-feed.png

결과: store/screenshots/ios/*.png (1320×2868), store/screenshots/play/*.png (1080×1920)

문구를 바꾸려면 아래 CAPTIONS만 고친다.
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

CAPTIONS = {
    1: '오늘 먹은 것과 운동을\n한 화면에',
    2: '말로 적으면\n칼로리가 채워집니다',
    3: '지난주보다 얼마나 늘었는지까지',
    4: '중량과 체중의 흐름을 한눈에',
    5: '친구 루틴을 내 무게로 가져오기',
}

SIZES = {'ios': (1320, 2868), 'play': (1080, 1920)}
G_FROM = (58, 160, 255)   # #3aa0ff
G_TO = (247, 159, 255)    # #f79fff
FONT_DIR = os.path.expanduser('~/Library/Fonts/')


def font(size):
    for name in ('NotoSansKR-Bold.otf', 'NotoSansCJKkr-Bold.otf'):
        path = os.path.join(FONT_DIR, name)
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.truetype('/System/Library/Fonts/AppleSDGothicNeo.ttc', size)


def gradient(w, h):
    im = Image.new('RGB', (w, h))
    px = im.load()
    for y in range(h):
        for x in range(w):
            t = (x / max(w - 1, 1) + y / max(h - 1, 1)) / 2
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(G_FROM, G_TO))
    return im


def compose(shot, size, caption):
    """위쪽은 그라데이션 바탕에 문구, 아래쪽에 기기 화면을 얹는다."""
    w, h = size
    canvas = gradient(w, h)
    draw = ImageDraw.Draw(canvas)

    title_size = round(w * 0.062)
    f = font(title_size)
    lines = caption.split('\n')
    line_h = round(title_size * 1.4)
    top = round(h * 0.055)
    for i, line in enumerate(lines):
        tw = draw.textlength(line, font=f)
        draw.text(((w - tw) / 2, top + i * line_h), line, font=f, fill=(255, 255, 255))

    # 화면은 가로 82%로 두고, 문구 아래부터 깔린다
    shot_w = round(w * 0.82)
    shot_h = round(shot.height * shot_w / shot.width)
    shot_resized = shot.resize((shot_w, shot_h), Image.LANCZOS)

    # 모서리 둥글리기
    radius = round(shot_w * 0.06)
    mask = Image.new('L', (shot_w, shot_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, shot_w - 1, shot_h - 1), radius=radius, fill=255)

    y = top + len(lines) * line_h + round(h * 0.035)
    canvas.paste(shot_resized, ((w - shot_w) // 2, y), mask)
    return canvas


def main():
    raw_dir = sys.argv[1] if len(sys.argv) > 1 else 'store/raw'
    if not os.path.isdir(raw_dir):
        raise SystemExit(f'{raw_dir} 가 없다. 스크린샷을 그 폴더에 넣어라.')

    files = sorted(f for f in os.listdir(raw_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg')))
    if not files:
        raise SystemExit(f'{raw_dir} 에 이미지가 없다.')

    for store, size in SIZES.items():
        out_dir = os.path.join('store/screenshots', store)
        os.makedirs(out_dir, exist_ok=True)
        for name in files:
            try:
                order = int(name.split('-')[0])
            except ValueError:
                order = 0
            caption = CAPTIONS.get(order, '')
            with Image.open(os.path.join(raw_dir, name)) as shot:
                out = compose(shot.convert('RGB'), size, caption)
            out_path = os.path.join(out_dir, f'{order:02d}.png')
            out.save(out_path)
            print('·', out_path)


if __name__ == '__main__':
    main()
