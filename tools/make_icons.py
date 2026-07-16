# Генерирует простые иконки PWA: силуэт стены с зубцами на тёмном фоне.
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "icons"
ICONS.mkdir(exist_ok=True)

S = 512
img = Image.new("RGB", (S, S), "#10141c")
d = ImageDraw.Draw(img)

# луна
d.ellipse([340, 60, 440, 160], fill="#e8e4d8")
d.ellipse([320, 50, 410, 140], fill="#10141c")

# горы
d.polygon([(0, 340), (150, 180), (300, 330), (410, 220), (512, 330), (512, 512), (0, 512)], fill="#1d2634")

# стена с зубцами по гребню
wall = "#f0a24b"
d.polygon([(0, 400), (512, 300), (512, 370), (0, 470)], fill=wall)
import math
for i in range(11):
    x = i * 48
    y_top = 400 - (x / 512) * 100
    d.rectangle([x + 6, y_top - 26, x + 34, y_top + 6], fill=wall)

img.save(ICONS / "icon-512.png")
img.resize((192, 192), Image.LANCZOS).save(ICONS / "icon-192.png")
img.resize((180, 180), Image.LANCZOS).save(ICONS / "icon-180.png")
print("иконки готовы:", sorted(p.name for p in ICONS.glob("*.png")))
