#include "Chunk.h"
#include "Blocks.h"
#include <algorithm>

namespace vox {
int floorDiv16(int n) { return n >= 0 ? n/16 : (n+1)/16 - 1; }
int floorMod16(int n) { return n - floorDiv16(n)*16; }

Section& Chunk::makeSection(int index) {
    if (!sections_[index]) sections_[index] = std::make_unique<Section>();
    return *sections_[index];
}
BlockState Chunk::block(int lx, int y, int lz) const {
    if (y<0 || y>=WorldHeight || lx<0 || lx>=16 || lz<0 || lz>=16) return {};
    const auto& s=sections_[y/16];
    return s ? s->block(lx,y,lz) : BlockState{};
}
bool Chunk::setBlock(int lx, int y, int lz, BlockState b) {
    if (y<0 || y>=WorldHeight || lx<0 || lx>=16 || lz<0 || lz>=16 ||
        b.id >= BlockID::BlockIDCount) return false;
    int si=y/16, col=lz*16+lx;
    BlockState old=block(lx,y,lz);
    if (old==b) return false;
    Section& s=makeSection(si);
    int i=Section::index(lx,y,lz);
    if (old.id == 0 && b.id != 0) ++s.nonAir;
    if (old.id != 0 && b.id == 0) --s.nonAir;
    s.ids[i]=b.id; Section::nibbleSet(s.meta,i,b.meta);
    bool wasOpaque = old.id && isOpaqueForLight(old.id,old.meta);
    bool nowOpaque = b.id && isOpaqueForLight(b.id,b.meta);
    if (nowOpaque && y>=height[col]) height[col]=(uint16_t)(y+1);
    else if (wasOpaque && !nowOpaque && y+1==height[col]) {
        int h=y-1;
        for (; h>=0; --h) {
            auto bb=block(lx,h,lz);
            if (bb.id && isOpaqueForLight(bb.id,bb.meta)) break;
        }
        height[col]=(uint16_t)(h+1);
    }
    dirty[si]=true;
    if (si>0 && y%16==0) dirty[si-1]=true;
    if (si+1<SectionCount && y%16==15) dirty[si+1]=true;
    return true;
}
uint8_t Chunk::skyLight(int lx, int y, int lz) const {
    if (y>=WorldHeight) return 15;
    if (y<0 || lx<0 || lx>=16 || lz<0 || lz>=16) return 0;
    const auto& s=sections_[y/16];
    if (s) return Section::nibble(s->sky,Section::index(lx,y,lz));
    return y>=height[lz*16+lx] ? 15 : 0;
}
uint8_t Chunk::blockLight(int lx, int y, int lz) const {
    if (y<0 || y>=WorldHeight || lx<0 || lx>=16 || lz<0 || lz>=16) return 0;
    const auto& s=sections_[y/16];
    return s ? Section::nibble(s->light,Section::index(lx,y,lz)) : 0;
}
void Chunk::setSky(int lx, int y, int lz, uint8_t level) {
    if (y<0 || y>=WorldHeight || lx<0 || lx>=16 || lz<0 || lz>=16) return;
    // Implicit sky is enough for unallocated sections above the terrain.
    if (!sections_[y/16] && level == (y>=height[lz*16+lx] ? 15 : 0)) return;
    Section::nibbleSet(makeSection(y/16).sky,Section::index(lx,y,lz),level);
    dirty[y/16]=true;
}
void Chunk::setLight(int lx, int y, int lz, uint8_t level) {
    if (y<0 || y>=WorldHeight || lx<0 || lx>=16 || lz<0 || lz>=16) return;
    if (!sections_[y/16] && !level) return;
    Section::nibbleSet(makeSection(y/16).light,Section::index(lx,y,lz),level);
    dirty[y/16]=true;
}
void Chunk::clearLight() {
    for (int i=0;i<SectionCount;++i) if (sections_[i]) {
        sections_[i]->sky.fill(0);
        sections_[i]->light.fill(0);
        dirty[i]=true;
    }
}
int Chunk::topSolid(int lx, int lz) const {
    for (int y=WorldHeight-1; y>=0; --y) {
        auto b=block(lx,y,lz);
        if (b.id && blockDef(b.id).solid) return y;
    }
    return -1;
}
std::size_t Chunk::allocatedSections() const {
    std::size_t n=0;
    for (const auto& s : sections_) if (s) ++n;
    return n;
}
} // namespace vox
