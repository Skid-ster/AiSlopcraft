#include "WorldGen.h"
#include "Blocks.h"
#include <algorithm>
#include <cmath>
#include <limits>

namespace vox {
namespace {
int div8(int n) { return n>=0 ? n/8 : (n+1)/8 - 1; }
uint32_t rgb(int r,int g,int b) { return (uint32_t)(r<<16 | g<<8 | b); }
}
const char* biomeName(uint8_t b) {
    switch ((Biome)b) {
        case Biome::Plains: return "Plains";
        case Biome::Forest: return "Forest";
        case Biome::BirchForest: return "Birch Forest";
        case Biome::RoofedForest: return "Roofed Forest";
        case Biome::Taiga: return "Taiga";
        case Biome::ColdTaiga: return "Cold Taiga";
        case Biome::MegaTaiga: return "Mega Taiga";
        case Biome::Desert: return "Desert";
        case Biome::Savanna: return "Savanna";
        case Biome::Mesa: return "Mesa";
        case Biome::Jungle: return "Jungle";
        case Biome::Swamp: return "Swampland";
        case Biome::ExtremeHills: return "Extreme Hills";
        case Biome::IcePlains: return "Ice Plains";
        case Biome::Ocean: return "Ocean";
        case Biome::DeepOcean: return "Deep Ocean";
        case Biome::Beach: return "Beach";
        case Biome::StoneBeach: return "Stone Beach";
        case Biome::Nether: return "Nether";
        case Biome::End: return "The End";
        default: return "Biome";
    }
}
uint32_t biomeGrassColor(uint8_t b) {
    switch ((Biome)b) {
        case Biome::Desert: case Biome::Savanna: case Biome::Mesa: return rgb(181,177,82);
        case Biome::Swamp: return rgb(97,128,70);
        case Biome::IcePlains: case Biome::ColdTaiga: return rgb(135,168,129);
        case Biome::Jungle: return rgb(113,188,72);
        case Biome::Forest: case Biome::RoofedForest: return rgb(136,199,92);
        default: return rgb(158,211,99);
    }
}
uint32_t biomeFoliageColor(uint8_t b) {
    uint32_t g = biomeGrassColor(b);
    return rgb(std::max(0,(int)((g>>16)&255)-14),
               std::min(255,(int)((g>>8)&255)+15),
               std::max(0,(int)(g&255)-8));
}

WorldGenerator::WorldGenerator(int64_t seed, WorldType type, Dimension dim)
    : seed_(seed), type_(type), dim_(dim),
      climate_(seed^INT64_C(0x13420468),4), moisture_(seed^INT64_C(0x59afc239),4),
      continental_(seed^INT64_C(0x435190b7),4), hills_(seed^INT64_C(0x6129073a),5),
      detail_(seed^INT64_C(0x21005283),3), cave_(seed^INT64_C(0x61018d32),3) {}

Biome WorldGenerator::biomeAt(int x,int z) const {
    if (dim_ == Dimension::Nether) return Biome::Nether;
    if (dim_ == Dimension::End) return Biome::End;
    if (type_ == WorldType::Flat) return Biome::Plains;
    double scale = type_ == WorldType::LargeBiomes ? 0.001 : 0.004;
    double coast=continental_.sample2(x,z,scale);
    if (coast < -0.32) return coast < -0.43 ? Biome::DeepOcean : Biome::Ocean;
    if (coast < -0.26) return Biome::Beach;
    double temp=climate_.sample2(x,z,scale*0.85);
    double humid=moisture_.sample2(x,z,scale*1.25);
    double mountain=hills_.sample2(x,z,scale*0.55);
    if (mountain > 0.35 && temp < 0.19) return Biome::ExtremeHills;
    if (temp < -0.28) return humid > 0.05 ? Biome::ColdTaiga : Biome::IcePlains;
    if (temp < -0.13) return humid > 0.25 ? Biome::MegaTaiga : Biome::Taiga;
    if (temp > 0.30) {
        if (humid < -0.23) return Biome::Mesa;
        if (humid < -0.07) return Biome::Desert;
        if (humid < 0.16) return Biome::Savanna;
        return Biome::Jungle;
    }
    if (humid > 0.38) return Biome::Swamp;
    if (humid > 0.14) return Biome::RoofedForest;
    if (humid > -0.08) return Biome::Forest;
    if (humid > -0.23) return Biome::BirchForest;
    return Biome::Plains;
}

int WorldGenerator::heightAt(int x,int z) const {
    if (dim_ == Dimension::Nether) return 32;
    if (dim_ == Dimension::End) {
        double islands=continental_.sample2(x,z,0.01);
        double dist=std::hypot((double)x,(double)z);
        return (dist < 100 || islands > 0.38) ? 57+(int)(detail_.sample2(x,z,0.04)*8) : 0;
    }
    if (type_==WorldType::Flat) return 3;
    Biome b=biomeAt(x,z);
    double base=64.0;
    switch (b) {
        case Biome::Ocean: base=53; break;
        case Biome::DeepOcean: base=42; break;
        case Biome::Beach: base=62; break;
        case Biome::Desert: base=65; break;
        case Biome::Swamp: base=63; break;
        case Biome::ExtremeHills: base=88; break;
        case Biome::Mesa: base=79; break;
        case Biome::Savanna: base=69; break;
        case Biome::Jungle: base=69; break;
        default: base=67; break;
    }
    double macro=hills_.sample2(x,z,0.009)*16;
    double fine=detail_.sample2(x,z,0.045)*5;
    double continental=continental_.sample2(x,z,0.004)*8;
    if (b == Biome::ExtremeHills) macro *= 2.4;
    if (b == Biome::Swamp || b == Biome::Beach) macro *= 0.25;
    if (type_==WorldType::Amplified && b!=Biome::Ocean && b!=Biome::DeepOcean) {
        base += 8;
        macro *= 3.2;
    }
    return std::clamp((int)std::lround(base+macro+fine+continental),2,246);
}

std::unique_ptr<Chunk> WorldGenerator::generate(int cx,int cz) const {
    auto c=std::make_unique<Chunk>(cx,cz);
    for (int lz=0;lz<16;++lz) for (int lx=0;lx<16;++lx) {
        int x=cx*16+lx,z=cz*16+lz;
        Biome b=biomeAt(x,z);
        c->biomes[lz*16+lx]=(uint8_t)b;
        int top=heightAt(x,z);
        if (dim_==Dimension::End) {
            for (int y=std::max(0,top-10);y<=top && top;++y)
                c->setBlock(lx,y,lz,{BlockID::EndStone,0});
            continue;
        }
        if (dim_==Dimension::Nether) {
            for (int y=0;y<WorldHeight;++y) {
                bool ceiling=y>=119 && y<=127;
                bool floor=y<36;
                if (!floor && !ceiling) continue;
                if (floor && y>6 && cave_.sample(x*0.048,y*0.045,z*0.048)>0.31) continue;
                uint16_t id=y<2 || y>=127 ? BlockID::Bedrock :
                    (y<=30 && y>3 && cave_.sample(x*0.028,y*0.034,z*0.028)>0.37
                     ? BlockID::SoulSand : BlockID::Netherrack);
                c->setBlock(lx,y,lz,{id,0});
            }
            continue;
        }
        if (type_==WorldType::Flat) {
            c->setBlock(lx,0,lz,{BlockID::Bedrock,0});
            for (int y=1;y<=2;++y) c->setBlock(lx,y,lz,{BlockID::Dirt,0});
            c->setBlock(lx,3,lz,{BlockID::Grass,0});
            continue;
        }
        for (int y=0;y<=std::max(top,SeaLevel);++y) {
            if (y>top) {
                c->setBlock(lx,y,lz,{BlockID::Water,0});
                continue;
            }
            if (y<=2 && hashUnit(seed_,x,y,z)<0.72f) {
                c->setBlock(lx,y,lz,{BlockID::Bedrock,0}); continue;
            }
            if (y>4 && y<top-3 && y<105 &&
                cave_.sample(x*0.060,y*0.075,z*0.060)>0.47 &&
                cave_.sample((x+500)*0.035,(y-800)*0.037,(z+500)*0.035)>0.12)
                continue;
            uint16_t id=BlockID::Stone;
            uint8_t meta=0;
            int depth=top-y;
            bool dry=b==Biome::Desert||b==Biome::Mesa||b==Biome::Beach;
            if (depth==0) {
                id=dry? BlockID::Sand : (b==Biome::ExtremeHills && top>99 ? BlockID::Stone : BlockID::Grass);
                if (b==Biome::Mesa) meta=1; // red sand
            } else if (depth<=3) {
                id=dry? BlockID::Sand : BlockID::Dirt;
                if (b==Biome::Mesa) meta=1;
                if (b==Biome::MegaTaiga && depth==1) { id=BlockID::Dirt; meta=2; } // podzol
            } else {
                // Stable 3-D hash for ore clusters; adjacent chunks agree at
                // boundaries. Vein size/altitudes are approximations.
                uint64_t hash=worldHash(seed_,x/3,y/3,z/3);
                int roll=(int)(hash%3600);
                if (y<16 && roll<3) id=BlockID::DiamondOre;
                else if (y<32 && roll<7) id=BlockID::GoldOre;
                else if (y<30 && roll<12) id=BlockID::RedstoneOre;
                else if (y<64 && roll<34) id=BlockID::IronOre;
                else if (roll<85) id=BlockID::CoalOre;
            }
            c->setBlock(lx,y,lz,{id,meta});
        }
        if (b==Biome::IcePlains || b==Biome::ColdTaiga) {
            if (top>=SeaLevel && top+1<WorldHeight && c->block(lx,top+1,lz).id==0)
                c->setBlock(lx,top+1,lz,{BlockID::SnowLayer,0});
            if (top<SeaLevel && c->block(lx,SeaLevel,lz).id==BlockID::Water)
                c->setBlock(lx,SeaLevel,lz,{BlockID::Ice,0});
        }
        if (top>=SeaLevel && top+1<WorldHeight && c->block(lx,top+1,lz).id==0) {
            float grass=hashUnit(seed_^INT64_C(7),x,0,z);
            if (grass<0.10f && b!=Biome::Desert && b!=Biome::Mesa && b!=Biome::IcePlains)
                c->setBlock(lx,top+1,lz,{BlockID::Tallgrass,1});
            else if (grass<0.105f && b!=Biome::Desert && b!=Biome::Mesa)
                c->setBlock(lx,top+1,lz,{BlockID::YellowFlower,0});
            else if (grass<0.109f && b!=Biome::Desert && b!=Biome::Mesa)
                c->setBlock(lx,top+1,lz,{BlockID::RedFlower,(uint8_t)((hashUnit(seed_,x,5,z)*9))});
            else if (grass<0.14f && (b==Biome::Desert||b==Biome::Mesa))
                c->setBlock(lx,top+1,lz,{BlockID::Deadbush,0});
        }
    }
    if (dim_==Dimension::Overworld && type_!=WorldType::Flat) decorateTrees(*c);
    c->generated=true;
    c->markAllDirty();
    return c;
}

void WorldGenerator::decorateTrees(Chunk& c) const {
    // Every potential tree is keyed by its GLOBAL 8x8 cell, so chunks can be
    // generated out of order/on different workers with identical edge leaves.
    const int startX=c.cx*16,startZ=c.cz*16;
    for (int gz=div8(startZ-5); gz<=div8(startZ+20); ++gz)
        for (int gx=div8(startX-5);gx<=div8(startX+20);++gx) {
            int ax=gx*8 + 1+(int)(worldHash(seed_,gx,103,gz)%6);
            int az=gz*8 + 1+(int)(worldHash(seed_,gx,104,gz)%6);
            Biome b=biomeAt(ax,az);
            double density=0;
            int wood=0;
            switch (b) {
                case Biome::Forest: density=0.72; wood=0; break;
                case Biome::BirchForest: density=0.65; wood=2; break;
                case Biome::RoofedForest: density=0.86; wood=5; break;
                case Biome::Taiga: case Biome::ColdTaiga: density=0.61; wood=1; break;
                case Biome::MegaTaiga: density=0.75; wood=1; break;
                case Biome::Jungle: density=0.78; wood=3; break;
                case Biome::Savanna: density=0.36; wood=4; break;
                case Biome::Plains: density=0.045; wood=0; break;
                default: break;
            }
            if (hashUnit(seed_,gx,106,gz) > density) continue;
            int ground=heightAt(ax,az);
            if (ground<SeaLevel || ground>WorldHeight-13) continue;
            int size=4+(int)(worldHash(seed_,gx,107,gz)%3);
            if (wood==1) size+=2;
            if (wood==3 || wood==5) size+=1;
            auto place=[&](int x,int y,int z,uint16_t id,uint8_t meta,bool onlyAir) {
                if (x<startX||x>=startX+16||z<startZ||z>=startZ+16||y<0||y>=WorldHeight) return;
                int lx=x-startX,lz=z-startZ;
                uint16_t old=c.block(lx,y,lz).id;
                if (!onlyAir || old==BlockID::Air || old==BlockID::Tallgrass ||
                    old==BlockID::SnowLayer || old==BlockID::RedFlower || old==BlockID::YellowFlower)
                    c.setBlock(lx,y,lz,{id,meta});
            };
            for (int y=ground+1; y<=ground+size; ++y)
                place(ax,y,az,wood>=4?BlockID::Log2:BlockID::Log,
                      (uint8_t)(wood>=4?wood-4:wood),false);
            int radius=wood==5?3:2;
            for (int dy=-2;dy<=1;++dy) {
                int r=dy==1?radius-1:radius;
                if (wood==1) r=(dy==-2 ? 2 : 1); // tapered spruce crown
                for (int dz=-r;dz<=r;++dz) for (int dx=-r;dx<=r;++dx) {
                    if (std::abs(dx)==r && std::abs(dz)==r &&
                        hashUnit(seed_,ax+dx,ground+size+dy,az+dz)<0.45f) continue;
                    place(ax+dx,ground+size+dy,az+dz,
                          wood>=4?BlockID::Leaves2:BlockID::Leaves,
                          (uint8_t)(wood>=4?wood-4:wood),true);
                }
            }
        }
}
} // namespace vox
