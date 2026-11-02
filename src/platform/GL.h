#pragma once
#include <SDL3/SDL.h>
#include <SDL3/SDL_opengl.h>
#include <string>

namespace vox {

// Minimal OpenGL 3.3 function table. Every call is resolved through SDL3 so
// Linux compilation does not require libGL development libraries; the binary
// still requires a real GL-capable driver/display at runtime.
struct GL {
    decltype(&glClearColor) ClearColor{};
    decltype(&glClear) Clear{};
    decltype(&glViewport) Viewport{};
    decltype(&glEnable) Enable{};
    decltype(&glDisable) Disable{};
    decltype(&glDepthFunc) DepthFunc{};
    decltype(&glBlendFunc) BlendFunc{};
    decltype(&glCullFace) CullFace{};
    decltype(&glGetString) GetString{};
    decltype(&glGenTextures) GenTextures{};
    decltype(&glBindTexture) BindTexture{};
    decltype(&glTexParameteri) TexParameteri{};
    decltype(&glTexImage2D) TexImage2D{};
    decltype(&glTexSubImage2D) TexSubImage2D{};
    decltype(&glDeleteTextures) DeleteTextures{};
    decltype(&glDrawArrays) DrawArrays{};
    decltype(&glDepthMask) DepthMask{};
    decltype(&glPixelStorei) PixelStorei{};
    decltype(&glReadPixels) ReadPixels{};
    decltype(&glGetError) GetError{};
    PFNGLCREATESHADERPROC CreateShader{};
    PFNGLSHADERSOURCEPROC ShaderSource{};
    PFNGLCOMPILESHADERPROC CompileShader{};
    PFNGLGETSHADERIVPROC GetShaderiv{};
    PFNGLGETSHADERINFOLOGPROC GetShaderInfoLog{};
    PFNGLCREATEPROGRAMPROC CreateProgram{};
    PFNGLATTACHSHADERPROC AttachShader{};
    PFNGLLINKPROGRAMPROC LinkProgram{};
    PFNGLGETPROGRAMIVPROC GetProgramiv{};
    PFNGLGETPROGRAMINFOLOGPROC GetProgramInfoLog{};
    PFNGLDELETESHADERPROC DeleteShader{};
    PFNGLDELETEPROGRAMPROC DeleteProgram{};
    PFNGLUSEPROGRAMPROC UseProgram{};
    PFNGLGETUNIFORMLOCATIONPROC GetUniformLocation{};
    PFNGLUNIFORMMATRIX4FVPROC UniformMatrix4fv{};
    PFNGLUNIFORM3FPROC Uniform3f{};
    PFNGLUNIFORM1FPROC Uniform1f{};
    PFNGLUNIFORM1IPROC Uniform1i{};
    PFNGLUNIFORM2FPROC Uniform2f{};
    PFNGLGENVERTEXARRAYSPROC GenVertexArrays{};
    PFNGLBINDVERTEXARRAYPROC BindVertexArray{};
    PFNGLDELETEVERTEXARRAYSPROC DeleteVertexArrays{};
    PFNGLGENBUFFERSPROC GenBuffers{};
    PFNGLBINDBUFFERPROC BindBuffer{};
    PFNGLBUFFERDATAPROC BufferData{};
    PFNGLDELETEBUFFERSPROC DeleteBuffers{};
    PFNGLENABLEVERTEXATTRIBARRAYPROC EnableVertexAttribArray{};
    PFNGLVERTEXATTRIBPOINTERPROC VertexAttribPointer{};
    bool load(std::string& error);
};

} // namespace vox
