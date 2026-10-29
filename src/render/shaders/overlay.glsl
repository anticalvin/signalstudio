uniform sampler2D tIn, tOv;
varying vec2 vUv;
void main() {
  vec4 o = texture2D(tOv, vUv);
  vec3 c = texture2D(tIn, vUv).rgb;
  gl_FragColor = vec4(mix(c, pow(o.rgb, vec3(2.2)), o.a), 1.);
}
