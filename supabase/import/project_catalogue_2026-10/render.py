#!/usr/bin/env python3
"""Writes public/projects/<slug>.svg for every catalogue project (and a contact sheet for review)."""
import sys
from pathlib import Path
from catalogue import PROJECTS
from scenes import S, frame

HERE = Path(__file__).resolve().parent
OUT = HERE.parents[2] / 'public' / 'projects'
OUT.mkdir(parents=True, exist_ok=True)
missing = [p['slug'] for p in PROJECTS if p['slug'] not in S]
if missing:
    sys.exit(f'missing scenes: {missing}')
cells = []
for p in PROJECTS:
    svg = frame(p['category'], S[p['slug']], p['image_alt'].replace("'", '&#39;'))
    (OUT / f"{p['slug']}.svg").write_text(svg, encoding='utf-8')
    cells.append(f"<figure><img src='{(OUT / (p['slug'] + '.svg')).as_uri()}'><figcaption>{p['n']}. {p['name']}</figcaption></figure>")
sheet = sys.argv[1] if len(sys.argv) > 1 else None
if sheet:
    Path(sheet).write_text("<html><body style='margin:0;font:12px sans-serif;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:6px;background:#fff'>"
                           "<style>img{width:100%;display:block;border:1px solid #ddd}figure{margin:0}</style>" + ''.join(cells) + '</body></html>')
print('wrote', len(PROJECTS), 'images to', OUT)
