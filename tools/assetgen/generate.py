#!/usr/bin/env python3
"""AiSlopcraft ORIGINAL pixel art, font atlas and sound effects.

Deterministic artwork authored as small illustrations with material-specific
forms (masonry joints, fibers, growth stages, tool silhouettes, food shapes,
ore clusters, etc.), not repainted Minecraft assets. Some rare registry tiles
still use provisional illustrative icons; see assets/tiles/coverage.tsv.

Requires Pillow (pip install Pillow). Run after `dump_tiles > assets/tiles/list.txt`.
"""
from __future__ import annotations
from pathlib import Path
import hashlib
import math
import wave
import struct
import random
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets"
TILE = 16
COLS = 32
C = {
    "white": (237, 231, 211), "orange": (223, 121, 57), "magenta": (194, 89, 169),
    "light_blue": (113, 171, 213), "yellow": (226, 198, 72), "lime": (130, 184, 58),
    "pink": (229, 152, 170), "gray": (75, 81, 89), "silver": (151, 157, 157),
    "cyan": (61, 156, 163), "purple": (132, 83, 168), "blue": (64, 98, 174),
    "brown": (126, 85, 51), "green": (83, 139, 67), "red": (192, 68, 60),
    "black": (43, 43, 49),
}
WOOD = {"oak": (161, 119, 67), "spruce": (104, 75, 56), "birch": (198, 185, 142),
        "jungle": (155, 108, 71), "acacia": (187, 100, 64), "big_oak": (86, 62, 52)}
ORE = {"coal": (42, 48, 53), "iron": (204, 155, 120), "gold": (244, 203, 70),
       "diamond": (75, 215, 206), "redstone": (220, 62, 54), "lapis": (57, 92, 209),
       "emerald": (58, 195, 124), "quartz": (226, 213, 199)}
MAT = {"wood": (170, 117, 68), "stone": (143, 151, 155), "iron": (199, 208, 213),
       "diamond": (86, 222, 213), "gold": (241, 196, 60), "leather": (146, 99, 69),
       "chainmail": (164, 177, 177), "golden": (236, 188, 63)}

def mix(a, b, t):
    return tuple(max(0, min(255, int(a[i] * (1-t) + b[i]*t))) for i in range(3))
def shade(color, value):
    return tuple(max(0, min(255, int(v * value))) for v in color[:3])
def solid(color, alpha=255):
    return (*color[:3], alpha)
def seed(name):
    return int.from_bytes(hashlib.blake2s(name.encode(), digest_size=8).digest(), 'big')
def img(bg=(0, 0, 0, 0)):
    return Image.new('RGBA', (TILE, TILE), bg)
def speck(draw, rng, box, colors, count=12):
    x0, y0, x1, y1 = box
    for _ in range(count):
        x = rng.randrange(x0, x1); y = rng.randrange(y0, y1)
        draw.rectangle((x, y, min(x1-1, x+rng.randrange(1,3)), y), fill=solid(rng.choice(colors)))

def earth(name, top=None):
    r = random.Random(seed(name)); image = img(solid((104, 78, 55))); d = ImageDraw.Draw(image)
    # Thin strata, mineral chips and dark loam clods; all positions deliberately layered.
    d.line([(0,3),(4,4),(7,3),(12,4),(15,3)], fill=solid((74,57,43)), width=1)
    d.line([(0,10),(5,9),(8,10),(13,9),(15,10)], fill=solid((77,57,41)), width=1)
    for box in [(2,5,4,7),(10,6,13,8),(5,12,8,14),(13,13,15,15),(0,0,2,1)]:
        d.rectangle(box, fill=solid((128, 96, 67)))
    for box in [(3,6,4,7),(11,6,12,7),(6,12,7,13)]: d.rectangle(box, fill=solid((153,115,79)))
    speck(d,r,(0,1,16,16),[(149,111,76),(66,53,42),(125,93,64)],8)
    if name == 'dirt_coarse':
        for x,y in [(1,4),(8,2),(13,8),(5,11)]:
            d.polygon([(x,y),(x+2,y-1),(x+3,y+1),(x+1,y+2)],fill=solid((157,144,122)))
    if top == 'grass':
        # Distinct clusters of blades and an underlayer of dark sod.
        d.rectangle((0,0,15,3),fill=solid((91,136,53)))
        for x in [0,3,6,9,12,15]:
            d.line((x,2,x,0 if x%3 else 1),fill=solid((134,175,64)))
            d.point((min(15,x+1),1),fill=solid((57,104,46)))
    if top == 'podzol':
        d.rectangle((0,0,15,3),fill=solid((99,71,47)))
        for x in [1,4,9,12]: d.line((x,0,x+2,1),fill=solid((135,104,69)))
    return image

def grass_top(name):
    # This tile is biome-tinted in the shader. Neutral luminance is essential:
    # multiplying green artwork by green foliage tint made the ground black-green.
    image = img(solid((221, 221, 221))); d=ImageDraw.Draw(image)
    for x,y in [(0,2),(5,0),(11,1),(3,6),(9,5),(14,6),(0,11),(7,10),(12,12),(3,15)]:
        d.polygon([(x,y+1),(x+1,y),(x+3,y),(x+2,y+2)],fill=solid((238,238,238)))
        d.point((min(15,x+1),min(15,y+2)),fill=solid((194,194,194)))
    for x,y in [(4,2),(13,4),(5,9),(10,15)]: d.line((x,y,x,y+2),fill=solid((205,205,205)))
    return image

