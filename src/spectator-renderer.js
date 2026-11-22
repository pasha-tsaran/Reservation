import * as T from 'three';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';

// A seated viewer turns in place. Keep the arena's colour and depth until the
// view changes, so moving twelve players does not redraw thousands of seats.
export function spectatorRenderer(renderer,scene){
  if(!renderer.extensions.has('EXT_color_buffer_float'))return null;
  const target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthBuffer:true,
    depthTexture:new T.DepthTexture(1,1,T.UnsignedIntType)});
  const gl=renderer.getContext();
  const samples=gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA16F,gl.SAMPLES);
  target.samples=Math.max(0,...Array.from(samples).filter(n=>n<=4));
  const material=new T.ShaderMaterial({
    uniforms:{arenaColour:{value:target.texture},arenaDepth:{value:target.depthTexture}},
    depthTest:true,depthWrite:true,depthFunc:T.AlwaysDepth,blending:T.NoBlending,
    vertexShader:`varying vec2 vUv;
      void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader:`uniform sampler2D arenaColour,arenaDepth;
      varying vec2 vUv;
      void main(){
        gl_FragColor=texture2D(arenaColour,vUv);
        gl_FragDepth=texture2D(arenaDepth,vUv).x;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const quad=new FullScreenQuad(material),size=new T.Vector2();
  let cached=false;
  return {
    invalidate(){cached=false;},
    render(camera,changed){
      renderer.getDrawingBufferSize(size);
      if(size.x!==target.width||size.y!==target.height){target.setSize(size.x,size.y);cached=false;}
      const layers=camera.layers.mask;
      if(!cached||changed){
        camera.layers.set(0);renderer.setRenderTarget(target);renderer.render(scene,camera);
        renderer.setRenderTarget(null);cached=true;
      }
      const autoClear=renderer.autoClear;renderer.autoClear=false;
      quad.render(renderer);camera.layers.set(1);renderer.render(scene,camera);
      camera.layers.mask=layers;renderer.autoClear=autoClear;
    }
  };
}
