#include "Mesh.h"
#include <array>

namespace rebuild {

int tile(Block b,int face) {
    switch(b) {
        case Block::Grass:return face==1?0:(face==0?2:1);
        case Block::Dirt:return 2;
        case Block::Stone:return 3;
        case Block::Log:return face<2?5:4;
        case Block::Leaves:return 6;
        case Block::Planks:return 7;
        case Block::Cobble:return 8;
        case Block::Sand:return 9;
        case Block::TallGrass:return 10;
        case Block::Flower:return 11;
        default:return 2;
    }
}
namespace {
// Vertex order is coherent per face. Culling is left off for cutout plants.
constexpr std::array<std::array<Vec3,4>,6> corners{{
    {{{0,0,0},{1,0,0},{1,0,1},{0,0,1}}}, // down
    {{{0,1,0},{0,1,1},{1,1,1},{1,1,0}}}, // up
    {{{0,0,0},{0,1,0},{1,1,0},{1,0,0}}}, // north
    {{{1,0,1},{1,1,1},{0,1,1},{0,0,1}}}, // south
    {{{0,0,1},{0,1,1},{0,1,0},{0,0,0}}}, // west
    {{{1,0,0},{1,1,0},{1,1,1},{1,0,1}}}  // east
}};
constexpr std::array<Cell,6> normals{{{0,-1,0},{0,1,0},{0,0,-1},{0,0,1},{-1,0,0},{1,0,0}}};
constexpr std::array<float,6> light{{.55f,1.f,.82f,.82f,.69f,.69f}};
void appendQuad(Mesh& mesh,Block block,int face,Cell pos,const std::array<Vec3,4>& quad) {
    const int t=tile(block,face);
    std::array<Vertex,4> v{};
    for(int i=0;i<4;++i) {
        const Vec3 p=quad[static_cast<size_t>(i)];
        float u=face<2?p.x:(face<4?p.x:p.z);
        float vertical=face<2?p.z:p.y;
        // Half-texel inset prevents sampling a neighbouring atlas cell.
        u=.03125f+.9375f*u;
        vertical=.03125f+.9375f*vertical;
        v[static_cast<size_t>(i)]={pos.x+p.x,pos.y+p.y,pos.z+p.z,
                                   (float(t)+u)/16.f,vertical,light[static_cast<size_t>(face)]};
    }
    constexpr int order[]={0,1,2,0,2,3};
    for(int i:order)mesh.vertices.push_back(v[static_cast<size_t>(i)]);
}
void plant(Mesh& mesh,Block b,Cell c) {
    constexpr std::array<Vec3,4> diagonalA{{{.12f,0,.12f},{.12f,1,.12f},
                                             {.88f,1,.88f},{.88f,0,.88f}}};
    constexpr std::array<Vec3,4> diagonalB{{{.88f,0,.12f},{.88f,1,.12f},
                                             {.12f,1,.88f},{.12f,0,.88f}}};
    appendQuad(mesh,b,2,c,diagonalA);
    appendQuad(mesh,b,2,c,diagonalB);
    mesh.plantQuads+=2;
}
}
Mesh buildMesh(const World& world,int cx,int cz) {
    Mesh result;
    if(cx<0 || cx>=World::side/World::chunk || cz<0 || cz>=World::side/World::chunk)
        return result;
    for(int z=cz*World::chunk-World::half;z<(cz+1)*World::chunk-World::half;++z)
        for(int x=cx*World::chunk-World::half;x<(cx+1)*World::chunk-World::half;++x)
            for(int y=0;y<World::height;++y) {
                Cell c{x,y,z};Block b=world.get(c);
                if(b==Block::Air)continue;
                if(b==Block::TallGrass || b==Block::Flower){plant(result,b,c);continue;}
                for(int face=0;face<6;++face){
                    const auto n=normals[static_cast<size_t>(face)];
                    Block adjacent=world.get({x+n.x,y+n.y,z+n.z});
                    if(opaque(adjacent) || (b==Block::Leaves && adjacent==Block::Leaves))continue;
                    appendQuad(result,b,face,c,corners[static_cast<size_t>(face)]);
                    ++result.cubeFaces;
                }
            }
    return result;
}
} // namespace rebuild
