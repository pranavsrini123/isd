"""
Hardware drawing primitives for the project illustrations (SVG, 800×500 canvas).
Each function returns an SVG fragment positioned at (x, y) with scale s.
Drawn to resemble the real modules (board colours, connectors, layouts).
"""
import math

FONT = "font-family='Inter,Segoe UI,Arial,sans-serif'"
MONO = "font-family='JetBrains Mono,Consolas,monospace'"


def g(x, y, s, body, rot=0):
    r = f' rotate({rot})' if rot else ''
    return f"<g transform='translate({x:.1f},{y:.1f}) scale({s}){r}'>{body}</g>"


def text(x, y, t, size=12, fill='#0B1F44', weight=600, anchor='middle', mono=False):
    return (f"<text x='{x}' y='{y}' font-size='{size}' fill='{fill}' font-weight='{weight}' "
            f"text-anchor='{anchor}' {MONO if mono else FONT}>{t}</text>")


def label(x, y, t, dark=False):
    """Small caption chip naming a part."""
    w = 8 + len(t) * 7.2
    bg, fg = ('#0B1F44', '#E0F2FE') if dark else ('#FFFFFF', '#0B1F44')
    return (f"<g><rect x='{x - w / 2:.1f}' y='{y - 11}' width='{w:.1f}' height='20' rx='10' fill='{bg}' "
            f"stroke='#0B1F44' stroke-opacity='.15'/>{text(x, y + 3.5, t, 11.5, fg, 700)}</g>")


def holes(w, h, inset=6, r=2.6):
    return ''.join(f"<circle cx='{cx}' cy='{cy}' r='{r}' fill='#E2E8F0' stroke='#94A3B8'/>"
                   for cx, cy in [(inset, inset), (w - inset, inset), (inset, h - inset), (w - inset, h - inset)])


def header_row(x, y, n, pitch=7, horizontal=True, color='#111827'):
    out = []
    for i in range(n):
        px, py = (x + i * pitch, y) if horizontal else (x, y + i * pitch)
        out.append(f"<rect x='{px - 2.6}' y='{py - 2.6}' width='5.2' height='5.2' fill='{color}'/>"
                   f"<rect x='{px - 1}' y='{py - 1}' width='2' height='2' fill='#D4AF37'/>")
    return ''.join(out)


def chip(x, y, w, h, pins=8):
    legs = ''.join(f"<rect x='{x + 4 + i * (w - 8) / max(1, pins - 1) - 1.2}' y='{y - 3}' width='2.4' height='3' fill='#CBD5E1'/>"
                   f"<rect x='{x + 4 + i * (w - 8) / max(1, pins - 1) - 1.2}' y='{y + h}' width='2.4' height='3' fill='#CBD5E1'/>"
                   for i in range(pins))
    return f"{legs}<rect x='{x}' y='{y}' width='{w}' height='{h}' rx='2' fill='#1F2937'/><circle cx='{x + 5}' cy='{y + h / 2}' r='2' fill='#374151'/>"


# ------------------------------------------------------------------ controllers
def arduino_uno(x, y, s=1, rot=0):
    b = (f"<rect width='170' height='120' rx='6' fill='#0E7C9B' stroke='#075E75' stroke-width='2'/>{holes(170, 120, 8)}"
         f"<rect x='-14' y='14' width='34' height='28' rx='2' fill='#CBD5E1' stroke='#94A3B8'/>"
         f"<rect x='-8' y='78' width='26' height='24' rx='3' fill='#111827'/>"
         f"{header_row(48, 10, 16)}{header_row(62, 110, 14)}"
         f"{chip(70, 64, 86, 18, 14)}"
         f"<rect x='34' y='40' width='20' height='12' rx='2' fill='#CBD5E1'/>"
         f"<circle cx='150' cy='30' r='4' fill='#F8FAFC'/><rect x='118' y='26' width='8' height='5' fill='#22C55E'/>"
         f"{text(112, 52, 'UNO', 15, '#F8FAFC', 800)}{text(112, 37, 'ARDUINO', 8, '#BAE6FD', 700)}")
    return g(x, y, s, b, rot)


def arduino_nano(x, y, s=1, rot=0):
    b = (f"<rect width='110' height='40' rx='3' fill='#1D4ED8' stroke='#1E3A8A' stroke-width='1.5'/>"
         f"<rect x='-10' y='12' width='18' height='16' rx='2' fill='#CBD5E1'/>"
         f"{header_row(14, 5, 14)}{header_row(14, 35, 14)}{chip(44, 14, 24, 12, 6)}"
         f"{text(86, 24, 'NANO', 9, '#F8FAFC', 800)}")
    return g(x, y, s, b, rot)


def esp32(x, y, s=1, rot=0):
    b = (f"<rect width='80' height='130' rx='4' fill='#111827' stroke='#000' stroke-width='1.5'/>"
         f"<rect x='14' y='6' width='52' height='18' fill='#0F172A' stroke='#475569'/>"
         + ''.join(f"<path d='M{20 + i * 8} 9v12' stroke='#94A3B8' stroke-width='2'/>" for i in range(5)) +
         f"<rect x='14' y='28' width='52' height='44' rx='2' fill='#CBD5E1' stroke='#94A3B8'/>"
         f"{text(40, 54, 'ESP32', 10, '#334155', 800)}"
         f"{header_row(6, 30, 14, 7, False)}{header_row(74, 30, 14, 7, False)}"
         f"<rect x='28' y='120' width='24' height='16' rx='2' fill='#CBD5E1'/>"
         f"<rect x='20' y='96' width='8' height='6' fill='#E5E7EB'/><rect x='52' y='96' width='8' height='6' fill='#E5E7EB'/>")
    return g(x, y, s, b, rot)


def nodemcu(x, y, s=1, rot=0):
    return g(x, y, s, esp32(0, 0, 1).replace('#111827', '#1E293B').replace('ESP32', 'ESP8266'), rot)


def mini_pc(x, y, s=1):
    b = (f"<rect width='150' height='150' rx='14' fill='#1F2937' stroke='#0F172A' stroke-width='2'/>"
         f"<rect x='12' y='12' width='126' height='126' rx='10' fill='#273449'/>"
         f"<circle cx='120' cy='126' r='4' fill='#38BDF8'/>{text(75, 82, 'hp', 26, '#94A3B8', 800)}")
    return g(x, y, s, b)


