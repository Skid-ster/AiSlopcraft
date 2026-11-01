#include "game/Game.h"
#include "core/Mesher.h"
#include "core/Blocks.h"
#include "core/Save.h"
#include <SDL3/SDL.h>
#include <SDL3/SDL_main.h>
#include <chrono>
#include <filesystem>
#include <iostream>
#include <string>
#include <thread>

namespace {
std::filesystem::path assets() {
    std::filesystem::path next=std::filesystem::path(SDL_GetBasePath())/"assets";
    if(std::filesystem::exists(next/"atlas.tsv"))return next;
    if(std::filesystem::exists("assets/atlas.tsv"))return "assets";
    return VOXCRAFT_ASSET_DIR;
}
int selftest() {
    using namespace vox;
    std::string error;
    TileCatalog tiles;
    if(!tiles.load((assets()/"atlas.tsv").string(),error)) {
        std::cerr<<"selftest failed: "<<error<<'\n';return 1;
    }
    World w(7137331,WorldType::Flat);
    w.ensureChunk(-1,0);
    if(w.blockAt(-1,3,0).id!=BlockID::Grass ||
       !w.setBlock(-1,4,0,{BlockID::Torch,0}) || w.lightAt(-1,4,0)!=14) {
        std::cerr<<"selftest failed: core world/lighting\n";return 1;
    }
    auto mesh=meshSection(w,-1,0,0,tiles);
    if(mesh.vertices()==0||mesh.missingTiles) {
        std::cerr<<"selftest failed: mesh or missing atlas tiles\n";return 1;
    }
    PlayerSnapshot player;player.position={-0.5f,4.f,0.5f};
    auto save=std::filesystem::temp_directory_path()/"aislopcraft-selftest"/"world.bin";
    if(!saveWorld(w,player,save,error)) {
        std::cerr<<"selftest failed: save: "<<error<<'\n';return 1;
    }
    PlayerSnapshot restored;
    auto loaded=loadWorld(save,restored,error);
    std::filesystem::remove_all(save.parent_path());
    if(!loaded || loaded->blockAt(-1,4,0).id!=BlockID::Torch) {
        std::cerr<<"selftest failed: load: "<<error<<'\n';return 1;
    }
    std::cout<<"SELFTEST PASS (headless): worldgen, edit, light, "<<mesh.vertices()
             <<" mesh vertices, "<<tiles.count()<<" atlas names, save/load. "
             <<"No OpenGL window or gameplay visuals were tested.\n";
    return 0;
}
int benchmark() {
    using namespace vox;
    using Clock=std::chrono::steady_clock;
    TileCatalog tiles;std::string error;
    if(!tiles.load((assets()/"atlas.tsv").string(),error)) {
        std::cerr<<error<<'\n';return 1;
    }
    std::cout<<"CPU-ONLY benchmark (NOT 1440p FPS, no GPU). Platform: "<<SDL_GetPlatform()
             <<"; hardware_concurrency: "<<std::thread::hardware_concurrency()<<"\n";
    struct Case {const char* name;int64_t seed;WorldType type;int cx,cz;};
    const Case cases[]={{"outdoor",7137331,WorldType::Default,0,0},
        {"mixed-biomes",7137331,WorldType::LargeBiomes,25,-15},
        {"fast-new-chunks",7137331,WorldType::Default,-18,22},
        {"cave",90121,WorldType::Default,7,3},
        {"water-and-glass",12345,WorldType::Default,-1,-7},
        {"populated-mobs",0,WorldType::Flat,0,0},
        {"save-reload",-19027,WorldType::Flat,-2,1}};
    for(const auto& sc:cases) {
        if(std::string(sc.name)=="populated-mobs") {
            std::cout<<"populated-mobs: UNIMPLEMENTED (no mob simulation/benchmark)\n";continue;
        }
        World world(sc.seed,sc.type);
        auto t0=Clock::now();world.ensureChunk(sc.cx,sc.cz);
        auto t1=Clock::now();
        if(std::string(sc.name)=="water-and-glass") {
            int x=sc.cx*16+8,z=sc.cz*16+8;
            world.setBlock(x,world.generator().heightAt(x,z)+2,z,{BlockID::Glass,0});
        }
        size_t vertices=0;
        for(int sy=0;sy<SectionCount;++sy)
            vertices+=meshSection(world,sc.cx,sc.cz,sy,tiles).vertices();
        auto t2=Clock::now();
        if(std::string(sc.name)=="save-reload") {
            std::string err;PlayerSnapshot player;
            auto file=std::filesystem::temp_directory_path()/"aislopcraft-bench"/"world.bin";
            if(!saveWorld(world,player,file,err)) {std::cerr<<err<<'\n';return 1;}
            auto loaded=loadWorld(file,player,err);
            std::filesystem::remove_all(file.parent_path());
            if(!loaded) {std::cerr<<err<<'\n';return 1;}
        }
        double gen=std::chrono::duration<double,std::milli>(t1-t0).count();
        double mesh=std::chrono::duration<double,std::milli>(t2-t1).count();
        std::cout<<sc.name<<": one chunk generation+light "<<gen
                 <<" ms; mesh "<<mesh<<" ms; vertices "<<vertices<<"\n";
    }
    std::cout<<"These workloads are not the seven complete GPU scenes; "
             <<"run the desktop app at native 2560x1440, and benchmark after "
             <<"mobs/structures are implemented. No FPS claims.\n";
    return 0;
}
}
int main(int argc,char* argv[]) {
    if(argc>1) {
        std::string flag=argv[1];
        if(flag=="--selftest")return selftest();
        if(flag=="--benchmark")return benchmark();
        if(flag=="--visual-smoke") {
            if(argc!=3) {std::cerr<<"Usage: aislopcraft --visual-smoke <output-directory>\n";return 2;}
            vox::Game game;
            return game.visualSmoke(argv[2]);
        }
        if(flag=="--help") {
            std::cout<<"AiSlopcraft (unofficial 1.7.3-inspired native sandbox)\n"
                <<"  aislopcraft             Open the SDL3/OpenGL desktop game\n"
                <<"  aislopcraft --selftest  Headless startup/core smoke test\n"
                <<"  aislopcraft --visual-smoke <dir>  Capture GL title/world/creative frames (display required)\n"
                <<"  aislopcraft --benchmark CPU-only workloads (NOT 1440p FPS)\n";
            return 0;
        }
        std::cerr<<"Unknown option: "<<flag<<". Use --help.\n";return 2;
    }
    vox::Game game;
    return game.run();
}
