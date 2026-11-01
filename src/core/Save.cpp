#include "Save.h"
#include "Blocks.h"
#include <algorithm>
#include <bit>
#include <cmath>
#include <fstream>
#include <limits>
#include <vector>
#ifdef _WIN32
#define NOMINMAX
#include <windows.h>
#endif

namespace vox {
namespace {
void push(std::vector<uint8_t>& out,uint64_t value,int n) {
    for (int i=0;i<n;++i) out.push_back((uint8_t)(value>>(i*8)));
}
void float32(std::vector<uint8_t>& out,float value) {
    push(out,std::bit_cast<uint32_t>(value),4);
}
struct Reader {
    const std::vector<uint8_t>& data;
    size_t at=0, limit;
    bool okay=true;
    uint64_t take(int n) {
        if (n<0 || at>limit || size_t(n)>limit-at) { okay=false; return 0; }
        uint64_t v=0;
        for (int i=0;i<n;++i) v|=(uint64_t)data[at++] << (8*i);
        return v;
    }
    float getFloat() { return std::bit_cast<float>((uint32_t)take(4)); }
};
uint32_t crc32(const uint8_t* data,size_t len) {
    uint32_t crc=0xffffffffu;
    for(size_t i=0;i<len;++i) {
        crc^=data[i];
        for(int bit=0;bit<8;++bit)
            crc=(crc>>1) ^ ((crc&1) ? 0xedb88320u : 0u);
    }
    return ~crc;
}
bool finitePlayer(const PlayerSnapshot& p) {
    auto validPos=[](float v) { return std::isfinite(v) && std::abs(v)<=30000000.f; };
    if (!validPos(p.position.x)||!validPos(p.position.z)||!std::isfinite(p.position.y)||
        p.position.y < -128 || p.position.y>512 || !std::isfinite(p.yaw) ||
        !std::isfinite(p.pitch) || p.health<0||p.health>20||p.hunger<0||p.hunger>20||
        !std::isfinite(p.saturation)||p.saturation<0||p.saturation>20||
        p.experience<0||p.selected>8) return false;
    for (const auto& s : p.inventory)
        if (!s.empty() && (!itemExists(s.id)||s.count>s.maxStack()||
                           (s.isDamageable() && s.meta>=s.maxDamage()))) return false;
    return true;
}
}

bool saveWorld(const World& world,const PlayerSnapshot& player,
               const std::filesystem::path& file,std::string& error) {
    error.clear();
    if (!finitePlayer(player)) { error="Refusing to save invalid player state"; return false; }
    std::vector<uint8_t> bytes;
    bytes.reserve(2048);
    for(char ch : std::string("ASLWLD01")) bytes.push_back((uint8_t)ch);
    push(bytes,1,4); // format version
    push(bytes,(uint64_t)world.seed(),8);
    push(bytes,(uint8_t)world.type(),1);
    push(bytes,(uint8_t)world.dimension(),1);
    push(bytes,world.time(),8);
    float32(bytes,player.position.x); float32(bytes,player.position.y); float32(bytes,player.position.z);
    float32(bytes,player.yaw); float32(bytes,player.pitch);
    push(bytes,(uint16_t)player.health,2); push(bytes,(uint16_t)player.hunger,2);
    float32(bytes,player.saturation);
    push(bytes,(uint32_t)player.experience,4);
    push(bytes,player.selected,1); push(bytes,player.creative?1:0,1);
    for(const ItemStack& s : player.inventory) {
        push(bytes,s.empty()?0:s.id,2);
        push(bytes,s.empty()?0:s.count,1);
        push(bytes,s.empty()?0:s.meta,2);
    }
    std::vector<std::pair<uint64_t,uint16_t>> keys;
    for(const auto& [key,records] : world.edits())
        for(const auto& [pos,b] : records) {
            (void)b;
            keys.emplace_back(key,pos);
        }
    if (keys.size()>1000000) { error="Save contains over one million edited blocks"; return false; }
    std::sort(keys.begin(),keys.end());
    push(bytes,(uint32_t)keys.size(),4);
    for (const auto& [key,pos] : keys) {
        auto b=world.edits().at(key).at(pos);
        push(bytes,key>>32,4); push(bytes,key&0xffffffffu,4);
        push(bytes,pos,2); push(bytes,b.id,2); push(bytes,b.meta,1);
    }
    push(bytes,crc32(bytes.data(),bytes.size()),4);
    if (bytes.size()>64u*1024u*1024u) { error="Save exceeds 64 MiB safety limit"; return false; }
    try {
        if (!file.has_parent_path() || file.filename().empty()) {
            error="Save path must include a parent directory and filename"; return false;
        }
        std::filesystem::create_directories(file.parent_path());
        auto temp=file; temp += ".tmp";
        {
            std::ofstream stream(temp,std::ios::binary|std::ios::trunc);
            if (!stream) { error="Cannot write temporary save: "+temp.string(); return false; }
            stream.write((const char*)bytes.data(),(std::streamsize)bytes.size());
            stream.flush();
            if (!stream) { error="Short write in temporary save: "+temp.string(); return false; }
            stream.close();
            if (!stream) { error="Failed closing temporary save: "+temp.string(); return false; }
        }
#ifdef _WIN32
        if (!MoveFileExW(temp.c_str(),file.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH)) {
            error="Windows could not atomically replace save (error "+std::to_string(GetLastError())+")";
            return false;
        }
#else
        std::filesystem::rename(temp,file);
#endif
        return true;
    } catch (const std::filesystem::filesystem_error& ex) {
        error=std::string("Save filesystem failure: ")+ex.what();
        return false;
    }
}

std::unique_ptr<World> loadWorld(const std::filesystem::path& file,
                                 PlayerSnapshot& player,std::string& error) {
    error.clear();
    std::ifstream stream(file,std::ios::binary|std::ios::ate);
    if (!stream) { error="Save file missing or unreadable: "+file.string(); return {}; }
    auto size=stream.tellg();
    if (size<252 || size>64LL*1024LL*1024LL) {
        error="Save size out of bounds (truncated or too large)"; return {};
    }
    std::vector<uint8_t> bytes((size_t)size);
    stream.seekg(0); stream.read((char*)bytes.data(),size);
    if (!stream) { error="Short read while loading save"; return {}; }
    Reader reader{bytes,0,bytes.size()-4};
    uint32_t crc=0;
    for(int i=0;i<4;++i) crc|=(uint32_t)bytes[bytes.size()-4+i]<<(8*i);
    if (crc != crc32(bytes.data(),bytes.size()-4)) {
        error="Save checksum mismatch; original file left untouched"; return {};
    }
    for(char ch:std::string("ASLWLD01")) {
        if (reader.take(1)!=(uint8_t)ch) { error="Not an AiSlopcraft world"; return {}; }
    }
    uint32_t version=(uint32_t)reader.take(4);
    if (version!=1) { error="Unsupported save version: "+std::to_string(version); return {}; }
    int64_t seed=(int64_t)reader.take(8);
    int type=(int)reader.take(1),dim=(int8_t)reader.take(1);
    if (type>3 || (dim!=0 && dim!=-1 && dim!=1)) { error="Invalid world type/dimension"; return {}; }
    uint64_t time=reader.take(8);
    PlayerSnapshot loaded;
    loaded.position={reader.getFloat(),reader.getFloat(),reader.getFloat()};
    loaded.yaw=reader.getFloat(); loaded.pitch=reader.getFloat();
    loaded.health=(int16_t)reader.take(2); loaded.hunger=(int16_t)reader.take(2);
    loaded.saturation=reader.getFloat();
    loaded.experience=(int32_t)reader.take(4);
    loaded.selected=(uint8_t)reader.take(1);
    loaded.creative=reader.take(1)!=0;
    for (auto& s : loaded.inventory) {
        s.id=(uint16_t)reader.take(2);
        s.count=(uint8_t)reader.take(1);
        s.meta=(uint16_t)reader.take(2);
    }
    uint32_t count=(uint32_t)reader.take(4);
    if (!reader.okay || count>1000000 ||
        (uint64_t)count*13 > reader.limit-reader.at) {
        error="Invalid edited-block count in save"; return {};
    }
    World::Edits edits;
    for (uint32_t i=0;i<count;++i) {
        uint32_t cx=(uint32_t)reader.take(4),cz=(uint32_t)reader.take(4);
        uint16_t pos=(uint16_t)reader.take(2);
        uint16_t id=(uint16_t)reader.take(2);
        uint8_t meta=(uint8_t)reader.take(1);
        if (id>=BlockID::BlockIDCount || meta>15 ||
            (int32_t)cx>1875000 || (int32_t)cx< -1875000 ||
            (int32_t)cz>1875000 || (int32_t)cz< -1875000) {
            error="Invalid block record/coordinate"; return {};
        }
        auto& records=edits[((uint64_t)cx<<32)|cz];
        if (!records.emplace(pos,BlockState{id,meta}).second) {
            error="Duplicate block record in save"; return {};
        }
    }
    if (reader.at!=reader.limit || !reader.okay || !finitePlayer(loaded)) {
        error="Invalid player data or trailing bytes in save"; return {};
    }
    auto world=std::make_unique<World>(seed,(WorldType)type,(Dimension)dim);
    world->setTime(time);
    if (!world->loadEdits(std::move(edits))) {
        error="Cannot apply world edits"; return {};
    }
    player=loaded;
    return world;
}
} // namespace vox
