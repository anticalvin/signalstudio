// Monolithic analog display shader, ported unchanged from the prototype.
// M6 splits this into display / composite-video / source-media stages; known defects until then:
//  - vertical hold switches on with a step (step(.0001, u_vh)) instead of scaling continuously
//  - mask pitch is in output pixels, so it is not resolution independent
precision highp float;
uniform sampler2D tScene, tPrev;
uniform vec2 u_res;
uniform float u_time, u_seed, u_dt, u_hasPrev;
varying vec2 vUv;
const vec3 LW=vec3(.2126,.7152,.0722);
float h11(float p){p=fract(p*.1031);p*=p+33.33;p*=p+p;return fract(p);}
float h21(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
vec3 tap(vec2 uv,float r){vec2 d=vec2(r/u_res.x,0.);vec3 s=texture2D(tScene,uv).rgb*.4;
 s+=(texture2D(tScene,uv+d).rgb+texture2D(tScene,uv-d).rgb)*.2;s+=(texture2D(tScene,uv+2.*d).rgb+texture2D(tScene,uv-2.*d).rgb)*.1;return s;}
vec3 oh(float i){return vec3(step(abs(i),.5),step(abs(i-1.),.5),step(abs(i-2.),.5))*3.;}
vec3 maskf(){vec2 q=gl_FragCoord.xy/u_maskPitch;vec3 m=vec3(1.);
 if(u_maskType<.5)return m;
 if(u_maskType<1.5)return oh(mod(floor(q.x),3.));
 if(u_maskType<2.5){float row=floor(q.y/2.);float x=q.x+mod(row,2.)*1.5;vec2 f=vec2(fract(x),fract(q.y/2.))-.5;
  return oh(mod(floor(x),3.))*mix(.25,1.,smoothstep(.55,.25,length(f)));}
 float st=mod(floor(q.x/3.),2.);float gy=mod(q.y+st*2.,4.);return oh(mod(floor(q.x),3.))*(1.-.85*step(gy,1.));}
void main(){
 vec2 c=(vUv*2.-1.)/u_over;c*=1.+u_curv*vec2(c.y*c.y,c.x*c.x);
 vec2 q2=abs(c)-(1.-u_round);float sd=length(max(q2,0.))-u_round;float edge=1.-smoothstep(-.006,.006,sd);
 vec2 uv=c*.5+.5;float T=u_time;float fr=floor(T*60.);
 uv+=u_finst*.004*vec2(sin(T*7.1),cos(T*5.3))+vec2(0.,(h11(fr+u_seed)-.5)*u_jitV*.012);
 float y0=uv.y+u_vh*T*.35;float dist=abs(fract(y0+.5)-.5);uv.y=mix(uv.y,fract(y0),step(.0001,u_vh));
 float bar=mix(1.,smoothstep(0.,.035,dist),clamp(u_vh*5.,0.,1.));
 float line=floor(uv.y*u_srcLines);float hs=u_hh*u_hh;float seg=floor(line/(3.+18.*h11(floor(T*5.)+u_seed)));
 float dx=hs*.14*(h11(seg+floor(T*5.)*7.3+u_seed)-.5)+hs*.05*sin(line*.07+T*2.5);
 dx+=u_warp*.04*sin(uv.y*7.+T*1.1)+u_warp*.015*sin(line*.19+T);
 dx+=(h11(line*1.31+fr+u_seed*7.)-.5)*u_jitH*.012;
 float tp=fract(T*.17);dx+=u_tear*(1.-smoothstep(0.,.07,abs(uv.y-tp)))*(.1+.06*sin(line*.7));
 uv.x+=dx;
 float rL=(1.-u_bandw)*6.;float rC=rL+(1.-u_chroma)*10.;vec2 cv=vec2(u_convX,u_convY)/u_res;
 vec3 rgb=vec3(tap(uv+cv,rL).r,tap(uv,rL).g,tap(uv-cv,rL).b);
 vec3 cL=tap(uv,rL);vec3 cC=tap(uv+vec2(u_cdelay/u_res.x,0.),rC);
 vec3 col=rgb-(cL-vec3(dot(cL,LW)))+(cC-vec3(dot(cC,LW)));
 vec3 bl=vec3(0.);
 for(int i=0;i<8;i++){float a=float(i)*.7854;vec2 d=vec2(cos(a),sin(a))/u_res;
  bl+=max(texture2D(tScene,uv+d*14.).rgb-.75,0.)*.14+max(texture2D(tScene,uv+d*5.).rgb-.75,0.)*.11;}
 col+=u_bloom*bl*1.5;
 col+=(h21(floor(vUv*u_res)+vec2(fr,u_seed))-.5)*u_noise*.4;
 col+=u_interf*.1*sin(uv.x*220.+uv.y*6.)*sin(uv.y*40.+T*2.);
 col+=u_rollI*.2*smoothstep(.8,1.,sin(uv.y*8.+T*3.))*vec3(1.);
 float lum=dot(col,LW);float sg=mix(.12,.42,u_beamW)*(1.+.5*clamp(lum,0.,1.));
 float d=fract(uv.y*u_srcLines+u_phase)-.5;float beam=exp(-d*d/(2.*sg*sg));
 col*=mix(1.,beam,u_scan)*mix(1.,clamp(1./(sg*2.5066),1.,2.2),u_scan);
 if(u_interlace>.5){float fld=mod(fr,2.);col*=(mod(line,2.)==fld)?1.:.35;}
 col*=mix(vec3(1.),maskf(),u_maskStr);
 col*=u_bright*(1.+u_flick*.08*(sin(T*47.)*.5+sin(T*13.1)*.5));
 lum=dot(col,LW);col=mix(vec3(lum),col,u_sat);col=mix(col,vec3(lum)*vec3(.4,1.,.5),u_mono);
 col*=vec3(1.+u_temp*.1,1.,1.-u_temp*.1);
 col*=edge*bar*clamp(1.-u_fall*.35*dot(c,c),0.,1.);
 if(u_hasPrev>.5)col=mix(col,texture2D(tPrev,vUv).rgb,pow(u_persist,u_dt*60.)*step(.001,u_persist));
 gl_FragColor=vec4(max(col,0.),1.);}