def jetson(x, y, s=1):
    fins = ''.join(f"<rect x='{40 + i * 9}' y='30' width='5' height='80' fill='#6B7280'/>" for i in range(11))
    b = (f"<rect width='200' height='150' rx='6' fill='#14532D' stroke='#052E16' stroke-width='2'/>{holes(200, 150, 9)}"
         f"<rect x='34' y='24' width='108' height='92' rx='4' fill='#9CA3AF'/>{fins}"
         f"<rect x='34' y='24' width='108' height='92' rx='4' fill='none' stroke='#4B5563' stroke-width='2'/>"
         f"<rect x='160' y='20' width='30' height='22' fill='#CBD5E1'/><rect x='160' y='50' width='30' height='22' fill='#CBD5E1'/>"
         f"<rect x='160' y='84' width='30' height='26' fill='#111827'/>{header_row(40, 132, 20)}"
         f"{text(88, 75, 'NVIDIA', 12, '#111827', 800)}")
    return g(x, y, s, b)


# ------------------------------------------------------------------ sensors & modules
def hcsr04(x, y, s=1, rot=0):
    def can(cx):
        return (f"<circle cx='{cx}' cy='38' r='25' fill='#E5E7EB' stroke='#9CA3AF' stroke-width='3'/>"
                f"<circle cx='{cx}' cy='38' r='17' fill='#475569'/>"
                + ''.join(f"<circle cx='{cx + dx}' cy='{38 + dy}' r='1.6' fill='#94A3B8'/>"
                          for dx in (-8, 0, 8) for dy in (-8, 0, 8)))
    b = (f"<rect width='150' height='72' rx='4' fill='#1D6FD8' stroke='#1E40AF' stroke-width='2'/>{can(36)}{can(114)}"
         f"<rect x='64' y='8' width='22' height='10' rx='2' fill='#CBD5E1'/>"
         + ''.join(f"<rect x='{57 + i * 11}' y='72' width='3' height='14' fill='#D4AF37'/>" for i in range(4)) +
         f"{text(75, 64, 'HC-SR04', 8, '#E0F2FE', 700)}")
    return g(x, y, s, b, rot)


def small_module(x, y, s=1, color='#1D4ED8', w=70, h=40, parts='', rot=0, pins=3):
    b = (f"<rect width='{w}' height='{h}' rx='4' fill='{color}' stroke='#0F172A' stroke-opacity='.4' stroke-width='1.5'/>{parts}"
         + ''.join(f"<rect x='{w - 2}' y='{h / 2 - (pins - 1) * 4 + i * 8 - 1.5}' width='12' height='3' fill='#D4AF37'/>" for i in range(pins)))
    return g(x, y, s, b, rot)


def ir_sensor(x, y, s=1, rot=0):
    p = ("<circle cx='14' cy='12' r='7' fill='#F1F5F9' stroke='#94A3B8'/><circle cx='14' cy='30' r='7' fill='#111827'/>"
         "<rect x='32' y='14' width='16' height='14' rx='2' fill='#2563EB'/><circle cx='40' cy='21' r='3' fill='#F8FAFC'/>"
         "<circle cx='58' cy='12' r='2.5' fill='#22C55E'/><circle cx='58' cy='30' r='2.5' fill='#EF4444'/>")
    return small_module(x, y, s, '#1E3A8A', 70, 42, p, rot)


def l298n(x, y, s=1):
    fins = ''.join(f"<rect x='{48 + i * 9}' y='4' width='5' height='60' fill='#111827'/>" for i in range(7))
    b = (f"<rect width='150' height='150' rx='5' fill='#B91C1C' stroke='#7F1D1D' stroke-width='2'/>{holes(150, 150, 8)}"
         f"<rect x='42' y='10' width='68' height='60' fill='#1F2937'/>{fins}"
         f"<rect x='4' y='40' width='22' height='40' fill='#2563EB'/><rect x='124' y='40' width='22' height='40' fill='#2563EB'/>"
         f"<rect x='40' y='120' width='54' height='22' fill='#2563EB'/>"
         f"<circle cx='120' cy='112' r='8' fill='#1F2937'/><rect x='100' y='126' width='42' height='10' fill='#111827'/>"
         f"{header_row(103, 131, 6)}{text(75, 100, 'L298N', 12, '#FEE2E2', 800)}")
    return g(x, y, s, b)


def relay_module(x, y, s=1, n=1):
    w = 34 + n * 46
    relays = ''.join(f"<rect x='{14 + i * 46}' y='14' width='38' height='34' rx='3' fill='#2563EB' stroke='#1E3A8A'/>"
                     f"{text(33 + i * 46, 35, 'SRD', 8, '#DBEAFE', 700)}"
                     f"<rect x='{16 + i * 46}' y='56' width='34' height='16' fill='#0EA5E9'/>" for i in range(n))
    b = f"<rect width='{w}' height='80' rx='4' fill='#1E40AF' stroke='#172554' stroke-width='1.5'/>{relays}"
    return g(x, y, s, b)


def gas_sensor(x, y, s=1):
    mesh = ''.join(f"<line x1='{30 + i * 5}' y1='18' x2='{30 + i * 5}' y2='62' stroke='#9CA3AF' stroke-width='1'/>" for i in range(9))
    p = (f"<circle cx='50' cy='40' r='26' fill='#D1D5DB' stroke='#6B7280' stroke-width='3'/>"
         f"<circle cx='50' cy='40' r='20' fill='#E5E7EB'/>{mesh}<circle cx='50' cy='40' r='20' fill='none' stroke='#9CA3AF'/>")
    return small_module(x, y, s, '#1E3A8A', 100, 80, p, pins=4)


