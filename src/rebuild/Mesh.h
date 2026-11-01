#pragma once
#include "World.h"
#include <vector>

namespace rebuild {

// World-local mesh generation. CPU-only/testable; GL upload is a separate path.
struct Vertex { float x,y,z,u,v,light; };
struct Mesh {
    std::vector<Vertex> vertices;
    size_t cubeFaces=0, plantQuads=0;
};
// Chunk coordinates 0..5, independent of the legacy chunk/mesher types.
Mesh buildMesh(const World& world,int cx,int cz);
// Indices in the original, one-row 16×16-pixel atlas.
int tile(Block b,int face); // 0=down 1=up 2=north 3=south 4=west 5=east

} // namespace rebuild
