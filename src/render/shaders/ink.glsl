float b2(vec2 p) { p = mod(p, 2.); return mod(p.x * 2. + p.y * 3., 4.); }
float bayer(vec2 p) { p = mod(floor(p), 8.); return (16. * b2(p) + 4. * b2(floor(p / 2.)) + b2(floor(p / 4.))) / 63.; }
void main() {
  vec2 px = k / res;
  vec4 c = texture2D(tIn, vUv);
  vec4 g = texture2D(tGeo, vUv);
  float l = lumE(vUv);
  float s0 = lumE(vUv + vec2(px.x * 2., 0.)), s1 = lumE(vUv - vec2(px.x * 2., 0.));
  float s2 = lumE(vUv + vec2(0., px.y * 2.)), s3 = lumE(vUv - vec2(0., px.y * 2.));
  float bl = (s0 + s1 + s2 + s3) * .25;
  l = l * exp2(u_exposure);
  l += (l - bl) * u_detail * 1.5;
  float mn = min(min(s0, s1), min(s2, s3)), mx = max(max(s0, s1), max(s2, s3));
  l = u_spread > 0. ? mix(l, min(l, mn), u_spread) : mix(l, max(l, mx), -u_spread);
  l = (l - u_lo) / max(u_hi - u_lo, .01);
  l = (l - .5) * u_contrast + .5 + u_density;
  float a = lumE(vUv + vec2(-px.x, px.y)), b = lumE(vUv + vec2(0., px.y)), cc = lumE(vUv + px);
  float d = lumE(vUv + vec2(-px.x, 0.)), e = lumE(vUv + vec2(px.x, 0.)), f = lumE(vUv - px);
  float gg = lumE(vUv - vec2(0., px.y)), h = lumE(vUv + vec2(px.x, -px.y));
  float gx = (cc + 2. * e + h) - (a + 2. * d + f), gy = (a + 2. * b + cc) - (f + 2. * gg + h);
  float eL = clamp(length(vec2(gx, gy)) * 1.5, 0., 1.);
  float id0 = g.g, d0 = g.r, eG = 0.;
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(i == 0 ? px.x : (i == 1 ? -px.x : 0.), i == 2 ? px.y : (i == 3 ? -px.y : 0.));
    vec4 q = texture2D(tGeo, vUv + o);
    if (abs(q.g - id0) > .5) eG = 1.;
    else {
      if (abs(q.r - d0) / max(d0, .5) > .05) eG = max(eG, .8);
      if (length(q.ba - g.ba) > .4) eG = max(eG, .6 * u_detail);
    }
  }
  l -= u_edge * max(eL * (.4 + .6 * u_detail), eG);
  l += (h21(floor(gl_FragCoord.xy / max(u_grainScale * k, 1.)) + seed) - .5) * u_grain;
  if (h21(floor(gl_FragCoord.xy / max(u_ditherScale * k, 1.)) + seed * 3.1) < u_speck) l = -1.;
  vec2 dp = floor(gl_FragCoord.xy / max(u_ditherScale * k, 1.));
  float dv = .5;
  if (u_dither > .5 && u_dither < 1.5) dv = bayer(dp);
  else if (u_dither > 1.5) dv = texture2D(tBlue, (dp + .5) / 64.).r;
  float t = u_threshold + (dv - .5) * u_ditherAmt;
  float v = smoothstep(t - .015, t + .015, l);
  if (u_invert > .5) v = 1. - v;
  vec3 ink = mix(u_inkC, u_paperC, v);
  gl_FragColor = vec4(mix(c.rgb, ink, maskAt(vUv) * op), 1.);
}