def lcd16x2(x, y, s=1, l1='HELLO ISD LAB', l2='', color='#84CC16'):
    b = (f"<rect width='240' height='90' rx='5' fill='#15803D' stroke='#14532D' stroke-width='2'/>{holes(240, 90, 7)}"
         f"<rect x='16' y='14' width='208' height='62' rx='3' fill='#111827'/>"
         f"<rect x='22' y='20' width='196' height='50' rx='2' fill='{color}'/>"
         f"{text(30, 42, l1, 17, '#1A2E05', 700, 'start', True)}{text(30, 63, l2, 17, '#1A2E05', 700, 'start', True)}")
    return g(x, y, s, b)


def servo(x, y, s=1, angle=0, rot=0):
    b = (f"<rect width='60' height='34' rx='3' fill='#1D4ED8' stroke='#1E3A8A' stroke-width='1.5'/>"
         f"<rect x='-10' y='12' width='80' height='8' rx='2' fill='#1D4ED8'/>"
         f"<circle cx='16' cy='-2' r='10' fill='#1E40AF'/><circle cx='16' cy='-2' r='4' fill='#F8FAFC'/>"
         f"<g transform='rotate({angle} 16 -2)'><path d='M16 -6 L58 -4 L58 0 L16 2 Z' fill='#F8FAFC' stroke='#CBD5E1'/></g>"
         f"{text(36, 23, 'SG90', 9, '#DBEAFE', 700)}")
    return g(x, y, s, b, rot)


def buzzer(x, y, s=1):
    return g(x, y, s, "<circle r='22' fill='#111827'/><circle r='16' fill='#1F2937'/><circle r='4' fill='#0B0F19'/>"
                       "<rect x='-8' y='22' width='3' height='12' fill='#9CA3AF'/><rect x='5' y='22' width='3' height='12' fill='#9CA3AF'/>")


def led(x, y, color='#EF4444', on=True, s=1):
    glow = f"<circle cx='0' cy='-6' r='18' fill='{color}' opacity='.25'/>" if on else ''
    return g(x, y, s, f"{glow}<path d='M-8 0 V-12 A8 8 0 0 1 8 -12 V0 Z' fill='{color}' opacity='{1 if on else .45}'/>"
                       f"<rect x='-10' y='0' width='20' height='4' fill='{color}' opacity='.8'/>"
                       f"<rect x='-5' y='4' width='2' height='16' fill='#9CA3AF'/><rect x='3' y='4' width='2' height='12' fill='#9CA3AF'/>")


def battery(x, y, s=1, rot=0, color='#16A34A'):
    b = (f"<rect width='110' height='34' rx='8' fill='{color}' stroke='#14532D' stroke-width='1.5'/>"
         f"<rect x='110' y='10' width='6' height='14' rx='2' fill='#CBD5E1'/><rect x='8' y='6' width='94' height='6' rx='3' fill='#FFFFFF' opacity='.25'/>"
         f"{text(55, 23, '18650', 10, '#F0FDF4', 800)}")
    return g(x, y, s, b, rot)


def breadboard(x, y, w=240, h=150):
    dots = ''.join(f"<circle cx='{x + 18 + c * 9}' cy='{y + 30 + r * 9 + (14 if r > 4 else 0)}' r='1.6' fill='#9CA3AF'/>"
                   for r in range(10) for c in range(int((w - 30) / 9)))
    return (f"<rect x='{x}' y='{y}' width='{w}' height='{h}' rx='6' fill='#F8FAFC' stroke='#CBD5E1' stroke-width='2'/>"
            f"<rect x='{x + 8}' y='{y + 76}' width='{w - 16}' height='6' fill='#E2E8F0'/>"
            f"<line x1='{x + 10}' y1='{y + 12}' x2='{x + w - 10}' y2='{y + 12}' stroke='#EF4444' stroke-width='2'/>"
            f"<line x1='{x + 10}' y1='{y + h - 12}' x2='{x + w - 10}' y2='{y + h - 12}' stroke='#2563EB' stroke-width='2'/>{dots}")


def wire(points, color='#F59E0B', w=3.5):
    d = 'M' + ' '.join(f'{px:.0f} {py:.0f}' for px, py in points[:1])
    for i in range(1, len(points)):
        (x0, y0), (x1, y1) = points[i - 1], points[i]
        mx = (x0 + x1) / 2
        d += f' C{mx:.0f} {y0:.0f} {mx:.0f} {y1:.0f} {x1:.0f} {y1:.0f}'
    return f"<path d='{d}' fill='none' stroke='{color}' stroke-width='{w}' stroke-linecap='round'/>"


def wheel(x, y, r=34):
    treads = ''.join(f"<line x1='{x + (r - 2) * math.cos(a):.1f}' y1='{y + (r - 2) * math.sin(a):.1f}' "
                     f"x2='{x + (r - 9) * math.cos(a):.1f}' y2='{y + (r - 9) * math.sin(a):.1f}' stroke='#374151' stroke-width='3'/>"
                     for a in [i * math.pi / 8 for i in range(16)])
    return (f"<circle cx='{x}' cy='{y}' r='{r}' fill='#111827'/>{treads}<circle cx='{x}' cy='{y}' r='{r * .45}' fill='#FACC15'/>"
            f"<circle cx='{x}' cy='{y}' r='{r * .15}' fill='#A16207'/>")


def gear_motor(x, y, s=1, rot=0):
    b = ("<rect width='70' height='26' rx='4' fill='#FACC15' stroke='#A16207' stroke-width='1.5'/>"
         "<rect x='70' y='4' width='30' height='18' rx='3' fill='#E5E7EB' stroke='#9CA3AF'/>"
         "<rect x='-8' y='9' width='8' height='8' fill='#FDE68A'/>")
    return g(x, y, s, b, rot)


def dc_motor(x, y, s=1):
    return g(x, y, s, "<rect width='70' height='44' rx='20' fill='#CBD5E1' stroke='#64748B' stroke-width='2'/>"
                      "<rect x='70' y='18' width='16' height='8' fill='#94A3B8'/><rect x='-8' y='10' width='8' height='24' rx='2' fill='#F59E0B'/>"
                      "<rect x='8' y='10' width='40' height='5' rx='2' fill='#FFFFFF' opacity='.5'/>")


