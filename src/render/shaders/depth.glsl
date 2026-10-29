void main() {
  vec4 c = texture2D(tIn, vUv);
  vec4 g = texture2D(tGeo, vUv);
  float m = maskAt(vUv);
  float t = clamp((g.r - u_near) / max(u_far - u_near, .001), 0., 1.);
  t = pow(t, u_gamma);
  t = clamp((t - .5) * u_contrast + .5, 0., 1.);
  if (u_invert > .5) t = 1. - t;
  vec3 d = mix(u_nearC, u_farC, t);
  if (g.g < .5) d = u_bg;
  gl_FragColor = vec4(mix(c.rgb, d, m * op), 1.);
}
