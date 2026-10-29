void main() {
  vec2 px = 1. / res;
  vec4 c = texture2D(tIn, vUv);
  vec4 g = texture2D(tGeo, vUv);
  float m = cover(vUv);
  vec3 base = c.rgb;
  if (u_bgMode > .5 && g.g < .5) base = u_bg;
  float dn = clamp((g.r - 3.) / 12., 0., 1.);
  vec3 fill = mix(u_fill, u_bg, u_depthTint * dn);
  vec3 col = mix(base, fill, m);
  float ring = 0.;
  if (u_outline > .5) {
    float w = u_outlineW * k;
    for (int i = 0; i < 8; i++) { float a = float(i) * .7854; ring = max(ring, cover(vUv + vec2(cos(a), sin(a)) * px * w)); }
    ring *= (1. - cover(vUv));
  }
  col = mix(col, u_outlineC, ring);
  gl_FragColor = vec4(mix(c.rgb, col, op), 1.);
}
