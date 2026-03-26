// ProductFinder v2 — Vertex Shader
// GPU-instanced product tiles with atlas texturing and smooth transitions.

attribute vec4 aLayout;       // position.xyz + scale
attribute vec4 aOldLayout;    // previous layout (for transitions)
attribute vec4 aTarget;       // sizeX, sizeY, unused, unused
attribute vec4 aOldTarget;    // previous target
attribute vec4 aUVOffset;     // atlas tile: offsetU, offsetV, scaleU, scaleV
attribute float aOpacity;     // per-instance opacity
attribute float aAnimOffset;  // stagger animation offset (0.0–0.7)

uniform float uLayoutMix;    // transition progress: 0 = old, 1 = new

varying vec2 vAtlasUV;
varying float vOpacity;

void main() {
    // Staggered transition per instance
    float staggeredMix = clamp(
        (uLayoutMix - aAnimOffset) / (1.0 - aAnimOffset + 0.001),
        0.0, 1.0
    );

    // Cubic ease-out
    float t = 1.0 - (1.0 - staggeredMix) * (1.0 - staggeredMix) * (1.0 - staggeredMix);

    // Interpolate position + scale
    vec3 worldPos = mix(aOldLayout.xyz, aLayout.xyz, t);
    float scale = mix(aOldLayout.w, aLayout.w, t);

    // Interpolate size
    vec2 size = mix(aOldTarget.xy, aTarget.xy, t);

    // PlaneGeometry is 1×1 centered at origin
    vec3 pos = position;
    pos.x *= size.x;
    pos.y *= size.y;

    pos *= scale;
    pos += worldPos;

    // Layout positions are top-left, quad is centered → offset
    pos.x += size.x * scale * 0.5;
    pos.y -= size.y * scale * 0.5;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);

    // Atlas UV
    vAtlasUV = uv * aUVOffset.zw + aUVOffset.xy;
    vOpacity = aOpacity * scale;
}
