varying vec3 vN;
varying float vD;
varying vec2 vU;
void main() {
  vec4 v = modelViewMatrix * vec4(position, 1.);
  vD = -v.z;
  vN = normalMatrix * normal;
  vU = uv;
  gl_Position = projectionMatrix * v;
}
