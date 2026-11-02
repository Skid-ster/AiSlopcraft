#pragma once
#include "World.h"
#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

namespace vox {

// Atlas: rows of 16x16 pixel tiles; the manifest contains "tile_name<TAB>id".
// The map is shared by meshing and the asset audit; missing names do not
// silently become a valid texture (lookup returns -1).
class TileCatalog {
public:
    bool load(const std::string& manifest, std::string& error);
    void add(const std::string& name, int index); // useful for unit-test meshes
    int lookup(const std::string& name) const;
    bool has(const std::string& name) const { return lookup(name)>=0; }
    std::size_t count() const { return tile_.size(); }
    int columns=32;
    int rows=1;
private:
    std::unordered_map<std::string,int> tile_;
};

struct MeshVertex {
    float x,y,z, u,v, r,g,b, sky,block;
};
struct MeshData {
    std::vector<MeshVertex> solid,cutout,transparent;
    std::size_t faces=0,missingTiles=0;
    std::size_t vertices() const { return solid.size()+cutout.size()+transparent.size(); }
};

// Output positions are LOCAL to chunk x/z and GLOBAL y. No GL/SDL calls.
MeshData meshSection(const World& world,int cx,int cz,int sectionY,
                     const TileCatalog& atlas);

} // namespace vox
