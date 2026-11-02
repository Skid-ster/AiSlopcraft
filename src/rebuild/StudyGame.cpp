// Standalone, independent SDL entry point for the small in-memory art study.
#include "StudyRenderer.h"
#include "World.h"
#include <SDL3/SDL.h>
#include <SDL3/SDL_main.h>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <optional>
#include <string>
#include "stb/stb_image.h"

namespace rebuild {
namespace {
using Clock=std::chrono::steady_clock;

class StudyGame {
public:
    int run();
    int smoke(const std::filesystem::path& directory);
private:
    World world_;
    Player player_;
    StudyRenderer renderer_;
    SDL_Window* window_=nullptr;
    SDL_GLContext context_=nullptr;
    bool running_=true,captured_=false,paused_=false,debug_=false,shot_=false;
    int slot_=0,guiScale_=2,edits_=0,width_=1280,height_=720;
    float fps_=0,frameMs_=0,drawMs_=0,swapMs_=0,editMs_=0;
    std::optional<Hit> target_;
    bool open(std::string& error);
    void close();
    void capture(bool enabled);
    void edit(uint8_t button);
    void handle(const SDL_Event& event);
    void events();
    void draw();
};

std::filesystem::path assetDir() {
    auto beside=std::filesystem::path(SDL_GetBasePath())/"assets";
    if(std::filesystem::exists(beside/"rebuild"/"atlas.png"))return beside;
    if(std::filesystem::exists("assets/rebuild/atlas.png"))return "assets";
    return VOXCRAFT_ASSET_DIR;
}
bool StudyGame::open(std::string& error) {
    if(!SDL_Init(SDL_INIT_VIDEO)){error=SDL_GetError();return false;}
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION,3);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION,3);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK,SDL_GL_CONTEXT_PROFILE_CORE);
    SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER,1);
    SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE,24);
    window_=SDL_CreateWindow("AiSlopcraft — REBUILD ART STUDY 01 (not a finished game)",
                             width_,height_,SDL_WINDOW_OPENGL|SDL_WINDOW_RESIZABLE);
    if(!window_){error=SDL_GetError();return false;}
    context_=SDL_GL_CreateContext(window_);
    if(!context_){error=SDL_GetError();return false;}
    if(!renderer_.init(assetDir(),error))return false;
    SDL_GL_SetSwapInterval(1);
    SDL_GetWindowSizeInPixels(window_,&width_,&height_);
    player_.feet={.5f,float(World::surface(0,15)+1),15.5f};
    player_.onGround=true;
    for(int cz=0;cz<World::side/World::chunk;++cz)
        for(int cx=0;cx<World::side/World::chunk;++cx)renderer_.rebuild(world_,cx,cz);
    target_=raycast(world_,player_.eye(),player_.direction());
    std::cout<<"Rebuild study: GL "<<renderer_.driver()<<"; fixed in-memory meadow, original art. "
             <<"Click the window to capture the mouse. No saves, survival or 1.7.3 parity.\n";
    return true;
}
void StudyGame::capture(bool enabled) {
    if(!window_)return;
    if(!SDL_SetWindowRelativeMouseMode(window_,enabled)) {
        std::cerr<<"Mouse capture error: "<<SDL_GetError()<<'\n';
        captured_=false;return;
    }
    captured_=enabled;
}
void StudyGame::close() {
    if(window_){
        capture(false);
        if(context_)renderer_.shutdown();
        if(context_)SDL_GL_DestroyContext(context_);
        SDL_DestroyWindow(window_);
    }
    context_=nullptr;window_=nullptr;
    SDL_Quit();
}
void StudyGame::edit(uint8_t button) {
    target_=raycast(world_,player_.eye(),player_.direction());
    if(!target_){if(debug_)std::cout<<"No solid target in 4.5-block reach\n";return;}
    Cell c=target_->cell;
    if(button==SDL_BUTTON_RIGHT) {
        c={c.x+target_->normal.x,c.y+target_->normal.y,c.z+target_->normal.z};
        if(!World::inside(c) || solid(world_.get(c)) || player_.overlaps(c)){
            if(debug_)std::cout<<"Place blocked (occupied, out of bounds or inside player)\n";
            return;
        }
        constexpr Block hotbar[]={Block::Grass,Block::Dirt,Block::Stone,Block::Log,
                                  Block::Planks,Block::Cobble,Block::Sand,Block::Leaves,Block::Flower};
        if(!world_.set(c,hotbar[static_cast<size_t>(slot_)]))return;
    } else if(button==SDL_BUTTON_LEFT) {
        if(!world_.set(c,Block::Air))return;
    } else return;
    auto meshStart=Clock::now();
    renderer_.rebuildAround(world_,c);
    editMs_=std::chrono::duration<float,std::milli>(Clock::now()-meshStart).count();
    ++edits_;
    target_=raycast(world_,player_.eye(),player_.direction());
    if(debug_)std::cout<<"Edit "<<edits_<<" at "<<c.x<<","<<c.y<<","<<c.z<<'\n';
}
void StudyGame::handle(const SDL_Event& e) {
    switch(e.type) {
        case SDL_EVENT_QUIT:running_=false;break;
        case SDL_EVENT_WINDOW_FOCUS_LOST:paused_=true;capture(false);break;
        case SDL_EVENT_KEY_DOWN:
            if(e.key.repeat)break;
            if(e.key.scancode==SDL_SCANCODE_ESCAPE){paused_=true;capture(false);}
            else if(e.key.scancode==SDL_SCANCODE_F3)debug_=!debug_;
            else if(e.key.scancode==SDL_SCANCODE_F2)shot_=true;
            else if(e.key.scancode==SDL_SCANCODE_F7)guiScale_=guiScale_%4+1;
            else if(e.key.scancode>=SDL_SCANCODE_1 && e.key.scancode<=SDL_SCANCODE_9)
                slot_=static_cast<int>(e.key.scancode-SDL_SCANCODE_1);
            break;
        case SDL_EVENT_MOUSE_MOTION:
            if(captured_ && !paused_) {
                player_.yaw+=e.motion.xrel*.0023f;
                player_.pitch=std::clamp(player_.pitch-e.motion.yrel*.0023f,-1.54f,1.54f);
            }
            break;
        case SDL_EVENT_MOUSE_BUTTON_DOWN:
            if(!captured_){paused_=false;capture(true);break;}
            if(!paused_)edit(e.button.button);
            break;
        case SDL_EVENT_MOUSE_WHEEL:
            slot_=(slot_+9-(e.wheel.y>0?1:(e.wheel.y<0?-1:0)))%9;
            break;
        default:break;
    }
}
void StudyGame::events() {
    SDL_Event e;
    while(SDL_PollEvent(&e))handle(e);
}
void StudyGame::draw() {
    SDL_GetWindowSizeInPixels(window_,&width_,&height_);
    auto drawStart=Clock::now();
    renderer_.draw(player_,target_,slot_,width_,height_,guiScale_,paused_,debug_,
                   fps_,frameMs_,drawMs_,swapMs_,editMs_,edits_);
    drawMs_=std::chrono::duration<float,std::milli>(Clock::now()-drawStart).count();
    if(shot_){
        std::string error;
        auto path=std::filesystem::path("screenshots")/"rebuild"/
                  ("study-"+std::to_string(SDL_GetTicks())+".png");
        if(renderer_.capture(path,width_,height_,error))std::cout<<"Screenshot: "<<path<<'\n';
        else std::cerr<<"Screenshot failed: "<<error<<'\n';
        shot_=false;
    }
    auto swapStart=Clock::now();
    SDL_GL_SwapWindow(window_);
    swapMs_=std::chrono::duration<float,std::milli>(Clock::now()-swapStart).count();
}
int StudyGame::run() {
    std::string error;
    if(!open(error)){std::cerr<<"Rebuild startup failed: "<<error<<'\n';close();return 1;}
    capture(true); // Esc/alt-tab releases; a click reacquires without also mining.
    auto previous=Clock::now(),second=previous;
    float accumulator=0;
    int frames=0;
    while(running_) {
        const auto frameStart=Clock::now();
        events();
        auto now=Clock::now();
        accumulator+=std::min(.15f,std::chrono::duration<float>(now-previous).count());
        previous=now;
        // Bounded 60-Hz movement with frame-independent, sliding AABB collision.
        int ticks=0;
        while(accumulator>=1.f/60 && ticks++<6){
            if(!paused_) {
                const bool* keys=SDL_GetKeyboardState(nullptr);
                Input input{keys[SDL_SCANCODE_W],keys[SDL_SCANCODE_S],
                            keys[SDL_SCANCODE_A],keys[SDL_SCANCODE_D],
                            keys[SDL_SCANCODE_SPACE],
                            keys[SDL_SCANCODE_LCTRL]||keys[SDL_SCANCODE_RCTRL]};
                player_.tick(world_,input,1.f/60);
            }
            accumulator-=1.f/60;
        }
        if(ticks>6)accumulator=0;
        target_=raycast(world_,player_.eye(),player_.direction());
        draw();
        ++frames;
        frameMs_=std::chrono::duration<float,std::milli>(Clock::now()-frameStart).count();
        float interval=std::chrono::duration<float>(Clock::now()-second).count();
        if(interval>=1.f){
            fps_=float(frames)/interval;frames=0;second=Clock::now();
            std::string title="AiSlopcraft REBUILD ART STUDY 01 | "+
                std::to_string(static_cast<int>(std::round(fps_)))+" FPS | edits "+
                std::to_string(edits_)+" | NO SAVES / NOT PARITY";
            SDL_SetWindowTitle(window_,title.c_str());
            if(debug_)std::cout<<title<<" | frame "<<frameMs_<<" ms\n";
        }
        SDL_Delay(1); // do not spin on uncapped software drivers
    }
    close();return 0;
}
int StudyGame::smoke(const std::filesystem::path& directory) {
    std::string error;
    if(!open(error)){std::cerr<<"Rebuild GL smoke startup failed: "<<error<<'\n';close();return 1;}
    auto before=directory/"before.png",after=directory/"after.png";
    renderer_.draw(player_,target_,slot_,width_,height_,guiScale_,false,false,0,0,0,0,0,0);
    bool ok=renderer_.capture(before,width_,height_,error);
    if(ok && target_) {
        const Cell base=target_->cell;
        const Cell normal=target_->normal;
        const Cell placed{base.x+normal.x,base.y+normal.y,base.z+normal.z};
        const Block original=world_.get(base);
        auto click=[&](uint8_t button) {
            SDL_PumpEvents();SDL_FlushEvents(SDL_EVENT_FIRST,SDL_EVENT_LAST);
            SDL_Event event{};event.type=SDL_EVENT_MOUSE_BUTTON_DOWN;
            event.button.button=button;event.button.x=width_/2.f;event.button.y=height_/2.f;
            bool queued=SDL_PushEvent(&event);
            events(); // EXACTLY the interactive window's event dispatch path.
            return queued;
        };
        SDL_PumpEvents();SDL_FlushEvents(SDL_EVENT_FIRST,SDL_EVENT_LAST);
        SDL_Event esc{};esc.type=SDL_EVENT_KEY_DOWN;esc.key.scancode=SDL_SCANCODE_ESCAPE;
        ok=SDL_PushEvent(&esc);events();
        if(ok)ok=paused_ && !captured_ && World::inside(placed);
        if(!ok)error="Escape did not release mouse or target is outside study";
        if(ok){
            ok=click(SDL_BUTTON_LEFT) && captured_ && !paused_ && edits_==0 &&
               world_.get(base)==original;
            if(!ok)error="first click after Escape must only recapture, not mine";
        }
        // Relative-mode recapture can synthesize a warp motion on some drivers.
        // Flush it so these synthetic button tests keep their known camera pose.
        player_.yaw=0;player_.pitch=-.48f;
        if(ok){
            ok=click(SDL_BUTTON_RIGHT) && world_.get(placed)==Block::Grass && edits_==1;
            if(!ok)error="SDL right button did not place the selected block";
        }
        if(ok){
            renderer_.draw(player_,target_,slot_,width_,height_,guiScale_,false,false,
                           0,0,0,0,editMs_,edits_);
            ok=renderer_.capture(after,width_,height_,error);
        }
        if(ok){
            std::ifstream lhs(before,std::ios::binary),rhs(after,std::ios::binary);
            std::string b((std::istreambuf_iterator<char>(lhs)),{});
            std::string a((std::istreambuf_iterator<char>(rhs)),{});
            ok=b!=a && !b.empty() && !a.empty();
            if(!ok)error="rendered PNG did not change after the SDL place event";
        }
        if(ok){
            int w=0,h=0,channels=0;
            stbi_set_flip_vertically_on_load(0); // PNG row 0 is top; HUD is at bottom.
            unsigned char* pixels=stbi_load(before.string().c_str(),&w,&h,&channels,4);
            if(!pixels || w!=width_ || h!=height_){ok=false;error="capture cannot be decoded";}
            else {
                size_t sky=0,green=0,hud=0;
                for(int y=0;y<h;++y)for(int x=0;x<w;++x){
                    const auto* pixel=pixels+(static_cast<size_t>(y)*w+x)*4;
                    if(std::abs(int(pixel[0])-138)<18 && std::abs(int(pixel[1])-189)<18 &&
                       std::abs(int(pixel[2])-240)<18)++sky;
                    if(int(pixel[1])>int(pixel[0])+20 && int(pixel[1])>int(pixel[2])+25)++green;
                    if(y>h-60 && pixel[0]<80 && pixel[1]<80 && pixel[2]<80)++hud;
                }
                std::cout<<"Rendered pixel groups: sky="<<sky<<" vegetation="<<green
                         <<" dark HUD="<<hud<<'\n';
                if(sky<10000 || green<3000 || hud<300){
                    ok=false;error="capture lacks sky, vegetation or visible hotbar";
                }
            }
            if(pixels)stbi_image_free(pixels);
        }
        if(ok){
            ok=click(SDL_BUTTON_LEFT) && world_.get(placed)==Block::Air &&
               world_.get(base)==original && edits_==2;
            if(!ok)error="SDL left button did not mine the placed block";
        }
    }else if(ok){error="initial crosshair has no target within 4.5 blocks";ok=false;}
    close();
    if(!ok){std::cerr<<"Rebuild GL smoke failed: "<<error<<'\n';return 1;}
    std::cout<<"REBUILD GL SMOKE PASS: two DIFFERENT "<<width_<<"x"<<height_
             <<" GL frames; SDL-synthetic Escape/recapture/place/mine dispatch passed. "
             <<"Windows physical input, visual parity and target-PC FPS NOT verified.\n";
    return 0;
}
} // namespace
} // namespace rebuild

