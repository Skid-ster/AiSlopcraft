#include "StudyRenderer.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdio>
#include <filesystem>
#include <iostream>
#include <sstream>
#if defined(__GNUC__)
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wmissing-field-initializers" // third-party stb C code
#endif
#define STB_IMAGE_IMPLEMENTATION
#include "stb/stb_image.h"
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb/stb_image_write.h"
#if defined(__GNUC__)
#pragma GCC diagnostic pop
#endif

namespace rebuild {
namespace {
constexpr float pi=3.14159265358979323846f;
struct Mat { std::array<float,16> m{}; };
Mat multiply(const Mat& a,const Mat& b) {
    Mat c;
    for(int column=0;column<4;++column)for(int row=0;row<4;++row)
        for(int k=0;k<4;++k)c.m[static_cast<size_t>(column*4+row)]+=
            a.m[static_cast<size_t>(k*4+row)]*b.m[static_cast<size_t>(column*4+k)];
    return c;
}
Mat projection(float aspect) {
    constexpr float nearPlane=.05f,farPlane=70.f;
    const float f=1.f/std::tan(70.f*pi/360.f);
    Mat p;p.m[0]=f/aspect;p.m[5]=f;
    p.m[10]=(farPlane+nearPlane)/(nearPlane-farPlane);
    p.m[11]=-1;p.m[14]=(2*farPlane*nearPlane)/(nearPlane-farPlane);
    return p;
}
float dot(Vec3 a,Vec3 b){return a.x*b.x+a.y*b.y+a.z*b.z;}
Vec3 cross(Vec3 a,Vec3 b){return {a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x};}
Vec3 unit(Vec3 a){float d=std::sqrt(dot(a,a));return d>0?a*(1.f/d):Vec3{};}
Mat camera(Vec3 eye,Vec3 forward) {
    Vec3 f=unit(forward),right=unit(cross(f,{0,1,0})),up=cross(right,f);
    Mat m;
    m.m[0]=right.x;m.m[4]=right.y;m.m[8]=right.z;m.m[12]=-dot(right,eye);
    m.m[1]=up.x;m.m[5]=up.y;m.m[9]=up.z;m.m[13]=-dot(up,eye);
    m.m[2]=-f.x;m.m[6]=-f.y;m.m[10]=-f.z;m.m[14]=dot(f,eye);
    m.m[15]=1;
    return m;
}
const char* worldVertex=R"GLSL(#version 330 core
layout(location=0) in vec3 aPosition;
layout(location=1) in vec2 aUV;
layout(location=2) in float aLight;
uniform mat4 uMVP;
out vec2 vUV;
out float vLight;
out vec3 vWorld;
void main(){vUV=aUV;vLight=aLight;vWorld=aPosition;gl_Position=uMVP*vec4(aPosition,1.0);}
)GLSL";
const char* worldFragment=R"GLSL(#version 330 core
in vec2 vUV;
in float vLight;
in vec3 vWorld;
uniform sampler2D uAtlas;
uniform vec3 uEye;
out vec4 fragColor;
void main(){
    vec4 texel=texture(uAtlas,vUV);
    if(texel.a<0.5)discard;
    vec3 sky=vec3(0.54,0.74,0.94);
    vec3 lit=texel.rgb*vLight;
    float distanceXZ=length(vWorld.xz-uEye.xz);
    float fog=smoothstep(27.0,43.0,distanceXZ);
    fragColor=vec4(mix(lit,sky,fog),1.0);
}
)GLSL";
const char* uiVertex=R"GLSL(#version 330 core
layout(location=0) in vec2 aPosition;
layout(location=1) in vec2 aUV;
layout(location=2) in vec4 aColor;
uniform vec2 uScreen;
out vec2 vUV;
out vec4 vColor;
void main(){vUV=aUV;vColor=aColor;gl_Position=vec4(aPosition*vec2(2.0,-2.0)/uScreen+vec2(-1.0,1.0),0.0,1.0);}
)GLSL";
const char* uiFragment=R"GLSL(#version 330 core
in vec2 vUV;
in vec4 vColor;
uniform sampler2D uAtlas;
out vec4 fragColor;
void main(){
    fragColor=vColor;
    if(vUV.x>=0.0){fragColor*=texture(uAtlas,vUV);if(fragColor.a<0.5)discard;}
}
)GLSL";
const char* lineVertex=R"GLSL(#version 330 core
layout(location=0) in vec3 aPosition;
uniform mat4 uMVP;
void main(){gl_Position=uMVP*vec4(aPosition,1.0);}
)GLSL";
const char* lineFragment=R"GLSL(#version 330 core
uniform vec3 uColor;
out vec4 fragColor;
void main(){fragColor=vec4(uColor,1.0);}
)GLSL";
// Original minimal pixel-letter overlays; not the reference game's font.
std::array<uint8_t,7> glyph(char ch) {
    switch(ch) {
        case 'A':return {14,17,17,31,17,17,17};
        case 'B':return {30,17,17,30,17,17,30};
        case 'C':return {14,17,16,16,16,17,14};
        case 'D':return {30,17,17,17,17,17,30};
        case 'E':return {31,16,16,30,16,16,31};
        case 'F':return {31,16,16,30,16,16,16};
        case 'G':return {14,17,16,23,17,17,14};
        case 'H':return {17,17,17,31,17,17,17};
        case 'I':return {31,4,4,4,4,4,31};
        case 'J':return {7,2,2,2,18,18,12};
        case 'K':return {17,18,20,24,20,18,17};
        case 'L':return {16,16,16,16,16,16,31};
        case 'M':return {17,27,21,21,17,17,17};
        case 'N':return {17,25,21,19,17,17,17};
        case 'O':return {14,17,17,17,17,17,14};
        case 'P':return {30,17,17,30,16,16,16};
        case 'Q':return {14,17,17,17,21,18,13};
        case 'R':return {30,17,17,30,20,18,17};
        case 'S':return {15,16,16,14,1,1,30};
        case 'T':return {31,4,4,4,4,4,4};
        case 'U':return {17,17,17,17,17,17,14};
        case 'V':return {17,17,17,17,10,10,4};
        case 'W':return {17,17,17,21,21,21,10};
        case 'X':return {17,17,10,4,10,17,17};
        case 'Y':return {17,17,10,4,4,4,4};
        case 'Z':return {31,1,2,4,8,16,31};
        case '0':return {14,17,19,21,25,17,14};
        case '1':return {4,12,4,4,4,4,14};
        case '2':return {14,17,1,2,4,8,31};
        case '3':return {30,1,1,14,1,1,30};
        case '4':return {2,6,10,18,31,2,2};
        case '5':return {31,16,30,1,1,17,14};
        case '6':return {6,8,16,30,17,17,14};
        case '7':return {31,1,2,4,8,8,8};
        case '8':return {14,17,17,14,17,17,14};
        case '9':return {14,17,17,15,1,2,12};
        case '.':return {0,0,0,0,0,12,12};
        case ':':return {0,12,12,0,12,12,0};
        case '-':return {0,0,0,31,0,0,0};
        case '/':return {1,2,2,4,8,8,16};
        case '+':return {0,4,4,31,4,4,0};
        default:return {};
    }
}
}
GLuint StudyRenderer::shader(GLenum type,const char* text,std::string& error) {
    GLuint id=gl_.CreateShader(type);gl_.ShaderSource(id,1,&text,nullptr);gl_.CompileShader(id);
    GLint ok=0;gl_.GetShaderiv(id,GL_COMPILE_STATUS,&ok);
    if(!ok){char log[2048]{};gl_.GetShaderInfoLog(id,2047,nullptr,log);
        error=std::string("Rebuild shader: ")+log;gl_.DeleteShader(id);return 0;}
    return id;
}
GLuint StudyRenderer::program(const char* vertex,const char* fragment,std::string& error) {
    GLuint vs=shader(GL_VERTEX_SHADER,vertex,error);if(!vs)return 0;
    GLuint fs=shader(GL_FRAGMENT_SHADER,fragment,error);
    if(!fs){gl_.DeleteShader(vs);return 0;}
    GLuint id=gl_.CreateProgram();gl_.AttachShader(id,vs);gl_.AttachShader(id,fs);
    gl_.LinkProgram(id);gl_.DeleteShader(vs);gl_.DeleteShader(fs);
    GLint ok=0;gl_.GetProgramiv(id,GL_LINK_STATUS,&ok);
    if(!ok){char log[2048]{};gl_.GetProgramInfoLog(id,2047,nullptr,log);
        error=std::string("Rebuild program: ")+log;gl_.DeleteProgram(id);return 0;}
    return id;
}
bool StudyRenderer::init(const std::filesystem::path& assets,std::string& error) {
    if(!gl_.load(error))return false;
    const auto* version=gl_.GetString(GL_VERSION);
    if(!version){error="No GL version; OpenGL 3.3 desktop driver required";return false;}
    driver_=reinterpret_cast<const char*>(version);
    worldProgram_=program(worldVertex,worldFragment,error);
    uiProgram_=worldProgram_?program(uiVertex,uiFragment,error):0;
    lineProgram_=uiProgram_?program(lineVertex,lineFragment,error):0;
    if(!lineProgram_)return false;
    int w=0,h=0,channels=0;
    const std::string atlas=(assets/"rebuild"/"atlas.png").string();
    stbi_set_flip_vertically_on_load(1);
    unsigned char* data=stbi_load(atlas.c_str(),&w,&h,&channels,4);
    if(!data || w!=256 || h!=16){
        error="Expected original 256x16 rebuild atlas at "+atlas;
        if(data)stbi_image_free(data);
        return false;
    }
    gl_.GenTextures(1,&texture_);gl_.BindTexture(GL_TEXTURE_2D,texture_);
    gl_.PixelStorei(GL_UNPACK_ALIGNMENT,1);
    gl_.TexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,w,h,0,GL_RGBA,GL_UNSIGNED_BYTE,data);
    stbi_image_free(data);
    gl_.TexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MIN_FILTER,GL_NEAREST);
    gl_.TexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MAG_FILTER,GL_NEAREST);
    gl_.TexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_S,GL_CLAMP_TO_EDGE);
    gl_.TexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_T,GL_CLAMP_TO_EDGE);
    gl_.GenVertexArrays(1,&uiVao_);gl_.GenBuffers(1,&uiVbo_);
    gl_.BindVertexArray(uiVao_);gl_.BindBuffer(GL_ARRAY_BUFFER,uiVbo_);
    gl_.VertexAttribPointer(0,2,GL_FLOAT,GL_FALSE,sizeof(UiVertex),reinterpret_cast<void*>(0));
    gl_.VertexAttribPointer(1,2,GL_FLOAT,GL_FALSE,sizeof(UiVertex),reinterpret_cast<void*>(2*sizeof(float)));
    gl_.VertexAttribPointer(2,4,GL_FLOAT,GL_FALSE,sizeof(UiVertex),reinterpret_cast<void*>(4*sizeof(float)));
    for(GLuint i=0;i<3;++i)gl_.EnableVertexAttribArray(i);
    gl_.GenVertexArrays(1,&lineVao_);gl_.GenBuffers(1,&lineVbo_);
    gl_.BindVertexArray(lineVao_);gl_.BindBuffer(GL_ARRAY_BUFFER,lineVbo_);
    gl_.VertexAttribPointer(0,3,GL_FLOAT,GL_FALSE,3*sizeof(float),reinterpret_cast<void*>(0));
    gl_.EnableVertexAttribArray(0);
    gl_.BindVertexArray(0);
    gl_.Enable(GL_DEPTH_TEST);gl_.DepthFunc(GL_LEQUAL);
    if(gl_.GetError()!=GL_NO_ERROR){error="OpenGL setup failed";return false;}
    return true;
}
void StudyRenderer::shutdown() {
    for(auto& gpu:chunks_){
        if(gpu.vao)gl_.DeleteVertexArrays(1,&gpu.vao);
        if(gpu.vbo)gl_.DeleteBuffers(1,&gpu.vbo);
        gpu={};
    }
    if(uiVao_)gl_.DeleteVertexArrays(1,&uiVao_);
    if(uiVbo_)gl_.DeleteBuffers(1,&uiVbo_);
    if(lineVao_)gl_.DeleteVertexArrays(1,&lineVao_);
    if(lineVbo_)gl_.DeleteBuffers(1,&lineVbo_);
    if(texture_)gl_.DeleteTextures(1,&texture_);
    if(worldProgram_)gl_.DeleteProgram(worldProgram_);
    if(uiProgram_)gl_.DeleteProgram(uiProgram_);
    if(lineProgram_)gl_.DeleteProgram(lineProgram_);
    uiVao_=uiVbo_=lineVao_=lineVbo_=texture_=worldProgram_=uiProgram_=lineProgram_=0;
}
void StudyRenderer::rebuild(const World& world,int cx,int cz) {
    constexpr int width=World::side/World::chunk;
    if(cx<0||cz<0||cx>=width||cz>=width)return;
    auto& gpu=chunks_[static_cast<size_t>(cz*width+cx)];
    auto mesh=buildMesh(world,cx,cz);
    if(!gpu.vao){gl_.GenVertexArrays(1,&gpu.vao);gl_.GenBuffers(1,&gpu.vbo);}
    gpu.count=static_cast<GLsizei>(mesh.vertices.size());
    gl_.BindVertexArray(gpu.vao);gl_.BindBuffer(GL_ARRAY_BUFFER,gpu.vbo);
    gl_.BufferData(GL_ARRAY_BUFFER,static_cast<GLsizeiptr>(mesh.vertices.size()*sizeof(Vertex)),
                   mesh.vertices.data(),GL_DYNAMIC_DRAW);
    gl_.VertexAttribPointer(0,3,GL_FLOAT,GL_FALSE,sizeof(Vertex),reinterpret_cast<void*>(0));
    gl_.VertexAttribPointer(1,2,GL_FLOAT,GL_FALSE,sizeof(Vertex),reinterpret_cast<void*>(3*sizeof(float)));
    gl_.VertexAttribPointer(2,1,GL_FLOAT,GL_FALSE,sizeof(Vertex),reinterpret_cast<void*>(5*sizeof(float)));
    for(GLuint i=0;i<3;++i)gl_.EnableVertexAttribArray(i);
    gl_.BindVertexArray(0);
}
void StudyRenderer::rebuildAround(const World& world,Cell edit) {
    const int x=edit.x+World::half,z=edit.z+World::half;
    const int cx=x/World::chunk,cz=z/World::chunk;
    rebuild(world,cx,cz);
    // A face in an adjacent chunk changes only at this exact boundary.
    if(x%World::chunk==0)rebuild(world,cx-1,cz);
    if(x%World::chunk==World::chunk-1)rebuild(world,cx+1,cz);
    if(z%World::chunk==0)rebuild(world,cx,cz-1);
    if(z%World::chunk==World::chunk-1)rebuild(world,cx,cz+1);
}
void StudyRenderer::quad(float x,float y,float w,float h,float u0,float v0,float u1,float v1,
                         uint32_t color,float alpha) {
    float r=float((color>>16)&255)/255.f,g=float((color>>8)&255)/255.f,b=float(color&255)/255.f;
    UiVertex v[4]={{x,y,u0,v1,r,g,b,alpha},{x,y+h,u0,v0,r,g,b,alpha},
                   {x+w,y+h,u1,v0,r,g,b,alpha},{x+w,y,u1,v1,r,g,b,alpha}};
    constexpr int order[]={0,1,2,0,2,3};
    for(int i:order)ui_.push_back(v[i]);
}
void StudyRenderer::rect(float x,float y,float w,float h,uint32_t color,float alpha) {
    quad(x,y,w,h,-1,-1,-1,-1,color,alpha);
}
void StudyRenderer::icon(int t,float x,float y,float size,float shade) {
    float u0=(float(t)+.03125f)/16.f,u1=(float(t)+.96875f)/16.f;
    const uint8_t tone=static_cast<uint8_t>(std::clamp(shade,0.f,1.f)*255);
    uint32_t tint=(uint32_t(tone)<<16)|(uint32_t(tone)<<8)|tone;
    quad(x,y,size,size,u0,.03125f,u1,.96875f,tint,1.f);
}
void StudyRenderer::label(std::string text,float x,float y,int size,uint32_t color) {
    for(char ch:text){
        auto rows=glyph(ch);
        for(int row=0;row<7;++row)for(int col=0;col<5;++col)
            if(rows[static_cast<size_t>(row)] & (1<<(4-col)))
                rect(x+col*size,y+row*size,float(size),float(size),color);
        x+=6*size;
    }
}
void StudyRenderer::draw(const Player& player,const std::optional<Hit>& target,int slot,
                         int width,int height,int guiScale,bool paused,bool debug,
                         float fps,float frameMs,float drawMs,float swapMs,float editMs,int edits) {
    width=std::max(width,1);height=std::max(height,1);
    Vec3 eye=player.eye();Mat mvp=multiply(projection(float(width)/height),camera(eye,player.direction()));
    gl_.Viewport(0,0,width,height);
    gl_.ClearColor(.54f,.74f,.94f,1.f);gl_.Clear(GL_COLOR_BUFFER_BIT|GL_DEPTH_BUFFER_BIT);
    gl_.Disable(GL_BLEND);gl_.Enable(GL_DEPTH_TEST);
    gl_.BindTexture(GL_TEXTURE_2D,texture_);
    gl_.UseProgram(worldProgram_);
    gl_.UniformMatrix4fv(gl_.GetUniformLocation(worldProgram_,"uMVP"),1,GL_FALSE,mvp.m.data());
    gl_.Uniform3f(gl_.GetUniformLocation(worldProgram_,"uEye"),eye.x,eye.y,eye.z);
    gl_.Uniform1i(gl_.GetUniformLocation(worldProgram_,"uAtlas"),0);
    for(const auto& gpu:chunks_)if(gpu.count){gl_.BindVertexArray(gpu.vao);
        gl_.DrawArrays(GL_TRIANGLES,0,gpu.count);}
    if(target){
        const float x=float(target->cell.x),y=float(target->cell.y),z=float(target->cell.z);
        constexpr float e=.003f;
        const float xa=x-e,xb=x+1+e,ya=y-e,yb=y+1+e,za=z-e,zb=z+1+e;
        const std::array<float,72> edges{{
            xa,ya,za, xb,ya,za, xb,ya,za, xb,ya,zb,
            xb,ya,zb, xa,ya,zb, xa,ya,zb, xa,ya,za,
            xa,yb,za, xb,yb,za, xb,yb,za, xb,yb,zb,
            xb,yb,zb, xa,yb,zb, xa,yb,zb, xa,yb,za,
            xa,ya,za, xa,yb,za, xb,ya,za, xb,yb,za,
            xb,ya,zb, xb,yb,zb, xa,ya,zb, xa,yb,zb}};
        gl_.UseProgram(lineProgram_);
        gl_.UniformMatrix4fv(gl_.GetUniformLocation(lineProgram_,"uMVP"),1,GL_FALSE,mvp.m.data());
        gl_.Uniform3f(gl_.GetUniformLocation(lineProgram_,"uColor"),.12f,.12f,.12f);
        gl_.BindVertexArray(lineVao_);gl_.BindBuffer(GL_ARRAY_BUFFER,lineVbo_);
        gl_.BufferData(GL_ARRAY_BUFFER,sizeof(edges),edges.data(),GL_DYNAMIC_DRAW);
        gl_.DrawArrays(GL_LINES,0,24);
    }
    ui_.clear();
    const int maxScale=std::max(1,std::min(width/190,height/72));
    const int s=std::clamp(guiScale,1,maxScale);
    const float barX=(width-182.f*s)/2.f,barY=height-25.f*s;
    // An ORIGINAL, opaque-edged 182×22 hotbar silhouette on a logical pixel grid.
    rect(barX,barY,182.f*s,22.f*s,0x171717,0.84f);
    rect(barX+s,barY+s,180.f*s,20.f*s,0x494949,0.9f);
    rect(barX+2*s,barY+2*s,178.f*s,18.f*s,0x202020,0.86f);
    for(int i=0;i<9;++i){
        const float x=barX+(2+20*i)*s;
        rect(x+1*s,barY+2*s,18*s,18*s,0x363636,.93f);
        rect(x+2*s,barY+3*s,16*s,16*s,0x777777,.55f);
        rect(x+3*s,barY+4*s,14*s,14*s,0x282828,.9f);
        constexpr Block palette[]={Block::Grass,Block::Dirt,Block::Stone,Block::Log,
                                   Block::Planks,Block::Cobble,Block::Sand,Block::Leaves,Block::Flower};
        int iconTile=tile(palette[static_cast<size_t>(i)],1);
        icon(iconTile,x+2*s,barY+2*s,16.f*s);
    }
    float selectedX=barX+(1+20*std::clamp(slot,0,8))*s;
    rect(selectedX,barY-s,23*s,2*s,0xeeeeee);
    rect(selectedX,barY+21*s,23*s,2*s,0xeeeeee);
    rect(selectedX,barY-s,2*s,24*s,0xeeeeee);
    rect(selectedX+21*s,barY-s,2*s,24*s,0xeeeeee);
    if(!paused){
        float cx=width/2.f,cy=height/2.f;
        rect(cx-5*s+1,cy-s/2.f+1,10*s,s+2,0x111111,.8f);
        rect(cx-s/2.f+1,cy-5*s+1,s+2,10*s,0x111111,.8f);
        rect(cx-5*s,cy-s/2.f,10*s,s,0xf3f3f3);
        rect(cx-s/2.f,cy-5*s,s,10*s,0xf3f3f3);
    }
    label("ART STUDY 01",width-92.f*s,6.f*s,s,0x202020);
    if(paused){
        rect(width/2.f-110*s,height/2.f-15*s,220*s,30*s,0x1b1b1b,.84f);
        label("PAUSED - CLICK TO RESUME",width/2.f-83*s,height/2.f-3*s,s,0xffffff);
    }
    if(debug){
        rect(4*s,4*s,184*s,58*s,0x171717,.75f);
        char line[80];std::snprintf(line,sizeof(line),"FPS %.0f FRAME %.1f MS",fps,frameMs);
        label(line,6.f*s,6.f*s,s,0xffffff);
        std::snprintf(line,sizeof(line),"DRAW %.1f SWAP %.1f MS",drawMs,swapMs);
        label(line,6.f*s,15.f*s,s,0xffffff);
        std::snprintf(line,sizeof(line),"LAST EDIT MESH %.1f MS",editMs);
        label(line,6.f*s,24.f*s,s,0xffffff);
        std::snprintf(line,sizeof(line),"X %.0f Y %.0f Z %.0f",player.feet.x,player.feet.y,player.feet.z);
        label(line,6.f*s,33.f*s,s,0xffffff);
        if(target){std::snprintf(line,sizeof(line),"HIT %d %d %d",target->cell.x,target->cell.y,target->cell.z);
            label(line,6.f*s,42.f*s,s,0xffffff);}
        std::snprintf(line,sizeof(line),"EDITS %d",edits);
        label(line,6.f*s,51.f*s,s,0xffffff);
    }
    gl_.Disable(GL_DEPTH_TEST);gl_.Enable(GL_BLEND);
    gl_.BlendFunc(GL_SRC_ALPHA,GL_ONE_MINUS_SRC_ALPHA);
    gl_.UseProgram(uiProgram_);
    gl_.Uniform2f(gl_.GetUniformLocation(uiProgram_,"uScreen"),float(width),float(height));
    gl_.Uniform1i(gl_.GetUniformLocation(uiProgram_,"uAtlas"),0);
    gl_.BindVertexArray(uiVao_);gl_.BindBuffer(GL_ARRAY_BUFFER,uiVbo_);
    gl_.BufferData(GL_ARRAY_BUFFER,static_cast<GLsizeiptr>(ui_.size()*sizeof(UiVertex)),
                   ui_.data(),GL_DYNAMIC_DRAW);
    gl_.DrawArrays(GL_TRIANGLES,0,static_cast<GLsizei>(ui_.size()));
    gl_.BindVertexArray(0);
}
bool StudyRenderer::capture(const std::filesystem::path& output,int w,int h,std::string& error) {
    if(w<1 || h<1 || w>8192 || h>8192){error="Invalid screenshot dimensions";return false;}
    std::vector<unsigned char> raw(static_cast<size_t>(w)*h*4);
    gl_.PixelStorei(GL_PACK_ALIGNMENT,1);
    gl_.ReadPixels(0,0,w,h,GL_RGBA,GL_UNSIGNED_BYTE,raw.data());
    if(gl_.GetError()!=GL_NO_ERROR){error="glReadPixels failed";return false;}
    std::vector<unsigned char> flipped(raw.size());
    for(int y=0;y<h;++y)std::copy_n(raw.begin()+static_cast<size_t>(h-1-y)*w*4,
                                     static_cast<size_t>(w)*4,
                                     flipped.begin()+static_cast<size_t>(y)*w*4);
    std::error_code ec;
    if(output.has_parent_path())std::filesystem::create_directories(output.parent_path(),ec);
    if(ec){error=ec.message();return false;}
    if(!stbi_write_png(output.string().c_str(),w,h,4,flipped.data(),w*4)){
        error="Cannot write screenshot to "+output.string();return false;}
    return true;
}
} // namespace rebuild
