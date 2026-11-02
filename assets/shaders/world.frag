#version 330 core
in vec2 vUV;
in vec3 vTint;
in float vSky;
in float vBlock;
in vec3 vWorld;
out vec4 FragColor;
uniform sampler2D uAtlas;
uniform vec3 uCamera;
uniform vec3 uFogColor;
uniform float uDay;
uniform float uFogDistance;
uniform float uAlphaCutoff;
void main() {
    vec4 tex=texture(uAtlas,vUV);
    if (tex.a<uAlphaCutoff) discard;
    float lit=max(vSky*uDay,vBlock);
    float brightness=0.12+0.88*pow(clamp(lit,0.0,1.0),0.75);
    vec3 rgb=tex.rgb*vTint*brightness;
    float distanceToCamera=length(vWorld-uCamera);
    float fog=smoothstep(uFogDistance*0.65,uFogDistance,distanceToCamera);
    FragColor=vec4(mix(rgb,uFogColor,fog),tex.a);
}