int main(int argc,char** argv) {
    rebuild::StudyGame game;
    if(argc==1)return game.run();
    std::string option=argv[1];
    if(option=="--smoke" && argc==3)return game.smoke(argv[2]);
    if(option=="--selftest" && argc==2){
        rebuild::World w;rebuild::Player p;
        p.feet.y=float(rebuild::World::surface(0,15)+1);
        auto hit=rebuild::raycast(w,p.eye(),p.direction());
        if(!hit){std::cerr<<"Rebuild selftest: no initial target\n";return 1;}
        std::cout<<"REBUILD SELFTEST PASS: first target "<<hit->cell.x<<","<<hit->cell.y
                 <<","<<hit->cell.z<<". No GL, saved game, or visuals tested.\n";
        return 0;
    }
    if(option=="--help" && argc==2){
        std::cout<<"AiSlopcraft REBUILD ART STUDY 01 (independent limited scene)\n"
                 <<"  aislopcraft-rebuild             In-memory creative study (click window)\n"
                 <<"  aislopcraft-rebuild --selftest  Headless core/crosshair check\n"
                 <<"  aislopcraft-rebuild --smoke DIR Captures before/after a GL edit\n"
                 <<"WASD mouse look, Space jump, Ctrl sprint, click mine, right-click place,\n"
                 <<"1-9 or wheel select, F2 screenshot, F3 diagnostic, F7 UI scale, Esc release.\n"
                 <<"No saves, survival, real worldgen, mobs or proven 2013 visual match.\n";
        return 0;
    }
    std::cerr<<"Unknown arguments. Use --help.\n";return 2;
}
