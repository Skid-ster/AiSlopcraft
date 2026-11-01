#pragma once
#include "core/Physics.h"
#include "core/Recipes.h"
#include "platform/Audio.h"
#include "render/Renderer.h"
#include <SDL3/SDL.h>
#include <atomic>
#include <condition_variable>
#include <deque>
#include <filesystem>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <unordered_map>
#include <unordered_set>

namespace vox {

class Game {
public:
    Game()=default;
    Game(const Game&)=delete;Game& operator=(const Game&)=delete;
    int run(); // 0 on clean exit, nonzero on startup failure
    // Requires a working desktop OpenGL context. Captures title, world and
    // creative catalogue frames without saving the temporary world.
    int visualSmoke(const std::filesystem::path& directory);
private:
    enum class Screen {Title,Playing,Pause,Options,Inventory,Creative,Crafting,Furnace,Chest,Death};
    SDL_Window* window_=nullptr;
    SDL_GLContext context_=nullptr;
    Renderer renderer_;
    Audio audio_;
    std::filesystem::path assetDir_,saveFile_="saves/World/world.bin";
    std::unique_ptr<World> world_;
    std::unique_ptr<World> titleWorld_;
    Player player_;
    Screen screen_=Screen::Title;
    bool running_=true,captured_=false,mouseLeft_=false,debug_=false,hideHud_=false;
    bool screenshotRequested_=false,screenshotOk_=false,createCreative_=false,vsync_=true;
    bool visualSmoke_=false;
    std::filesystem::path screenshotPath_;
    float fov_=70.f,sensitivity_=0.13f,miningProgress_=0;
    int width_=1280,height_=720,renderDistance_=4,frames_=0,creativePage_=0;
    float mouseX_=0,mouseY_=0;
    double fps_=0,autosaveTimer_=0;
    std::string seedText_="7137331",message_;
    std::optional<RayHit> target_;
    Vec3i miningPos_{INT32_MIN,0,0};
    ItemStack cursor_{};
    std::array<ItemStack,9> craftGrid_{};
    Vec3i openedBlock_{};
    std::unordered_map<uint64_t,Furnace> furnaces_;
    std::unordered_map<uint64_t,Inventory> chests_;
    WorldType newWorldType_=WorldType::Default;
    // Worker only reads an immutable *private* WorldGenerator, never the
    // mutable World. Main thread exclusively installs finished chunks.
    std::thread worker_;
    std::mutex workMutex_;
    std::condition_variable workCV_;
    bool stopWork_=false;
    std::deque<std::pair<int,int>> pending_;
    std::deque<std::unique_ptr<Chunk>> finished_;
    std::unordered_set<uint64_t> submitted_;

    bool startup(std::string& error);
    void shutdown();
    void events();
    void key(SDL_Scancode key);
    void mouseButton(int button,float x,float y);
    void capture(bool enabled);
    void startWorld(bool newWorld);
    bool save();
    void loadSettings();
    void saveSettings() const;
    void startWorker();
    void stopWorker();
    void streamChunks();
    void meshBudget();
    void buildTitleMeshes();
    void logicTick();
    void interact();
    void placeOrUse();
    void breakTarget();
    void closeInventory();
    void inventoryClick(float x,float y,bool right);
    void frame();
    void drawTitle();
    void drawHud();
    void drawInventory();
    void drawPause();
    void drawOptions();
    void drawDeath();
    void slot(float x,float y,const ItemStack& item,bool chosen=false);
    void button(float x,float y,float w,const std::string& label,bool selected=false);
    int uiScale() const;
    static uint64_t blockKey(Vec3i pos);
};

} // namespace vox
