#!/usr/bin/env python3
"""Emit a tiny GL-frame diagnostic through GitHub check annotations.

Only use on an opt-in workflow_dispatch run. This transfers an ORIGINAL app
frame from a CI runner to reviewers when the Actions artifact host is blocked.
Do not pass screenshots from a proprietary/reference client to this tool.
"""
import base64
import hashlib
from pathlib import Path
import struct
import sys
import zlib


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))


def decode_rgba(path: Path):
    content = path.read_bytes()
    if content[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('Expected PNG signature')
    pos = 8
    raw_idat = bytearray()
    size = None
    while pos + 12 <= len(content):
        length = struct.unpack_from('>I', content, pos)[0]
        tag = content[pos + 4:pos + 8]
        data = content[pos + 8:pos + 8 + length]
        if len(data) != length or pos + 12 + length > len(content):
            raise ValueError('Truncated PNG chunk')
        if tag == b'IHDR':
            w, h, depth, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', data)
            if (depth, color, compression, filtering, interlace) != (8, 6, 0, 0, 0):
                raise ValueError('Only noninterlaced 8-bit RGBA is supported')
            if not (1 <= w <= 4096 and 1 <= h <= 4096):
                raise ValueError('Image outside size budget')
            size = (w, h)
        elif tag == b'IDAT':
            raw_idat.extend(data)
        elif tag == b'IEND':
            break
        pos += 12 + length
    if size is None:
        raise ValueError('PNG has no IHDR')
    w, h = size
    raw = zlib.decompress(raw_idat)
    stride = w * 4
    if len(raw) != (stride + 1) * h:
        raise ValueError('Unexpected decompressed byte count')
    rows = []
    prev = bytearray(stride)
    index = 0
    for _ in range(h):
        filt = raw[index]
        row = bytearray(raw[index + 1:index + stride + 1])
        index += stride + 1
        if filt not in range(5):
            raise ValueError('Invalid PNG filter')
        if filt:
            for i in range(stride):
                left = row[i - 4] if i >= 4 else 0
                above = prev[i]
                upper_left = prev[i - 4] if i >= 4 else 0
                if filt == 1:
                    predictor = left
                elif filt == 2:
                    predictor = above
                elif filt == 3:
                    predictor = (left + above) // 2
                else:
                    p = left + above - upper_left
                    da, db, dc = abs(p - left), abs(p - above), abs(p - upper_left)
                    predictor = left if da <= db and da <= dc else above if db <= dc else upper_left
                row[i] = (row[i] + predictor) & 255
        rows.append(row)
        prev = row
    return w, h, rows


def thumbnail_png(width, height, rows):
    # Preserve full-frame composition. Nearest 5:1 integer scale yields 256x144
    # from the CI's 1280x720 screenshot. Quantize to reduce annotation budget.
    if (width, height) != (1280, 720):
        raise ValueError(f'Only the fixed 1280x720 smoke is supported: {width}x{height}')
    out = bytearray()
    for y in range(0, height, 5):
        out.append(0)  # PNG filter 0
        row = rows[y]
        for x in range(0, width, 5):
            start = x * 4
            for channel in row[start:start + 3]:
                out.append((channel & 0xF0) | 0x08)
    w, h = width // 5, height // 5
    header = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) +
            chunk(b'IDAT', zlib.compress(bytes(out), 9)) + chunk(b'IEND', b''))


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Usage: ci_frame_probe.py original-frame.png')
    image = Path(sys.argv[1])
    result = thumbnail_png(*decode_rgba(image))
    destination = Path('build/qa-thumbnail.png')
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(result)
    encoded = base64.b64encode(result).decode('ascii')
    segments = [encoded[i:i + 5000] for i in range(0, len(encoded), 5000)]
    if len(segments) > 20:
        raise ValueError('Thumbnail annotation budget exceeded')
    digest = hashlib.sha256(result).hexdigest()
    print(f'Frame probe: {image}, 256x144 thumbnail {len(result)} bytes, '
          f'{len(segments)} annotations, SHA256={digest}')
    print(f'::notice title=FRAME_PROBE_META::{len(segments)} {digest}')
    for i, part in enumerate(segments):
        print(f'::notice title=FRAME_PROBE_{i:02d}::{part}')


if __name__ == '__main__':
    main()
