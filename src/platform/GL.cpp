#include "GL.h"

namespace vox {
bool GL::load(std::string& error) {
    error.clear();
#define RESOLVE(field, symbol) do { \
    field=reinterpret_cast<decltype(field)>(SDL_GL_GetProcAddress(symbol)); \
    if (!field) { error=std::string("OpenGL driver missing ")+symbol; return false; } \
} while (false)
    RESOLVE(ClearColor,"glClearColor");RESOLVE(Clear,"glClear");
    RESOLVE(Viewport,"glViewport");RESOLVE(Enable,"glEnable");
    RESOLVE(Disable,"glDisable");RESOLVE(DepthFunc,"glDepthFunc");
    RESOLVE(BlendFunc,"glBlendFunc");RESOLVE(CullFace,"glCullFace");
    RESOLVE(GetString,"glGetString");RESOLVE(GenTextures,"glGenTextures");
    RESOLVE(BindTexture,"glBindTexture");RESOLVE(TexParameteri,"glTexParameteri");
    RESOLVE(TexImage2D,"glTexImage2D");RESOLVE(TexSubImage2D,"glTexSubImage2D");
    RESOLVE(DeleteTextures,"glDeleteTextures");RESOLVE(DrawArrays,"glDrawArrays");
    RESOLVE(DepthMask,"glDepthMask");RESOLVE(PixelStorei,"glPixelStorei");
    RESOLVE(ReadPixels,"glReadPixels");RESOLVE(GetError,"glGetError");
    RESOLVE(CreateShader,"glCreateShader");RESOLVE(ShaderSource,"glShaderSource");
    RESOLVE(CompileShader,"glCompileShader");RESOLVE(GetShaderiv,"glGetShaderiv");
    RESOLVE(GetShaderInfoLog,"glGetShaderInfoLog");
    RESOLVE(CreateProgram,"glCreateProgram");RESOLVE(AttachShader,"glAttachShader");
    RESOLVE(LinkProgram,"glLinkProgram");RESOLVE(GetProgramiv,"glGetProgramiv");
    RESOLVE(GetProgramInfoLog,"glGetProgramInfoLog");
    RESOLVE(DeleteShader,"glDeleteShader");RESOLVE(DeleteProgram,"glDeleteProgram");
    RESOLVE(UseProgram,"glUseProgram");RESOLVE(GetUniformLocation,"glGetUniformLocation");
    RESOLVE(UniformMatrix4fv,"glUniformMatrix4fv");RESOLVE(Uniform3f,"glUniform3f");
    RESOLVE(Uniform1f,"glUniform1f");RESOLVE(Uniform1i,"glUniform1i");
    RESOLVE(Uniform2f,"glUniform2f");
    RESOLVE(GenVertexArrays,"glGenVertexArrays");
    RESOLVE(BindVertexArray,"glBindVertexArray");
    RESOLVE(DeleteVertexArrays,"glDeleteVertexArrays");
    RESOLVE(GenBuffers,"glGenBuffers");RESOLVE(BindBuffer,"glBindBuffer");
    RESOLVE(BufferData,"glBufferData");RESOLVE(DeleteBuffers,"glDeleteBuffers");
    RESOLVE(EnableVertexAttribArray,"glEnableVertexAttribArray");
    RESOLVE(VertexAttribPointer,"glVertexAttribPointer");
#undef RESOLVE
    return true;
}
} // namespace vox