def robot_car(x, y, s=1, wheels=4, top=''):
    """Top-down robot car with chassis, wheels and optional mounted parts."""
    ws = [(-12, 18), (-12, 132), (212, 18), (212, 132)] if wheels == 4 else [(-12, 75), (212, 75)]
    wh = ''.join(f"<rect x='{wx - 14}' y='{wy - 32}' width='28' height='64' rx='8' fill='#111827'/>"
                 + ''.join(f"<line x1='{wx - 14}' y1='{wy - 28 + i * 8}' x2='{wx + 14}' y2='{wy - 28 + i * 8}' stroke='#374151' stroke-width='2'/>" for i in range(8))
                 for wx, wy in ws)
    castor = "" if wheels == 4 else "<circle cx='100' cy='160' r='10' fill='#9CA3AF' stroke='#475569'/>"
    b = (f"{wh}<rect x='0' y='0' width='200' height='150' rx='16' fill='#FDE68A' fill-opacity='.55' stroke='#D97706' stroke-width='2.5'/>"
         f"{castor}{top}")
    return g(x, y, s, b)


def phone(x, y, s=1, screen=''):
    return g(x, y, s, f"<rect width='110' height='200' rx='18' fill='#0F172A'/><rect x='8' y='14' width='94' height='172' rx='10' fill='#E0F2FE'/>"
                      f"<rect x='42' y='5' width='26' height='5' rx='2.5' fill='#334155'/>{screen}")


def laptop(x, y, s=1, screen=''):
    return g(x, y, s, f"<rect x='10' y='0' width='260' height='165' rx='10' fill='#1E293B'/><rect x='20' y='10' width='240' height='145' rx='4' fill='#F8FAFC'/>"
                      f"{screen}<path d='M-10 170 H290 L274 186 H6 Z' fill='#94A3B8'/><rect x='110' y='170' width='60' height='5' rx='2' fill='#64748B'/>")


def wifi(x, y, s=1, color='#2563EB'):
    return g(x, y, s, f"<path d='M-30 -8 A42 42 0 0 1 30 -8' stroke='{color}' stroke-width='5' fill='none' stroke-linecap='round'/>"
                      f"<path d='M-19 3 A27 27 0 0 1 19 3' stroke='{color}' stroke-width='5' fill='none' stroke-linecap='round'/>"
                      f"<path d='M-8 14 A12 12 0 0 1 8 14' stroke='{color}' stroke-width='5' fill='none' stroke-linecap='round'/>"
                      f"<circle cx='0' cy='22' r='4' fill='{color}'/>")


def bluetooth(x, y, s=1):
    return g(x, y, s, "<circle r='24' fill='#2563EB'/><path d='M-8 -9 L8 7 L0 15 V-15 L8 -7 L-8 9' stroke='#fff' stroke-width='3.5' fill='none' stroke-linejoin='round'/>")


def waves(x, y, n=3, color='#22D3EE', direction=1, spread=34):
    return ''.join(f"<path d='M{x + direction * (14 + i * 16)} {y - spread / 2 - i * 8} Q{x + direction * (26 + i * 18)} {y} {x + direction * (14 + i * 16)} {y + spread / 2 + i * 8}' "
                   f"stroke='{color}' stroke-width='4' fill='none' stroke-linecap='round' opacity='{1 - i * .25}'/>" for i in range(n))


def flame(x, y, s=1):
    return g(x, y, s, "<path d='M0 -70 C26 -40 40 -20 32 6 C26 26 -26 26 -32 6 C-40 -20 -14 -30 0 -70 Z' fill='#F97316'/>"
                      "<path d='M0 -36 C14 -20 20 -8 15 6 C10 18 -10 18 -15 6 C-19 -6 -8 -14 0 -36 Z' fill='#FDE047'/>")


def heart(x, y, s=1, color='#EF4444'):
    return g(x, y, s, f"<path d='M0 30 C-40 4 -46 -26 -24 -36 C-12 -42 -2 -34 0 -24 C2 -34 12 -42 24 -36 C46 -26 40 4 0 30 Z' fill='{color}'/>")


def ecg(x, y, w=220, color='#EF4444', sw=4):
    pts = [(0, 0), (40, 0), (52, -8), (62, 0), (78, 0), (86, 18), (96, -52), (106, 26), (116, 0), (150, 0), (164, -12), (178, 0), (w, 0)]
    return f"<polyline points='{' '.join(f'{x + px},{y + py}' for px, py in pts)}' fill='none' stroke='{color}' stroke-width='{sw}' stroke-linejoin='round' stroke-linecap='round'/>"


def chart(x, y, w, h, pts, color='#2563EB'):
    n = len(pts)
    poly = ' '.join(f'{x + i * w / (n - 1):.0f},{y + h - v * h:.0f}' for i, v in enumerate(pts))
    grid = ''.join(f"<line x1='{x}' y1='{y + i * h / 4}' x2='{x + w}' y2='{y + i * h / 4}' stroke='#E2E8F0'/>" for i in range(5))
    return (f"{grid}<polygon points='{x},{y + h} {poly} {x + w},{y + h}' fill='{color}' opacity='.12'/>"
            f"<polyline points='{poly}' fill='none' stroke='{color}' stroke-width='3' stroke-linejoin='round'/>")


def printer3d(x, y, s=1, printing=''):
    b = (f"<rect x='0' y='0' width='16' height='260' fill='#334155'/><rect x='204' y='0' width='16' height='260' fill='#334155'/>"
         f"<rect x='0' y='0' width='220' height='16' fill='#334155'/><rect x='-10' y='250' width='240' height='24' rx='4' fill='#1E293B'/>"
         f"<rect x='16' y='86' width='188' height='10' fill='#64748B'/>"
         f"<rect x='86' y='72' width='48' height='40' rx='4' fill='#F97316'/><path d='M104 112 L110 126 L116 112 Z' fill='#CBD5E1'/>"
         f"<rect x='30' y='222' width='160' height='12' rx='2' fill='#94A3B8'/>{printing}"
         f"<rect x='160' y='252' width='50' height='18' rx='3' fill='#0EA5E9'/>")
    return g(x, y, s, b)


