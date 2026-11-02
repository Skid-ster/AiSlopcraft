#include "World.h"
#include "Blocks.h"
#include <algorithm>
#include <cmath>
#include <queue>
#include <vector>

namespace vox {
World::World(int64_t seed, WorldType type, Dimension dim) : gen_(seed,type,dim) {}

bool World::loadEdits(Edits edits) {
    if (!chunks_.empty() || !changes_.empty()) return false;
    for (const auto& [key, records] : edits) {
        (void)key;
        for (const auto& [pos, b] : records)
            if (b.id>=BlockID::BlockIDCount || (pos>>8)>=WorldHeight) return false;
    }
    changes_ = std::move(edits);
    return true;
}

Chunk* World::findChunk(int cx,int cz) {
    auto it=chunks_.find(chunkKey(cx,cz));
    return it==chunks_.end()?nullptr:it->second.get();
}
const Chunk* World::findChunk(int cx,int cz) const {
    auto it=chunks_.find(chunkKey(cx,cz));
    return it==chunks_.end()?nullptr:it->second.get();
}

Chunk& World::ensureChunk(int cx,int cz) {
    if (Chunk* existing=findChunk(cx,cz)) return *existing;
    installChunk(gen_.generate(cx,cz));
    return *findChunk(cx,cz);
}
void World::installChunk(std::unique_ptr<Chunk> chunk) {
    if (!chunk || findChunk(chunk->cx,chunk->cz)) return;
    int cx=chunk->cx,cz=chunk->cz;
    auto it=changes_.find(chunkKey(cx,cz));
    if (it!=changes_.end()) for (const auto& [idx,b] : it->second)
        chunk->setBlock(idx&15,idx>>8,(idx>>4)&15,b);
    chunks_[chunkKey(cx,cz)]=std::move(chunk);
    // A newly loaded neighbor changes boundary face visibility.
    for (Dir d : {North,South,West,East}) {
        Vec3i off=dirOffset(d);
        if (Chunk* n=findChunk(cx+off.x,cz+off.z)) n->markAllDirty();
    }
    relightAround(cx,cz);
}
BlockState World::blockAt(int x,int y,int z) {
    if (y<0) return {BlockID::Bedrock,0};
    if (y>=WorldHeight) return {};
    return ensureChunk(floorDiv16(x),floorDiv16(z)).block(floorMod16(x),y,floorMod16(z));
}
BlockState World::peekBlock(int x,int y,int z) const {
    if (y<0) return {BlockID::Bedrock,0};
    if (y>=WorldHeight) return {};
    const Chunk* c=findChunk(floorDiv16(x),floorDiv16(z));
    return c?c->block(floorMod16(x),y,floorMod16(z)):BlockState{};
}
uint8_t World::skyAt(int x,int y,int z) const {
    if (y>=WorldHeight) return 15;
    if (y<0) return 0;
    const Chunk* c=findChunk(floorDiv16(x),floorDiv16(z));
    return c?c->skyLight(floorMod16(x),y,floorMod16(z)):(y>=SeaLevel?15:0);
}
uint8_t World::lightAt(int x,int y,int z) const {
    if (y<0 || y>=WorldHeight) return 0;
    const Chunk* c=findChunk(floorDiv16(x),floorDiv16(z));
    return c?c->blockLight(floorMod16(x),y,floorMod16(z)):0;
}

void World::markNeighbors(int x,int y,int z) {
    int cx=floorDiv16(x),cz=floorDiv16(z),si=std::clamp(y/16,0,SectionCount-1);
    auto dirty=[&](int a,int b) { if (Chunk* n=findChunk(a,b)) n->dirty[si]=true; };
    if (floorMod16(x)==0) dirty(cx-1,cz);
    if (floorMod16(x)==15) dirty(cx+1,cz);
    if (floorMod16(z)==0) dirty(cx,cz-1);
    if (floorMod16(z)==15) dirty(cx,cz+1);
}
bool World::change(int x,int y,int z,BlockState b,bool doLight) {
    if (y<0 || y>=WorldHeight || b.id>=BlockID::BlockIDCount) return false;
    Chunk& c=ensureChunk(floorDiv16(x),floorDiv16(z));
    if (!c.setBlock(floorMod16(x),y,floorMod16(z),b)) return false;
    uint16_t key=(uint16_t)((y<<8)|(floorMod16(z)<<4)|floorMod16(x));
    changes_[chunkKey(c.cx,c.cz)][key]=b;
    markNeighbors(x,y,z);
    // A bounded queue prevents a single block from recursively updating an
    // unbounded unloaded world. Fluids/crops/gravity are 1.7-style approximations.
    for (Dir d : {Down,Up,North,South,West,East}) {
        Vec3i o=dirOffset(d);
        schedule(x+o.x,y+o.y,z+o.z,5);
    }
    schedule(x,y,z,5);
    if (doLight) relightAround(c.cx,c.cz);
    else needsRelight_.insert(chunkKey(c.cx,c.cz));
    return true;
}
bool World::setBlock(int x,int y,int z,BlockState b) { return change(x,y,z,b,true); }

void World::relightAround(int cx,int cz) {
    // Bounded 3x3 rebuild handles both light addition and removal; unlike an
    // incremental 1.7 light engine it can cause a brief edit-time hitch. The
    // test suite covers the local invariants, not long-range exact parity.
    std::vector<Chunk*> region;
    for (int dz=-1;dz<=1;++dz) for (int dx=-1;dx<=1;++dx)
        if (Chunk* c=findChunk(cx+dx,cz+dz)) { c->clearLight(); region.push_back(c); }
    if (region.empty()) return;
    std::deque<Vec3i> skyQueue,blockQueue;
    auto inRegion=[&](int x,int z) {
        int dx=floorDiv16(x)-cx,dz=floorDiv16(z)-cz;
        return dx>=-1 && dx<=1 && dz>=-1 && dz<=1 && findChunk(cx+dx,cz+dz);
    };
    for (Chunk* c : region) {
        for (int z=0;z<16;++z) for (int x=0;x<16;++x) {
            uint8_t level=15;
            int colHeight=c->height[z*16+x];
            for (int y=WorldHeight-1;y>=0;--y) {
                auto b=c->block(x,y,z);
                int op=lightOpacityOf(b.id,b.meta);
                if (op>=15) level=0;
                else if (op>0) level=(uint8_t)std::max(0,(int)level-op);
                c->setSky(x,y,z,level);
                if (level && y<=colHeight+1 && y>0)
                    skyQueue.push_back({c->cx*16+x,y,c->cz*16+z});
                int emit=blockDef(b.id).lightEmission;
                if (emit) {
                    c->setLight(x,y,z,(uint8_t)emit);
                    blockQueue.push_back({c->cx*16+x,y,c->cz*16+z});
                }
            }
        }
    }
    // Propagate light through open voxels, attenuating sideways by at least
    // one level. Direct overhead skylight remains 15 in a vertical air shaft.
    auto flood=[&](std::deque<Vec3i>& q,bool sky) {
        while (!q.empty()) {
            Vec3i p=q.front(); q.pop_front();
            int level=sky?skyAt(p.x,p.y,p.z):lightAt(p.x,p.y,p.z);
            if (level<=1) continue;
            for (Dir d : {Down,Up,North,South,West,East}) {
                Vec3i o=dirOffset(d),n=p+o;
                if (n.y<0 || n.y>=WorldHeight || !inRegion(n.x,n.z)) continue;
                auto b=peekBlock(n.x,n.y,n.z);
                int op=lightOpacityOf(b.id,b.meta);
                int newLevel=level-std::max(1,op);
                if (newLevel<=0) continue;
                Chunk* c=findChunk(floorDiv16(n.x),floorDiv16(n.z));
                int lx=floorMod16(n.x),lz=floorMod16(n.z);
                int old=sky?c->skyLight(lx,n.y,lz):c->blockLight(lx,n.y,lz);
                if (newLevel<=old) continue;
                if (sky) c->setSky(lx,n.y,lz,(uint8_t)newLevel);
                else c->setLight(lx,n.y,lz,(uint8_t)newLevel);
                q.push_back(n);
            }
        }
    };
    flood(skyQueue,true);
    flood(blockQueue,false);
}

std::optional<RayHit> World::raycast(Vec3f p,Vec3f dir,float reach,bool includeLiquids) const {
    dir=dir.normalized();
    if (dir.lengthSq()<0.5f || reach<=0) return std::nullopt;
    int x=(int)std::floor(p.x),y=(int)std::floor(p.y),z=(int)std::floor(p.z);
    int sx=(dir.x>0)?1:-1,sy=(dir.y>0)?1:-1,sz=(dir.z>0)?1:-1;
    auto boundary=[](float pos,int cell,int step,float delta) -> float {
        return delta==0 ? 1e30f : ((step>0 ? cell+1 : cell)-pos)/delta;
    };
    float tx=boundary(p.x,x,sx,dir.x),ty=boundary(p.y,y,sy,dir.y),tz=boundary(p.z,z,sz,dir.z);
    float dx=dir.x==0?1e30f:std::abs(1.0f/dir.x);
    float dy=dir.y==0?1e30f:std::abs(1.0f/dir.y);
    float dz=dir.z==0?1e30f:std::abs(1.0f/dir.z);
    Dir face=Up;
    float traveled=0;
    for (int steps=0;steps<1024;++steps) {
        float d=std::min({tx,ty,tz});
        // Looking around must never synchronously generate a chunk on the
        // render thread; a missing chunk simply has no selectable geometry.
        BlockState b=peekBlock(x,y,z);
        if (b.id!=BlockID::Air && blockDef(b.id).layer!=RenderLayer::Invisible &&
            (includeLiquids || !blockDef(b.id).liquid)) {
            return RayHit{{x,y,z},face,traveled,b};
        }
        if (d>reach) break;
        traveled=d;
        if (tx<=ty && tx<=tz) { x+=sx; face=sx>0?West:East; tx+=dx; }
        else if (ty<=tz) { y+=sy; face=sy>0?Down:Up; ty+=dy; }
        else { z+=sz; face=sz>0?North:South; tz+=dz; }
    }
    return std::nullopt;
}
bool World::collides(const AABB& box) {
    for (int y=(int)std::floor(box.min.y);y<(int)std::ceil(box.max.y);++y)
        for (int z=(int)std::floor(box.min.z);z<(int)std::ceil(box.max.z);++z)
            for (int x=(int)std::floor(box.min.x);x<(int)std::ceil(box.max.x);++x) {
                BlockState b=blockAt(x,y,z);
                AABB cb;
                if (blockCollision(b.id,b.meta,x,y,z,cb) && cb.intersects(box)) return true;
            }
    return false;
}
void World::schedule(int x,int y,int z,int delay) {
    if (y<0||y>=WorldHeight||scheduled_.size()>50000) return;
    scheduled_.push_back({time_+(uint64_t)delay,{x,y,z}});
}
void World::updateBlock(Vec3i p) {
    // Process only LOADED neighbours; simulation never generates huge new
    // worlds from a fluid update. Schedule further edges when chunks load.
    Chunk* c=findChunk(floorDiv16(p.x),floorDiv16(p.z));
    if (!c || p.y<1 || p.y>=WorldHeight-1) return;
    auto b=c->block(floorMod16(p.x),p.y,floorMod16(p.z));
    if (b.id==BlockID::Sand || b.id==BlockID::Gravel) {
        int y=p.y;
        while (y>1 && isAirLike(peekBlock(p.x,y-1,p.z).id)) --y;
        if (y!=p.y) { change(p.x,p.y,p.z,{},false); change(p.x,y,p.z,b,false); }
        return;
    }
    if (b.id==BlockID::Water || b.id==BlockID::FlowingWater ||
        b.id==BlockID::Lava || b.id==BlockID::FlowingLava) {
        bool water=b.id==BlockID::Water||b.id==BlockID::FlowingWater;
        uint16_t liquid=water?BlockID::FlowingWater:BlockID::FlowingLava;
        auto beneath=peekBlock(p.x,p.y-1,p.z);
        if (isAirLike(beneath.id) && beneath.id!=BlockID::Fire) {
            change(p.x,p.y-1,p.z,{liquid,(uint8_t)(8|(b.meta&7))},false);
            return;
        }
        if (b.meta>=7 && b.id==liquid) return;
        uint8_t level=(uint8_t)std::min(7,(int)(b.meta&7)+1);
        for (Dir d : {North,South,West,East}) {
            Vec3i off=dirOffset(d),n=p+off;
            if (!findChunk(floorDiv16(n.x),floorDiv16(n.z))) continue;
            auto next=peekBlock(n.x,n.y,n.z);
            if (next.id==BlockID::Air || next.id==BlockID::Tallgrass ||
                (next.id==liquid && (next.meta&7)>level))
                change(n.x,n.y,n.z,{liquid,level},false);
            if (!water && (next.id==BlockID::Water || next.id==BlockID::FlowingWater))
                change(p.x,p.y,p.z,{b.meta==0?BlockID::Obsidian:BlockID::Cobblestone,0},false);
        }
        return;
    }
    if (b.id==BlockID::Wheat || b.id==BlockID::Carrots || b.id==BlockID::Potatoes) {
        if (b.meta<7 && (worldHash(seed(),p.x,(int)time_,p.z)%24)==0)
            change(p.x,p.y,p.z,{b.id,(uint8_t)(b.meta+1)},false);
    }
}
void World::tick() {
    ++time_;
    int handled=0;
    while (!scheduled_.empty() && scheduled_.front().due<=time_ && handled<128) {
        auto ev=scheduled_.front(); scheduled_.pop_front();
        updateBlock(ev.pos); ++handled;
    }
    for (uint64_t key : needsRelight_)
        relightAround((int32_t)(key>>32),(int32_t)key);
    needsRelight_.clear();
}
void World::unloadFar(int cx,int cz,int radius) {
    for (auto it=chunks_.begin();it!=chunks_.end();) {
        Chunk& c=*it->second;
        if (std::max(std::abs(c.cx-cx),std::abs(c.cz-cz))>radius) it=chunks_.erase(it);
        else ++it;
    }
}
} // namespace vox
