#version 330 core
layout(location=0) in vec2 aPosition;
layout(location=1) in vec2 aUV;
layout(location=2) in vec4 aColor;
uniform vec2 uScreen;
out vec2 vUV;
out vec4 vColor;
void main() {
    gl_Position=vec4(aPosition.x*2.0/uScreen.x-1.0,
                     1.0-aPosition.y*2.0/uScreen.y,0.0,1.0);
    vUV=aUV;
    vColor=aColor;
}
