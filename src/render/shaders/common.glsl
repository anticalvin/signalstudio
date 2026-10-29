precision highp float;
uniform sampler2D tIn, tGeo, tBlue, tMask;
uniform vec2 res;
// k: output pixels per composition unit. All "composition pixel" parameters are multiplied by k.
uniform float k, op, mAll, seed;
varying vec2 vUv;
const vec3 LW = vec3(.2126, .7152, .0722);
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
// Selection mask: tMask is a 256x1 lookup indexed by object ID (0 = background).
float maskId(float id) { return texture2D(tMask, vec2((id + .5) / 256., .5)).r; }
float maskAt(vec2 uv) { if (mAll > .5) return 1.; return maskId(texture2D(tGeo, uv).g); }
float cover(vec2 uv) { return maskAt(uv) * step(.5, texture2D(tGeo, uv).g); }
float enc(float x) { return pow(max(x, 0.), 1. / 2.2); }
float lumE(vec2 uv) { return enc(dot(texture2D(tIn, uv).rgb, LW)); }
