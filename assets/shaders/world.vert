#version 330 core
layout(location=0) in vec3 aPosition;
layout(location=1) in vec2 aUV;
layout(location=2) in vec3 aTint;
layout(location=3) in float aSky;
layout(location=4) in float aBlock;
uniform mat4 uViewProjection;
uniform vec3 uChunkOrigin;
out vec2 vUV;
out vec3 vTint;
out float vSky;
out float vBlock;
out vec3 vWorld;
void main() {
    vec3 p=aPosition+uChunkOrigin;
    gl_Position=uViewProjection*vec4(p,1.0);
    vUV=aUV;
    vTint=aTint;
    vSky=aSky;
    vBlock=aBlock;
    vWorld=p;
}