def robot_arm(x, y, s=1, a1=-60, a2=50, a3=30, grip=''):
    """Side view: base, shoulder, elbow, wrist, gripper."""
    def seg(length, angle, inner):
        return (f"<g transform='rotate({angle})'><rect x='-12' y='-12' width='{length + 24}' height='24' rx='12' fill='#E2E8F0' stroke='#475569' stroke-width='2'/>"
                f"<rect x='-14' y='-14' width='34' height='28' rx='5' fill='#1D4ED8'/>"
                f"<g transform='translate({length},0)'>{inner}</g></g>")
    gripper = ("<rect x='-14' y='-14' width='30' height='28' rx='5' fill='#1D4ED8'/>"
               "<path d='M14 -12 H44 V-4 H24' stroke='#334155' stroke-width='6' fill='none' stroke-linejoin='round'/>"
               "<path d='M14 12 H44 V4 H24' stroke='#334155' stroke-width='6' fill='none' stroke-linejoin='round'/>" + grip)
    b = (f"<rect x='-60' y='0' width='120' height='26' rx='6' fill='#1E293B'/><rect x='-34' y='-34' width='68' height='40' rx='8' fill='#334155'/>"
         f"<g transform='translate(0,-30)'>{seg(120, a1, seg(110, a2, seg(54, a3, gripper)))}</g>")
    return g(x, y, s, b)


def mecanum_wheel(x, y, s=1, flip=False):
    rollers = ''.join(f"<rect x='{-22 + i * 10}' y='-30' width='7' height='60' rx='3.5' fill='#9CA3AF' transform='rotate({-35 if flip else 35} {-18 + i * 10} 0)'/>" for i in range(5))
    return g(x, y, s, f"<rect x='-26' y='-34' width='52' height='68' rx='10' fill='#111827'/>{rollers}")


def drone(x, y, s=1):
    arms = ''.join(f"<line x1='0' y1='0' x2='{dx}' y2='{dy}' stroke='#1F2937' stroke-width='14' stroke-linecap='round'/>"
                   for dx, dy in [(-110, -70), (110, -70), (-110, 70), (110, 70)])
    props = ''.join(f"<circle cx='{dx}' cy='{dy}' r='16' fill='#374151'/><ellipse cx='{dx}' cy='{dy}' rx='66' ry='9' fill='#94A3B8' opacity='.55'/>"
                    f"<ellipse cx='{dx}' cy='{dy}' rx='9' ry='60' fill='#CBD5E1' opacity='.35'/>"
                    for dx, dy in [(-110, -70), (110, -70), (-110, 70), (110, 70)])
    body = ("<rect x='-50' y='-40' width='100' height='80' rx='18' fill='#F97316' stroke='#9A3412' stroke-width='3'/>"
            "<rect x='-30' y='-22' width='60' height='44' rx='6' fill='#1F2937'/><circle cx='0' cy='0' r='8' fill='#22D3EE'/>")
    return g(x, y, s, arms + props + body)


def lidar(x, y, s=1, rays=True, rx=0, ry=0):
    r = ''
    if rays:
        for i in range(18):
            a = -math.pi / 2 + i * (2 * math.pi / 18)
            ln = 120 + 40 * math.sin(i * 1.7)
            r += f"<line x1='0' y1='0' x2='{ln * math.cos(a):.0f}' y2='{ln * math.sin(a):.0f}' stroke='#EF4444' stroke-width='2' opacity='.55'/>"
    b = (f"{r}<circle r='40' fill='#111827'/><circle r='30' fill='#1F2937'/><rect x='-14' y='-26' width='28' height='18' rx='4' fill='#334155'/>"
         f"<circle cx='0' cy='-17' r='5' fill='#EF4444'/><circle r='6' fill='#475569'/>")
    return g(x, y, s, b)


def stereo_cam(x, y, s=1):
    b = ("<rect width='300' height='70' rx='35' fill='#1F2937' stroke='#0F172A' stroke-width='3'/>"
         "<rect x='14' y='10' width='272' height='50' rx='25' fill='#111827'/>"
         "<circle cx='60' cy='35' r='24' fill='#0F172A' stroke='#475569' stroke-width='3'/><circle cx='60' cy='35' r='12' fill='#1E3A8A'/><circle cx='54' cy='29' r='4' fill='#93C5FD'/>"
         "<circle cx='240' cy='35' r='24' fill='#0F172A' stroke='#475569' stroke-width='3'/><circle cx='240' cy='35' r='12' fill='#1E3A8A'/><circle cx='234' cy='29' r='4' fill='#93C5FD'/>"
         f"{text(150, 41, 'ZED 2', 16, '#94A3B8', 800)}")
    return g(x, y, s, b)


def depth_cam(x, y, s=1):
    b = ("<rect width='180' height='46' rx='10' fill='#374151' stroke='#111827' stroke-width='2'/>"
         + ''.join(f"<circle cx='{cx}' cy='23' r='{r}' fill='#0F172A' stroke='#6B7280' stroke-width='2'/>" for cx, r in [(30, 12), (78, 9), (118, 12), (154, 8)])
         + f"{text(96, 42, 'intel', 9, '#9CA3AF', 700)}")
    return g(x, y, s, b)


def bbox(x, y, w, h, lbl, color='#22C55E'):
    return (f"<rect x='{x}' y='{y}' width='{w}' height='{h}' fill='none' stroke='{color}' stroke-width='3.5' rx='3'/>"
            f"<rect x='{x}' y='{y - 22}' width='{len(lbl) * 8 + 16}' height='22' fill='{color}'/>"
            f"{text(x + 8, y - 6, lbl, 12, '#FFFFFF', 700, 'start')}")


def gps_module(x, y, s=1):
    b = ("<rect width='120' height='90' rx='5' fill='#1E40AF' stroke='#172554' stroke-width='2'/>"
         "<rect x='14' y='14' width='54' height='54' rx='4' fill='#E5E7EB' stroke='#9CA3AF'/>"
         f"{text(41, 45, 'NEO-6M', 8, '#334155', 800)}"
         "<rect x='132' y='10' width='64' height='64' rx='6' fill='#D6A55A' stroke='#92400E' stroke-width='2'/><circle cx='164' cy='42' r='12' fill='#F5D08A'/>"
         "<path d='M120 42 H132' stroke='#111827' stroke-width='3'/><circle cx='96' cy='22' r='4' fill='#22C55E'/>")
    return g(x, y, s, b)


