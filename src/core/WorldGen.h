#pragma once
#include "Chunk.h"
#include "Noise.h"
#include <cstdint>
#include <memory>

namespace vox {

enum class WorldType : uint8_t { Default=0, Flat=1, LargeBiomes=2, Amplified=3 };
enum class Dimension : int8_t { Overworld=0, Nether=-1, End=1 };

// Numeric 1.7 biome IDs (subset in this independent generator).
enum class Biome : uint8_t {
    Ocean=0, Plains=1, Desert=2, ExtremeHills=3, Forest=4, Taiga=5,
    Swamp=6, River=7, Nether=8, End=9, FrozenOcean=10, FrozenRiver=11,
    IcePlains=12, IceMountains=13, MushroomIsland=14, MushroomShore=15,
    Beach=16, DesertHills=17, ForestHills=18, TaigaHills=19,
    ExtremeHillsEdge=20, Jungle=21, JungleHills=22, JungleEdge=23,
    DeepOcean=24, StoneBeach=25, ColdBeach=26, BirchForest=27,
    BirchForestHills=28, RoofedForest=29, ColdTaiga=30, ColdTaigaHills=31,
    MegaTaiga=32, MegaTaigaHills=33, ExtremeHillsPlus=34, Savanna=35,
    SavannaPlateau=36, Mesa=37, MesaPlateauF=38, MesaPlateau=39
};
const char* biomeName(uint8_t b);
uint32_t biomeGrassColor(uint8_t b);
uint32_t biomeFoliageColor(uint8_t b);

// Deterministic 1.7-INSPIRED terrain, not seed-for-seed vanilla worldgen.
// Generator is immutable after construction: safe to call on worker threads.
class WorldGenerator {
public:
    WorldGenerator(int64_t seed, WorldType type=WorldType::Default,
                   Dimension dim=Dimension::Overworld);
    int64_t seed() const { return seed_; }
    WorldType type() const { return type_; }
    Dimension dimension() const { return dim_; }
    Biome biomeAt(int x, int z) const;
    int heightAt(int x, int z) const; // highest solid terrain y before decoration
    std::unique_ptr<Chunk> generate(int cx, int cz) const;
private:
    int64_t seed_;
    WorldType type_;
    Dimension dim_;
    OctaveNoise climate_, moisture_, continental_, hills_, detail_, cave_;
    void decorateTrees(Chunk& c) const;
};

} // namespace vox
