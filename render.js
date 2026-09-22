/* ============================================================================
   render.js — capa de dibujo con PixiJS (v8)
   game.js arma las formas (POLY, EDGE, LINE, RECT, CIRC, ELL) y acá se pintan
   con WebGL en un solo Graphics por capa. El mundo usa las mismas coordenadas
   que antes: el contenedor se escala con zoom y se corre con camX/camY, igual
   que el setTransform del canvas 2D.
   Orden de capas (de atrás hacia adelante): escena → velo nocturno → luces/hover.
   ========================================================================== */
(function(){
  if(typeof PIXI==='undefined'){window.CiudadRender={ready:false,frame(){},resize(){}};return;}

  const app=new PIXI.Application();
  const gScene=new PIXI.Graphics();   // suelo, lotes, autos, edificios, fuego, vista previa
  const gTint=new PIXI.Graphics();    // velo de noche, en píxeles de pantalla
  const gNight=new PIXI.Graphics();   // ventanas encendidas, central y faros
  const worldScene=new PIXI.Container(), worldNight=new PIXI.Container();
  worldScene.addChild(gScene); worldNight.addChild(gNight);
  app.stage.addChild(worldScene,gTint,worldNight);

  let ready=false;
  let pintadas=0;                     // formas del último cuadro (para revisar el rendimiento)
  const buf=[];                       // formas de una celda, reusado para no asignar de más

  // Color: se parsea una vez por cadena y queda en caché (las formas repiten colores)
  const CACHE=new Map();
  function style(css){
    let c=CACHE.get(css);
    if(!c){const col=new PIXI.Color(css);CACHE.set(css,c={color:col.toNumber(),alpha:col.alpha});}
    return c;
  }
  const fillOf=(g,css)=>{const c=style(css);g.fill({color:c.color,alpha:c.alpha});};
  const strokeOf=(g,css,w)=>{const c=style(css);g.stroke({color:c.color,alpha:c.alpha,width:w});};

  // Tramo a rayas: PixiJS no tiene setLineDash, así que cada guion es un subtrazo
  function dash(g,s){
    const ax=s.a[0],ay=s.a[1],bx=s.b[0],by=s.b[1];
    const L=Math.hypot(bx-ax,by-ay);
    if(L<0.5)return;
    const ux=(bx-ax)/L,uy=(by-ay)/L,ciclo=s.on+s.gap;
    for(let d=0;d<L;d+=ciclo){
      const e=Math.min(L,d+s.on);
      g.moveTo(ax+ux*d,ay+uy*d);g.lineTo(ax+ux*e,ay+uy*e);
    }
    strokeOf(g,s.s,s.w);
  }
  function paint(g,s){
    const off=s.off;
    switch(s.t){
      case 'poly':{
        const p=s.p;
        for(let i=0;i<p.length;i++){
          const x=p[i][0]+(off?off[0]:0), y=p[i][1]+(off?off[1]:0);
          if(i)g.lineTo(x,y);else g.moveTo(x,y);
        }
        g.closePath();fillOf(g,s.f);break;
      }
      case 'edge':{
        const p=s.p;
        for(let i=0;i<p.length;i++){
          if(i)g.lineTo(p[i][0],p[i][1]);else g.moveTo(p[i][0],p[i][1]);
        }
        g.closePath();strokeOf(g,s.s,s.w);break;
      }
      case 'line':{
        const p=s.p;
        for(let i=0;i<p.length;i++){
          if(i)g.lineTo(p[i][0],p[i][1]);else g.moveTo(p[i][0],p[i][1]);
        }
        strokeOf(g,s.s,s.w);break;
      }
      case 'dash':dash(g,s);break;
      case 'rect':g.rect(s.x,s.y,s.w,s.h);fillOf(g,s.f);break;
      case 'circle':g.circle(s.x,s.y,s.r);fillOf(g,s.f);break;
      case 'ellipse':g.ellipse(s.x,s.y,s.rx,s.ry);fillOf(g,s.f);break;
    }
  }
  // Pinta en g lo que la función de formas agregue a buf
  function each(g,fn,a,b){
    buf.length=0;fn(buf,a,b);pintadas+=buf.length;
    for(let i=0;i<buf.length;i++)paint(g,buf[i]);
  }

  // Autos por celda: el vehículo de una celda va antes que su edificio
  const porCelda=new Map();
  function agruparAutos(){
    porCelda.clear();
    for(const c of cars){
      const k=c.y*N+c.x;
      let a=porCelda.get(k);
      if(!a)porCelda.set(k,a=[]);
      a.push(c);
    }
  }
  function buildScene(){
    const bb=visibleTiles();
    gScene.clear();
    for(let y=bb.y0;y<=bb.y1;y++)for(let x=bb.x0;x<=bb.x1;x++)each(gScene,groundShapes,x,y);
    if(view!=='none')                                          // vistas de datos: sobre el suelo
      for(let y=bb.y0;y<=bb.y1;y++)for(let x=bb.x0;x<=bb.x1;x++)each(gScene,overlayShapes,x,y);
    agruparAutos();
    for(let y=bb.y0;y<=bb.y1;y++)for(let x=bb.x0;x<=bb.x1;x++){
      const fila=porCelda.get(y*N+x);
      if(fila)each(gScene,carShapes,fila);
      each(gScene,tileShapes,x,y);
    }
    for(let y=bb.y0;y<=bb.y1;y++)for(let x=bb.x0;x<=bb.x1;x++)each(gScene,fxShapes,x,y);
    if(hover&&inB(hover[0],hover[1])&&!painting)each(gScene,hoverShapes,hover[0],hover[1]);
  }
  function buildNight(night){
    gNight.clear();
    if(!night)return;
    const bb=visibleTiles();
    for(let y=bb.y0;y<=bb.y1;y++)for(let x=bb.x0;x<=bb.x1;x++)each(gNight,nightShapes,x,y);
    each(gNight,headlightShapes);
  }

  function frame(){
    if(!ready)return;
    pintadas=0;
    worldScene.scale.set(zoom);  worldScene.position.set(camX,camY);
    worldNight.scale.set(zoom);  worldNight.position.set(camX,camY);
    buildScene();
    const night=isNight();
    gTint.clear();
    if(night){gTint.rect(0,0,VW,VH);gTint.fill({color:0x080c28,alpha:0.5});}
    buildNight(night);
    app.renderer.render(app.stage);
  }

  app.init({
    canvas:cv, width:VW, height:VH,
    background:'#16231a',                  // lo que se ve fuera del mapa
    antialias:false, autoDensity:true, autoStart:false, preference:'webgl',
    resolution:Math.min(2,window.devicePixelRatio||1)
  }).then(()=>{
    ready=true;
    log('PixiJS '+PIXI.VERSION+' dibujando la ciudad.','ok');
  }).catch(e=>{
    log('No se pudo iniciar PixiJS ('+e.message+'); se juega sin dibujo.','bad');
  });

  window.CiudadRender={
    get ready(){return ready;},
    resize(w,h){ if(ready)app.renderer.resize(w,h); },
    frame,
    // para revisar desde afuera que el dibujo lo está haciendo PixiJS de verdad
    get info(){
      return {version:PIXI.VERSION, render:ready?String(app.renderer.constructor.name):null,
              ancho:VW, alto:VH, formas:pintadas, noche:isNight()};
    }
  };
})();