def rfid_reader(x, y, s=1):
    coil = ''.join(f"<rect x='{16 + i * 7}' y='{16 + i * 7}' width='{148 - i * 14}' height='{98 - i * 14}' rx='{12 - i}' fill='none' stroke='#93C5FD' stroke-width='2.5'/>" for i in range(4))
    b = f"<rect width='180' height='130' rx='6' fill='#1D4ED8' stroke='#1E3A8A' stroke-width='2'/>{coil}{chip(76, 104, 30, 14, 6)}{text(90, 70, 'RC522', 13, '#DBEAFE', 800)}"
    return g(x, y, s, b)


def rfid_card(x, y, s=1, rot=0):
    b = ("<rect width='150' height='94' rx='10' fill='#F8FAFC' stroke='#94A3B8' stroke-width='2'/>"
         "<rect x='16' y='26' width='30' height='24' rx='3' fill='#D4AF37'/><rect x='16' y='66' width='90' height='8' rx='4' fill='#CBD5E1'/>"
         f"{text(108, 46, 'ID', 18, '#2563EB', 800)}")
    return g(x, y, s, b, rot)


def fingerprint(x, y, s=1, color='#38BDF8'):
    arcs = ''.join(f"<path d='M{-6 - i * 7} {12} A{8 + i * 7} {10 + i * 8} 0 1 1 {6 + i * 7} {12}' fill='none' stroke='{color}' stroke-width='3' stroke-linecap='round'/>" for i in range(5))
    return g(x, y, s, arcs)


def thermometer(x, y, s=1, level=.7, color='#EF4444'):
    h = 120
    return g(x, y, s, f"<rect x='-12' y='0' width='24' height='{h}' rx='12' fill='#F8FAFC' stroke='#94A3B8' stroke-width='3'/>"
                      f"<rect x='-5' y='{h - h * level}' width='10' height='{h * level}' fill='{color}'/>"
                      f"<circle cx='0' cy='{h + 10}' r='20' fill='{color}' stroke='#94A3B8' stroke-width='3'/>")


def plant_pot(x, y, s=1):
    return g(x, y, s, "<path d='M-60 0 H60 L48 90 H-48 Z' fill='#C2410C'/><rect x='-66' y='-12' width='132' height='18' rx='4' fill='#EA580C'/>"
                      "<rect x='-56' y='-6' width='112' height='14' fill='#78350F'/>"
                      "<path d='M0 -6 C-4 -50 -10 -70 -2 -110' stroke='#15803D' stroke-width='6' fill='none'/>"
                      "<path d='M-2 -70 C-40 -80 -56 -60 -60 -50 C-30 -46 -12 -56 -2 -70 Z' fill='#22C55E'/>"
                      "<path d='M-2 -96 C30 -120 52 -104 56 -96 C30 -84 12 -86 -2 -96 Z' fill='#16A34A'/>"
                      "<path d='M0 -40 C34 -54 50 -40 52 -34 C28 -24 12 -28 0 -40 Z' fill='#22C55E'/>")


def soil_probe(x, y, s=1):
    return g(x, y, s, "<path d='M0 0 H60 V40 L52 140 L40 140 L36 40 H24 L20 140 L8 140 L0 40 Z' fill='#B45309' stroke='#78350F' stroke-width='1.5'/>"
                      "<rect x='0' y='0' width='60' height='40' rx='3' fill='#1E40AF'/><rect x='10' y='44' width='6' height='90' fill='#FCD34D'/><rect x='44' y='44' width='6' height='90' fill='#FCD34D'/>")


def house(x, y, s=1, fill='#F8FAFC'):
    return g(x, y, s, f"<path d='M0 70 L110 0 L220 70 V200 H0 Z' fill='{fill}' stroke='#334155' stroke-width='4' stroke-linejoin='round'/>"
                      "<rect x='86' y='120' width='48' height='80' fill='#CBD5E1' stroke='#334155' stroke-width='3'/>")


def bulb(x, y, s=1, on=True):
    glow = "<circle cx='0' cy='0' r='46' fill='#FDE047' opacity='.35'/>" if on else ''
    return g(x, y, s, f"{glow}<circle r='28' fill='{'#FDE047' if on else '#E5E7EB'}' stroke='#A16207' stroke-width='3'/>"
                      "<rect x='-12' y='24' width='24' height='18' rx='3' fill='#94A3B8'/><path d='M-8 6 L0 -6 L8 6' stroke='#A16207' stroke-width='3' fill='none'/>")


def map_grid(x, y, w, h, color='#CBD5E1'):
    lines = ''.join(f"<line x1='{x + i * 30}' y1='{y}' x2='{x + i * 30}' y2='{y + h}' stroke='{color}' stroke-width='1'/>" for i in range(int(w / 30) + 1))
    lines += ''.join(f"<line x1='{x}' y1='{y + i * 30}' x2='{x + w}' y2='{y + i * 30}' stroke='{color}' stroke-width='1'/>" for i in range(int(h / 30) + 1))
    return f"<rect x='{x}' y='{y}' width='{w}' height='{h}' fill='#FFFFFF' stroke='#94A3B8' stroke-width='2'/>{lines}"


def pin(x, y, s=1, color='#EF4444'):
    return g(x, y, s, f"<path d='M0 0 C-22 -26 -24 -40 -24 -48 A24 24 0 1 1 24 -48 C24 -40 22 -26 0 0 Z' fill='{color}'/><circle cx='0' cy='-48' r='9' fill='#FFFFFF'/>")


def satellite(x, y, s=1):
    return g(x, y, s, "<rect x='-14' y='-14' width='28' height='28' rx='4' fill='#CBD5E1' stroke='#475569' stroke-width='2'/>"
                      "<rect x='-74' y='-12' width='54' height='24' fill='#1D4ED8' stroke='#1E3A8A'/><rect x='20' y='-12' width='54' height='24' fill='#1D4ED8' stroke='#1E3A8A'/>"
                      "<line x1='-47' y1='-12' x2='-47' y2='12' stroke='#93C5FD'/><line x1='47' y1='-12' x2='47' y2='12' stroke='#93C5FD'/>", -20)


