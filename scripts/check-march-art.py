"""Verify the twelve node CGs and create a labeled review sheet (requires Pillow)."""
from pathlib import Path
import hashlib
import re
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
feature = root / 'src/renderer/src/features/long-march'
catalog = (feature / 'landscape-catalog.ts').read_text()
titles = dict(re.findall(r"(\w+): \{\s*title: '([^']+)'", catalog))
names = dict(zip(['yudu','xiangjiang','zunyi','chishui','jinshajiang','luding','jiajin','maogong','ruoergai','lazikou','hadapu','wuqi'], ['于都','湘江','遵义','赤水','金沙江','泸定','夹金山','懋功','若尔盖','腊子口','哈达铺','吴起']))
assert set(titles) == set(names), 'Incomplete node catalog'
hashes = set()
sheet = Image.new('RGB', (1920, 1140), '#f6f1e7')
font = ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc', 23)
small = ImageFont.truetype('/System/Library/Fonts/STHeiti Light.ttc', 17)
draw = ImageDraw.Draw(sheet)
for index, (node_id, name) in enumerate(names.items()):
    file = feature / 'assets/nodes' / (node_id + '.png')
    digest = hashlib.sha256(file.read_bytes()).hexdigest()
    assert digest not in hashes, 'Duplicate node CG: ' + node_id
    hashes.add(digest)
    with Image.open(file) as source:
        assert source.width >= 1400 and source.height >= 900, 'Undersized CG: ' + node_id
        assert abs(source.width / source.height - 1.5) < .02, 'Unexpected aspect ratio'
        tile = source.convert('RGB').resize((480, 320), Image.Resampling.LANCZOS)
    x, y = (index % 4) * 480, (index // 4) * 380
    sheet.paste(tile, (x, y))
    draw.text((x + 13, y + 330), f'{index+1:02d}  {name}', fill='#b8322a', font=font)
    draw.text((x + 185, y + 334), titles[node_id], fill='#5f584d', font=small)
output = root / 'docs/images/long-march/cg-twelve-overview.jpg'
sheet.save(output, quality=93)
print('Verified 12 distinct, full-resolution node CGs. Review sheet:', output)
