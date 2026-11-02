#include "StudySave.h"
#include <algorithm>
#include <array>
#include <bit>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <limits>
#include <system_error>
#include <utility>
#include <vector>
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#endif

namespace rebuild {
namespace {
constexpr std::array<uint8_t,8> magic{'A','S','R','B','S','T','U','1'};
constexpr uint16_t version=1;
constexpr uint8_t sceneRevision=1;
constexpr size_t headerSize=42;
constexpr size_t blockCount=static_cast<size_t>(World::side)*World::side*World::height;
static_assert(sizeof(float)==4 && std::numeric_limits<float>::is_iec559,
              "Study save requires IEEE 754 binary32 floats");

uint32_t crc32(const uint8_t* p,size_t length) {
    uint32_t crc=0xFFFFFFFFu;
    for(size_t i=0;i<length;++i){
        crc^=p[i];
        for(int bit=0;bit<8;++bit)crc=(crc>>1)^((crc&1)?0xEDB88320u:0);
    }
    return ~crc;
}
void put16(std::vector<uint8_t>& b,uint16_t v) {
    b.push_back(static_cast<uint8_t>(v));b.push_back(static_cast<uint8_t>(v>>8));
}
void put32(std::vector<uint8_t>& b,uint32_t v) {
    for(int i=0;i<4;++i)b.push_back(static_cast<uint8_t>(v>>(8*i)));
}
uint16_t read16(const std::vector<uint8_t>& b,size_t at) {
    return static_cast<uint16_t>(b[at] | (uint16_t(b[at+1])<<8));
}
uint32_t read32(const std::vector<uint8_t>& b,size_t at) {
    uint32_t n=0;
    for(int i=0;i<4;++i)n|=uint32_t(b[at+static_cast<size_t>(i)])<<(8*i);
    return n;
}
bool validCamera(const Player& p,int slot) {
    const auto v=p.feet;
    return std::isfinite(v.x)&&std::isfinite(v.y)&&std::isfinite(v.z)&&
           std::isfinite(p.yaw)&&std::isfinite(p.pitch)&&slot>=0&&slot<9&&
           v.x>=-World::half+.3f&&v.x<=World::half-.3f&&
           v.z>=-World::half+.3f&&v.z<=World::half-.3f&&
           v.y>=1.f&&v.y<World::height-1.8f&&
           std::abs(p.yaw)<1.e6f&&p.pitch>=-1.54f&&p.pitch<=1.54f;
}

bool readOne(const std::filesystem::path& path,World& world,Player& player,int& slot,
             size_t& editCount,std::string& error) {
    std::error_code ec;
    auto length=std::filesystem::file_size(path,ec);
    if(ec){error="Cannot stat save: "+ec.message();return false;}
    if(length<headerSize+4 || length>headerSize+blockCount*4+4) {
        error="Invalid save file size";return false;
    }
    std::ifstream in(path,std::ios::binary);
    if(!in){error="Cannot open save";return false;}
    std::vector<uint8_t> b(static_cast<size_t>(length));
    in.read(reinterpret_cast<char*>(b.data()),static_cast<std::streamsize>(b.size()));
    if(!in || in.gcount()!=static_cast<std::streamsize>(b.size())) {
        error="Truncated save";return false;
    }
    if(!std::equal(magic.begin(),magic.end(),b.begin())){
        error="Unknown save magic";return false;
    }
    if(read16(b,8)!=version || read16(b,10)!=World::side ||
       read16(b,12)!=World::height || b[39]!=sceneRevision || b[40]!=0 || b[41]!=0){
        error="Unsupported save or study-scene revision";return false;
    }
    uint32_t count=read32(b,14);
    if(count>blockCount || length!=headerSize+static_cast<uint64_t>(count)*4+4){
        error="Invalid block edit count";return false;
    }
    if(read32(b,b.size()-4)!=crc32(b.data(),b.size()-4)){
        error="Save checksum mismatch";return false;
    }
    Player restored;
    restored.feet.x=std::bit_cast<float>(read32(b,18));
    restored.feet.y=std::bit_cast<float>(read32(b,22));
    restored.feet.z=std::bit_cast<float>(read32(b,26));
    restored.yaw=std::bit_cast<float>(read32(b,30));
    restored.pitch=std::bit_cast<float>(read32(b,34));
    int selected=b[38];
    if(!validCamera(restored,selected)){error="Invalid saved camera/slot";return false;}
    World candidate;
    std::vector<uint8_t> seen(blockCount,0);
    for(uint32_t n=0;n<count;++n){
        size_t at=headerSize+static_cast<size_t>(n)*4;
        int x=b[at],y=b[at+1],z=b[at+2];
        if(x>=World::side || z>=World::side || y==0 || y>=World::height ||
           b[at+3]>static_cast<uint8_t>(Block::Flower)){
            error="Invalid block edit coordinate/type";return false;
        }
        size_t index=(static_cast<size_t>(z)*World::side+static_cast<size_t>(x))*World::height+
                     static_cast<size_t>(y);
        if(seen[index]++){error="Duplicate block edit";return false;}
        if(!candidate.set({x-World::half,y,z-World::half},static_cast<Block>(b[at+3]))) {
            error="Redundant/invalid block edit";return false;
        }
    }
    // No partially loaded world escapes a failed parse.
    world=std::move(candidate);player=restored;slot=selected;editCount=count;
    return true;
}
std::filesystem::path suffix(std::filesystem::path file,const char* extension) {
    file+=extension;return file;
}
bool replaceFile(const std::filesystem::path& from,const std::filesystem::path& to,
                 std::string& error) {
#ifdef _WIN32
    if(!MoveFileExW(from.c_str(),to.c_str(),
                    MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH)) {
        error="Windows atomic replace failed (error "+std::to_string(GetLastError())+")";
        return false;
    }
#else
    std::error_code ec;
    std::filesystem::rename(from,to,ec); // POSIX replace, same-directory temp
    if(ec){error="Atomic replace failed: "+ec.message();return false;}
#endif
    return true;
}
}

bool saveStudy(const World& world,const Player& player,int slot,
               const std::filesystem::path& file,std::string& error) {
    error.clear();
    if(file.empty() || !validCamera(player,slot)){
        error="Cannot save invalid path/player/slot";return false;
    }
    World baseline;
    struct Edit { uint8_t x,y,z,block; };
    std::vector<Edit> edits;
    for(int z=-World::half;z<World::half;++z)
        for(int x=-World::half;x<World::half;++x)
            for(int y=1;y<World::height;++y){
                Cell cell{x,y,z};auto current=world.get(cell);
                if(current!=baseline.get(cell))
                    edits.push_back({uint8_t(x+World::half),uint8_t(y),
                                     uint8_t(z+World::half),uint8_t(current)});
            }
    std::vector<uint8_t> data;
    data.reserve(headerSize+edits.size()*4+4);
    data.insert(data.end(),magic.begin(),magic.end());
    put16(data,version);put16(data,World::side);put16(data,World::height);
    put32(data,static_cast<uint32_t>(edits.size()));
    put32(data,std::bit_cast<uint32_t>(player.feet.x));
    put32(data,std::bit_cast<uint32_t>(player.feet.y));
    put32(data,std::bit_cast<uint32_t>(player.feet.z));
    put32(data,std::bit_cast<uint32_t>(player.yaw));
    put32(data,std::bit_cast<uint32_t>(player.pitch));
    data.push_back(static_cast<uint8_t>(slot));
    data.push_back(sceneRevision);data.push_back(0);data.push_back(0);
    for(auto edit:edits){data.push_back(edit.x);data.push_back(edit.y);
                         data.push_back(edit.z);data.push_back(edit.block);}
    put32(data,crc32(data.data(),data.size()));

    std::error_code ec;
    if(file.has_parent_path())std::filesystem::create_directories(file.parent_path(),ec);
    if(ec){error="Cannot create save directory: "+ec.message();return false;}
    const auto tmp=suffix(file,".tmp"),backup=suffix(file,".bak");
    const auto backupTmp=suffix(backup,".tmp");
    {
        std::ofstream out(tmp,std::ios::binary|std::ios::trunc);
        if(!out){error="Cannot create temporary save";return false;}
        out.write(reinterpret_cast<const char*>(data.data()),static_cast<std::streamsize>(data.size()));
        out.flush();
        if(!out){error="Temporary save write failed";return false;}
        out.close();
        if(!out){error="Temporary save close failed";return false;}
    }
    if(std::filesystem::exists(file,ec)) {
        // Do not replace a previously good backup with a corrupted primary.
        World previous;Player oldPlayer;int oldSlot=0;size_t oldCount=0;
        std::string rejected;
        if(readOne(file,previous,oldPlayer,oldSlot,oldCount,rejected)){
            // Stage the backup too: a failed copy must not truncate a good .bak.
            std::filesystem::copy_file(file,backupTmp,
                                        std::filesystem::copy_options::overwrite_existing,ec);
            if(ec){error="Cannot stage previous save backup: "+ec.message();return false;}
            if(!replaceFile(backupTmp,backup,error))return false;
        }
    }
    if(ec){error="Cannot inspect previous save: "+ec.message();return false;}
    if(!replaceFile(tmp,file,error))return false;
    return true;
}

LoadStatus loadStudy(World& world,Player& player,int& slot,
                     const std::filesystem::path& file) {
    LoadStatus result;
    std::error_code ec;
    auto backup=suffix(file,".bak");
    if(std::filesystem::exists(file,ec)){
        World candidate;Player p;int chosen=0;size_t count=0;
        if(readOne(file,candidate,p,chosen,count,result.message)){
            world=std::move(candidate);player=p;slot=chosen;
            result.loaded=true;result.edits=count;result.message="Study save loaded";
            return result;
        }
        result.message="Primary study save rejected: "+result.message;
    }else if(ec)result.message="Cannot inspect study save: "+ec.message();
    else result.message="No prior study save";
    ec.clear();
    if(std::filesystem::exists(backup,ec)){
        World candidate;Player p;int chosen=0;size_t count=0;std::string issue;
        if(readOne(backup,candidate,p,chosen,count,issue)){
            world=std::move(candidate);player=p;slot=chosen;
            result.loaded=true;result.backup=true;result.edits=count;
            result.message+="; valid backup loaded (primary left untouched)";
            return result;
        }
        result.message+="; backup rejected: "+issue;
    }else if(ec)result.message+="; cannot inspect backup: "+ec.message();
    return result;
}
} // namespace rebuild