def touch_pad(x, y, s=1):
    p = "<circle cx='34' cy='28' r='18' fill='#DC2626' stroke='#FCA5A5' stroke-width='3'/><circle cx='34' cy='28' r='6' fill='#FCA5A5'/>"
    return small_module(x, y, s, '#B91C1C', 68, 56, p)


def finger(x, y, s=1, rot=0):
    return g(x, y, s, "<path d='M0 0 C0 -20 26 -20 26 0 V120 H0 Z' fill='#F5C6A5' stroke='#C08457' stroke-width='2'/>"
                      "<path d='M5 -2 C5 -12 21 -12 21 -2 V14 H5 Z' fill='#FDE7D6'/>", rot)


def dice_face(x, y, s=1, n=5):
    spots = {1: [(1, 1)], 2: [(0, 0), (2, 2)], 3: [(0, 0), (1, 1), (2, 2)], 4: [(0, 0), (2, 0), (0, 2), (2, 2)],
             5: [(0, 0), (2, 0), (1, 1), (0, 2), (2, 2)], 6: [(0, 0), (2, 0), (0, 1), (2, 1), (0, 2), (2, 2)]}[n]
    all7 = [(0, 0), (2, 0), (0, 1), (1, 1), (2, 1), (0, 2), (2, 2)]
    b = "<rect width='180' height='180' rx='26' fill='#FFFFFF' stroke='#CBD5E1' stroke-width='3'/>"
    for cx, cy in all7:
        on = (cx, cy) in spots
        b += led(36 + cx * 54, 52 + cy * 50, '#EF4444', on, 1.1)
    return g(x, y, s, b)


def bin_(x, y, s=1, lid=-35):
    return g(x, y, s, f"<path d='M0 0 H150 L136 200 H14 Z' fill='#16A34A' stroke='#14532D' stroke-width='3'/>"
                      f"<g transform='rotate({lid} 0 0)'><rect x='-6' y='-18' width='162' height='18' rx='6' fill='#15803D' stroke='#14532D' stroke-width='3'/></g>"
                      "<path d='M58 70 l16 -26 l16 26 M64 80 h-26 l14 24 M100 80 h26 l-14 24' stroke='#DCFCE7' stroke-width='4' fill='none' stroke-linecap='round'/>")


def tank(x, y, w, h, level=.62):
    return (f"<rect x='{x}' y='{y}' width='{w}' height='{h}' rx='10' fill='#F8FAFC' stroke='#64748B' stroke-width='4'/>"
            f"<rect x='{x + 4}' y='{y + h - (h - 8) * level - 4}' width='{w - 8}' height='{(h - 8) * level}' rx='6' fill='#38BDF8' opacity='.75'/>"
            f"<path d='M{x + 4} {y + h - (h - 8) * level} q20 -8 40 0 t40 0 t40 0 t40 0' stroke='#0EA5E9' stroke-width='3' fill='none'/>")


def beaker(x, y, s=1, fill='#A16207', opacity=.45):
    return g(x, y, s, f"<path d='M0 0 H100 V10 H92 V150 Q92 166 76 166 H24 Q8 166 8 150 V10 H0 Z' fill='#F8FAFC' stroke='#64748B' stroke-width='3'/>"
                      f"<path d='M10 60 H90 V150 Q90 164 76 164 H24 Q10 164 10 150 Z' fill='{fill}' opacity='{opacity}'/>"
                      + ''.join(f"<circle cx='{20 + (i * 37) % 64}' cy='{80 + (i * 23) % 70}' r='3' fill='{fill}' opacity='.7'/>" for i in range(9)))


def walking_stick(x, y, s=1):
    return g(x, y, s, "<path d='M0 0 C0 -40 60 -40 60 0' stroke='#78350F' stroke-width='16' fill='none' stroke-linecap='round'/>"
                      "<rect x='52' y='0' width='16' height='330' rx='6' fill='#92400E'/><rect x='50' y='322' width='20' height='16' rx='5' fill='#111827'/>")


def car(x, y, s=1, color='#2563EB'):
    return g(x, y, s, f"<path d='M10 60 L40 20 H150 L190 60 H220 Q232 60 232 74 V96 H0 V70 Q0 60 10 60 Z' fill='{color}'/>"
                      "<path d='M52 28 H96 V58 H32 Z M106 28 H146 L176 58 H106 Z' fill='#BFDBFE'/>"
                      f"{wheel(52, 98, 24)}{wheel(186, 98, 24)}")


def person(x, y, s=1, color='#334155'):
    return g(x, y, s, f"<circle cx='0' cy='-110' r='18' fill='{color}'/><path d='M-24 -86 H24 L20 -20 H-20 Z' fill='{color}'/>"
                      f"<rect x='-18' y='-22' width='14' height='70' rx='6' fill='{color}'/><rect x='4' y='-22' width='14' height='70' rx='6' fill='{color}'/>")


def door(x, y, s=1, open_=.6):
    return g(x, y, s, f"<rect x='0' y='0' width='190' height='250' fill='#E2E8F0' stroke='#334155' stroke-width='4'/>"
                      f"<rect x='{8 + 86 * open_}' y='8' width='86' height='242' fill='#93C5FD' stroke='#1E3A8A' stroke-width='3'/>"
                      f"<rect x='{96 - 86 * open_}' y='8' width='86' height='242' fill='#93C5FD' stroke='#1E3A8A' stroke-width='3' opacity='.0'/>"
                      "<rect x='8' y='8' width='86' height='242' fill='#BFDBFE' stroke='#1E3A8A' stroke-width='3' transform='translate(-60 0)' opacity='0'/>")


def fan(x, y, s=1):
    blades = ''.join(f"<ellipse cx='0' cy='-38' rx='16' ry='36' fill='#38BDF8' opacity='.85' transform='rotate({a})'/>" for a in (0, 120, 240))
    return g(x, y, s, f"<circle r='86' fill='none' stroke='#94A3B8' stroke-width='5'/>{blades}<circle r='14' fill='#1E293B'/>")


