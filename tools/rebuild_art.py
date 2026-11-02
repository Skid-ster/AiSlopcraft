#!/usr/bin/env python3
"""Author-made 16px pixel textures for the *new* small rebuild study.

No Mojang/resource-pack files, external images or Pillow are used. Re-run this
script after editing the palettes/motifs. Outputs only assets/rebuild/atlas.png.
This is preliminary original art, NOT a matched 2013 reference texture set.
"""
from pathlib import Path
import struct
import zlib

W, H = 256, 16
pixels = bytearray(W * H * 4)


def paint(tile, x, y, color):
    if 0 <= x < 16 and 0 <= y < 16:
        i = (y * W + tile * 16 + x) * 4
        pixels[i:i + 4] = bytes((*color, 255) if len(color) == 3 else color)


def fleck(x, y, salt=0):
    value = (x * 6971 + y * 8191 + salt * 5471) & 0xFFFFFFFF
    value ^= value >> 9
    value = (value * 0x9E3779B1) & 0xFFFFFFFF
    return (value ^ value >> 11) & 255


for y in range(16):
    for x in range(16):
        # 0. Grass top: a few two-pixel tufts, not high-frequency confetti.
        shade = fleck(x // 2, y // 2, 1)
        grass = (105, 166, 68) if shade < 145 else (115, 173, 73)
        if shade < 29:
            grass = (82, 139, 56)
        if (x + 2 * y) % 17 == 0 and shade > 140:
            grass = (128, 183, 77)
        paint(0, x, y, grass)

        # 2. Dirt: broad mottling with deliberate small pebbles.
        dirt = (126, 91, 56)
        grain = fleck(x // 3, y // 2, 2)
        if grain < 52:
            dirt = (105, 76, 46)
        elif grain > 177:
            dirt = (145, 107, 68)
        if fleck(x, y, 3) < 11:
            dirt = (163, 117, 73)
        paint(2, x, y, dirt)

        # 1. Grass side: same dirt grain, thin mossy top and occasional roots.
        cap = y < 2 or (y == 2 and fleck(x // 2, 0, 9) < 175)
        cap |= y == 3 and x in (2, 3, 9, 13)
        paint(1, x, y, grass if cap else dirt)
        if not cap and y > 5 and fleck(x // 2, y // 3, 41) < 19:
            paint(1, x, y, (106, 128, 57))

        # 3. Stone: diffuse mid-grey chunks with low contrast dark/light cracks.
        stone_grain = fleck(x // 3, y // 3, 7)
        stone = (128, 128, 126) if stone_grain < 90 else (138, 137, 133)
        if stone_grain > 218:
            stone = (113, 115, 115)
        if fleck(x, y, 8) < 8:
            stone = (157, 157, 153)
        paint(3, x, y, stone)

        # 4. Log side: coarse vertical bark grain.
        stripe = (x + (y // 5) % 2) % 5
        bark = (111, 82, 52) if stripe == 0 else (138, 101, 63)
        if stripe == 4:
            bark = (156, 118, 72)
        if fleck(x // 2, y // 2, 16) < 30:
            bark = (91, 65, 40)
        paint(4, x, y, bark)

        # 5. Log top: squared growth rings and a darker bark perimeter.
        r = max(abs(x - 7.5), abs(y - 7.5))
        rings = [(91, 67, 45), (143, 108, 65), (173, 131, 80),
                 (139, 102, 61), (182, 143, 91)]
        log = rings[0] if r > 6.8 else rings[min(4, int(r) % 4 + 1)]
        paint(5, x, y, log)

        # 6. Fancy-leaf alpha cutout; the opaque pixels vary in clustered hue.
        hole = fleck(x // 2, y // 2, 19) < 42
        if x in (0, 15) and y in (0, 15):
            hole = True
        if not hole:
            hue = fleck(x // 3, y // 3, 23)
            leaf = ((62, 116, 42) if hue < 70 else
                    (85, 137, 53) if hue < 194 else (111, 153, 65))
            paint(6, x, y, leaf)

        # 7. Board planks; offset seam per row of boards.
        board = (177, 141, 88) if y % 6 < 3 else (171, 134, 82)
        if y % 6 == 5:
            board = (115, 87, 55)
        elif y % 6 == 0:
            board = (205, 166, 104)
        if x == (4 if y < 6 else 12 if y < 12 else 7) and y % 6 != 5:
            board = (122, 94, 59)
        paint(7, x, y, board)

        # 8. Cobble: deliberately readable large irregular stones/mortar.
        row = y // 5
        offset = (0, 3, 7, 1)[row]
        dx = (x + offset) % 7
        mortar = (y % 5 == 4 or dx == 0 or (y % 5 == 0 and dx < 2))
        stone_color = (79, 80, 79) if mortar else (
            (136, 138, 136) if fleck((x + offset) // 7, row, 11) & 1 else (155, 157, 154))
        if not mortar and (x + 2 * y) % 23 == 0:
            stone_color = (112, 113, 112)
        paint(8, x, y, stone_color)

        # 9. Sand: pale, low contrast, sparse dark grains.
        sand = (219, 210, 157) if fleck(x // 2, y // 2, 32) > 80 else (199, 189, 139)
        if fleck(x, y, 31) < 10:
            sand = (177, 164, 113)
        paint(9, x, y, sand)

# 10. Crossed grassy blades, cut out from transparency.
for y in range(5, 16):
    stem_x = 7 + (y // 3) % 2
    paint(10, stem_x, y, (70, 139, 47))
    if y in (6, 8, 10, 12):
        for d in range(1, 5):
            paint(10, max(0, stem_x - d), y - d // 2, (92, 154, 51))
    if y in (7, 9, 11):
        for d in range(1, 5):
            paint(10, min(15, stem_x + d), y - d // 2, (87, 143, 49))

# 11. Flower: yellow petals/amber center on a crisp green stem.
for y in range(8, 16):
    paint(11, 7, y, (77, 140, 42))
    if y in (11, 13):
        paint(11, 6, y, (107, 154, 55))
for y in range(3, 10):
    for x in range(4, 11):
        dx, dy = x - 7, y - 6
        if dx * dx + dy * dy <= 10:
            paint(11, x, y, (235, 200, 56) if (x + y) & 1 else (244, 219, 78))
for y in (5, 6, 7):
    for x in (6, 7, 8):
        paint(11, x, y, (164, 105, 44))


def chunk(tag, data):
    return (struct.pack('>I', len(data)) + tag + data +
            struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))

raw = b''.join(b'\x00' + pixels[y * W * 4:(y + 1) * W * 4] for y in range(H))
png = (b'\x89PNG\r\n\x1a\n' +
       chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0)) +
       chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
out = Path('assets/rebuild/atlas.png')
out.parent.mkdir(parents=True, exist_ok=True)
out.write_bytes(png)
print(f'{out}: {W}x{H}, {len(png)} bytes, 12 original material/plant tiles')
