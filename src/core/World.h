#pragma once
#include "WorldGen.h"
#include <array>
#include <cstdint>
#include <deque>
#include <memory>
#include <optional>
#include <unordered_map>
#include <unordered_set>

namespace vox {

struct RayHit {
    Vec3i pos;
    Dir face = Up;      // face entered by the ray (place adjacent at face offset)
    float distance = 0;
    BlockState block{};
};

class World {
public:
    using Edits = std::unordered_map<uint64_t,std::unordered_map<uint16_t,BlockState>>;
    explicit World(int64_t seed, WorldType type=WorldType::Default,
                   Dimension dim=Dimension::Overworld);
    World(const World&) = delete;
    World& operator=(const World&) = delete;
    int64_t seed() const { return gen_.seed(); }
    WorldType type() const { return gen_.type(); }
    Dimension dimension() const { return gen_.dimension(); }
    uint64_t time() const { return time_; }
    void setTime(uint64_t ticks) { time_=ticks; }
    const WorldGenerator& generator() const { return gen_; }
    const std::unordered_map<uint64_t,std::unique_ptr<Chunk>>& chunks() const { return chunks_; }
    const Edits& edits() const { return changes_; }
    bool loadEdits(Edits edits); // on a fresh World, validates and stores edits

    Chunk& ensureChunk(int cx,int cz);
    void installChunk(std::unique_ptr<Chunk> chunk); // worker-generated, main thread only
    Chunk* findChunk(int cx,int cz);
    const Chunk* findChunk(int cx,int cz) const;
    BlockState blockAt(int x,int y,int z); // generates the target chunk if absent
    BlockState peekBlock(int x,int y,int z) const; // never generates (for mesher)
    bool setBlock(int x,int y,int z, BlockState b);
    uint8_t skyAt(int x,int y,int z) const;
    uint8_t lightAt(int x,int y,int z) const;
    void relightAround(int cx,int cz);
    std::optional<RayHit> raycast(Vec3f origin, Vec3f direction, float reach,
                                  bool includeLiquids=false);
    bool collides(const AABB& box);
    void tick(); // 20 Hz; capped scheduled updates
    void unloadFar(int centerX,int centerZ,int radius);
    std::size_t loadedChunkCount() const { return chunks_.size(); }
private:
    struct TickEvent { uint64_t due; Vec3i pos; };
    WorldGenerator gen_;
    uint64_t time_=6000;
    std::unordered_map<uint64_t,std::unique_ptr<Chunk>> chunks_;
    Edits changes_;
    std::unordered_set<uint64_t> needsRelight_;
    std::deque<TickEvent> scheduled_;
    void markNeighbors(int x,int y,int z);
    bool change(int x,int y,int z,BlockState b,bool doLight);
    void schedule(int x,int y,int z,int delay);
    void updateBlock(Vec3i pos);
};

} // namespace vox
