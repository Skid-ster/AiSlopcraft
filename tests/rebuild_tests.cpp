#include "rebuild/Mesh.h"
#include "rebuild/StudySave.h"
#include "rebuild/World.h"
#include <chrono>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#define STB_IMAGE_IMPLEMENTATION
#include "stb/stb_image.h"

// Never use assert in Release CTest: NDEBUG would silently remove the tests.
#define CHECK(...) do { if (!(__VA_ARGS__)) { \
    std::cerr << "CHECK failed: " << #__VA_ARGS__ << " line " << __LINE__ << '\n'; \
    return 1; } } while(false)

using namespace rebuild;
int main() {
    int width=0,height=0,channels=0;
    auto atlas=std::string(VOXCRAFT_ASSET_DIR)+"/rebuild/atlas.png";
    unsigned char* pixels=stbi_load(atlas.c_str(),&width,&height,&channels,4);
    CHECK(pixels && width==256 && height==16 && channels==4);
    int leafCutouts=0,leafOpaque=0;
    for(int y=0;y<16;++y)for(int x=96;x<112;++x) {
        unsigned char alpha=pixels[(y*width+x)*4+3];
        if(alpha<128)++leafCutouts;else ++leafOpaque;
    }
    CHECK(leafCutouts>16 && leafOpaque>120);
    stbi_image_free(pixels);
    World a,b;
    for(int x=-48;x<48;x+=7)for(int z=-48;z<48;z+=9)
        for(int y=0;y<25;++y)CHECK(a.get({x,y,z})==b.get({x,y,z}));
    CHECK(!a.set({0,0,0},Block::Air));
    CHECK(!a.set({48,10,0},Block::Stone));
    CHECK(!solid(Block::Flower) && !opaque(Block::Leaves));
    CHECK(solid(Block::Leaves) && tile(Block::Grass,1)!=tile(Block::Grass,2));
    Player starting;
    starting.feet.y=float(World::surface(0,15)+1);
    auto initial=raycast(a,starting.eye(),starting.direction());
    CHECK(initial && initial->distance>0 && initial->distance<=4.5f);
    Block saved=a.get(initial->cell);
    for(int i=0;i<100;++i){
        CHECK(a.set(initial->cell,Block::Air));
        CHECK(a.get(initial->cell)==Block::Air);
        CHECK(a.set(initial->cell,saved));
        CHECK(a.get(initial->cell)==saved);
    }

    CHECK(a.set({-1,20,0},Block::Cobble));
    auto hit=raycast(a,{-3.5f,20.5f,.5f},{1,0,0});
    CHECK(hit && hit->cell==Cell(-1,20,0) && hit->normal==Cell(-1,0,0));
    CHECK(std::abs(hit->distance-2.5f)<.0001f);
    CHECK(!raycast(a,{-3.5f,20.5f,.5f},{1,0,0},2.49f));
    CHECK(a.set(hit->cell,Block::Air));
    CHECK(!raycast(a,{-3.5f,20.5f,.5f},{1,0,0}));
    CHECK(a.set({-1,20,0},Block::Stone));
    CHECK(a.set({0,20,0},Block::Stone));
    auto left=buildMesh(a,2,3),right=buildMesh(a,3,3);
    CHECK(!left.vertices.empty() && left.vertices.size()%6==0);
    CHECK(!right.vertices.empty() && right.vertices.size()%6==0);
    const auto adjacentFaces=left.cubeFaces+right.cubeFaces;
    CHECK(a.set({0,20,0},Block::Air));
    const auto separatedFaces=buildMesh(a,2,3).cubeFaces+buildMesh(a,3,3).cubeFaces;
    CHECK(separatedFaces==adjacentFaces-4); // 2 exposed faces after 1 cube is removed: -6+2
    CHECK(a.set({1,20,0},Block::Flower));
    CHECK(buildMesh(a,3,3).plantQuads>=2);
    World aoScene;
    CHECK(aoScene.set({2,20,0},Block::Stone));
    CHECK(aoScene.set({3,21,0},Block::Stone));
    float clearCorner=0,occludedCorner=0;
    for(const auto& vertex:buildMesh(aoScene,3,3).vertices){
        if(vertex.y==21 && vertex.z==0 && vertex.x==2 && vertex.light>.84f)
            clearCorner=vertex.light;
        if(vertex.y==21 && vertex.z==0 && vertex.x==3 && vertex.light>.84f)
            occludedCorner=vertex.light;
    }
    CHECK(clearCorner>.99f && occludedCorner>.84f && occludedCorner<clearCorner);

    World movement;
    CHECK(movement.set({0,7,11},Block::Air)); // open a level controller test corridor
    CHECK(movement.set({0,8,10},Block::Air));
    Player p;
    p.feet.y=float(World::surface(0,15)+1);
    for(int i=0;i<120;++i)p.tick(movement,Input{.forward=true},1.f/60);
    CHECK(p.feet.z<8.f && p.feet.z>6.f);
    CHECK(p.onGround && std::abs(p.feet.y-7.f)<.1f);
    float ground=p.feet.y;
    p.tick(movement,Input{.jump=true},1.f/60);
    for(int i=0;i<12;++i)p.tick(movement,Input{},1.f/60);
    CHECK(p.feet.y>ground+.25f);
    for(int i=0;i<120;++i)p.tick(movement,Input{},1.f/60);
    CHECK(p.onGround && std::abs(p.feet.y-ground)<.1f);

    World blocked;
    CHECK(blocked.set({0,7,11},Block::Air)); // clear opening outcrop for a plain wall test
    CHECK(blocked.set({0,8,10},Block::Air));
    CHECK(blocked.set({0,7,10},Block::Planks));
    CHECK(blocked.set({0,8,10},Block::Planks));
    Player q;q.feet.y=7;
    for(int i=0;i<120;++i)q.tick(blocked,Input{.forward=true},1.f/60);
    CHECK(q.feet.z>=11.29f && q.feet.z<12.f); // player cannot pass through wall
    CHECK(q.overlaps({0,7,11}));
    CHECK(!q.overlaps({0,7,10}));

    const auto root=std::filesystem::temp_directory_path()/
        ("aislopcraft-rebuild-save-test-"+
         std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));
    const auto file=root/"saves-rebuild"/"study-v1.bin";
    std::filesystem::create_directories(root/"saves");
    {std::ofstream untouched(root/"saves"/"legacy-sentinel");untouched<<"old data";}
    World source;
    CHECK(source.set({-1,20,0},Block::Stone));
    CHECK(source.set({0,20,0},Block::Flower));
    Player sp;sp.feet={1.5f,7.f,15.5f};sp.yaw=.25f;sp.pitch=-.35f;
    std::string error;
    CHECK(saveStudy(source,sp,4,file,error));
    CHECK(std::filesystem::exists(root/"saves"/"legacy-sentinel"));
    World restored;Player rp;int slot=0;
    auto status=loadStudy(restored,rp,slot,file);
    CHECK(status.loaded && !status.backup && status.edits==2);
    CHECK(restored.get({-1,20,0})==Block::Stone);
    CHECK(restored.get({0,20,0})==Block::Flower);
    CHECK(rp.feet.x==sp.feet.x && rp.yaw==sp.yaw && slot==4);
    CHECK(source.set({1,20,0},Block::Planks));
    CHECK(saveStudy(source,sp,3,file,error));
    auto backup=file;backup+=".bak";
    CHECK(std::filesystem::exists(backup));
    {std::fstream corrupt(file,std::ios::binary|std::ios::in|std::ios::out);
     corrupt.seekp(22);const char broken='x';corrupt.write(&broken,1);}
    World recovered;Player recoverPlayer;int chosen=0;
    status=loadStudy(recovered,recoverPlayer,chosen,file);
    CHECK(status.loaded && status.backup && status.edits==2 && chosen==4);
    CHECK(recovered.get({1,20,0})==Block::Air); // backup predates the third edit
    CHECK(recovered.get({0,20,0})==Block::Flower);
    std::ifstream goodBackup(backup,std::ios::binary);
    const std::string backupBytes((std::istreambuf_iterator<char>(goodBackup)),{});
    goodBackup.close();
    CHECK(saveStudy(source,sp,3,file,error)); // invalid primary must not overwrite valid backup
    std::ifstream stillGood(backup,std::ios::binary);
    CHECK(std::string((std::istreambuf_iterator<char>(stillGood)),{})==backupBytes);
    stillGood.close();
    CHECK(std::filesystem::exists(root/"saves"/"legacy-sentinel"));
    std::filesystem::resize_file(file,8);
    std::filesystem::resize_file(backup,8);
    World unchanged;Player notChanged;int stillSlot=7;
    CHECK(unchanged.set({7,20,0},Block::Cobble));
    status=loadStudy(unchanged,notChanged,stillSlot,file);
    CHECK(!status.loaded && unchanged.get({7,20,0})==Block::Cobble && stillSlot==7);
    std::filesystem::remove_all(root); // only our unique test directory

    std::cout<<"REBUILD CORE PASS: deterministic study, reach/face, seam mesh, "
             <<"movement, collision, separate save/backup/corruption (no GL or visual claims).\n";
}