def screen_box(x, y, w, h, body='', title=''):
    bar = f"<rect x='{x}' y='{y}' width='{w}' height='26' rx='8' fill='#0B1F44'/>{text(x + 14, y + 17, title, 11, '#E0F2FE', 700, 'start')}" if title else ''
    return f"<rect x='{x}' y='{y}' width='{w}' height='{h}' rx='8' fill='#FFFFFF' stroke='#CBD5E1' stroke-width='2'/>{bar}{body}"


def vib_motor(x, y, s=1):
    return g(x, y, s, "<circle r='26' fill='#CBD5E1' stroke='#64748B' stroke-width='3'/><circle r='14' fill='#94A3B8'/>"
                      "<path d='M-6 26 L-10 60 M6 26 L10 60' stroke='#EF4444' stroke-width='3'/>")


def mpu6050(x, y, s=1):
    p = (chip(30, 18, 34, 34, 6) + text(47, 72, 'MPU-6050', 8, '#E0F2FE', 700)
         + "<path d='M76 50 V18 M76 50 H102 M76 50 L60 66' stroke='#FDE047' stroke-width='2.5'/>")
    return small_module(x, y, s, '#1D4ED8', 110, 84, p, pins=5)


def rtc_module(x, y, s=1):
    p = ("<circle cx='92' cy='44' r='26' fill='#CBD5E1' stroke='#64748B' stroke-width='2'/>"
         f"{text(92, 48, 'CR2032', 8, '#334155', 800)}" + chip(14, 20, 40, 24, 8) + text(34, 66, 'DS3231', 9, '#E0F2FE', 800))
    return small_module(x, y, s, '#1E3A8A', 130, 88, p, pins=4)


def heart_sensor(x, y, s=1):
    return g(x, y, s, "<circle r='40' fill='#16A34A' stroke='#14532D' stroke-width='2'/><circle r='12' fill='#F8FAFC'/>"
                      + heart(0, -18, .35, '#F8FAFC') + "<circle cx='0' cy='0' r='7' fill='#86EFAC'/>")


def fp_reader(x, y, s=1):
    return g(x, y, s, "<rect width='160' height='110' rx='14' fill='#1F2937' stroke='#0F172A' stroke-width='2'/>"
                      "<rect x='30' y='18' width='100' height='74' rx='8' fill='#0EA5E9' opacity='.35' stroke='#38BDF8' stroke-width='2'/>"
                      + fingerprint(80, 46, 1.05, '#E0F2FE'))


def gsm_module(x, y, s=1):
    p = ("<rect x='14' y='14' width='56' height='50' rx='3' fill='#CBD5E1' stroke='#94A3B8'/>"
         f"{text(42, 44, 'SIM800L', 8, '#334155', 800)}<rect x='80' y='24' width='26' height='34' rx='3' fill='#D4AF37'/>"
         "<path d='M108 14 c10 -10 10 -30 -2 -40' stroke='#111827' stroke-width='3' fill='none'/>")
    return small_module(x, y, s, '#0F172A', 120, 80, p, pins=5)


def sms_bubble(x, y, msg='ALERT: motion', s=1):
    w = 30 + len(msg) * 8
    return g(x, y, s, f"<rect width='{w}' height='46' rx='14' fill='#22C55E'/><path d='M18 46 L12 62 L34 46 Z' fill='#22C55E'/>"
                      f"{text(w / 2, 29, msg, 13, '#FFFFFF', 700)}")


def pump(x, y, s=1):
    return g(x, y, s, "<rect width='70' height='44' rx='10' fill='#1F2937'/><rect x='70' y='14' width='26' height='14' fill='#64748B'/>"
                      "<rect x='8' y='-10' width='14' height='10' fill='#64748B'/>")


def chute(x, y, s=1):
    return g(x, y, s, "<path d='M0 0 L150 90 L170 74 L20 -16 Z' fill='#CBD5E1' stroke='#64748B' stroke-width='3'/>")


def floorplan(x, y, w, h):
    return (f"<rect x='{x}' y='{y}' width='{w}' height='{h}' fill='#FFFFFF' stroke='#0B1F44' stroke-width='6'/>"
            f"<path d='M{x + w * .45} {y} V{y + h * .45} M{x + w * .45} {y + h * .65} V{y + h} M{x} {y + h * .55} H{x + w * .25} M{x + w * .7} {y + h * .4} H{x + w}' stroke='#0B1F44' stroke-width='6'/>"
            f"<rect x='{x + w * .08}' y='{y + h * .1}' width='{w * .22}' height='{h * .2}' fill='#CBD5E1'/>"
            f"<rect x='{x + w * .62}' y='{y + h * .66}' width='{w * .26}' height='{h * .22}' fill='#CBD5E1'/>")


def twin_bot(x, y, s=1):
    b = ("<rect x='-90' y='-60' width='180' height='120' rx='20' fill='#0EA5E9' stroke='#075985' stroke-width='3'/>"
         "<rect x='-60' y='-40' width='120' height='70' rx='12' fill='#0B1F44'/><circle cx='-26' cy='-6' r='10' fill='#22D3EE'/><circle cx='26' cy='-6' r='10' fill='#22D3EE'/>"
         "<rect x='-110' y='-50' width='22' height='100' rx='8' fill='#111827'/><rect x='88' y='-50' width='22' height='100' rx='8' fill='#111827'/>"
         f"{text(0, 50, 'TWIN BOT', 11, '#E0F2FE', 800)}")
    return g(x, y, s, b)


def smorphi(x, y, s=1):
    modules = ''.join(f"<rect x='{-130 + i * 88}' y='-60' width='84' height='120' rx='14' fill='#F8FAFC' stroke='#334155' stroke-width='3'/>"
                      f"<rect x='{-118 + i * 88}' y='-44' width='60' height='88' rx='8' fill='#E2E8F0'/>" for i in range(3))
    wheels = ''.join(mecanum_wheel(cx, cy, .6, flip=(i % 2 == 1)) for i, (cx, cy) in enumerate([(-130, -64), (-130, 64), (122, -64), (122, 64)]))
    return g(x, y, s, wheels + modules + "<circle cx='-4' cy='0' r='14' fill='#22D3EE'/>" + text(-4, 34, 'SMORPHI', 12, '#0B1F44', 800))
