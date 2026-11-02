#version 330 core
in vec2 vUV;
in vec4 vColor;
out vec4 FragColor;
uniform sampler2D uTex;
void main() {
    vec4 pixel=texture(uTex,vUV);
    if (pixel.a<0.01) discard;
    FragColor=pixel*vColor;
}
