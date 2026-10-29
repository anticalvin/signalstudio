uniform float id, hasMap;
uniform sampler2D map;
varying vec3 vN;
varying float vD;
varying vec2 vU;
// R = view depth, G = object id, BA = view-space normal xy
void main() {
  if (hasMap > .5 && texture2D(map, vU).a < .5) discard;
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  gl_FragColor = vec4(vD, id, n.x, n.y);
}
