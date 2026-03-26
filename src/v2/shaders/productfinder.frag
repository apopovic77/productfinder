// ProductFinder v2 — Fragment Shader

varying vec2 vAtlasUV;
varying float vOpacity;

uniform sampler2D uAtlasTexture;

void main() {
    vec4 texColor = texture2D(uAtlasTexture, vAtlasUV);
    if (texColor.a < 0.01) discard;
    gl_FragColor = vec4(texColor.rgb, texColor.a * vOpacity);
}
