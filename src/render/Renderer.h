#pragma once
#include "core/Mesher.h"
#include "platform/GL.h"
#include <array>
#include <filesystem>
#include <string>
#include <unordered_map>
#include <vector>

namespace vox {

class Renderer {
public:
    Renderer()=default;
    Renderer(const Renderer&)=delete;
    Renderer& operator=(const Renderer&)=delete;
    bool init(const std::filesystem::path& assets,std::string& error);
    void shutdown(); // call before destroying SDL's GL context
    const TileCatalog& tiles() const { return tiles_; }
    const std::string& driver() const { return driver_; }
    void upload(int cx,int cz,int sectionY,const MeshData& mesh);
    void clearSection(int cx,int cz,int sectionY); // no VBO for all-air sections
    void removeUnloaded(const World& world);
    void clearMeshes();
    void drawWorld(const World& world,Vec3f eye,Vec3f direction,
                   int width,int height,float fov,int renderDistance);
    void drawSelection(const RayHit& hit); // outlined block within reach
    void uiBegin(int width,int height);
    void uiRect(float x,float y,float w,float h,uint32_t color,float alpha=1);
    void uiSprite(const std::string& tile,float x,float y,float size,
                  uint32_t color=0xffffffu,float alpha=1);
    void uiText(const std::string& text,float x,float y,float scale=1,
                uint32_t color=0xffffffu);
    void uiDraw();
    bool screenshot(const std::filesystem::path& filename,int w,int h,std::string& error);
private:
    struct GPUSection {
        std::array<GLuint,3> vao{},vbo{};
        std::array<GLsizei,3> count{};
    };
    struct UIQuadVertex { float x,y,u,v,r,g,b,a; };
    GL gl_;
    TileCatalog tiles_;
    std::string driver_;
    GLuint atlas_=0,font_=0,worldProgram_=0,uiProgram_=0,uiVao_=0,uiVbo_=0;
    GLuint selectionVao_=0,selectionVbo_=0;
    std::unordered_map<uint64_t,std::array<GPUSection,SectionCount>> meshes_;
    std::vector<UIQuadVertex> uiAtlas_,uiFont_;
    int uiWidth_=1,uiHeight_=1;
    struct Animation { int tile=0,frames=0,interval=1,last=-1;std::vector<uint8_t> pixels; };
    std::vector<Animation> animations_;
    uint64_t lastAnimatedTick_=~uint64_t{0};
    GLuint compile(GLenum kind,const std::string& src,std::string& error);
    GLuint program(const std::filesystem::path& vert,const std::filesystem::path& frag,
                   std::string& error);
    GLuint image(const std::filesystem::path& file,std::string& error);
    void animate(uint64_t time);
    void appendUI(std::vector<UIQuadVertex>& buffer,float x,float y,float w,float h,
                  float u0,float v0,float u1,float v1,uint32_t color,float alpha);
    void destroySection(GPUSection& section);
};

} // namespace vox