def stone(name):
    r=random.Random(seed(name));base=(137,143,150)
    if name.startswith('bedrock'): base=(78,81,87)
    if name.startswith('end_stone'): base=(211,208,166)
    if name.startswith('netherrack'): base=(114,56,59)
    if name.startswith('soul_sand'): base=(103,77,64)
    if name.startswith('clay') or 'hardened_clay' in name: base=(164,122,103)
    image=img(solid(base));d=ImageDraw.Draw(image)
    # Geometric plates and fracture lines, not independent per-pixel noise.
    d.polygon([(0,0),(8,0),(6,3),(0,4)],fill=solid(mix(base,(245,240,232),.10)))
    d.polygon([(9,2),(15,0),(15,7),(10,6)],fill=solid(shade(base,.82)))
    d.polygon([(0,8),(4,6),(8,8),(7,15),(1,15)],fill=solid(shade(base,.89)))
    d.line([(3,0),(4,3),(7,4),(8,7)],fill=solid(shade(base,.72)))
    d.line([(10,10),(8,11),(9,14),(12,15)],fill=solid(mix(base,(237,234,226),.23)))
    speck(d,r,(0,0,16,16),[shade(base,.76),mix(base,(250,248,245),.18)],10)
    return image

def cobble(name):
    moss='mossy' in name
    base=(100,111,105) if moss else (128,134,139)
    image=img(solid(shade(base,.56)));d=ImageDraw.Draw(image)
    stones=[[(0,0),(5,0),(7,2),(6,5),(2,6),(0,4)],[(8,0),(15,0),(15,4),(13,6),(8,5),(7,3)],
            [(0,7),(4,6),(7,8),(7,11),(5,13),(0,12)],[(9,7),(13,7),(15,9),(15,15),(10,15),(8,12)],
            [(0,14),(4,14),(5,15),(0,15)]]
    for j,points in enumerate(stones):
        c=mix(base,(239,236,224),[.08,.18,.02,.13,.07][j]);d.polygon(points,fill=solid(c))
        d.line(points[:2],fill=solid(mix(c,(255,255,255),.23)))
    if moss:
        for x,y in [(3,3),(11,5),(2,10),(14,12)]:
            d.rectangle((x,y,x+2,y+1),fill=solid((72,130,72)))
            d.point((x+1,y),fill=solid((113,151,68)))
    return image

