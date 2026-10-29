uniform sampler2D t, tc;
uniform float op;
varying vec2 vUv;
// Final stage: linear -> sRGB. The only place output encoding happens.
void main() {
  vec3 c = clamp(mix(texture2D(tc, vUv).rgb, texture2D(t, vUv).rgb, op), 0., 1.);
  gl_FragColor = vec4(mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)), 1.);
}
