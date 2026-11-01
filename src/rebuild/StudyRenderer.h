#pragma once
#include "Mesh.h"
#include "World.h"
#include "platform/GL.h" // the only shared legacy C++ component: SDL GL symbol loader
#include <array>
#include <filesystem>
#include <string>
#include <vector>

namespace rebuild {

class StudyRenderer {
public:
    bool init(const std::filesystem::path& assets,std::string& error);
    void shutdown(); // before SDL_GL_DestroyContext
    void rebuild(const World& world,int cx,int cz);
    void rebuildAround(const World& world,Cell edit);
    void draw(const Player& player,const std::optional<Hit>& target,int slot,
              int width,int height,int guiScale,bool paused,bool debug,
              float fps,float frameMs,float drawMs,float swapMs,float editMs,int edits);
    bool capture(const std::filesystem::path& output,int width,int height,std::string& error);
    const std::string& driver() const { return driver_; }
private:
    struct GPUChunk { GLuint vao=0,vbo=0;GLsizei count=0; };
    struct UiVertex {float x,y,u,v,r,g,b,a;};
    vox::GL gl_;
    std::array<GPUChunk,(World::side/World::chunk)*(World::side/World::chunk)> chunks_{};
    GLuint texture_=0,worldProgram_=0,uiProgram_=0,lineProgram_=0;
    GLuint uiVao_=0,uiVbo_=0,lineVao_=0,lineVbo_=0;
    std::vector<UiVertex> ui_;
    std::string driver_;
    GLuint shader(GLenum type,const char* text,std::string& error);
    GLuint program(const char* vertex,const char* fragment,std::string& error);
    void rect(float x,float y,float w,float h,uint32_t color,float alpha=1.f);
    void icon(int tile,float x,float y,float size,float shade=1.f);
    void label(std::string text,float x,float y,int size,uint32_t color);
    void quad(float x,float y,float w,float h,float u0,float v0,float u1,float v1,
              uint32_t color,float alpha);
};

} // namespace rebuild
