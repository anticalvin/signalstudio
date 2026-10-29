precision highp float;
uniform sampler2D tIn, tGeo, tBlue, tCover;
uniform vec2 res;
// k: output pixels per composition unit. All "composition pixel" parameters are multiplied by k.
uniform float k, op, mAll, seed, blueN;
varying vec2 vUv;
const vec3 LW = vec3(.2126, .7152, .0722);
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
// Selection mask: tCover holds antialiased coverage of the targeted objects (white) rendered with the
// same depth test as the beauty pass, so occlusion by other objects is exact and edges are fractional.
float maskAt(vec2 uv) { if (mAll > .5) return 1.; return texture2D(tCover, uv).r; }
float cover(vec2 uv) { return maskAt(uv); }
float enc(float x) { return pow(max(x, 0.), 1. / 2.2); }
float lumE(vec2 uv) { return enc(dot(texture2D(tIn, uv).rgb, LW)); }
