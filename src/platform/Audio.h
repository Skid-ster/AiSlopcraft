#pragma once
#include <SDL3/SDL.h>
#include <filesystem>
#include <string>
#include <unordered_map>
#include <vector>

namespace vox {
class Audio {
public:
    bool init(const std::filesystem::path& assets,std::string& error);
    void play(const char* name);
    void shutdown();
    bool muted=false;
private:
    SDL_AudioStream* stream_=nullptr;
    std::unordered_map<std::string,std::vector<uint8_t>> sounds_;
};
} // namespace vox
