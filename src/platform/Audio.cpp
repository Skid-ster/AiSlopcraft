#include "Audio.h"
#include <array>

namespace vox {
bool Audio::init(const std::filesystem::path& assets,std::string& error) {
    error.clear();
    SDL_AudioSpec spec{};spec.format=SDL_AUDIO_S16;spec.channels=1;spec.freq=22050;
    stream_=SDL_OpenAudioDeviceStream(SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK,&spec,nullptr,nullptr);
    if(!stream_) {
        error=std::string("Audio unavailable (game remains playable): ")+SDL_GetError();
        return false;
    }
    SDL_ResumeAudioStreamDevice(stream_);
    for(const char* name: {"break_stone","break_wood","step_grass","step_stone",
                           "place","pickup","hurt","click","splash"}) {
        SDL_AudioSpec loaded{};uint8_t* buf=nullptr;Uint32 len=0;
        auto path=assets/"audio"/(std::string(name)+".wav");
        if(!SDL_LoadWAV(path.string().c_str(),&loaded,&buf,&len)) {
            error="Cannot load sound "+path.string()+": "+SDL_GetError();
            shutdown();return false;
        }
        if(loaded.format!=spec.format||loaded.channels!=spec.channels||loaded.freq!=spec.freq) {
            SDL_free(buf);error="Sound format differs from 22050 Hz mono S16: "+path.string();
            shutdown();return false;
        }
        sounds_[name]=std::vector<uint8_t>(buf,buf+len);SDL_free(buf);
    }
    return true;
}
void Audio::play(const char* name) {
    if(!stream_||muted)return;
    auto it=sounds_.find(name);
    if(it!=sounds_.end() && SDL_GetAudioStreamAvailable(stream_)<22050)
        SDL_PutAudioStreamData(stream_,it->second.data(),(int)it->second.size());
}
void Audio::shutdown() {
    if(stream_) SDL_DestroyAudioStream(stream_);
    stream_=nullptr;sounds_.clear();
}
} // namespace vox