def brick(name):
    base=(145,73,65) if name=='brick' else ((116,118,116) if 'stonebrick' in name else (83,54,61))
    grout=(57,54,51)
    image=img(solid(grout));d=ImageDraw.Draw(image)
    for row in range(4):
        y=row*4; off=(row%2)*4
        for x in range(-8+off,16,8):
            if x+7<0 or x+1>15: continue
            d.rectangle((max(0,x+1),y+1,min(15,x+7),y+3),fill=solid(mix(base,(250,235,209),((row+x//8)%3)*.07)))
            d.line((max(0,x+1),y+1,min(15,x+5),y+1),fill=solid(mix(base,(255,245,225),.22)))
    if 'mossy' in name:
        for x,y in [(2,5),(12,8),(8,13)]:d.line((x,y,x+2,y+1),fill=solid((84,141,74)),width=2)
    if 'cracked' in name: d.line([(11,1),(9,4),(11,7),(7,9),(6,13)],fill=solid((52,55,56)))
    if 'carved' in name: d.rectangle((5,5,10,10),outline=solid((78,78,76)),width=1)
    return image

def planks(name):
    species=next((key for key in WOOD if key in name), 'oak');base=WOOD[species]
    image=img(solid(base));d=ImageDraw.Draw(image)
    for y,offset in [(0,0),(4,6),(8,1),(12,8)]:
        d.line((0,y,15,y),fill=solid(shade(base,.63)))
        d.line((0,y+1,15,y+1),fill=solid(mix(base,(252,226,181),.20)))
        d.line((offset,y+1,offset,y+3),fill=solid(shade(base,.69)))
        for x in [2+offset%4,9+offset%3]:
            d.line((x,y+2,min(15,x+3),y+2),fill=solid(shade(base,.84)))
    return image

def log(name):
    species=next((key for key in WOOD if key in name), 'oak');base=WOOD[species]
    image=img(solid(shade(base,.68)));d=ImageDraw.Draw(image)
    if name.endswith('_top'):
        d.rectangle((1,1,14,14),fill=solid(mix(base,(241,218,172),.23)))
        for t in [(3,3,12,12),(5,5,10,10),(7,7,8,8)]:d.rectangle(t,outline=solid(shade(base,.72)))
        d.line((0,0,2,0),fill=solid(shade(base,.46)))
    else:
        for x in [1,4,7,10,13,15]:
            d.line((x,0,x+(-1 if x%2 else 1),7),fill=solid(shade(base,.49)))
            d.line((x+1,9,x,15),fill=solid(mix(base,(253,224,173),.14)))
        if species=='birch':
            for x,y in [(2,3),(10,2),(5,10),(13,12)]:
                d.rectangle((x,y,x+2,y+1),fill=solid((53,51,49)))
    return image

def leaves(name):
    # Fancy leaves use binary cutouts (not alpha-blended glass). Grayscale
    # artwork is multiplied by the biome's foliage colour exactly once.
    species=next((key for key in sorted(WOOD,key=len,reverse=True) if key in name), 'oak')
    value={'oak':218,'spruce':204,'birch':230,'jungle':220,
           'acacia':213,'big_oak':207}[species]
    background=value-28
    image=img(solid((background,background,background)));d=ImageDraw.Draw(image)
    rng=random.Random(seed(name))
    # Overlapping diagonal leaf clusters give depth without random pixel noise.
    for row in range(5):
        for col in range(5):
            x=col*4+(row%2)-1;y=row*4-2+rng.randrange(2)
            tone=max(175,min(249,value+rng.randrange(22)-8))
            d.polygon([(x,y+1),(x+2,y),(x+3,y+1),(x+2,y+2),(x,y+3)],
                      fill=solid((tone,tone,tone)))
            shadow=max(160,tone-33)
            d.line((x+1,y+2,x+2,y+2),fill=solid((shadow,shadow,shadow)))
    # Small gaps, not the old mostly-transparent disconnected leaf squares.
    for x,y in [(1,2),(7,0),(12,3),(4,5),(9,6),(0,9),
                (14,8),(6,11),(11,12),(2,14),(15,15)]:
        d.rectangle((x,y,min(15,x+1),min(15,y+1)),fill=(0,0,0,0))
    return image

def ore(name):
    kind=next((x for x in ORE if name.startswith(x+'_ore')), 'coal')
    image=stone('stone');d=ImageDraw.Draw(image)
    color=ORE[kind];dark=shade(color,.52)
    # Embedded faceted clusters: arranged composition, not random colored dots.
    for x,y,size in [(2,3,3),(9,2,3),(5,10,4),(12,11,2)]:
        d.polygon([(x,y+1),(x+size-1,y),(x+size+1,y+2),
                   (x+size,y+size),(x,y+size)],fill=solid(dark))
        d.polygon([(x+1,y+1),(x+size-1,y),(x+size,y+2),(x+1,y+size-1)],fill=solid(color))
        d.point((x+1,y+1),fill=solid(mix(color,(255,255,255),.55)))
    return image

def block_metal(name):
    kind=next((k for k in ORE if name.startswith(k)), 'iron')
    base=ORE.get(kind,(174,175,172));image=img(solid(shade(base,.78)));d=ImageDraw.Draw(image)
    d.rectangle((1,1,14,14),fill=solid(base),outline=solid(shade(base,.56)))
    d.rectangle((3,3,12,12),outline=solid(mix(base,(255,255,255),.34)))
    d.polygon([(4,9),(7,5),(10,6),(12,10),(8,12)],fill=solid(mix(base,(255,255,255),.22)))
    d.line((2,13,13,13),fill=solid(shade(base,.7)))
    return image

def sand(name):
    red='red_' in name or 'mesa' in name
    base=(171,91,63) if red else (215,195,143)
    image=img(solid(base));d=ImageDraw.Draw(image)
    for j,points in enumerate([[(0,3),(4,2),(9,4),(15,3)],[(0,9),(5,7),(11,9),(15,8)],
                                [(0,14),(7,12),(15,14)]]):
        d.line(points,fill=solid(shade(base,.83 if j%2 else 1.12)),width=1)
    for x,y in [(2,5),(7,1),(12,6),(4,11),(11,13)]:d.point((x,y),fill=solid(shade(base,.75)))
    if 'sandstone' in name:
        for y in [4,10]: d.line((0,y,15,y),fill=solid(shade(base,.75)))
        if 'carved' in name: d.arc((4,3,12,12),0,340,fill=solid(shade(base,.64)))
    return image

def glass(name):
    color=next((C[k] for k in sorted(C,key=len,reverse=True) if name.endswith('_'+k)),(198,223,226))
    image=img((*color,51));d=ImageDraw.Draw(image)
    d.rectangle((0,0,15,15),outline=(*shade(color,.64),235),width=1)
    d.line((2,1,6,1),fill=(*mix(color,(255,255,255),.75),221))
    d.line((1,2,1,6),fill=(*mix(color,(255,255,255),.6),213))
    d.line((11,14,14,11),fill=(*shade(color,.72),158))
    return image

def wool(name):
    color=next((C[k] for k in sorted(C,key=len,reverse=True) if name.endswith('_'+k)),C['white'])
    image=img(solid(shade(color,.84)));d=ImageDraw.Draw(image)
    # Interlocking woven tufts and diagonal weave.
    for y in range(0,16,4):
        for x in range((y//4)%2*2,16,4):
            d.rectangle((x,y,min(15,x+2),min(15,y+2)),fill=solid(color))
            d.line((x,min(15,y+3),min(15,x+2),min(15,y+3)),fill=solid(shade(color,.62)))
    return image

def crop(name):
    image=img();d=ImageDraw.Draw(image)
    stage=int(name.rsplit('_',1)[-1]) if name.rsplit('_',1)[-1].isdigit() else 3
    h=2+stage*2 if 'wheat' in name else 3+stage*3
    h=min(14,h);green=(89,158,64);gold=(197,166,68)
    col=mix(green,gold,stage/8 if 'wheat' in name else stage/5)
    for x in (3,7,12):
        d.line((x,15,x,15-h),fill=solid(shade(col,.72)),width=1)
        for dy in range(2,h,3):
            d.polygon([(x,15-dy),(x-2,14-dy),(x-3,13-dy),(x,14-dy)],fill=solid(col))
            if stage>2: d.line((x,15-dy,x+2,14-dy),fill=solid(mix(col,(231,225,112),.24)))
    if 'carrot' in name or 'potato' in name:
        for x in (3,7,12):d.rectangle((x-1,14,x+1,15),fill=solid((191,102,55) if 'carrot' in name else (180,146,91)))
    return image

def plant(name):
    image=img();d=ImageDraw.Draw(image)
    if name.startswith('sapling'):
        d.line((8,15,8,6),fill=solid((105,83,52)),width=2)
        for x,y in [(4,5),(10,4),(3,9),(11,9)]:
            d.polygon([(8,y+3),(x,y),(x+2,y+1)],fill=solid((66,142,65)))
            d.line((x,y,x+1,y),fill=solid((140,190,83)))
    elif name.startswith(('double_plant_grass','double_plant_fern')):
        for x in (3,7,11):
            d.line((x,15,8,2 if x==7 else 5),fill=solid((206,206,206)),width=2)
            d.line((8,11,x,9),fill=solid((231,231,231)))
        if 'fern' in name:
            for y in (6,9,12): d.line((4,y,12,y-1),fill=solid((189,189,189)))
    elif 'flower' in name or 'double_plant' in name:
        d.line((8,15,8,7),fill=solid((68,130,66)))
        d.polygon([(8,13),(4,11),(5,10),(8,11)],fill=solid((102,161,67)))
        # Each flower has a distinct size, petal geometry, palette and center.
        petals={'dandelion':(227,199,73),'poppy':(207,76,73),'blue_orchid':(83,154,211),
                'allium':(172,112,190),'houstonia':(218,221,213),'tulip':(218,101,86),
                'oxeye':(231,225,204),'sunflower':(231,172,55),'rose':(207,72,92),
                'syringa':(190,138,195),'paeonia':(232,130,155)}
        key=next((k for k in petals if k in name),'dandelion');col=petals[key]
        if 'tulip_orange' in name:col=(230,138,68)
        if 'tulip_white' in name:col=(228,226,209)
        if 'tulip_pink' in name:col=(231,146,171)
        for a,b in [(6,4),(10,4),(5,7),(11,7),(7,2),(9,2)]:
            d.rectangle((a,b,a+2,b+2),fill=solid(col))
            d.point((a,b),fill=solid(mix(col,(255,255,255),.45)))
        d.rectangle((7,5,9,7),fill=solid((159,105,51) if key=='sunflower' else (247,204,88)))
    elif name in ('tallgrass','fern','vine','deadbush'):
        c=(218,218,218) if name!='deadbush' else (147,118,73)
        for x in [3,7,11]:
            d.line((x,15,8,6 if x!=7 else 3),fill=solid(c),width=1)
            d.line((8,9,x,10),fill=solid((191,191,191) if name!='deadbush' else (172,141,95)))
        if name=='fern':
            for y in [7,10,13]:d.line((5,y,11,y-1),fill=solid(c))
    elif name=='waterlily':
        d.ellipse((1,2,14,14),fill=solid((222,222,222)))
        d.polygon([(8,8),(15,4),(15,0)],fill=(0,0,0,0))
        d.line((2,10,6,12),fill=solid((187,187,187)))
    elif name=='reeds':
        for x in (4,8,12):
            d.line((x,15,x,1 if x==8 else 4),fill=solid((219,219,219)),width=2)
            d.line((x,9,x+2,7),fill=solid((192,192,192)))
    else:
        d.line((8,15,8,4),fill=solid((77,137,62)),width=2)
        d.ellipse((3,3,12,9),fill=solid((115,165,70)))
    return image

def water_lava(name,frame=0):
    lava='lava' in name or 'fire' in name
    portal='portal' in name
    base=(213,101,44) if lava else ((113,63,160) if portal else (56,124,171))
    image=img((*base,232 if lava else 178));d=ImageDraw.Draw(image)
    shift=frame%8
    if portal:
        for x,y in [(2,3),(11,2),(7,9),(14,13),(2,14)]:
            yy=(y+shift*2)%16
            d.polygon([(x,yy),(x+2,yy+1),(x,yy+3)],fill=(188,111,224,216))
            d.point((x+1,min(15,yy+1)),fill=(230,157,244,240))
    elif lava:
        for cx,cy in [(2,2),(11,0),(5,10),(13,12)]:
            y=(cy+shift*2)%16
            d.polygon([(cx-2,y+2),(cx,y),(cx+3,y+1),(cx+4,y+4),(cx+1,y+6)],
                      fill=solid((239,146,50)))
            d.line((cx,y+2,cx+2,y+3),fill=solid((255,218,100)),width=2)
        d.line((0,6,15,5),fill=solid((126,57,42)))
    else:
        for y in [2,7,12]:
            yy=(y+shift)%16
            d.line([(0,yy),(3,yy-1),(7,yy),(11,yy-1),(15,yy)],fill=solid((126,185,217),201),width=1)
            d.line([(1,(yy+2)%16),(5,(yy+3)%16),(10,(yy+2)%16)],fill=solid((34,96,154),198))
    return image

def machinery(name):
    base=(125,128,126) if 'furnace' in name or 'dispenser' in name else (128,98,68)
    image=stone('stone') if base[0]==125 else planks('planks_oak')
    d=ImageDraw.Draw(image)
    if 'furnace' in name or 'dropper' in name or 'dispenser' in name:
        d.rectangle((3,3,12,12),fill=solid((59,62,63)),outline=solid((175,175,168)))
        if 'on' in name or 'lit' in name:
            d.polygon([(5,11),(7,8),(6,6),(9,3),(10,7),(11,11)],fill=solid((240,133,50)))
            d.line((8,8,9,10),fill=solid((255,214,92)))
        elif 'dropper' in name or 'dispenser' in name:
            d.rectangle((6,6,9,9),fill=solid((180,180,168)))
    elif 'crafting' in name:
        d.rectangle((1,1,14,14),outline=solid((82,61,42)),width=2)
        for x in (4,8,12):d.line((x,2,x,13),fill=solid((172,139,88)))
        d.line((2,6,13,6),fill=solid((81,61,43)))
    elif 'chest' in name:
        d.rectangle((1,2,14,14),fill=solid((158,109,61)),outline=solid((73,56,42)),width=2)
        d.line((1,6,14,6),fill=solid((70,54,45)),width=2)
        d.rectangle((7,5,9,9),fill=solid((227,188,91)),outline=solid((91,71,47)))
    elif 'tnt' in name:
        d.rectangle((0,5,15,12),fill=solid((215,66,60)))
        d.rectangle((1,0,14,4),fill=solid((228,217,181)))
        d.rectangle((1,13,14,15),fill=solid((229,215,182)))
        d.text((2,5),'!',fill=solid((253,234,195)))
    else:
        d.rectangle((3,3,12,12),fill=solid((90,70,51)),outline=solid((214,188,126)))
        d.rectangle((6,6,9,9),fill=solid((172,153,102)))
    return image

def tool(name):
    mat=next((m for m in MAT if name.startswith(m+'_')), 'iron')
    metal=MAT[mat];shadow=shade(metal,.58)
    image=img();d=ImageDraw.Draw(image)
    # Handle rises from lower left to upper right; distinct heads for each tool.
    d.line((2,14,10,6),fill=solid((74,51,41)),width=3)
    d.line((3,13,10,6),fill=solid((173,119,65)),width=1)
    d.point((2,14),fill=solid((214,168,96)))
    if '_sword' in name:
        d.polygon([(8,7),(13,1),(15,0),(14,4),(10,8)],fill=solid(metal))
        d.line((12,2,14,1),fill=solid(mix(metal,(255,255,255),.57)))
        d.line((6,8,11,11),fill=solid(shadow),width=2)
    elif '_pickaxe' in name:
        d.polygon([(4,4),(12,1),(15,3),(11,4),(8,5),(6,7)],fill=solid(shadow))
        d.line((4,4,13,2),fill=solid(metal),width=2)
    elif '_axe' in name:
        d.polygon([(7,5),(9,1),(14,1),(15,4),(12,7),(10,6)],fill=solid(metal))
        d.line((10,2,14,2),fill=solid(mix(metal,(255,255,255),.42)))
        d.line((13,5,11,6),fill=solid(shadow))
    elif '_shovel' in name:
        d.polygon([(10,3),(13,1),(15,3),(14,7),(11,9),(9,7)],fill=solid(metal))
        d.line((12,2,14,3),fill=solid(mix(metal,(255,255,255),.43)))
    elif '_hoe' in name:
        d.polygon([(9,4),(15,2),(15,5),(11,6),(9,8)],fill=solid(metal))
        d.line((11,3,15,2),fill=solid(mix(metal,(255,255,255),.48)))
    return image

def armor(name):
    mat=next((m for m in MAT if name.startswith(m+'_')), 'iron')
    col=MAT[mat];image=img();d=ImageDraw.Draw(image)
    if 'helmet' in name:
        d.polygon([(3,9),(3,5),(6,2),(10,2),(13,5),(13,9),(11,9),(10,12),(6,12),(5,9)],fill=solid(col))
        d.rectangle((6,7,10,8),fill=solid(shade(col,.46)))
    elif 'chestplate' in name:
        d.polygon([(4,2),(7,4),(9,4),(12,2),(15,5),(12,7),(11,14),(5,14),(4,7),(1,5)],fill=solid(col))
        d.line((8,5,8,13),fill=solid(shade(col,.75)))
    elif 'leggings' in name:
        d.polygon([(3,2),(13,2),(13,8),(11,14),(8,14),(8,7),(7,14),(4,14),(3,8)],fill=solid(col))
        d.line((4,3,12,3),fill=solid(shade(col,.65)))
    else:
        d.polygon([(3,5),(7,5),(7,10),(11,11),(12,13),(2,13),(2,10)],fill=solid(col))
        d.line((3,6,6,6),fill=solid(mix(col,(255,255,255),.4)))
    d.line((3,14,13,14),fill=solid(shade(col,.55)))
    return image

def food(name):
    image=img();d=ImageDraw.Draw(image)
    if 'apple' in name:
        col=(231,190,64) if 'golden' in name else (203,65,59)
        d.ellipse((2,4,13,13),fill=solid(shade(col,.68)))
        d.ellipse((3,3,12,12),fill=solid(col))
        d.rectangle((7,1,8,4),fill=solid((91,65,45)))
        d.polygon([(8,2),(11,1),(12,3),(9,4)],fill=solid((93,160,67)))
        d.line((4,6,5,5),fill=solid(mix(col,(255,255,255),.55)))
    elif 'fish' in name:
        col=(97,160,179) if 'raw' in name else (213,147,78)
        if 'salmon' in name: col=(219,115,106)
        if 'clown' in name: col=(229,149,61)
        if 'puffer' in name: col=(199,178,83)
        d.ellipse((3,5,13,11),fill=solid(col),outline=solid(shade(col,.63)))
        d.polygon([(3,8),(0,4),(0,12)],fill=solid(shade(col,.8)))
        d.point((11,7),fill=solid((29,39,42)))
        d.line((5,7,8,7),fill=solid(mix(col,(255,255,255),.6)))
        if 'clown' in name:
            for x in [6,9]: d.line((x,6,x,10),fill=solid((243,226,201)))
        if 'puffer' in name:
            for x in [5,8,11]:d.point((x,4),fill=solid((117,100,58)))
    elif 'bread' in name or 'cookie' in name or 'pie' in name:
        col=(202,149,76)
        d.ellipse((2,4,14,13),fill=solid(shade(col,.66)))
        d.ellipse((3,3,13,12),fill=solid(col))
        for x,y in [(5,6),(8,8),(10,5)]:d.rectangle((x,y,x+1,y+1),fill=solid((103,69,46)))
    elif 'carrot' in name:
        d.polygon([(4,3),(13,6),(9,14),(7,12)],fill=solid((230,135,60)))
        d.polygon([(5,4),(2,3),(5,6)],fill=solid((81,151,60)))
        d.line((8,6,12,7),fill=solid((245,188,93)))
    elif 'potato' in name:
        col=(156,139,92) if 'poisonous' not in name else (103,155,76)
        d.ellipse((3,4,13,12),fill=solid(col),outline=solid(shade(col,.65)))
        for x,y in [(6,6),(10,8),(8,11)]:d.point((x,y),fill=solid(shade(col,.54)))
    elif 'melon' in name:
        d.polygon([(2,3),(13,4),(10,13),(4,12)],fill=solid((192,70,63)))
        d.line((2,3,13,4),fill=solid((77,151,67)),width=2)
        for x,y in [(6,7),(9,9)]:d.point((x,y),fill=solid((71,53,47)))
    else:
        col=(172,96,74) if 'raw' in name or name in ('beef','porkchop','chicken') else (169,110,72)
        d.ellipse((3,4,13,12),fill=solid(col),outline=solid(shade(col,.68)))
        d.polygon([(4,7),(7,5),(10,6),(8,9)],fill=solid(mix(col,(255,255,255),.23)))
    return image

def icon(name):
    image=img();d=ImageDraw.Draw(image);r=random.Random(seed(name))
    if name in ('stick','bone','arrow','blaze_rod','string','fishing_rod','shears','flint_and_steel'):
        color=(173,125,76) if name in ('stick','fishing_rod') else (218,203,170)
        d.line((2,13,12,3),fill=solid(shade(color,.55)),width=3)
        d.line((3,12,12,3),fill=solid(color),width=1)
        if name=='arrow':d.polygon([(10,3),(14,1),(14,6)],fill=solid((163,169,166)))
        if name=='bone':d.ellipse((10,1,14,5),fill=solid(color))
        if name=='shears':d.line((2,2,13,12),fill=solid((182,200,208)),width=2)
    elif name.startswith('bucket') or name in ('bowl','cauldron'):
        d.polygon([(2,4),(13,4),(11,13),(4,13)],fill=solid((134,145,151)),outline=solid((62,78,89)))
        if 'water' in name:d.rectangle((4,6,11,9),fill=solid((58,141,192)))
        if 'lava' in name:d.rectangle((4,6,11,9),fill=solid((236,125,54)))
        if 'milk' in name:d.rectangle((4,6,11,9),fill=solid((242,236,221)))
        d.line((3,3,12,3),fill=solid((228,232,225)),width=1)
    elif 'door' in name:
        wood='wood' in name;c=(157,110,64) if wood else (173,184,189)
        d.rectangle((4,0,12,15),fill=solid(c),outline=solid(shade(c,.51)),width=1)
        d.rectangle((5,2,11,7),outline=solid(shade(c,.68)))
        d.point((10,9),fill=solid((233,200,112)))
    elif name.startswith('dye_powder_'):
        color=next((C[k] for k in sorted(C,key=len,reverse=True) if name.endswith(k)),(150,150,150))
        d.ellipse((2,7,13,14),fill=solid(shade(color,.58)))
        d.ellipse((3,6,12,12),fill=solid(color))
        for x,y in [(5,7),(9,6),(11,9)]:d.point((x,y),fill=solid(mix(color,(255,255,255),.55)))
    elif name in ('coal','charcoal','diamond','emerald','quartz','redstone','lapis','iron_ingot','gold_ingot','gold_nugget','brick','clay_ball'):
        color=ORE.get(name,(160,153,142))
        if 'iron' in name:color=MAT['iron']
        if 'gold' in name:color=MAT['gold']
        if name=='redstone':color=ORE['redstone']
        d.polygon([(2,11),(5,4),(11,2),(14,8),(9,13),(5,14)],fill=solid(shade(color,.58)))
        d.polygon([(4,10),(6,5),(11,3),(13,8),(9,11)],fill=solid(color))
        d.line((6,5,11,3),fill=solid(mix(color,(255,255,255),.6)))
    elif name in ('book_normal','paper','map','writable_book','written_book','enchanted_book','filled_map'):
        c=(217,204,158)
        d.polygon([(2,3),(8,1),(14,3),(14,13),(8,11),(2,13)],fill=solid(c),outline=solid((97,76,61)))
        d.line((8,2,8,11),fill=solid((80,69,59)))
        if name in ('enchanted_book','writable_book'):d.rectangle((10,5,11,8),fill=solid((124,78,158)))
    elif name in ('egg','snowball','ender_pearl','slime_ball','experience_bottle','spawn_egg'):
        color=(229,220,191)
        if 'ender' in name:color=(75,148,138)
        if 'slime' in name:color=(114,189,98)
        if 'experience' in name:color=(139,180,83)
        d.ellipse((3,3,12,13),fill=solid(color),outline=solid(shade(color,.64)))
        d.ellipse((5,5,7,7),fill=solid(mix(color,(255,255,255),.72)))
    elif name.startswith('seeds'):
        for x,y in [(3,11),(8,7),(11,12)]:
            d.ellipse((x,y,x+2,y+2),fill=solid((151,120,67)))
            d.point((x,y),fill=solid((208,168,94)))
    elif name in ('torch_on','redstone_torch_on','redstone_torch_off'):
        d.line((7,15,8,4),fill=solid((126,90,58)),width=3)
        d.polygon([(6,5),(8,1),(10,4),(9,8)],fill=solid((237,180,60) if 'redstone' not in name else (213,63,61)))
        d.point((8,3),fill=solid((255,235,152)))
    else:
        # Provisional icons are not considered visual parity. Still a deliberate
        # illustrated emblem (rim, inset symbol, highlight), never random noise.
        hue=(seed(name)%200)
        base=(75+hue//3,100+(hue*3)%80,130+(hue//2)%60)
        d.polygon([(8,1),(13,4),(14,10),(8,14),(2,10),(3,4)],fill=solid(shade(base,.54)))
        d.polygon([(8,2),(12,5),(12,10),(8,12),(4,10),(4,5)],fill=solid(base))
        d.line((5,5,8,3,11,5),fill=solid(mix(base,(255,255,255),.55)))
        mark=(sum(map(ord,name))%3)
        if mark==0:d.line((6,8,10,8),fill=solid(shade(base,.45)),width=2)
        elif mark==1:d.rectangle((7,6,9,9),fill=solid(shade(base,.43)))
        else:d.polygon([(7,6),(10,9),(6,9)],fill=solid(shade(base,.43)))
    return image

FOODS=('apple','bread','beef','porkchop','chicken','fish_','cookie','melon','carrot','potato','pie','stew','rotten_flesh','spider_eye')
MACHINES=('furnace','dispenser','dropper','crafting_table','chest','tnt_','noteblock','jukebox','hopper','piston','anvil')
STONES=('stone','bedrock','netherrack','end_stone','soul_sand','clay','hardened_clay','mycelium','obsidian','gravel','sponge','quartz_block')

def render_tile(name):
    if name == 'white': return img((255,255,255,255)),'custom'
    if name.startswith('hud_'):
        image=img();d=ImageDraw.Draw(image)
        if 'heart' in name:
            shape=[(1,4),(3,2),(6,2),(8,4),(10,2),(13,2),(15,4),(15,8),(8,15),(1,8)]
            d.polygon(shape,fill=(48,44,51,255))
            if not name.endswith('empty'):
                d.polygon([(2,4),(4,3),(6,3),(8,5),(10,3),(12,3),(14,4),(14,8),
                           (8,13),(2,8)],fill=(199,64,69,255))
                d.line((3,5,5,4),fill=(244,158,146,255),width=2)
        elif 'hunger' in name:
            d.polygon([(4,2),(9,1),(14,4),(14,9),(11,12),(8,12),(6,15),(2,12),
                       (4,10),(2,6)],fill=(57,50,49,255))
            if not name.endswith('empty'):
                d.polygon([(5,3),(9,2),(13,5),(13,9),(9,11),(7,13),(4,11),(5,9),
                           (3,6)],fill=(199,136,78,255))
                d.line((6,4,10,3),fill=(242,193,116,255))
        else:
            d.polygon([(8,1),(14,3),(13,11),(8,15),(3,11),(2,3)],fill=(142,172,178,255))
            d.line((8,4,8,11),fill=(227,238,224,255))
        return image,'custom'
    if name == 'missing':
        image=img((229,49,199,255));d=ImageDraw.Draw(image)
        for x in (0,8):
            for y in (0,8):
                if x==y:d.rectangle((x,y,x+7,y+7),fill=(31,29,35,255))
        return image,'custom'
    if name=='grass_side_overlay':
        image=img();d=ImageDraw.Draw(image);d.rectangle((0,0,15,2),fill=(230,230,230,255))
        for x,y in [(1,5),(4,4),(8,6),(11,4),(14,5)]:
            d.polygon([(x-1,2),(x+1,2),(x,y)],fill=(207,207,207,255))
        return image,'custom'
    if name=='grass_top':return grass_top(name),'custom'
    if name=='grass_side':return earth(name,'grass'),'custom'
    if name.startswith('dirt'):return earth(name,'podzol' if 'podzol' in name else None),'custom'
    if name.startswith('planks') or name.startswith('wooden_slab'):return planks(name),'custom'
    if name.startswith('log_'):return log(name),'custom'
    if name.startswith('leaves_'):return leaves(name),'custom'
    if name.endswith('_ore'):return ore(name),'custom'
    if name in ('stone','bedrock','netherrack','end_stone','soul_sand','clay','hardened_clay','obsidian','gravel','sponge'):
        return stone(name),'custom'
    if name.startswith('cobblestone') or name.startswith('stone_slab'):
        return cobble(name),'custom'
    if 'stonebrick' in name or name in ('brick','nether_brick'):
        return brick(name),'custom'
    if name in ('sand','red_sand') or name.startswith('sandstone'):
        return sand(name),'custom'
    if name.startswith('glass') or 'stained_glass' in name:
        return glass(name),'custom'
    if name.startswith('wool_colored_') or name.startswith('carpet_'):
        return wool(name),'custom'
    if name.startswith('hardened_clay_stained_'):
        image=stone('clay'); tint=next((C[k] for k in sorted(C,key=len,reverse=True) if name.endswith(k)),C['white'])
        tint_image=Image.new('RGBA',(16,16),solid(tint,90));return Image.alpha_composite(image,tint_image),'derived'
    if name.endswith('_block') and name.split('_')[0] in ORE:
        return block_metal(name),'custom'
    if name.startswith(('water_','lava_','fire_layer','portal')):
        return water_lava(name),'custom'
    if name.startswith(('flower_','sapling_','double_plant_')) or name in ('tallgrass','fern','vine','deadbush','waterlily','reeds'):
        return plant(name),'custom'
    if '_stage_' in name or name.startswith('nether_wart_stage'):
        return crop(name),'custom'
    if name.startswith('cactus'):
        image=img(solid((67,129,68)));d=ImageDraw.Draw(image)
        for x in [2,6,10,14]:d.line((x,0,x,15),fill=solid((41,104,65)),width=1)
        for x,y in [(3,4),(8,9),(11,2),(5,13)]:d.point((x,y),fill=solid((228,211,147)))
        return image,'custom'
    if name in ('snow','ice','ice_packed'):
        image=img(solid((231,239,233) if name=='snow' else (148,200,220)));d=ImageDraw.Draw(image)
        for line in [[(2,13),(8,8),(13,9)],[(1,4),(4,5),(8,2)],[(11,14),(14,11),(15,12)]]:
            d.line(line,fill=solid((254,255,254) if name=='snow' else (205,236,244)))
        return image,'custom'
    if any(name.startswith(n) for n in MACHINES):return machinery(name),'custom'
    if name.endswith(('_pickaxe','_axe','_shovel','_sword','_hoe')):
        return tool(name),'custom'
    if name.endswith(('_helmet','_chestplate','_leggings','_boots','_horse_armor')):
        return armor(name),'custom'
    if any(name.startswith(prefix) for prefix in FOODS):return food(name),'custom'
    if name.startswith('dye_powder_') or name in ('stick','bone','arrow','blaze_rod', 'string','fishing_rod_uncast',
        'shears','flint_and_steel','coal','charcoal','diamond','emerald','quartz','redstone_dust','iron_ingot',
        'gold_ingot','gold_nugget','brick','clay_ball','torch_on','redstone_torch_on','redstone_torch_off',
        'egg','snowball','ender_pearl','slime_ball','experience_bottle','spawn_egg','book_normal','paper','map',
        'writable_book','written_book','enchanted_book','filled_map','bucket_empty','bucket_water','bucket_lava',
        'bucket_milk','bowl','cauldron','door_wood','door_iron') or name.startswith('seeds_'):
        return icon(name),'custom'
    return icon(name),'provisional'

def generate_tiles():
    names=(ASSETS/'tiles/list.txt').read_text().splitlines()
    assert len(names)==len(set(names)) and names==sorted(names), 'list must be sorted and unique'
    rows=math.ceil(len(names)/COLS)
    atlas=Image.new('RGBA',(COLS*TILE,rows*TILE))
    coverage=[]
    for i,name in enumerate(names):
        art,status=render_tile(name)
        assert art.size==(16,16)
        atlas.paste(art,((i%COLS)*TILE,(i//COLS)*TILE))
        coverage.append(f'{name}\t{status}\n')
    (ASSETS/'atlas.tsv').write_text('# tile name\tindex (row-major 32 columns)\n'+
                                    ''.join(f'{n}\t{i}\n' for i,n in enumerate(names)))
    (ASSETS/'tiles/coverage.tsv').write_text('# tile name\tart status (not in-game verification)\n'+''.join(coverage))
    atlas.save(ASSETS/'atlas.png',optimize=True)
    animation_dir=ASSETS/'animations';animation_dir.mkdir(exist_ok=True)
    animated=[n for n in ('water_still','water_flow','lava_still','lava_flow','fire_layer_0','portal') if n in names]
    for name in animated:
        strip=Image.new('RGBA',(16,16*8))
        for frame in range(8):strip.paste(water_lava(name,frame),(0,frame*16))
        strip.save(animation_dir/f'{name}.png',optimize=True)
    (animation_dir/'manifest.tsv').write_text('# tile\tframes\tframe duration at 20Hz\n'+
        ''.join(f'{n}\t8\t{4 if n.startswith("water") else 3}\n' for n in animated))
    # 3x enlarged annotated studies, only for art QA, not gameplay screenshots.
    chosen=['grass_top','grass_side','dirt','dirt_coarse','dirt_podzol_top',
            'stone','cobblestone','planks_oak','log_oak','log_oak_top','leaves_oak',
            'coal_ore','iron_ore','diamond_ore','gold_block','brick','stonebrick',
            'sand','red_sand','sandstone_normal','glass','water_still','lava_still',
            'flower_poppy','flower_blue_orchid','wheat_stage_7','oak_sapling',
            'iron_pickaxe','diamond_sword','leather_chestplate','apple','fish_salmon_raw']
    chosen=[n for n in chosen if n in names]
    study=Image.new('RGBA',(8*96,math.ceil(len(chosen)/8)*115),(32,36,49,255))
    d=ImageDraw.Draw(study)
    for i,name in enumerate(chosen):
        tile=atlas.crop(((names.index(name)%COLS)*16,(names.index(name)//COLS)*16,
                         (names.index(name)%COLS+1)*16,(names.index(name)//COLS+1)*16))
        # Show the in-world result, not the untinted grayscale atlas source.
        tint=(136,199,92) if name=='grass_top' else ((122,214,84) if name.startswith('leaves_') else None)
        if tint:
            pixels=tile.load()
            for py in range(16):
                for px in range(16):
                    r,g,b,a=pixels[px,py]
                    pixels[px,py]=(r*tint[0]//255,g*tint[1]//255,b*tint[2]//255,a)
        tile=tile.resize((64,64),Image.Resampling.NEAREST)
        x=(i%8)*96+15;y=(i//8)*115+5
        study.paste(tile,(x,y),tile)
        # Pillow's built-in bitmap font is suitable for QA labels only.
        d.text((x-9,y+70),name[:16],fill=(222,226,223,255))
    (ASSETS/'previews').mkdir(exist_ok=True)
    study.save(ASSETS/'previews/art-study.png')
    print(f'Generated {len(names)} original tile illustrations: {atlas.width}x{atlas.height}; '
          f'{sum("provisional" in s for s in coverage)} provisional.')

def generate_font():
    source=ASSETS/'fonts/PressStart2P-Regular.ttf'
    font=ImageFont.truetype(str(source),10)
    atlas=Image.new('RGBA',(16*16,6*16),(0,0,0,0));d=ImageDraw.Draw(atlas)
    for n in range(32,127):
        x=(n-32)%16*16;y=(n-32)//16*16
        d.text((x+2,y+2),chr(n),font=font,fill=(255,255,255,255))
    atlas.save(ASSETS/'font_atlas.png')

def generate_sounds():
    path=ASSETS/'audio';path.mkdir(exist_ok=True)
    rate=22050
    specs={'break_stone':(.17,'crunch'),'break_wood':(.19,'knock'),
           'step_grass':(.13,'grass'),'step_stone':(.12,'crunch'),
           'place':(.10,'knock'),'pickup':(.17,'chirp'),'hurt':(.24,'hurt'),
           'click':(.07,'click'),'splash':(.27,'splash')}
    for name,(duration,kind) in specs.items():
        r=random.Random(seed('sound:'+name));samples=[]
        n=int(duration*rate)
        filter_state=0
        for i in range(n):
            t=i/rate;env=(1-i/n)**2
            white=r.random()*2-1
            filter_state=filter_state*.6+white*.4
            if kind=='chirp': val=math.sin(2*math.pi*(500*t+1700*t*t))*.42
            elif kind=='hurt':val=math.sin(2*math.pi*(240*t-250*t*t))*.34+filter_state*.12
            elif kind=='click':val=filter_state*.25+math.sin(2*math.pi*640*t)*.1
            elif kind=='splash':val=filter_state*.31+white*.11+math.sin(2*math.pi*93*t)*.07
            elif kind=='knock':val=filter_state*.34+math.sin(2*math.pi*120*t)*.21
            else:val=(white*.22+filter_state*.32) if kind=='crunch' else filter_state*.25+white*.09
            samples.append(int(max(-1,min(1,val*env))*32767))
        with wave.open(str(path/f'{name}.wav'),'wb') as f:
            f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate)
            f.writeframes(struct.pack('<'+'h'*len(samples),*samples))

if __name__=='__main__':
    generate_tiles();generate_font();generate_sounds()
