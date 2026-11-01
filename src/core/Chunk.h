#pragma once
#include "Types.h"
#include <array>
#include <cstdint>
#include <memory>

namespace vox {

struct BlockState {
    uint16_t id = 0;
    uint8_t meta = 0;
    bool operator==(const BlockState& other) const = default;
};

// Packed 4-bit sky/block light and metadata; block IDs 16-bit to leave room
// for non-standard blocks without corrupting the persistent format.
struct Section {
    std::array<uint16_t, 4096> ids{};
    std::array<uint8_t, 2048> meta{};
    std::array<uint8_t, 2048> sky{};
    std::array<uint8_t, 2048> light{};
    int nonAir = 0;
    static int index(int x, int y, int z) { return ((y&15)<<8) | ((z&15)<<4) | (x&15); }
    static uint8_t nibble(const std::array<uint8_t,2048>& a, int idx) {
        uint8_t v = a[idx>>1]; return (idx & 1) ? (v >> 4) : (v & 15);
    }
    static void nibbleSet(std::array<uint8_t,2048>& a, int idx, uint8_t value) {
        uint8_t& v = a[idx>>1];
        v = (idx & 1) ? (uint8_t)((v & 15) | ((value & 15) << 4))
                      : (uint8_t)((v & 240) | (value & 15));
    }
    BlockState block(int x, int y, int z) const {
        int i=index(x,y,z); return {ids[i],nibble(meta,i)};
    }
};

class Chunk {
public:
    explicit Chunk(int chunkX, int chunkZ) : cx(chunkX), cz(chunkZ) { dirty.fill(true); }
    Chunk(const Chunk&) = delete;
    Chunk& operator=(const Chunk&) = delete;
    int cx, cz;
    std::array<uint8_t, 256> biomes{};
    // Highest fully light-blocking block + 1; used for implicit sky 15 above.
    std::array<uint16_t, 256> height{};
    std::array<bool, SectionCount> dirty{};
    bool generated = false;

    BlockState block(int lx, int y, int lz) const;
    bool setBlock(int lx, int y, int lz, BlockState b);
    uint8_t skyLight(int lx, int y, int lz) const;
    uint8_t blockLight(int lx, int y, int lz) const;
    void setSky(int lx, int y, int lz, uint8_t level);
    void setLight(int lx, int y, int lz, uint8_t level);
    void clearLight();
    void markAllDirty() { dirty.fill(true); }
    int topSolid(int lx, int lz) const; // true non-air surface (not heightmap)
    std::size_t allocatedSections() const;
private:
    Section& makeSection(int index);
    std::array<std::unique_ptr<Section>,SectionCount> sections_{};
};

// Correct mathematical floor division / floor modulo for x/z < 0.
int floorDiv16(int n);
int floorMod16(int n);

} // namespace vox
