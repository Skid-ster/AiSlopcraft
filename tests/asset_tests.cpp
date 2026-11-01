#include "core/Blocks.h"
#include "core/Items.h"
#include "core/Mesher.h"
#include "core/World.h"
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#define STB_IMAGE_IMPLEMENTATION
#include "stb/stb_image.h"

using namespace vox;
namespace fs=std::filesystem;
static void require(bool okay,const std::string& message) {
    if(!okay) throw std::runtime_error(message);
}
static void png(const fs::path& p,int wantW,int wantH) {
    int w=0,h=0,c=0;
    auto* data=stbi_load(p.string().c_str(),&w,&h,&c,4);
    if(!data) throw std::runtime_error("Cannot decode PNG: "+p.string()+": "+stbi_failure_reason());
    stbi_image_free(data);
    require(w==wantW && h==wantH,"Wrong PNG dimensions: "+p.string());
}
int main() {
    try {
        fs::path root=VOXCRAFT_ASSET_DIR;
        TileCatalog tiles; std::string err;
        require(tiles.load((root/"atlas.tsv").string(),err),err);
        png(root/"atlas.png",tiles.columns*16,tiles.rows*16);
        png(root/"font_atlas.png",256,96);
        std::size_t tested=0;
        for(int id=1;id<BlockID::BlockIDCount;++id) {
            if(std::string(blockName((uint16_t)id))=="air") continue;
            for(int m=0;m<16;++m)for(int f=0;f<6;++f) {
                auto name=blockTile((uint16_t)id,(uint8_t)m,f);
                require(tiles.has(name),"Missing block face tile: "+name);
                ++tested;
            }
        }
        for(int id=1;id<ItemID::ItemIDCount;++id)if(itemExists((uint16_t)id)) {
            for(int m=0;m<16;++m) {
                auto name=itemTile((uint16_t)id,(uint16_t)m);
                require(tiles.has(name),"Missing item tile: "+name);
                ++tested;
            }
        }
        std::ifstream list(root/"animations/manifest.tsv");
        require((bool)list,"Missing animation manifest");
        int strips=0;
        for(std::string line;std::getline(list,line);) {
            if(line.empty() || line[0]=='#') continue;
            std::istringstream f(line);std::string name;int frames=0,rate=0;
            require((bool)(f>>name>>frames>>rate) && frames>0 && frames<=64 && rate>0,
                    "Invalid animation metadata: "+line);
            require(tiles.has(name),"Animated tile not in atlas: "+name);
            png(root/"animations"/(name+".png"),16,frames*16);
            ++strips;
        }
        require(strips>=4,"Expected at least four animation strips");
        for (const char* sound : {"break_stone","break_wood","step_grass","step_stone",
                                  "place","pickup","hurt","click","splash"}) {
            std::ifstream wav(root/"audio"/(std::string(sound)+".wav"),std::ios::binary);
            char header[12]{};wav.read(header,12);
            require(wav.gcount()==12 && std::string(header,4)=="RIFF" &&
                    std::string(header+8,4)=="WAVE",std::string("Missing/bad WAV: ")+sound);
        }
        World w(9,WorldType::Flat);
        w.ensureChunk(0,0);
        auto mesh=meshSection(w,0,0,0,tiles);
        require(mesh.vertices()>0 && mesh.missingTiles==0,
                "Flat-world mesh is empty or uses missing tiles");
        require(mesh.solid.size()%6==0 && mesh.cutout.size()%6==0,
                "Mesh quad indices are not triangular");
        std::cout<<"[PASS] "<<tiles.count()<<" atlas tiles, "<<tested
                 <<" registry face/icon lookups, "<<strips
                 <<" decoded animations, 9 WAV headers, flat-world mesh\n";
        return 0;
    }catch(const std::exception& ex){std::cerr<<"[FAIL] "<<ex.what()<<'\n';return 1;}
}
