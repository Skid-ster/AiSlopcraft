#include "Mesher.h"
#include "Blocks.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <fstream>
#include <sstream>

namespace vox {
bool TileCatalog::load(const std::string& manifest,std::string& error) {
    error.clear(); tile_.clear();
    std::ifstream f(manifest);
    if (!f) { error="Cannot read atlas manifest: "+manifest; return false; }
    int maxIndex=-1;
    for(std::string line;std::getline(f,line);) {
        if (line.empty() || line[0]=='#') continue;
        std::istringstream parts(line);
        std::string name;int idx=-1;
        if (!(parts>>name>>idx) || idx<0 || idx>4095 ||
            name.find('/')!=std::string::npos || name.find('\\')!=std::string::npos ||
            !tile_.emplace(name,idx).second) {
            error="Invalid or duplicate atlas entry: "+line; tile_.clear(); return false;
        }
        maxIndex=std::max(idx,maxIndex);
    }
    if (tile_.empty() || !has("missing")) {
        error="Atlas manifest must contain a missing tile and at least one entry";
        tile_.clear(); return false;
    }
    rows=std::max(1,(maxIndex+columns)/columns);
    return true;
}
void TileCatalog::add(const std::string& name,int index) {
    tile_[name]=index;
    rows=std::max(rows,index/columns+1);
}
int TileCatalog::lookup(const std::string& name) const {
    auto it=tile_.find(name);return it==tile_.end()?-1:it->second;
}

namespace {
struct Quad {
    std::array<Vec3f,4> p;
};
Quad faceQuad(Dir d,Vec3f lo,Vec3f hi) {
    float x=lo.x,X=hi.x,y=lo.y,Y=hi.y,z=lo.z,Z=hi.z;
    switch (d) {
        case Down: return Quad{{Vec3f{x,y,z},Vec3f{X,y,z},Vec3f{X,y,Z},Vec3f{x,y,Z}}};
        case Up: return Quad{{Vec3f{x,Y,Z},Vec3f{X,Y,Z},Vec3f{X,Y,z},Vec3f{x,Y,z}}};
        case North: return Quad{{Vec3f{X,y,z},Vec3f{x,y,z},Vec3f{x,Y,z},Vec3f{X,Y,z}}};
        case South: return Quad{{Vec3f{x,y,Z},Vec3f{X,y,Z},Vec3f{X,Y,Z},Vec3f{x,Y,Z}}};
        case West: return Quad{{Vec3f{x,y,z},Vec3f{x,y,Z},Vec3f{x,Y,Z},Vec3f{x,Y,z}}};
        default: return Quad{{Vec3f{X,y,Z},Vec3f{X,y,z},Vec3f{X,Y,z},Vec3f{X,Y,Z}}};
    }
}
float faceShade(Dir d) {
    switch (d) { case Up:return 1;case Down:return 0.56f;
        case North:case South:return 0.82f;default:return 0.71f; }
}
struct Builder {
    const World& world;
    const TileCatalog& atlas;
    MeshData& data;
    int cx,cz;
    std::vector<MeshVertex>& layer(RenderLayer l) {
        if (l==RenderLayer::Transparent) return data.transparent;
        if (l==RenderLayer::Cutout) return data.cutout;
        return data.solid;
    }
    void quad(RenderLayer l,const Quad& q,const std::string& tile,
              int wx,int wy,int wz,Dir d,uint8_t biome,bool tint,float alpha=1) {
        int idx=atlas.lookup(tile);
        if (idx<0) { ++data.missingTiles; idx=std::max(0,atlas.lookup("missing")); }
        float u0=(float)(idx%atlas.columns)/atlas.columns;
        float v0=(float)(idx/atlas.columns)/atlas.rows;
        float u1=(float)(idx%atlas.columns+1)/atlas.columns;
        float v1=(float)(idx/atlas.columns+1)/atlas.rows;
        // Inset 0.01 texels to avoid bleeding at nearest-neighbor boundaries.
        float insetU=0.01f/(16.f*atlas.columns),insetV=0.01f/(16.f*atlas.rows);
        u0+=insetU;u1-=insetU;v0+=insetV;v1-=insetV;
        float uu[4]={u0,u1,u1,u0},vv[4]={v1,v1,v0,v0};
        uint32_t rgb=tint ? (tile=="water_still"||tile=="water_flow" ?
            0x779bc1u : (tile.find("leaves_")==0?biomeFoliageColor(biome):biomeGrassColor(biome)))
            : 0xffffffu;
        float shade=faceShade(d);
        float color[3]={shade*((rgb>>16)&255)/255.f,
                        shade*((rgb>>8)&255)/255.f,shade*(rgb&255)/255.f};
        Vec3i off=dirOffset(d);
        int sampleX=wx+off.x,sampleY=wy+off.y,sampleZ=wz+off.z;
        float sky=world.skyAt(sampleX,sampleY,sampleZ)/15.f;
        float block=std::max((int)world.lightAt(sampleX,sampleY,sampleZ),
                             (int)blockDef(world.peekBlock(wx,wy,wz).id).lightEmission)/15.f;
        MeshVertex verts[4];
        for(int i=0;i<4;++i) {
            const auto& p=q.p[i];
            // AO: if a solid neighbour sits at the same vertex corner, darken
            // gently. Edge/corner resolution is approximate; screenshots needed.
            float ao=1.f;
            if (l==RenderLayer::Opaque && d!=Down) {
                int ax=wx+(p.x<wx-cx*16+0.5f?-1:1);
                int az=wz+(p.z<wz-cz*16+0.5f?-1:1);
                if (isFullCube(world.peekBlock(ax,wy,az).id,0)) ao=0.84f;
            }
            verts[i]={p.x,p.y,p.z,uu[i],vv[i],
                      color[0]*ao,color[1]*ao,color[2]*ao,sky,block};
        }
        (void)alpha; // opacity is encoded in the source pixel alpha.
        int indices[6]={0,1,2,0,2,3};
        auto& out=layer(l);
        for(int j : indices) out.push_back(verts[j]);
        ++data.faces;
    }
    void prism(uint16_t id,uint8_t meta,RenderLayer l,
               Vec3f lo,Vec3f hi,int wx,int wy,int wz,uint8_t biome,bool cull) {
        for(int f=0;f<6;++f) {
            Dir d=(Dir)f;
            Vec3i off=dirOffset(d);
            auto n=world.peekBlock(wx+off.x,wy+off.y,wz+off.z);
            if (cull && ((n.id==id && !isFullCube(id,meta)) ||
                         isFullCube(n.id,n.meta))) continue;
            bool tint=blockTint(id)!=TintType::None;
            if (id==BlockID::Grass) tint=f==Up;
            std::string tile=blockTile(id,meta,f,wx,wy,wz);
            quad(l,faceQuad(d,lo,hi),tile,wx,wy,wz,d,biome,tint);
            if (id==BlockID::Grass && f>=North) {
                Quad overlay=faceQuad(d,lo,hi);
                for (Vec3f& p : overlay.p) {
                    p.x+=off.x*0.001f; p.y+=off.y*0.001f; p.z+=off.z*0.001f;
                }
                quad(RenderLayer::Cutout,overlay,"grass_side_overlay",
                     wx,wy,wz,d,biome,true);
            }
        }
    }
    void cross(uint16_t id,uint8_t meta,RenderLayer l,int x,int y,int z,
               int wx,int wy,int wz,uint8_t biome,float minY=0,float maxY=1) {
        std::string tile=blockTile(id,meta,North,wx,wy,wz);
        // Only the grassy/fern varieties are biome-coloured. Tinting the
        // complete red/pink/yellow flower tile turned its petals muddy brown.
        bool tint=blockTint(id)!=TintType::None &&
                  (id!=BlockID::DoublePlant ||
                   tile.find("double_plant_grass")==0 || tile.find("double_plant_fern")==0);
        for(int side=0;side<2;++side) {
            Vec3f a=side?Vec3f{x+0.12f,y+minY,z+0.88f}:Vec3f{x+0.12f,y+minY,z+0.12f};
            Vec3f b=side?Vec3f{x+0.88f,y+minY,z+0.12f}:Vec3f{x+0.88f,y+minY,z+0.88f};
            Quad q{{a,b,Vec3f{b.x,y+maxY,b.z},Vec3f{a.x,y+maxY,a.z}}};
            quad(l,q,tile,wx,wy,wz,North,biome,tint);
            Quad back{{q.p[1],q.p[0],q.p[3],q.p[2]}};
            quad(l,back,tile,wx,wy,wz,South,biome,tint);
        }
    }
};
}

MeshData meshSection(const World& world,int cx,int cz,int sectionY,const TileCatalog& atlas) {
    MeshData result;
    if (sectionY<0 || sectionY>=SectionCount) return result;
    const Chunk* c=world.findChunk(cx,cz);
    if (!c) return result;
    Builder b{world,atlas,result,cx,cz};
    for(int ly=0;ly<16;++ly) for(int z=0;z<16;++z) for(int x=0;x<16;++x) {
        int y=sectionY*16+ly;
        auto cell=c->block(x,y,z);
        if (!cell.id) continue;
        const BlockDef& def=blockDef(cell.id);
        if (def.layer==RenderLayer::Invisible) continue;
        int wx=cx*16+x,wz=cz*16+z;
        uint8_t biome=c->biomes[z*16+x];
        Vec3f lo{(float)x,(float)y,(float)z},hi{float(x+1),float(y+1),float(z+1)};
        auto prism=[&](Vec3f a,Vec3f e,bool cull=false) {
            b.prism(cell.id,cell.meta,def.layer,a,e,wx,y,wz,biome,cull);
        };
        switch (def.shape) {
            case BlockShape::Cross: case BlockShape::DoublePlant: case BlockShape::Fire:
            case BlockShape::Stem: case BlockShape::Crop:
                b.cross(cell.id,cell.meta,def.layer,x,y,z,wx,y,wz,biome,
                        0,(def.shape==BlockShape::Crop||def.shape==BlockShape::Stem)?0.55f:1.f);
                break;
            case BlockShape::Torch:
                prism({x+0.44f,(float)y,z+0.44f},{x+0.56f,y+0.67f,z+0.56f});break;
            case BlockShape::Liquid: {
                float h=(cell.meta&7)==0 ? 0.88f : 0.78f-((cell.meta&7)*0.07f);
                if (cell.meta&8) h=1.0f;
                prism(lo,{float(x+1),y+h,float(z+1)},true);break;
            }
            case BlockShape::Slab: {
                bool top=(cell.meta&8)!=0;
                prism({(float)x,y+(top?0.5f:0.f),(float)z},
                      {float(x+1),y+(top?1.f:0.5f),float(z+1)});break;
            }
            case BlockShape::Stairs: {
                bool top=cell.meta&4;int facing=cell.meta&3;
                prism({(float)x,y+(top?0.5f:0.f),(float)z},
                      {float(x+1),y+(top?1.f:0.5f),float(z+1)});
                Vec3f a{(float)x,y+(top?0.f:0.5f),(float)z};
                Vec3f e{float(x+1),y+(top?0.5f:1.f),float(z+1)};
                if (facing==0) a.x+=0.5f;
                else if (facing==1) e.x-=0.5f;
                else if (facing==2) a.z+=0.5f;
                else e.z-=0.5f;
                prism(a,e);break;
            }
            case BlockShape::Fence: case BlockShape::Wall:
                prism({x+0.375f,(float)y,z+0.375f},{x+0.625f,y+1.25f,z+0.625f});
                break;
            case BlockShape::Pane:
                prism({x+0.45f,(float)y,z+0.45f},{x+0.55f,float(y+1),z+0.55f});
                break;
            case BlockShape::SnowLayer:
                prism(lo,{float(x+1),y+((cell.meta&7)+1)/8.f,float(z+1)});break;
            case BlockShape::Carpet:
                prism(lo,{float(x+1),y+0.0625f,float(z+1)});break;
            case BlockShape::Farmland:
                prism(lo,{float(x+1),y+0.9375f,float(z+1)});break;
            case BlockShape::Cake:
                prism({x+0.0625f,(float)y,z+0.0625f},
                      {x+0.9375f,y+0.5f,z+0.9375f});break;
            case BlockShape::LilyPad:
                prism({(float)x,y+0.0125f,(float)z},
                      {float(x+1),y+0.025f,float(z+1)});break;
            case BlockShape::Ladder: case BlockShape::Vine:
                prism({(float)x,(float)y,z+0.94f},{float(x+1),float(y+1),float(z+1)});
                break;
            case BlockShape::Rails: case BlockShape::PressurePlate:
                prism(lo,{float(x+1),y+0.0625f,float(z+1)});break;
            case BlockShape::Door: case BlockShape::Trapdoor: {
                AABB box;
                if(blockCollision(cell.id,cell.meta,x,y,z,box)) prism(box.min,box.max);
                else prism({(float)x,(float)y,z+0.4f},{float(x+1),float(y+1),z+0.6f});
                break;
            }
            case BlockShape::Portal:
                prism({(float)x,(float)y,z+0.4f},{float(x+1),float(y+1),z+0.6f});
                break;
            case BlockShape::InvisibleShape: break;
            default: prism(lo,hi,true);break;
        }
    }
    return result;
}
} // namespace vox
