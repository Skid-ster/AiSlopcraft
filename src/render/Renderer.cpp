#include "Renderer.h"
#include "core/Blocks.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <fstream>
#include <sstream>
#include <utility>
#define STB_IMAGE_IMPLEMENTATION
#include "stb/stb_image.h"
#if defined(__GNUC__)
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wmissing-field-initializers" // third-party stb implementation
#endif
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb/stb_image_write.h"
#if defined(__GNUC__)
#pragma GCC diagnostic pop
#endif

namespace vox {
namespace {
constexpr float PI=3.14159265358979323846f;
struct Mat4 { std::array<float,16> m{}; };
Mat4 multiply(const Mat4& a,const Mat4& b) {
    Mat4 c;
    for(int col=0;col<4;++col) for(int row=0;row<4;++row)
        for(int k=0;k<4;++k) c.m[row+col*4]+=a.m[row+k*4]*b.m[k+col*4];
    return c;
}
Mat4 perspective(float degrees,float aspect,float nearPlane,float farPlane) {
    Mat4 m;float f=1.f/std::tan(degrees*PI/360.f);
    m.m[0]=f/aspect;m.m[5]=f;
    // `near` and `far` are legacy Windows/MSVC keywords/macros.
    m.m[10]=(farPlane+nearPlane)/(nearPlane-farPlane);m.m[11]=-1.f;
    m.m[14]=2*farPlane*nearPlane/(nearPlane-farPlane);
    return m;
}
Mat4 lookAt(Vec3f eye,Vec3f direction) {
    Vec3f f=direction.normalized();
    Vec3f s=f.cross({0,1,0}).normalized();
    Vec3f u=s.cross(f);
    Mat4 m;
    m.m[0]=s.x;m.m[4]=s.y;m.m[8]=s.z;m.m[12]=-s.dot(eye);
    m.m[1]=u.x;m.m[5]=u.y;m.m[9]=u.z;m.m[13]=-u.dot(eye);
    m.m[2]=-f.x;m.m[6]=-f.y;m.m[10]=-f.z;m.m[14]=f.dot(eye);
    m.m[15]=1;
    return m;
}
std::string readText(const std::filesystem::path& file) {
    std::ifstream f(file);
    return f ? std::string(std::istreambuf_iterator<char>(f),{}) : std::string{};
}
float channel(uint32_t color,int shift) {return ((color>>shift)&255)/255.f;}
}
GLuint Renderer::compile(GLenum kind,const std::string& src,std::string& error) {
    GLuint sh=gl_.CreateShader(kind);
    const char* ptr=src.c_str();
    gl_.ShaderSource(sh,1,&ptr,nullptr);
    gl_.CompileShader(sh);
    GLint status=0;gl_.GetShaderiv(sh,GL_COMPILE_STATUS,&status);
    if(!status) {
        char log[4096]{};GLsizei length=0;
        gl_.GetShaderInfoLog(sh,4095,&length,log);
        error=std::string(kind==GL_VERTEX_SHADER?"Vertex":"Fragment")+
              " shader compile failed: "+std::string(log,(size_t)std::max(0,(int)length));
        gl_.DeleteShader(sh);return 0;
    }
    return sh;
}
GLuint Renderer::program(const std::filesystem::path& vert,
                         const std::filesystem::path& frag,std::string& error) {
    auto vs=readText(vert),fs=readText(frag);
    if(vs.empty() || fs.empty()) {error="Missing/empty shader: "+vert.string()+" or "+frag.string();return 0;}
    GLuint v=compile(GL_VERTEX_SHADER,vs,error);
    if(!v) return 0;
    GLuint f=compile(GL_FRAGMENT_SHADER,fs,error);
    if(!f) {gl_.DeleteShader(v);return 0;}
    GLuint p=gl_.CreateProgram();
    gl_.AttachShader(p,v);gl_.AttachShader(p,f);gl_.LinkProgram(p);
    gl_.DeleteShader(v);gl_.DeleteShader(f);
    GLint okay=0;gl_.GetProgramiv(p,GL_LINK_STATUS,&okay);
    if(!okay) {
        char log[4096]{};GLsizei length=0;gl_.GetProgramInfoLog(p,4095,&length,log);
        error="Program link failed: "+std::string(log,(size_t)std::max(0,(int)length));
        gl_.DeleteProgram(p);return 0;
    }
    return p;
}
GLuint Renderer::image(const std::filesystem::path& file,std::string& error) {
    int w=0,h=0,c=0;
    uint8_t* pixels=stbi_load(file.string().c_str(),&w,&h,&c,4);
    if(!pixels) {error="Cannot load "+file.string()+": "+stbi_failure_reason();return 0;}
    if(w<1||h<1||w>4096||h>4096) {
        stbi_image_free(pixels);error="Image dimensions out of bounds: "+file.string();return 0;
    }
    GLuint texture=0;gl_.GenTextures(1,&texture);
    gl_.BindTexture(GL_TEXTURE_2D,texture);
    gl_.PixelStorei(GL_UNPACK_ALIGNMENT,1);
    gl_.TexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,w,h,0,GL_RGBA,GL_UNSIGNED_BYTE,pixels);
    gl_.TexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MIN_FILTER,GL_NEAREST);
    gl_.TexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MAG_FILTER,GL_NEAREST);
    gl_.TexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_S,GL_CLAMP_TO_EDGE);
    gl_.TexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_T,GL_CLAMP_TO_EDGE);
    stbi_image_free(pixels);
    return texture;
}
bool Renderer::init(const std::filesystem::path& assets,std::string& error) {
    if(!gl_.load(error)) return false;
    const GLubyte* info=gl_.GetString(GL_VERSION);
    driver_=info ? reinterpret_cast<const char*>(info) : "unknown GL version";
    if(!tiles_.load((assets/"atlas.tsv").string(),error)) return false;
    worldProgram_=program(assets/"shaders/world.vert",assets/"shaders/world.frag",error);
    if(!worldProgram_) {shutdown();return false;}
    uiProgram_=program(assets/"shaders/ui.vert",assets/"shaders/ui.frag",error);
    if(!uiProgram_) {shutdown();return false;}
    atlas_=image(assets/"atlas.png",error);
    if(!atlas_) {shutdown();return false;}
    font_=image(assets/"font_atlas.png",error);
    if(!font_) {shutdown();return false;}
    gl_.GenVertexArrays(1,&uiVao_);gl_.GenBuffers(1,&uiVbo_);
    gl_.BindVertexArray(uiVao_);gl_.BindBuffer(GL_ARRAY_BUFFER,uiVbo_);
    GLsizei stride=(GLsizei)sizeof(UIQuadVertex);
    gl_.EnableVertexAttribArray(0);gl_.VertexAttribPointer(0,2,GL_FLOAT,GL_FALSE,stride,(const void*)offsetof(UIQuadVertex,x));
    gl_.EnableVertexAttribArray(1);gl_.VertexAttribPointer(1,2,GL_FLOAT,GL_FALSE,stride,(const void*)offsetof(UIQuadVertex,u));
    gl_.EnableVertexAttribArray(2);gl_.VertexAttribPointer(2,4,GL_FLOAT,GL_FALSE,stride,(const void*)offsetof(UIQuadVertex,r));
    gl_.BindVertexArray(0);
    // Decode all animation strips at startup; updates replace only a 16x16
    // atlas sub-rectangle at their 20-Hz tick cadence, not the entire atlas.
    std::ifstream f(assets/"animations/manifest.tsv");
    if(!f) {error="Missing animation manifest";shutdown();return false;}
    for(std::string line;std::getline(f,line);) {
        if(line.empty()||line[0]=='#') continue;
        std::istringstream fields(line);std::string name;int frames=0,interval=0;
        if(!(fields>>name>>frames>>interval) || frames<1 || frames>64 || interval<1 ||
           tiles_.lookup(name)<0) {error="Invalid animation descriptor: "+line;shutdown();return false;}
        int w=0,h=0,c=0;
        auto* pixels=stbi_load((assets/"animations"/(name+".png")).string().c_str(),&w,&h,&c,4);
        if(!pixels || w!=16 || h!=16*frames) {
            if(pixels) stbi_image_free(pixels);
            error="Invalid animation strip: "+name;shutdown();return false;
        }
        Animation a; a.tile=tiles_.lookup(name);a.frames=frames;a.interval=interval;
        a.pixels.assign(pixels,pixels+(size_t)w*h*4);stbi_image_free(pixels);
        animations_.push_back(std::move(a));
    }
    gl_.Enable(GL_DEPTH_TEST);gl_.DepthFunc(GL_LEQUAL);
    gl_.Enable(GL_BLEND);gl_.BlendFunc(GL_SRC_ALPHA,GL_ONE_MINUS_SRC_ALPHA);
    return true;
}
void Renderer::destroySection(GPUSection& s) {
    for(int i=0;i<3;++i) {
        if(s.vbo[i])gl_.DeleteBuffers(1,&s.vbo[i]);
        if(s.vao[i])gl_.DeleteVertexArrays(1,&s.vao[i]);
        s.vbo[i]=s.vao[i]=0;s.count[i]=0;
    }
}
void Renderer::shutdown() {
    if(!gl_.DeleteBuffers) return;
    clearMeshes();animations_.clear();
    if(uiVbo_)gl_.DeleteBuffers(1,&uiVbo_);
    if(uiVao_)gl_.DeleteVertexArrays(1,&uiVao_);
    if(atlas_)gl_.DeleteTextures(1,&atlas_);
    if(font_)gl_.DeleteTextures(1,&font_);
    if(worldProgram_)gl_.DeleteProgram(worldProgram_);
    if(uiProgram_)gl_.DeleteProgram(uiProgram_);
    uiVbo_=uiVao_=atlas_=font_=worldProgram_=uiProgram_=0;
}
void Renderer::upload(int cx,int cz,int sy,const MeshData& mesh) {
    if(sy<0||sy>=SectionCount) return;
    auto& gpu=meshes_[chunkKey(cx,cz)][sy];
    destroySection(gpu);
    const std::vector<MeshVertex>* layers[3]={&mesh.solid,&mesh.cutout,&mesh.transparent};
    for(int i=0;i<3;++i) {
        const auto& vertices=*layers[i];
        if(vertices.empty()) continue;
        gl_.GenVertexArrays(1,&gpu.vao[i]);gl_.GenBuffers(1,&gpu.vbo[i]);
        gl_.BindVertexArray(gpu.vao[i]);gl_.BindBuffer(GL_ARRAY_BUFFER,gpu.vbo[i]);
        gl_.BufferData(GL_ARRAY_BUFFER,(GLsizeiptr)(vertices.size()*sizeof(MeshVertex)),
                       vertices.data(),GL_STATIC_DRAW);
        GLsizei stride=(GLsizei)sizeof(MeshVertex);
        gl_.EnableVertexAttribArray(0);
        gl_.VertexAttribPointer(0,3,GL_FLOAT,GL_FALSE,stride,(const void*)offsetof(MeshVertex,x));
        gl_.EnableVertexAttribArray(1);
        gl_.VertexAttribPointer(1,2,GL_FLOAT,GL_FALSE,stride,(const void*)offsetof(MeshVertex,u));
        gl_.EnableVertexAttribArray(2);
        gl_.VertexAttribPointer(2,3,GL_FLOAT,GL_FALSE,stride,(const void*)offsetof(MeshVertex,r));
        gl_.EnableVertexAttribArray(3);
        gl_.VertexAttribPointer(3,1,GL_FLOAT,GL_FALSE,stride,(const void*)offsetof(MeshVertex,sky));
        gl_.EnableVertexAttribArray(4);
        gl_.VertexAttribPointer(4,1,GL_FLOAT,GL_FALSE,stride,(const void*)offsetof(MeshVertex,block));
        gpu.count[i]=(GLsizei)vertices.size();
    }
    gl_.BindVertexArray(0);
}
void Renderer::clearMeshes() {
    for(auto& [key,sections]:meshes_) {
        (void)key;
        for(auto& s:sections)destroySection(s);
    }
    meshes_.clear();
}
void Renderer::removeUnloaded(const World& world) {
    for(auto it=meshes_.begin();it!=meshes_.end();) {
        if(world.findChunk((int32_t)(it->first>>32),(int32_t)it->first)) {++it;continue;}
        for(auto& s:it->second)destroySection(s);
        it=meshes_.erase(it);
    }
}
void Renderer::animate(uint64_t time) {
    if(time==lastAnimatedTick_)return;
    lastAnimatedTick_=time;
    gl_.BindTexture(GL_TEXTURE_2D,atlas_);
    for(auto& a:animations_) {
        int frame=(int)((time/a.interval)%a.frames);
        if(frame==a.last)continue;
        a.last=frame;
        gl_.TexSubImage2D(GL_TEXTURE_2D,0,(a.tile%tiles_.columns)*16,
                          (a.tile/tiles_.columns)*16,16,16,GL_RGBA,GL_UNSIGNED_BYTE,
                          a.pixels.data()+(size_t)frame*16*16*4);
    }
}
void Renderer::drawWorld(const World& world,Vec3f eye,Vec3f direction,
                         int width,int height,float fov,int renderDistance) {
    if(width<1||height<1)return;
    animate(world.time());
    float t=(world.time()%24000)/24000.f;
    float day=clampf(std::sin(2*PI*t)*1.25f+0.2f,0.13f,1.f);
    Vec3f sky=Vec3f{0.035f,0.055f,0.12f}*(1-day)+Vec3f{0.52f,0.72f,0.89f}*day;
    bool underwater=world.peekBlock((int)std::floor(eye.x),
        (int)std::floor(eye.y),(int)std::floor(eye.z)).id==BlockID::Water;
    if(underwater)sky={0.07f,0.22f,0.34f};
    gl_.Viewport(0,0,width,height);
    gl_.ClearColor(sky.x,sky.y,sky.z,1.f);
    gl_.Clear(GL_COLOR_BUFFER_BIT|GL_DEPTH_BUFFER_BIT);
    gl_.Enable(GL_DEPTH_TEST);
    gl_.UseProgram(worldProgram_);
    Mat4 projection=perspective(fov,(float)width/height,0.05f,
                                (float)renderDistance*16+48.f);
    Mat4 view=lookAt(eye,direction);
    Mat4 vp=multiply(projection,view);
    gl_.UniformMatrix4fv(gl_.GetUniformLocation(worldProgram_,"uViewProjection"),1,GL_FALSE,vp.m.data());
    gl_.Uniform3f(gl_.GetUniformLocation(worldProgram_,"uCamera"),eye.x,eye.y,eye.z);
    gl_.Uniform3f(gl_.GetUniformLocation(worldProgram_,"uFogColor"),sky.x,sky.y,sky.z);
    gl_.Uniform1f(gl_.GetUniformLocation(worldProgram_,"uDay"),day);
    gl_.Uniform1f(gl_.GetUniformLocation(worldProgram_,"uFogDistance"),
                  underwater?16.f:renderDistance*16.f);
    gl_.Uniform1i(gl_.GetUniformLocation(worldProgram_,"uAtlas"),0);
    auto originLoc=gl_.GetUniformLocation(worldProgram_,"uChunkOrigin");
    auto alphaLoc=gl_.GetUniformLocation(worldProgram_,"uAlphaCutoff");
    gl_.BindTexture(GL_TEXTURE_2D,atlas_);
    struct Draw {int cx,cz;const GPUSection* section;float distSq;};
    std::vector<Draw> visible;
    for(const auto& [key,sections]:meshes_) {
        int cx=(int32_t)(key>>32),cz=(int32_t)key;
        float dx=cx*16.f+8.f-eye.x,dz=cz*16.f+8.f-eye.z;
        float dsq=dx*dx+dz*dz;
        if(std::abs(dx)>renderDistance*16.f+12||std::abs(dz)>renderDistance*16.f+12)continue;
        float d=std::sqrt(dsq);
        if(d>32 && (dx*direction.x+dz*direction.z)<-d*0.45f)continue;
        for(const auto& section:sections)
            if(section.count[0]||section.count[1]||section.count[2])
                visible.push_back({cx,cz,&section,dsq});
    }
    for(int layer=0;layer<3;++layer) {
        if(layer==2) {
            std::sort(visible.begin(),visible.end(),[](const Draw& a,const Draw& b){return a.distSq>b.distSq;});
            gl_.DepthMask(GL_FALSE);
        }
        gl_.Uniform1f(alphaLoc,layer==2?0.01f:0.40f);
        for(const auto& d:visible) {
            if(!d.section->count[layer])continue;
            gl_.Uniform3f(originLoc,d.cx*16.f,0.f,d.cz*16.f);
            gl_.BindVertexArray(d.section->vao[layer]);
            gl_.DrawArrays(GL_TRIANGLES,0,d.section->count[layer]);
        }
    }
    gl_.DepthMask(GL_TRUE);gl_.BindVertexArray(0);
}
void Renderer::uiBegin(int width,int height) {
    uiWidth_=std::max(1,width);uiHeight_=std::max(1,height);
    uiAtlas_.clear();uiFont_.clear();
}
void Renderer::appendUI(std::vector<UIQuadVertex>& buffer,float x,float y,float w,float h,
                        float u0,float v0,float u1,float v1,uint32_t color,float alpha) {
    float r=channel(color,16),g=channel(color,8),b=channel(color,0);
    UIQuadVertex a{x,y,u0,v0,r,g,b,alpha};
    UIQuadVertex c{x+w,y+h,u1,v1,r,g,b,alpha};
    UIQuadVertex b0{x+w,y,u1,v0,r,g,b,alpha};
    UIQuadVertex d{x,y+h,u0,v1,r,g,b,alpha};
    for(const auto& v : {a,b0,c,a,c,d})buffer.push_back(v);
}
void Renderer::uiRect(float x,float y,float w,float h,uint32_t color,float alpha) {
    int idx=std::max(0,tiles_.lookup("white"));
    float u0=(idx%tiles_.columns+0.1f)/tiles_.columns;
    float v0=(idx/tiles_.columns+0.1f)/tiles_.rows;
    float u1=(idx%tiles_.columns+0.9f)/tiles_.columns;
    float v1=(idx/tiles_.columns+0.9f)/tiles_.rows;
    appendUI(uiAtlas_,x,y,w,h,u0,v0,u1,v1,color,alpha);
}
void Renderer::uiSprite(const std::string& tile,float x,float y,float size,
                        uint32_t color,float alpha) {
    int idx=tiles_.lookup(tile);
    if(idx<0) idx=std::max(0,tiles_.lookup("missing"));
    float u0=(float)(idx%tiles_.columns)/tiles_.columns;
    float v0=(float)(idx/tiles_.columns)/tiles_.rows;
    float u1=(float)(idx%tiles_.columns+1)/tiles_.columns;
    float v1=(float)(idx/tiles_.columns+1)/tiles_.rows;
    appendUI(uiAtlas_,x,y,size,size,u0,v0,u1,v1,color,alpha);
}
void Renderer::uiText(const std::string& text,float x,float y,float scale,uint32_t color) {
    float start=x;
    for(unsigned char ch:text) {
        if(ch=='\n') {y+=16*scale;x=start;continue;}
        if(ch<32||ch>126)ch='?';
        int idx=ch-32;
        float u0=(idx%16)/16.f,v0=(idx/16)/6.f;
        float u1=(idx%16+1)/16.f,v1=(idx/16+1)/6.f;
        appendUI(uiFont_,x,y,16*scale,16*scale,u0,v0,u1,v1,color,1);
        x+=11*scale;
    }
}
void Renderer::uiDraw() {
    gl_.Disable(GL_DEPTH_TEST);
    gl_.UseProgram(uiProgram_);
    gl_.Uniform2f(gl_.GetUniformLocation(uiProgram_,"uScreen"),(float)uiWidth_,(float)uiHeight_);
    gl_.Uniform1i(gl_.GetUniformLocation(uiProgram_,"uTex"),0);
    gl_.BindVertexArray(uiVao_);
    auto draw=[&](const std::vector<UIQuadVertex>& v,GLuint texture) {
        if(v.empty())return;
        gl_.BindTexture(GL_TEXTURE_2D,texture);
        gl_.BindBuffer(GL_ARRAY_BUFFER,uiVbo_);
        gl_.BufferData(GL_ARRAY_BUFFER,(GLsizeiptr)(v.size()*sizeof(UIQuadVertex)),v.data(),GL_STREAM_DRAW);
        gl_.DrawArrays(GL_TRIANGLES,0,(GLsizei)v.size());
    };
    draw(uiAtlas_,atlas_);draw(uiFont_,font_);
    gl_.BindVertexArray(0);
    gl_.Enable(GL_DEPTH_TEST);
}
bool Renderer::screenshot(const std::filesystem::path& filename,int w,int h,std::string& error) {
    error.clear();
    if(w<1||h<1||w>8192||h>8192) {error="Screenshot dimensions out of bounds";return false;}
    std::vector<uint8_t> pixels((size_t)w*h*4),flipped(pixels.size());
    gl_.PixelStorei(GL_PACK_ALIGNMENT,1);
    gl_.ReadPixels(0,0,w,h,GL_RGBA,GL_UNSIGNED_BYTE,pixels.data());
    for(int y=0;y<h;++y)
        std::copy_n(pixels.data()+(size_t)(h-1-y)*w*4,(size_t)w*4,
                    flipped.data()+(size_t)y*w*4);
    try {std::filesystem::create_directories(filename.parent_path());}
    catch (const std::filesystem::filesystem_error& ex) {error=ex.what();return false;}
    if(!stbi_write_png(filename.string().c_str(),w,h,4,flipped.data(),w*4)) {
        error="Could not write screenshot: "+filename.string();return false;
    }
    return true;
}
} // namespace vox
