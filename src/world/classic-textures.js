// Original, hand-authored 16px artwork inspired by Minecraft Beta's material
// language. These are generated locally; no Minecraft asset files are bundled.
import { TILES } from './blocks.js';

const SIZE = 16;
const hash = (x,y,seed=0) => {
  let n = Math.imul(x + 37, 374761393) + Math.imul(y + 71, 668265263) + Math.imul(seed + 1, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
const mod = (n, m) => ((n % m) + m) % m;
const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
const shade = (c,n) => c.map(v => clamp(v+n));

export function applyClassicTextures(ctx) {
  const put = (tile, draw) => {
    const img=ctx.createImageData(SIZE,SIZE);
    const pixel=(x,y,c,a=255) => {
      if (x<0 || x>=SIZE || y<0 || y>=SIZE) return;
      const i=(y*SIZE+x)*4;
      img.data[i]=c[0]; img.data[i+1]=c[1]; img.data[i+2]=c[2]; img.data[i+3]=a;
    };
    draw(pixel);
    ctx.putImageData(img,(tile%16)*SIZE,Math.floor(tile/16)*SIZE);
  };
  // Low-frequency pixel clusters plus restrained single-pixel variation.
  const grain = (x,y,seed=0) => {
    const patch=hash(Math.floor(x/2),Math.floor(y/2),seed);
    return Math.round((patch-.5)*13 + (hash(x,y,seed+40)-.5)*7);
  };
  const fill = (p,fn) => { for (let y=0;y<16;y++) for(let x=0;x<16;x++) { const c=fn(x,y); p(x,y,c); } };
  const stone = (x,y) => shade([125,125,125],grain(x,y,3));
  const dirt = (x,y) => {
    const speck=hash(x,y,13);
    return shade([132,96,67],grain(x,y,4)+(speck<.08?-15:speck>.96?9:0));
  };
  const grass = (x,y) => {
    const clump=hash(Math.floor(x/2),Math.floor(y/2),6);
    return shade([116,171,64],grain(x,y,6)+(clump<.18?-10:clump>.8?8:0));
  };
  put(TILES.stone,p=>fill(p,stone));
  put(TILES.dirt,p=>fill(p,dirt));
  put(TILES.grass_top,p=>fill(p,grass));
  const fringe=[3,3,4,4,3,3,5,4,3,3,4,3,5,4,3,3];
  put(TILES.grass_side,p=>fill(p,(x,y)=>y<fringe[x] ? shade(grass(x,y),y===fringe[x]-1?-16:0) : dirt(x,y)));

  // Irregular, interlocking stones rather than overlapping rectangles.
  const cobble = (x,y,moss=false) => {
    let best=Infinity, next=Infinity, index=0, localY=0;
    for(let gy=-1;gy<=4;gy++) for(let gx=-1;gx<=4;gx++) {
      const sx=gx*4+1.5+(hash(mod(gx,4),mod(gy,4),11)-.5)*2;
      const sy=gy*4+1.5+(hash(mod(gx,4),mod(gy,4),12)-.5)*2;
      const d=(x-sx)**2+(y-sy)**2;
      if (d<best) { next=best; best=d; index=mod(gx,4)+mod(gy,4)*4; localY=y-sy; }
      else if(d<next) next=d;
    }
    const border=next-best<2.9;
    const base=border ? [76,76,76] : [122,122,122];
    const v=grain(x,y,8)+(hash(index,0,9)-.5)*20+(localY<0?5:-2);
    if(moss && (hash(Math.floor(x/2),Math.floor(y/2),25)>.62 || (border && hash(x,y,26)>.54))) return shade([77,105,54],v*.4);
    return shade(base,v);
  };
  put(TILES.cobble,p=>fill(p,(x,y)=>cobble(x,y)));
  put(TILES.mossy_cobble,p=>fill(p,(x,y)=>cobble(x,y,true)));
  put(TILES.bedrock,p=>fill(p,(x,y)=>shade([74,74,74],grain(x,y,17)+(hash(Math.floor(x/3),Math.floor(y/2),18)-.5)*70)));
  put(TILES.sand,p=>fill(p,(x,y)=>shade([219,207,163],grain(x,y,20))));
  put(TILES.gravel,p=>fill(p,(x,y)=>shade([132,126,122],grain(x,y,22)+(hash(Math.floor(x/2),Math.floor(y/2),21)-.5)*28)));
  put(TILES.log_side,p=>fill(p,(x,y)=>{
    const stripe=[-20,4,8,-5,-22,-3,7,3,-15,5,8,-7,-20,1,9,-4][x];
    return shade([105,82,53],stripe+grain(x,y,30));
  }));
  put(TILES.log_top,p=>fill(p,(x,y)=>{
    const edge=Math.min(x,y,15-x,15-y);
    const ring=Math.max(Math.abs(x-7.5),Math.abs(y-7.5));
    const base=edge===0?[94,71,43]:(ring>5.2&&ring<6.5)||(ring>2.7&&ring<3.8)?[142,114,72]:[174,145,94];
    return shade(base,grain(x,y,31));
  }));
  put(TILES.planks,p=>fill(p,(x,y)=>{
    const row=y%4, seam=(y<4?x===7:y<8?x===2||x===14:y<12?x===9:x===4);
    return shade(row===3||seam?[112,87,52]:row===0?[171,139,89]:[157,125,78],grain(x,y,32)+(row===2&&hash(x,y,33)<.17?-9:0));
  }));
  put(TILES.leaves,p=>{
    fill(p,(x,y)=>shade([67,126,43],grain(x,y,34)+(hash(Math.floor(x/2),Math.floor(y/2),35)-.5)*30));
    // Small irregular openings with leafy borders, not independent random dots.
    for(const [x,y] of [[1,2],[6,1],[11,3],[3,7],[8,6],[14,8],[5,12],[10,11],[1,14],[15,14]]) {
      p(x,y,[0,0,0],0); if(hash(x,y,8)>.35) p(x+1,y,[0,0,0],0);
    }
  });
  const oreColors = [[TILES.coal_ore,[36,36,36]],[TILES.iron_ore,[210,177,143]],[TILES.gold_ore,[244,216,77]],
    [TILES.diamond_ore,[95,221,215]],[TILES.redstone_ore,[204,35,26]],[TILES.lapis_ore,[47,83,181]]];
  const clusters=[[2,2],[8,1],[12,5],[5,6],[1,11],[9,11],[13,14]];
  for(const [tile,color] of oreColors) put(tile,p=>{
    fill(p,stone);
    clusters.forEach(([x,y],i)=>{
      const shape=i%2?[[0,0],[1,0],[0,1],[1,1],[2,1],[1,2]]:[[0,0],[1,0],[0,1],[1,1],[1,2],[2,2]];
      for(const [dx,dy] of shape) p(mod(x+dx,16),mod(y+dy,16),shade(color,(dx===0&&dy===0)?16:(dy===2?-19:0)));
    });
  });
  put(TILES.brick,p=>fill(p,(x,y)=>{
    const row=Math.floor(y/4), mortar=y%4===3 || mod(x+(row%2?4:0),8)===7;
    return shade(mortar?[177,172,157]:[151,87,76],grain(x,y,40));
  }));
  put(TILES.glass,p=>{
    for(let y=0;y<16;y++) for(let x=0;x<16;x++) {
      const border=x===0||x===15||y===0||y===15;
      const corner=(x<3||x>12)&&(y<3||y>12);
      const shine=(x===3&&y>=4&&y<=7)||(x===4&&y===3)||(x===11&&y>=9&&y<=12)||(x===12&&y===8);
      if(border || corner) p(x,y,border?[202,220,220]:[228,242,242],border?210:150);
      else if(shine) p(x,y,[235,247,247],165);
    }
  });
  // Thin metal rails and dark wooden sleepers on a transparent background.
  put(TILES.rail,p=>{
    for(const y of [2,7,12]) for(let x=2;x<=13;x++) p(x,y,[112,82,50]);
    for(const x of [4,11]) for(let y=0;y<16;y++) {
      p(x-1,y,[83,83,83]); p(x,y,[177,177,177]); p(x+1,y,[111,111,111]);
    }
  });
  // Pixel-scale ripples still use the existing animated water shader.
  put(TILES.water,p=>{
    for(let y=0;y<16;y++) for(let x=0;x<16;x++) {
      const ripple=hash(Math.floor((x+Math.floor(y/4))/3),Math.floor(y/2),64);
      p(x,y,shade([43,78,184],(ripple-.5)*16+grain(x,y,65)*.5),175);
    }
  });
  put(TILES.lava,p=>fill(p,(x,y)=>{
    const cell=hash(Math.floor(x/2),Math.floor(y/2),66), n=grain(x,y,67);
    return cell>.84?shade([255,195,57],n):cell<.2?shade([190,67,12],n):shade([231,105,20],n);
  }));
  put(TILES.glowstone,p=>fill(p,(x,y)=>{
    const light=hash(Math.floor(x/3),Math.floor(y/3),68);
    return shade(light>.65?[236,207,138]:light<.25?[119,83,50]:[181,143,93],grain(x,y,69));
  }));
  // Classic TNT's narrow white band and readable 3x5 label.
  put(TILES.tnt_side,p=>{
    fill(p,(x,y)=>y>=5&&y<=11?shade([215,211,200],grain(x,y,51)*.5):shade([171,44,38],(x%4===0?-21:0)+grain(x,y,52)));
    const letters=['111.101.111','010.111.010','010.111.010','010.111.010','010.101.010'];
    for(let y=0;y<5;y++) for(let x=0;x<11;x++) if(letters[y][x]==='1') p(x+2,6+y,[52,48,44]);
  });
  put(TILES.tnt_top,p=>fill(p,(x,y)=>shade(x>=5&&x<=10&&y>=5&&y<=10?[82,72,62]:[169,52,43],grain(x,y,53))));
  put(TILES.tnt_bottom,p=>fill(p,(x,y)=>shade([141,40,34],(x%4===0?-19:0)+grain(x,y,54))));
  const plank=(x,y) => {
    const row=y%4, seam=(y<4?x===7:y<8?x===2||x===14:y<12?x===9:x===4);
    return shade(row===3||seam?[112,87,52]:row===0?[171,139,89]:[157,125,78],grain(x,y,32));
  };
  // A grid on top, with the familiar tool silhouettes on the two sides.
  put(TILES.crafting_top,p=>fill(p,(x,y)=>{
    const border=x===0||x===15||y===0||y===15;
    const grid=x===5||x===10||y===5||y===10;
    return shade(border?[93,62,39]:grid?[104,72,43]:[167,126,77],grain(x,y,70));
  }));
  const craftSide=(p,front)=>{
    fill(p,plank);
    for(let y=0;y<16;y++) for(let x=0;x<16;x++) {
      if(x===0||x===15||y===0||y===15) p(x,y,[89,62,39]);
      else if(x===1||x===14||y===1||y===14) p(x,y,[187,145,90]);
    }
    if(front) {
      // Pale saw blade and dark handle.
      for(let y=5;y<=10;y++) for(let x=3;x<=11;x++) if(x+y>=10&&x+y<=16) p(x,y,[171,171,164]);
      for(const [x,y] of [[3,7],[3,8],[4,6],[4,9],[5,10],[11,4],[12,4],[12,5]]) p(x,y,[77,54,35]);
      for(const [x,y] of [[6,9],[8,7],[10,5]]) p(x,y,[224,220,202]);
    } else {
      // Hammer and tongs against the wood.
      for(let i=0;i<8;i++) p(4+i,11-i,[76,53,33]);
      for(let y=3;y<=5;y++) for(let x=9;x<=12;x++) p(x,y,[135,133,125]);
      for(let i=0;i<6;i++) {p(4+i,4+i,[80,55,36]);p(3+i,4+i,[124,119,103]);}
    }
  };
  put(TILES.crafting_side,p=>craftSide(p,false)); put(TILES.crafting_front,p=>craftSide(p,true));
  const furnaceSide=(x,y)=>shade([112,112,112],grain(x,y,72)+(x===0||y===0?9:x===15||y===15?-12:0));
  put(TILES.furnace_side,p=>fill(p,furnaceSide));
  put(TILES.furnace_top,p=>fill(p,(x,y)=>{
    const frame=x<2||y<2||x>13||y>13, inset=x>=4&&x<=11&&y>=4&&y<=11;
    return shade(frame?[132,132,132]:inset?[87,87,87]:[108,108,108],grain(x,y,73));
  }));
  const furnaceFront=(p,lit)=>{
    fill(p,furnaceSide);
    for(let y=3;y<=8;y++) for(let x=4;x<=11;x++) p(x,y, x===4||x===11||y===3?[65,65,65]:[37,37,37]);
    for(let y=10;y<=13;y++) for(let x=4;x<=11;x++) {
      const fire=lit&&y>=10&&x>=5&&x<=10;
      p(x,y,fire?(hash(x,y,74)>.35?[250,180,43]:[255,222,88]):[48,48,48]);
    }
    for(let x=3;x<=12;x++) { p(x,2,[151,151,151]); p(x,9,[139,139,139]); p(x,14,[78,78,78]); }
  };
  put(TILES.furnace_front,p=>furnaceFront(p,false)); put(TILES.furnace_front_lit,p=>furnaceFront(p,true));
  const wools = [[TILES.wool_white,[222,222,222]],[TILES.wool_red,[160,44,36]], [TILES.wool_orange,[216,128,24]],
    [TILES.wool_yellow,[202,186,48]],[TILES.wool_lime,[108,168,32]],[TILES.wool_green,[82,108,40]],
    [TILES.wool_cyan,[36,132,148]],[TILES.wool_lightblue,[100,140,200]],[TILES.wool_blue,[48,56,142]],
    [TILES.wool_purple,[116,44,168]],[TILES.wool_magenta,[186,62,186]],[TILES.wool_pink,[222,140,162]],
    [TILES.wool_gray,[68,68,68]],[TILES.wool_lightgray,[142,142,142]],[TILES.wool_brown,[106,68,36]],[TILES.wool_black,[32,32,32]]];
  for(const [tile,base] of wools) put(tile,p=>fill(p,(x,y)=>{
    const tuft=hash(Math.floor(x/2),Math.floor(y/2),80);
    return shade(base,grain(x,y,81)+(tuft>.7?7:tuft<.25?-7:0));
  }));
  // Cross-plane plants: chunky silhouettes remain legible at normal distance.
  const sprite=(tile,rows,palette)=>put(tile,p=>{
    rows.forEach((row,y)=>{ for(let x=0;x<row.length;x++) if(palette[row[x]]) p(x,y,palette[row[x]]); });
  });
  sprite(TILES.rose,[
    '................','................','.....rr...rr....','....rRRr.rRRr...','...rRRRRrRRRRr..','....rRRRRRRRr...',
    '.....rRRRRRr....','......rRRRr.....','.......gG.......','....g..gG.......','...gGg.gG..g....',
    '....gGGgG.gGg...','......gGGGgG....','.......gGg......','.......gG.......','.......gG.......'
  ],{r:[152,28,25],R:[210,42,36],g:[59,115,40],G:[88,144,51]});
  sprite(TILES.dandelion,[
    '................','................','......yy........','....yyYYyy......','...yYYYYYYy.....','...yYYYYYYy.....',
    '....yyYYyy......','......gg........','......gG........','...g..gG..g.....','..gGg.gG.gGg....',
    '...gGGgGgGg.....','.....gGGGg......','......gG........','......gG........','......gG........'
  ],{y:[190,152,28],Y:[245,215,49],g:[57,110,38],G:[85,146,47]});
  const metal=(p,base)=>fill(p,(x,y)=>shade(base, x===0||y===0?20:x===15||y===15?-27:grain(x,y,56)*.45));
  put(TILES.iron_block,p=>metal(p,[208,208,208]));
  put(TILES.gold_block,p=>metal(p,[242,208,62]));
  put(TILES.diamond_block,p=>metal(p,[99,218,210]));
  put(TILES.obsidian,p=>fill(p,(x,y)=>shade([24,18,37],grain(x,y,57)+(hash(Math.floor(x/3),Math.floor(y/2),58)-.5)*24)));
  put(TILES.netherrack,p=>fill(p,(x,y)=>shade([111,48,48],grain(x,y,59)+(hash(Math.floor(x/2),Math.floor(y/2),60)-.5)*30)));
  put(TILES.slow_sand,p=>fill(p,(x,y)=>{
    const face=(x>=3&&x<=6&&y>=4&&y<=7)||(x>=10&&x<=12&&y>=5&&y<=8)||(x>=6&&x<=10&&y>=11&&y<=12);
    return shade(face?[75,56,45]:[107,84,67],grain(x,y,61));
  }));
  // Distinct bottom halves; the upper-half tiles retain transparent windows.
  for(const [tile,base] of [[TILES.door_wood_bottom,[151,116,69]],[TILES.door_iron_bottom,[196,196,200]]]) put(tile,p=>fill(p,(x,y)=>{
    const frame=x===0||x===15||y===0||y===15||x===7||x===8||y===7||y===8;
    const handle=x>=12&&x<=13&&y>=3&&y<=4;
    return handle?[64,56,43]:shade(base,(frame?-35:0)+grain(x,y,62)*.5);
  }));
}
