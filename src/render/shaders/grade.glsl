void main() {
  vec3 c = texture2D(tIn, vUv).rgb;
  vec3 o = c * exp2(u_exposure);
  o = (o - .18) * u_contrast + .18;
  float l = dot(o, LW);
  o = mix(vec3(l), o, u_saturation);
  o *= 1. - u_vignette * smoothstep(.35, 1., length(vUv - .5) * 1.414);
  gl_FragColor = vec4(mix(c, max(o, 0.), op), 1.);
}
