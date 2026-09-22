'use strict';
/* ============================== Constantes ============================== */
const N=54,T=30;
// Proyección isométrica 2:1: la celda es un rombo de 2*HW por 2*HH píxeles
const HW=T, HH=T/2;
const WORLD={w:2*N*HW,h:2*N*HH,minX:-N*HW,minY:-HH};   // caja del mapa en píxeles de mundo
const tileCenter=(x,y)=>[(x-y)*HW,(x+y)*HH];            // centro del rombo de la celda (x,y)
const gridPoint=(fx,fy)=>[(fx-fy)*HW,(fx+fy-1)*HH];     // punto continuo (centro de celda = x+0.5)
const worldDir=(dx,dy)=>[(dx-dy)*HW,(dx+dy)*HH];        // un paso de la grilla, en píxeles
const EMPTY=0,ROAD=1;
const RES_LOW=2,RES_MED=3,RES_HIGH=4;
const COM_LOW=5,COM_MED=6,COM_HIGH=7;
const IND_LOW=8,IND_MED=9,IND_HIGH=10;
const PARK=11,POWER=12,WATER=13,FIRE_STATION=14,POLICE_STATION=15,SCHOOL=16,HOSPITAL=17;
const RUBBLE=18; // solo lo crean los incendios

const isRes=id=>id>=RES_LOW&&id<=RES_HIGH;
const isCom=id=>id>=COM_LOW&&id<=COM_HIGH;
const isInd=id=>id>=IND_LOW&&id<=IND_HIGH;
const isZone=id=>isRes(id)||isCom(id)||isInd(id);

// Datos por tipo de zona: poblacion, empleos, base imponible, consumo de energia/agua, contaminacion
const ZD={
  [RES_LOW] :{pop:6,jobs:0,tax:2, pw:1, wt:1, poll:0,label:'Baja Res.'},
  [RES_MED] :{pop:20,jobs:0,tax:4, pw:2, wt:2, poll:0,label:'Media Res.'},
  [RES_HIGH]:{pop:40,jobs:0,tax:8, pw:4, wt:4, poll:0,label:'Alta Res.'},
  [COM_LOW] :{pop:0,jobs:4,tax:3, pw:2, wt:0.5,poll:2,label:'Baja Com.'},
  [COM_MED] :{pop:0,jobs:10,tax:6, pw:4, wt:1, poll:3,label:'Media Com.'},
  [COM_HIGH]:{pop:0,jobs:22,tax:12,pw:8, wt:2, poll:5,label:'Alta Com.'},
  [IND_LOW] :{pop:0,jobs:6,tax:4, pw:3, wt:2, poll:25,label:'Baja Ind.'},
  [IND_MED] :{pop:0,jobs:16,tax:8, pw:6, wt:4, poll:40,label:'Media Ind.'},
  [IND_HIGH]:{pop:0,jobs:30,tax:16,pw:12,wt:8, poll:58,label:'Alta Ind.'}
};

const TILES=[
  {id:EMPTY,name:'Demolir',cost:0,key:'0',group:'Terreno'},
  {id:ROAD,name:'Calle',cost:10,key:'1',group:'Vías'},
  {id:RES_LOW,name:'Baja Res.',cost:30,key:'2',group:'Residencial'},
  {id:RES_MED,name:'Media Res.',cost:60,key:'3',group:'Residencial'},
  {id:RES_HIGH,name:'Alta Res.',cost:120,key:'4',group:'Residencial'},
  {id:COM_LOW,name:'Baja Com.',cost:80,key:'5',group:'Comercial'},
  {id:COM_MED,name:'Media Com.',cost:160,key:'6',group:'Comercial'},
  {id:COM_HIGH,name:'Alta Com.',cost:320,key:'7',group:'Comercial'},
  {id:IND_LOW,name:'Baja Ind.',cost:200,key:'8',group:'Industrial'},
  {id:IND_MED,name:'Media Ind.',cost:400,key:'9',group:'Industrial'},
  {id:IND_HIGH,name:'Alta Ind.',cost:800,key:'q',group:'Industrial'},
  {id:PARK,name:'Parque',cost:150,key:'w',group:'Verde'},
  {id:POWER,name:'Central',cost:300,key:'e',group:'Utilidades'},
  {id:WATER,name:'Planta de agua',cost:200,key:'r',group:'Utilidades'},
  {id:FIRE_STATION,name:'Bomberos',cost:200,key:'t',group:'Servicios'},
  {id:POLICE_STATION,name:'Comisaría',cost:200,key:'y',group:'Servicios'},
  {id:SCHOOL,name:'Escuela',cost:180,key:'u',group:'Servicios'},
  {id:HOSPITAL,name:'Hospital',cost:250,key:'i',group:'Servicios'}
];

const VIEWS=[
  {id:'none',name:'Normal'},
  {id:'land',name:'Valor del suelo'},
  {id:'pollution',name:'Contaminación'},
  {id:'density',name:'Desarrollo'},
  {id:'traffic',name:'Tránsito'},
  {id:'power',name:'Energía'},
  {id:'water',name:'Agua'},
  {id:'fire',name:'Bomberos'},
  {id:'police',name:'Policía'},
  {id:'school',name:'Educación'},
  {id:'hospital',name:'Salud'}
];

// Costos de mantenimiento por hora
const UPKEEP={[ROAD]:0.02,[POWER]:1.2,[WATER]:0.8,[FIRE_STATION]:6,[POLICE_STATION]:5,[SCHOOL]:4,[HOSPITAL]:5,[PARK]:1};
const TAX_K=13;             // escala global de recaudación
const POWER_SUPPLY=60, WATER_SUPPLY=100;
const MAX_STAGE=6;

/* ============================== Estado ============================== */
const DIRS4=[[1,0],[-1,0],[0,1],[0,-1]];
const cv=document.getElementById('c');
let VW=960,VH=600;           // el lienzo en píxeles CSS: lo maneja render.js (PixiJS)
const ZMIN=0.4, ZMAX=3;      // zoom: en el mínimo entra el mapa entero

let g=[],res=[],burn=[],landValue=[],pollutionGrid=[],growthTarget=[],growthAccess=[],
    waterCoverage=[],powerCoverage=[],fireCoverage=[],policeCoverage=[],schoolCoverage=[],hospitalCoverage=[],
    money=3000,hour=7,nextFire=90,pollutionPeak=0,camX=0,camY=0,zoom=1,drag=null,panBtn=null,
    taxRate={res:7,com:10,ind:7},
    ordinances={cleanair:false,reading:false,health:false},
    demand={res:0,com:0,ind:0},
    stats={pop:0,jobs:0,workers:0,unemp:0,crime:80,edu:0,health:0,fire:0,happy:50,dev:0,built:0,traffic:0},
    util={powerSupply:0,powerDemand:0,powerRatio:1,waterSupply:0,waterDemand:0,waterRatio:1},
    budget={subsidy:0,res:0,com:0,ind:0,income:0,expenses:0,net:0,lines:{}},
    logs=[],undoStack=[],lastAutosave=0,
    tool=1,view='none',speed=1,hover=null,lastPaint=null,painting=false,dirty=true;

const AUTOSAVE_KEY='ciudadjs_auto', SAVE_KEY='ciudadjs';

const makeGrid=v=>Array.from({length:N},()=>new Array(N).fill(v));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const inB=(x,y)=>x>=0&&x<N&&y>=0&&y<N;
const nb4=(x,y,t)=>DIRS4.some(d=>inB(x+d[0],y+d[1])&&g[y+d[1]][x+d[0]]===t);
const countOf=t=>{let c=0;for(let y=0;y<N;y++)for(let x=0;x<N;x++)if(g[y][x]===t)c++;return c;};
const tileName=id=>{if(id===EMPTY)return 'Terreno vacío';const f=TILES.find(t=>t.id===id);return f?f.name:(id===RUBBLE?'Escombros':'Vacío');};

/* ============================== Inicialización ============================== */
function init(){
  g=makeGrid(EMPTY); res=makeGrid(0); burn=makeGrid(0);
  landValue=makeGrid(45); pollutionGrid=makeGrid(0);
  growthTarget=makeGrid(0); growthAccess=makeGrid(0);
  waterCoverage=makeGrid(false); powerCoverage=makeGrid(false);
  fireCoverage=makeGrid(0); policeCoverage=makeGrid(0); schoolCoverage=makeGrid(0); hospitalCoverage=makeGrid(0);
  cars=[];
  money=3000; hour=7; nextFire=90; undoStack=[]; logs=[];
  taxRate={res:7,com:10,ind:7};
  ordinances={cleanair:false,reading:false,health:false};
  syncTaxInputs();

  // Trazado inicial: avenidas por la fila y la columna del medio (el centro va con el tamaño)
  const C=Math.floor(N/2);
  for(let i=0;i<N;i++){g[C][i]=ROAD;g[i][C]=ROAD;}
  // Central y planta de agua pegadas a las avenidas
  g[C+1][C+1]=POWER; g[C+1][C-1]=WATER;
  // Zonas iniciales, todas con acceso a calle y a las dos redes
  g[C-1][C-1]=RES_LOW; g[C-1][C-2]=RES_LOW; g[C-1][C-3]=RES_LOW;   // al norte de la avenida
  g[C+1][C-3]=RES_LOW; g[C+1][C-2]=RES_LOW;                        // al sur
  g[C-1][C+1]=COM_LOW; g[C-1][C+2]=COM_LOW;                        // comercio sobre la avenida
  g[C+2][C+1]=IND_LOW; g[C+3][C+1]=IND_LOW; g[C+4][C+1]=IND_LOW;   // industria junto a la columna
  g[C+1][C+2]=PARK;

  updateCoverages();
  recalc();
  draw();
  updateHUD();
  updateSidebar();
  renderTools(); renderViews(); renderSpeed();
}

/* ============================== Coberturas, contaminación y valor del suelo ============================== */
function servicePositions(type){
  const a=[];
  for(let y=0;y<N;y++)for(let x=0;x<N;x++)if(g[y][x]===type)a.push([x,y]);
  return a;
}
function minDist(x,y,list){
  let best=Infinity;
  for(let i=0;i<list.length;i++){
    const dx=list[i][0]-x, dy=list[i][1]-y, d=Math.sqrt(dx*dx+dy*dy);
    if(d<best)best=d;
  }
  return best;
}
function floodFrom(type,out){
  const q=[];
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    if(g[y][x]===type){out[y][x]=true;q.push([x,y]);}
    else out[y][x]=false;
  }
  for(let i=0;i<q.length;i++){
    const x=q[i][0], y=q[i][1];
    for(let k=0;k<4;k++){
      const nx=x+DIRS4[k][0], ny=y+DIRS4[k][1];
      if(inB(nx,ny)&&g[ny][nx]!==EMPTY&&!out[ny][nx]){out[ny][nx]=true;q.push([nx,ny]);}
    }
  }
}

function updateCoverages(){
  // Redes: se propagan por las celdas construidas conectadas a la fuente
  floodFrom(WATER,waterCoverage);
  floodFrom(POWER,powerCoverage);

  // Servicios: cobertura por radio decreciente
  const fires=servicePositions(FIRE_STATION), polices=servicePositions(POLICE_STATION),
        schools=servicePositions(SCHOOL), hospitals=servicePositions(HOSPITAL),
        parks=servicePositions(PARK);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    let d=minDist(x,y,fires);    fireCoverage[y][x]    = d<=5.5?clamp(100*(1-(d-1)/5),0,100):0;
    d=minDist(x,y,polices);      policeCoverage[y][x]  = d<=5.5?clamp(100*(1-(d-1)/5),0,100):0;
    d=minDist(x,y,schools);      schoolCoverage[y][x]  = d<=6.5?clamp(100*(1-(d-1)/6),0,100):0;
    d=minDist(x,y,hospitals);    hospitalCoverage[y][x]= d<=6.5?clamp(100*(1-(d-1)/6),0,100):0;
  }

  // Contaminación por celda: industrias emiten, parques limpian
  for(let y=0;y<N;y++)for(let x=0;x<N;x++)pollutionGrid[y][x]=0;
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const id=g[y][x];
    if(isInd(id)&&res[y][x]>0.4){
      const base=ZD[id].poll*(0.45+0.55*res[y][x]/MAX_STAGE);
      for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
        const nx=x+dx, ny=y+dy;
        if(!inB(nx,ny))continue;
        const d=Math.sqrt(dx*dx+dy*dy);
        if(d<=4)pollutionGrid[ny][nx]+=base*(1-d/4.5);
      }
    }
  }
  const cleanMult=ordinances.cleanair?0.55:1;
  pollutionPeak=0;
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    pollutionGrid[y][x]=clamp(pollutionGrid[y][x]*cleanMult,0,100);
    if(g[y][x]!==EMPTY&&pollutionGrid[y][x]>pollutionPeak)pollutionPeak=pollutionGrid[y][x];
  }
  if(pollutionPeak<1)pollutionPeak=0;

  // Valor del suelo
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    let v=32;
    let d=minDist(x,y,parks);     if(d<=3.5)v+=20*(1-(d-1)/3);
    d=minDist(x,y,fires);         if(d<=5.5)v+=11*(1-(d-1)/5);
    d=minDist(x,y,polices);       if(d<=5.5)v+=11*(1-(d-1)/5);
    d=minDist(x,y,schools);       if(d<=6.5)v+=9*(1-(d-1)/6);
    d=minDist(x,y,hospitals);     if(d<=6.5)v+=8*(1-(d-1)/6);
    if(waterCoverage[y][x])v+=4;
    if(powerCoverage[y][x])v+=4;
    v-=pollutionGrid[y][x]*0.55;
    const dc=Math.sqrt((x-N/2)*(x-N/2)+(y-N/2)*(y-N/2));
    v+=Math.max(0,12-dc*0.7);
    if(ordinances.cleanair)v+=3;
    landValue[y][x]=clamp(Math.round(v),5,100);
  }
}

/* ============================== Estadísticas y economía ============================== */
function recalc(){
  util.powerSupply=countOf(POWER)*POWER_SUPPLY;
  util.waterSupply=countOf(WATER)*WATER_SUPPLY;

  let pwD=0,wtD=0,built=0,jobsRaw=0,popRaw=0,zoneTiles=0,stageSum=0;
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const id=g[y][x];
    if(id===EMPTY)continue;
    built++;
    if(isZone(id)){
      zoneTiles++;
      const st=res[y][x]/MAX_STAGE;
      stageSum+=st;
      const z=ZD[id];
      if(powerCoverage[y][x])pwD+=z.pw*st;
      if(waterCoverage[y][x])wtD+=z.wt*st;
    }
  }
  util.powerDemand=pwD; util.waterDemand=wtD;
  util.powerRatio=util.powerSupply>=pwD?1:clamp(util.powerSupply/Math.max(0.001,pwD),0,1);
  util.waterRatio=util.waterSupply>=wtD?1:clamp(util.waterSupply/Math.max(0.001,wtD),0,1);

  // Población y empleo (el desarrollo y los servicios pesan)
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const id=g[y][x];
    if(!isZone(id))continue;
    const st=res[y][x]/MAX_STAGE;
    const z=ZD[id], lv=0.5+landValue[y][x]/200; // 0.5 .. 1.0
    let utilF=1;
    if(powerCoverage[y][x])utilF*=0.55+0.45*util.powerRatio; else utilF*=0.3;
    if(waterCoverage[y][x])utilF*=0.6+0.4*util.waterRatio;   else utilF*=0.5;
    popRaw+=z.pop*st*lv*utilF;
    jobsRaw+=z.jobs*st*lv*utilF;
  }
  stats.pop=Math.floor(popRaw);
  stats.jobs=Math.floor(jobsRaw);
  stats.workers=Math.round(stats.pop*0.4);
  const unemployment=stats.workers>0?Math.max(0,(stats.workers-stats.jobs))/stats.workers:0;
  stats.unemp=Math.round(unemployment*100);
  stats.built=built;
  stats.zones=zoneTiles;
  stats.dev=zoneTiles?Math.round(stageSum/zoneTiles*100):0;

  // Niveles de servicios: cada dotación cubre ~60 celdas ZONIFICADAS (las calles no piden servicios,
  // si no un mapa más grande con la misma ciudad castigaría la cobertura)
  const need=Math.max(1,zoneTiles||built);
  const policeCap=Math.min(1,(countOf(POLICE_STATION)*60)/need);
  const popPressure=Math.min(1,stats.pop/250); // una ciudad chica casi no tiene delito
  stats.crime   =clamp(popPressure*(1-policeCap)*90,0,100);
  stats.edu     =clamp(100*Math.min(1,(countOf(SCHOOL)*60)/(need*0.4)),0,100);
  stats.health  =clamp(100*Math.min(1,(countOf(HOSPITAL)*60)/(need*0.5)),0,100);
  stats.fire    =clamp(100*Math.min(1,(countOf(FIRE_STATION)*60)/(need*0.35)),0,100);

  // Felicidad: las expectativas de servicios crecen con el tamaño de la ciudad
  const taxPenalty=Math.max(0,taxRate.res-8)*0.9+Math.max(0,taxRate.com-12)*0.7+Math.max(0,taxRate.ind-8)*0.9;
  const exp=Math.min(1,stats.pop/80);
  let h=55;
  h+=Math.min(20,countOf(PARK)*2.2);
  h+=(stats.edu-50)*0.08*exp+(stats.health-50)*0.08*exp+(stats.fire-50)*0.06*exp;
  h-=stats.crime*0.09;
  h-=pollutionPeak*0.15;
  h-=taxPenalty;
  h-=stats.unemp*0.12;
  h-=Math.max(0,stats.traffic-80)*0.08;   // el tráfico pesado también desgasta (hasta -1.6)
  if(money<0)h-=5;
  if(ordinances.cleanair)h+=4;
  if(ordinances.reading)h+=4;
  if(ordinances.health)h+=4;
  h+=Math.min(6,stats.pop*0.01);
  stats.happy=clamp(h,0,100);

  calculateDemand();
  economy();
}

function calculateDemand(){
  const indCap=zoneCapacity(isInd);
  // Ciudad chica: hay demanda base para que el pueblo crezca solo.
  // Al agrandarse la ciudad manda el equilibrio empleo/obreros (RCI clásico).
  const sprawl=clamp(1-stats.pop/120,0,1);
  const equilibrio=((stats.jobs*1.05)/Math.max(1,stats.workers)-1)*100;
  const dRes=equilibrio*(1-sprawl*0.85)+45*sprawl;
  // El comercio se mide en residentes atendidos; la industria, en puestos de trabajo
  const comNeed=stats.pop*0.45;
  const comCap=zoneCapacity(isCom)*1.2;
  const dCom=comNeed>0?((comNeed-comCap)/Math.max(1,comNeed))*130:45;
  const indNeed=stats.workers*0.6;
  const dInd=indNeed>0?((indNeed-indCap)/Math.max(1,indNeed))*130:45;
  const taxF=clamp(1-Math.max(0,Math.max(taxRate.res,taxRate.com,taxRate.ind)-10)*0.035,0.5,1);
  demand.res=Math.round(clamp(dRes*taxF,-100,100));
  demand.com=Math.round(clamp(dCom*taxF,-100,100));
  demand.ind=Math.round(clamp(dInd*taxF,-100,100));
}
function zoneCapacity(pred){
  let c=0;
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const id=g[y][x];
    if(pred(id))c+=ZD[id].jobs*res[y][x]/MAX_STAGE;
  }
  return c;
}

function economy(){
  const happyMult=0.35+0.65*stats.happy/100;
  let incRes=0,incCom=0,incInd=0;
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const id=g[y][x];
    if(!isZone(id))continue;
    const st=res[y][x]/MAX_STAGE;
    if(st<=0)continue;
    const z=ZD[id], lv=landValue[y][x]/100;
    let base=z.tax*st*lv;
    if(isCom(id))      base*=(powerCoverage[y][x]?1.25:0.6)*util.powerRatio;
    else if(isInd(id)) base*=(powerCoverage[y][x]?1.3:0.6)*util.powerRatio*(waterCoverage[y][x]?1.15:0.8);
    else               base*=(waterCoverage[y][x]?1.15:0.85);
    if(isInd(id))base*=0.6+0.4*Math.min(1,workersNear(x,y)/6);
    if(isRes(id)) base*=(taxRate.res/100)*TAX_K; else if(isCom(id)) base*=(taxRate.com/100)*TAX_K; else base*=(taxRate.ind/100)*TAX_K;
    if(isRes(id))incRes+=base; else if(isCom(id))incCom+=base; else incInd+=base;
  }
  // Ordenanzas que incentivan la economía
  if(ordinances.reading)incCom*=1+stats.edu/400;
  if(ordinances.health)incInd*=1+stats.health/400;
  const subsidy=clamp(stats.pop*0.06,1.5,15);
  budget.subsidy=subsidy; budget.res=incRes; budget.com=incCom; budget.ind=incInd;
  budget.lines={};
  for(const k of [ROAD,POWER,WATER,FIRE_STATION,POLICE_STATION,SCHOOL,HOSPITAL,PARK]){
    const n=countOf(k);
    if(n>0)budget.lines[(k===ROAD?'Mantenimiento de calles':tileName(k))]=n*UPKEEP[k];
  }
  if(ordinances.cleanair)budget.lines['Ordenanza: Aire Limpio']=15;
  if(ordinances.reading) budget.lines['Ordenanza: Pro-Lectura']=15;
  if(ordinances.health)  budget.lines['Ordenanza: Salud']=20;
  const exp=Object.values(budget.lines).reduce((a,b)=>a+b,0);
  budget.expenses=exp;
  const gross=(incRes+incCom+incInd+subsidy)*happyMult;
  budget.income=gross;
  budget.net=gross-exp;
  money+=budget.net;
}

/* ============================== Crecimiento e incendios ============================== */
function workersNear(x,y){
  let w=0;
  DIRS4.forEach(d=>{
    const nx=x+d[0], ny=y+d[1];
    if(inB(nx,ny)&&isRes(g[ny][nx])){
      const mult=g[ny][nx]===RES_HIGH?2:(g[ny][nx]===RES_MED?1.5:1);
      w+=res[ny][nx]*mult;
    }
  });
  return Math.min(15,w);
}

function grow(){
  const happyF=0.55+stats.happy/220;
  const utilF=Math.min(util.powerRatio,util.waterRatio);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const id=g[y][x];
    if(!isZone(id)){ if(id===EMPTY)res[y][x]=0; continue; }
    let access=false,demF=0.35,extra=1;
    if(isRes(id)){
      access=nb4(x,y,ROAD)&&waterCoverage[y][x];
      demF=clamp(0.4+demand.res/120,0,1.15);
    }else if(isCom(id)){
      access=nb4(x,y,ROAD)&&powerCoverage[y][x];
      demF=clamp(0.4+demand.com/120,0,1.15);
    }else{
      access=nb4(x,y,ROAD)&&powerCoverage[y][x]&&waterCoverage[y][x];
      demF=clamp(0.4+demand.ind/120,0,1.15)*clamp(0.45+workersNear(x,y)/6,0.45,1);
    }
    if(pollutionGrid[y][x]>40)extra*=clamp(1-(pollutionGrid[y][x]-40)/120,0.6,1);
    const lvF=0.62+landValue[y][x]/250;
    const target=access?MAX_STAGE*demF*lvF*happyF*utilF*extra:0;
    // Sin demanda el barrio deja de crecer, pero no se vacía: sin acceso a servicios sí se abandona
    const piso=access?MAX_STAGE*0.45*lvF*happyF*utilF*extra:0;
    const objetivo=Math.max(target,piso);
    growthTarget[y][x]=target; growthAccess[y][x]=access?1:0;
    const step=res[y][x]<objetivo?0.12:0.16;
    if(res[y][x]<objetivo)res[y][x]=Math.min(MAX_STAGE,res[y][x]+step);
    else if(res[y][x]>objetivo)res[y][x]=Math.max(0,res[y][x]-step);
  }
}

function randomBuilding(){
  const c=[];
  for(let y=0;y<N;y++)for(let x=0;x<N;x++)
    if(isZone(g[y][x])&&!burn[y][x]&&res[y][x]>1)c.push([x,y]);
  if(!c.length)return null;
  return c[Math.floor(Math.random()*c.length)];
}

function stepFires(){
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    if(burn[y][x]<=0)continue;
    burn[y][x]-=(1+fireCoverage[y][x]/100*1.6+stats.fire/100*0.9);
    if(burn[y][x]<=0){
      burn[y][x]=0;
      const cov=fireCoverage[y][x];
      if(isZone(g[y][x])){
        // Con cobertura de bomberos el edificio se daña y se recupera; sin cobertura se pierde
        if(cov<25){
          g[y][x]=RUBBLE; res[y][x]=0;
          log('El incendio destruyó '+nameCoord(x,y)+'. Quedaron escombros.','bad');
        }else{
          res[y][x]=Math.max(0,res[y][x]*(1-(0.4+(1-cov/100)*0.5)));
          log('El incendio dañó '+nameCoord(x,y)+'; los bomberos lograron salvarlo.','bad');
        }
      }
      continue;
    }
    // Propagación a un vecino si no hay protección
    if(fireCoverage[y][x]<45&&Math.random()<0.04){
      const d=DIRS4[Math.floor(Math.random()*4)];
      const nx=x+d[0], ny=y+d[1];
      if(inB(nx,ny)&&isZone(g[ny][nx])&&burn[ny][nx]<=0){burn[ny][nx]=5;log('El fuego se propagó a '+nameCoord(nx,ny)+'.','bad');}
    }
  }
}
const nameCoord=(x,y)=>'('+x+','+y+')';
function dayOf(){return Math.floor((hour-1)/24)+1;}
function isNight(){return hour%24>=21||hour%24<6;}

/* ============================== Tránsito ============================== */
// Las calles son de doble mano: cada vehículo circula por el carril de su derecha,
// así que en una misma calle se cruzan autos en los dos sentidos.
const CAR_CAP=110;
const LANE=0.17;      // carril: fracción de celda a cada lado del eje de la calle
const CAR_COLORS=['#eaeaea','#d94f4f','#4f7fd9','#f0c33c','#63c47a','#c8c8c8','#b06fd9','#e08b3c','#3fb5b5'];
let cars=[], carDensity=makeGrid(0);
const traffic={cars:0,peak:0,jam:0};

const roadAt=(x,y)=>inB(x,y)&&g[y][x]===ROAD;
// a la derecha del sentido de marcha (en pantalla la Y crece hacia abajo)
const laneOffset=(dx,dy)=>[-dy*LANE,dx*LANE];

function carTarget(){
  if(countOf(ROAD)<3)return 0;
  const n=stats.pop*0.22+stats.jobs*0.12;   // habitantes que salen a la calle + camiones de los puestos
  return Math.min(CAR_CAP,Math.round(n*(isNight()?0.45:1)));
}

function roadTiles(){
  const a=[];
  for(let y=0;y<N;y++)for(let x=0;x<N;x++)if(g[y][x]===ROAD)a.push([x,y]);
  return a;
}

// Próximo tramo: prefiere seguir derecho y esquiva la celda más cargada
function chooseNext(x,y,dx,dy){
  const cand=[];
  for(const d of DIRS4){
    const nx=x+d[0],ny=y+d[1];
    if(!roadAt(nx,ny))continue;
    if(d[0]===-dx&&d[1]===-dy)continue;   // no se da vuelta salvo que no haya otra salida
    cand.push({nx,ny,w:(d[0]===dx&&d[1]===dy?1.6:1)/(1+carDensity[ny][nx]*2.5)});
  }
  if(!cand.length){
    const bx=x-dx,by=y-dy;
    return roadAt(bx,by)?[bx,by]:null;    // callejón sin salida: da la vuelta (doble mano)
  }
  let total=0; for(const c of cand)total+=c.w;
  let r=Math.random()*total;
  for(const c of cand){ r-=c.w; if(r<=0)return [c.nx,c.ny]; }
  return [cand[cand.length-1].nx,cand[cand.length-1].ny];
}

function spawnCar(){
  const calles=roadTiles();
  if(!calles.length)return null;
  // los viajes nacen en calles pegadas a lo construido, no en el descampado
  const junto=calles.filter(([x,y])=>DIRS4.some(d=>{const nx=x+d[0],ny=y+d[1];return inB(nx,ny)&&g[ny][nx]!==EMPTY&&g[ny][nx]!==ROAD;}));
  const pool=junto.length?junto:calles;
  for(let intento=0;intento<6;intento++){
    const [x,y]=pool[Math.floor(Math.random()*pool.length)];
    const opts=DIRS4.filter(d=>roadAt(x+d[0],y+d[1]));
    if(!opts.length)continue;
    const [dx,dy]=opts[Math.floor(Math.random()*opts.length)];
    return {x,y,nx:x+dx,ny:y+dy,p:0,
      spd:1.5+Math.random()*1.1,
      color:CAR_COLORS[Math.floor(Math.random()*CAR_COLORS.length)],
      camion:stats.jobs>0&&Math.random()<0.22,
      life:180+Math.floor(Math.random()*420)};
  }
  return null;
}

// Avanza el tránsito. dtMs son milisegundos de juego (0 = pausa, los autos se quedan quietos)
function stepTraffic(dtMs){
  carDensity=makeGrid(0);
  for(const c of cars)carDensity[c.y][c.x]++;

  const target=carTarget();
  if(cars.length<target){
    const n=Math.max(1,Math.ceil((target-cars.length)*0.08));
    for(let i=0;i<n;i++){ const c=spawnCar(); if(!c)break; cars.push(c); }
  }else while(cars.length>target)cars.pop();

  const dt=clamp(dtMs,0,200);
  for(let i=cars.length-1;i>=0;i--){
    const c=cars[i];
    if(!roadAt(c.x,c.y)||!roadAt(c.nx,c.ny)){cars.splice(i,1);continue;}   // le sacaron la calle
    const carga=carDensity[c.y][c.x]+carDensity[c.ny][c.nx];
    c.p+=c.spd*(1-Math.min(0.8,Math.max(0,carga-2)*0.2))*dt/1000;         // el tráfico lento embotella
    if(c.p>=1){
      const dx=c.nx-c.x,dy=c.ny-c.y;      // sentido de marcha actual
      c.x=c.nx;c.y=c.ny;c.p=0;
      const nxt=chooseNext(c.x,c.y,dx,dy);
      if(!nxt){cars.splice(i,1);continue;}
      c.nx=nxt[0];c.ny=nxt[1];
      if(--c.life<=0){cars.splice(i,1);continue;}   // llegó a destino y se va
    }
  }

  let roads=0,load=0,peak=0;
  for(let y=0;y<N;y++)for(let x=0;x<N;x++)if(g[y][x]===ROAD){
    const n=carDensity[y][x]; roads++; load+=n; if(n>peak)peak=n;
  }
  traffic.cars=cars.length; traffic.peak=peak;
  traffic.jam=roads?clamp(Math.round(load/roads/3*100+Math.max(0,peak-2)*8),0,100):0;
  stats.traffic=traffic.jam;
}

/* ============================== Un tick ============================== */
function tick(){
  hour++;
  nextFire--;
  if(nextFire<=0){
    nextFire=200+Math.floor(Math.random()*280);
    // Un pueblo de cuatro casas no se incendia: los incendios llegan con la ciudad
    if(stats.zones>=14){
      const b=randomBuilding();
      if(b){
        const chance=1-fireCoverage[b[1]][b[0]]/100;
        if(Math.random()<chance*0.5){
          burn[b[1]][b[0]]=5;
          log('¡Incendio! en '+nameCoord(b[0],b[1])+' (día '+dayOf()+')','bad');
        }
      }
    }
  }
  stepFires();
  updateCoverages();
  recalc();
  grow(); // el desarrollo de las zonas va después de conocer la demanda del tick

  if(money<0&&hour%12===0)log('Déficit: no podés construir con la caja en rojo.','bad');
  if(hour%24===0){
    if(stats.pop>=100&&stats.pop<110)log('¡La ciudad superó los 100 habitantes!','ok');
    if(stats.pop>=500&&stats.pop<510)log('¡500 habitantes! Empezá a pensar en alta densidad.','ok');
    if(stats.pop>=1000&&stats.pop<1010)log('¡Ciudad mediana: 1000 habitantes!','ok');
  }
  if(hour-lastAutosave>=60){lastAutosave=hour;saveGame(AUTOSAVE_KEY,true);}

  dirty=true;
  updateHUD();
  updateSidebar();
}

/* ============================== Construcción ============================== */
// ¿La celda vacía (x,y) queda conectada a la red al construir? Se sirve desde un vecino ya cubierto
const anyNb4Cov=(x,y,cov)=>DIRS4.some(d=>inB(x+d[0],y+d[1])&&cov[y+d[1]][x+d[0]]);

function canPlace(id,x,y){
  if(!inB(x,y))return false;
  if(id===EMPTY)return g[y][x]!==EMPTY;
  if(g[y][x]!==EMPTY)return false;
  if(isRes(id))return nb4(x,y,ROAD)&&anyNb4Cov(x,y,waterCoverage);
  if(isCom(id))return nb4(x,y,ROAD)&&anyNb4Cov(x,y,powerCoverage);
  if(isInd(id))return nb4(x,y,ROAD)&&anyNb4Cov(x,y,powerCoverage)&&anyNb4Cov(x,y,waterCoverage);
  if(id===PARK)return true;
  return nb4(x,y,ROAD); // centrales, planta de agua y servicios públicos
}

function applyTool(x,y,silent){
  const t=TILES[tool];
  if(!inB(x,y))return false;
  if(t.id===EMPTY){
    if(g[y][x]===EMPTY)return false;
    undoStack.push({x,y,tile:g[y][x],stage:res[y][x],burn:burn[y][x],cost:0});
    g[y][x]=EMPTY; res[y][x]=0; burn[y][x]=0;
  }else{
    if(!canPlace(t.id,x,y)){ if(!silent)log('No se puede construir '+t.name+' ahí.', 'info'); return false; }
    if(money<t.cost){ if(!silent)log('Fondos insuficientes para '+t.name+' ('+t.cost+'$).','bad'); return false; }
    undoStack.push({x,y,tile:EMPTY,stage:0,burn:0,cost:t.cost});
    g[y][x]=t.id; res[y][x]=0; money-=t.cost;
  }
  if(undoStack.length>300)undoStack.shift();
  updateCoverages(); recalc();
  dirty=true; updateHUD(); updateSidebar();
  return true;
}

function undo(){
  const a=undoStack.pop();
  if(!a){log('Nada para deshacer.','info');return;}
  g[a.y][a.x]=a.tile; res[a.y][a.x]=a.stage; burn[a.y][a.x]=a.burn;
  money+=a.cost;
  updateCoverages(); recalc();
  dirty=true; updateHUD(); updateSidebar();
  log('Deshecho: '+nameCoord(a.x,a.y),'info');
}

/* ============================== Dibujo ============================== */
/* ============================== Dibujo isométrico ============================== */
// Proyección 2:1: la celda (x,y) es un rombo de 2*HW x 2*HH píxeles.
// Se dibuja de atrás hacia adelante: filas y de arriba abajo y, dentro de cada fila,
// x de izquierda a derecha. Así cada construcción tapa lo que tiene detrás (x+y menor)
// y nunca lo que tiene adelante.
const shade=(hex,f)=>{
  const n=parseInt(hex.slice(1),16);
  let r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  if(f>=0){r+=(255-r)*f;g+=(255-g)*f;b+=(255-b)*f;}else{r*=1+f;g*=1+f;b*=1+f;}
  return 'rgb('+Math.round(r)+','+Math.round(g)+','+Math.round(b)+')';
};
const hash2=(x,y)=>{let h=Math.imul(x*374761393+y*668265263+1013904223,2246822519);h^=h>>>13;h=Math.imul(h,3266489917);return ((h^(h>>>16))>>>0)/4294967296;};

/* El dibujo lo hace render.js con PixiJS: acá sólo se arman las formas.
   Cada forma es un objeto plano: {t:tipo, ...} y render.js la pinta en un Graphics.
   poly=relleno, edge=contorno cerrado, line=polilínea, dash=tramo a rayas, rect/circle/ellipse. */
const POLY=(p,f)=>({t:'poly',p:p,f:f});
const EDGE=(p,s,w)=>({t:'edge',p:p,s:s,w:w||1});
const LINE=(p,s,w)=>({t:'line',p:p,s:s,w:w||1});
const DASH=(a,b,s,w,on,gap)=>({t:'dash',a:a,b:b,s:s,w:w||1,on:on||5,gap:gap||6});
const RECT=(x,y,w,h,f)=>({t:'rect',x:x,y:y,w:w,h:h,f:f});
const CIRC=(x,y,r,f)=>({t:'circle',x:x,y:y,r:r,f:f});
const ELL=(x,y,rx,ry,f)=>({t:'ellipse',x:x,y:y,rx:rx,ry:ry,f:f});
const rombo=(cx,cy,hw,hh)=>[[cx,cy-hh],[cx+hw,cy],[cx,cy+hh],[cx-hw,cy]];   // celda (x,y) en isométrico

// Caja isométrica: base en el rombo de la celda, altura h hacia arriba (las dos caras
// que miran al jugador y el techo; la cara sudoeste queda algo más iluminada que la sudeste).
function prismShapes(out,cx,cy,hw,hh,h,col){
  if(h>0.6){
    out.push(POLY([[cx-hw,cy],[cx,cy+hh],[cx,cy+hh-h],[cx-hw,cy-h]],shade(col,-0.08)));
    out.push(POLY([[cx,cy+hh],[cx+hw,cy],[cx+hw,cy-h],[cx,cy+hh-h]],shade(col,-0.34)));
    out.push(POLY(rombo(cx,cy-h,hw,hh),shade(col,0.24)));
  }
  // línea de contacto: marca dónde apoya la construcción sin derramarse sobre los vecinos
  out.push(LINE([[cx-hw,cy],[cx,cy+hh],[cx+hw,cy]],'rgba(0,0,0,0.26)',1));
}
// Pisos: líneas horizontales sobre las dos caras visibles
function floorShapes(out,cx,cy,hw,hh,h,rows){
  if(h<5||rows<2)return;
  for(let i=1;i<rows;i++){
    const y=h*i/rows;
    out.push(LINE([[cx-hw,cy-y],[cx,cy+hh-y]],'rgba(0,0,0,0.2)',1));
    out.push(LINE([[cx,cy+hh-y],[cx+hw,cy-y]],'rgba(0,0,0,0.2)',1));
  }
}
// Ventanas: tres por fila en cada cara visible. De noche se encienden (algunas apagadas)
function windowShapes(out,cx,cy,hw,hh,h,rows,lit){
  if(h<6)return;
  const seed=hash2(Math.round(cx),Math.round(cy));
  const w=Math.max(1.6,hw*0.15), col=lit?'rgba(255,233,150,0.9)':'rgba(18,22,28,0.4)';
  for(let r=0;r<rows;r++){
    const yb=h*(r+0.78)/rows, yt=h*(r+0.46)/rows;
    for(let i=0;i<3;i++){
      const t=0.22+i*0.28;
      if(lit&&((r*3+i+Math.floor(seed*5))%3===0))continue;
      out.push(RECT(cx-hw+hw*t-w/2,cy+hh*t-yb,w,yb-yt,col));   // cara sudoeste
      out.push(RECT(cx+hw*t-w/2,cy+hh-hh*t-yb,w,yb-yt,col));   // cara sudeste
    }
  }
}

// Alturas (px) y colores por uso del suelo; la etapa de desarrollo escala la altura
const BASEH={[RES_LOW]:11,[RES_MED]:20,[RES_HIGH]:32,
             [COM_LOW]:13,[COM_MED]:24,[COM_HIGH]:40,
             [IND_LOW]:11,[IND_MED]:17,[IND_HIGH]:25,
             [POWER]:16,[WATER]:14,[FIRE_STATION]:17,[POLICE_STATION]:16,[SCHOOL]:14,[HOSPITAL]:23};
const ZCOLOR={[RES_LOW]:'#c9a06a',[RES_MED]:'#b8854a',[RES_HIGH]:'#9c6a3c',
              [COM_LOW]:'#9fb4c4',[COM_MED]:'#7c9cb0',[COM_HIGH]:'#5c7f96',
              [IND_LOW]:'#8a8a94',[IND_MED]:'#75757f',[IND_HIGH]:'#61616b'};
const zoneHeight=(x,y,id,stage)=>BASEH[id]*(0.45+0.55*stage)*(0.9+0.2*hash2(x,y));

// Suelo: pasto, asfalto o lote zonificado (queda a la vista si la construcción es baja)
function groundShapes(out,x,y){
  const [cx,cy]=tileCenter(x,y),id=g[y][x];
  if(id===ROAD){
    out.push(POLY(rombo(cx,cy,HW,HH),'#575757'));
    roadAxisShapes(out,x,y);
    return;
  }
  if(isZone(id)){
    out.push(POLY(rombo(cx,cy,HW,HH),res[y][x]>0?'#3f3520':'#4b4131'));
    out.push(EDGE(rombo(cx,cy,HW,HH),isRes(id)?'rgba(120,200,130,0.4)':(isCom(id)?'rgba(120,180,240,0.4)':'rgba(232,200,110,0.35)'),1));
    return;
  }
  if(id===PARK){out.push(POLY(rombo(cx,cy,HW,HH),'#3d6b3d'));return;}
  out.push(POLY(rombo(cx,cy,HW,HH),(x+y)%2?'#2f4a2f':'#2c452c'));
}

// Doble mano: la línea de eje va del centro al borde por donde la calle sigue,
// así una recta se lee como dos carriles y un cruce como intersección.
function roadAxisShapes(out,x,y){
  const [cx,cy]=tileCenter(x,y);
  const e=roadAt(x+1,y),w=roadAt(x-1,y),no=roadAt(x,y-1),so=roadAt(x,y+1);
  const mitad=(dx,dy)=>{const [vx,vy]=worldDir(dx,dy);return [cx+vx/2,cy+vy/2];};
  if(e||w)out.push(DASH(w?mitad(-1,0):[cx,cy],e?mitad(1,0):[cx,cy],'#c9c9c9',1.3,5,6));
  if(no||so)out.push(DASH(no?mitad(0,-1):[cx,cy],so?mitad(0,1):[cx,cy],'#c9c9c9',1.3,5,6));
  if(!e&&!w&&!no&&!so)out.push(LINE([[cx-HW*0.25,cy],[cx+HW*0.25,cy]],'#bdbdbd',1.3));
}

// Color de la vista de datos de cada celda (null = no se pinta)
function overlayFor(x,y){
  const id=g[y][x];
  switch(view){
    case 'land':{
      const t=(landValue[y][x]-5)/95;
      return 'hsla('+Math.round(t*130)+',70%,45%,0.55)';
    }
    case 'pollution':{
      const p=pollutionGrid[y][x]; if(p<1)return null;
      return 'hsla('+Math.round(120*(1-p/100))+',85%,50%,'+(0.25+0.55*p/100)+')';
    }
    case 'density':{
      if(!isZone(id))return null;
      const t=res[y][x]/MAX_STAGE;
      return isRes(id)?'hsla('+Math.round(60+120*t)+',80%,52%,0.5)':
             isCom(id)?'hsla('+Math.round(200+60*t)+',80%,55%,0.5)':
                       'hsla('+Math.round(20+40*t)+',85%,50%,0.5)';
    }
    case 'traffic':{
      if(id!==ROAD)return null;
      const n=carDensity[y][x];
      if(!n)return 'rgba(70,90,70,0.22)';
      const t=Math.min(1,n/4);
      return 'hsla('+Math.round(120-120*t)+',85%,50%,0.55)';
    }
    case 'power':   return powerCoverage[y][x]?(id===EMPTY?null:'rgba(232,199,76,0.35)'):(id===EMPTY?null:'rgba(230,60,60,0.35)');
    case 'water':   return waterCoverage[y][x]?(id===EMPTY?null:'rgba(74,144,226,0.35)'):(id===EMPTY?null:'rgba(230,60,60,0.35)');
    case 'fire':    return fireCoverage[y][x]>0?'hsla('+Math.round(fireCoverage[y][x]*1.2)+',80%,50%,0.45)':null;
    case 'police':  return policeCoverage[y][x]>0?'hsla('+Math.round(policeCoverage[y][x]*1.2)+',80%,50%,0.45)':null;
    case 'school':  return schoolCoverage[y][x]>0?'hsla('+Math.round(schoolCoverage[y][x]*1.2)+',80%,50%,0.45)':null;
    case 'hospital':return hospitalCoverage[y][x]>0?'hsla('+Math.round(hospitalCoverage[y][x]*1.2)+',80%,50%,0.45)':null;
  }
  return null;
}

// Vistas de datos: el rombo de la celda pintado con el color del mapa temático
function overlayShapes(out,x,y){
  const c=overlayFor(x,y);
  if(!c)return;
  const [cx,cy]=tileCenter(x,y);
  out.push(POLY(rombo(cx,cy,HW,HH),c));
}

// Construcciones: el orden de las capas lo resuelve render.js (fila por fila, atrás→adelante)
function tileShapes(out,x,y){
  const [cx,cy]=tileCenter(x,y),id=g[y][x];
  const stage=isZone(id)?res[y][x]/MAX_STAGE:0;

  if(isZone(id)&&stage>0){
    const h=zoneHeight(x,y,id,stage),col=ZCOLOR[id];
    out.push(POLY(rombo(cx,cy,HW,HH),'rgba(0,0,0,0.25)'));
    prismShapes(out,cx,cy,HW,HH,h,col);
    floorShapes(out,cx,cy,HW,HH,h,Math.max(2,Math.round(h/7)));
    windowShapes(out,cx,cy,HW,HH,h,Math.max(1,Math.round(h/9)),false);
    if(isCom(id)&&stage>0.75){                       // cartel luminoso en la azotea
      out.push(RECT(cx-7,cy-h-4,14,3,'rgba(255,236,170,0.85)'));
      out.push(RECT(cx-9,cy-h-1,18,2,shade(col,0.4)));
    }
    if(isInd(id)&&stage>0.3){                        // chimenea (el humo va en fxShapes)
      const ch=5+stage*9;
      prismShapes(out,cx+6,cy-h+2,HW*0.13,HH*0.22,ch,'#5a5a62');
    }
  }else if(id===PARK){
    const arboles=[[-13,4,6],[9,-5,7],[2,11,5],[-4,-9,4]];
    for(const [dx,dy,r] of arboles){
      const tx=cx+dx,ty=cy+dy;
      out.push(ELL(tx+3,ty+r*0.5,r*0.9,r*0.45,'rgba(0,0,0,0.22)'));
      out.push(RECT(tx-1,ty-r*0.3,2,r*0.7,'#5a3d22'));
      out.push(CIRC(tx,ty-r*0.7,r,'#3f8a3f'));
      out.push(CIRC(tx-r*0.25,ty-r*0.95,r*0.6,'#57a557'));
    }
  }else if(id===POWER){
    const h=BASEH[POWER];
    out.push(POLY(rombo(cx,cy,HW,HH),'rgba(0,0,0,0.25)'));
    prismShapes(out,cx,cy,HW,HH,h,'#e0c04a');
    floorShapes(out,cx,cy,HW,HH,h,3);
    out.push(LINE([[cx+4,cy-h-8],[cx-2,cy-h-1],[cx+3,cy-h-1],[cx-4,cy-h+7]],'#4a4020',2.2));  // rayo en la azotea
  }else if(id===WATER){
    const h=BASEH[WATER];
    out.push(POLY(rombo(cx,cy,HW,HH),'rgba(0,0,0,0.25)'));
    prismShapes(out,cx,cy,HW,HH,h,'#4a90e2');
    prismShapes(out,cx,cy-h+2,HW*0.5,HH*0.5,8,'#7fc0ff');                                    // tanque
  }else if(id===FIRE_STATION||id===POLICE_STATION||id===SCHOOL||id===HOSPITAL){
    const h=BASEH[id];
    const col=id===FIRE_STATION?'#c8342f':(id===POLICE_STATION?'#2f6fc8':(id===SCHOOL?'#b07a4a':'#a6a3a0'));
    out.push(POLY(rombo(cx,cy,HW,HH),'rgba(0,0,0,0.25)'));
    prismShapes(out,cx,cy,HW,HH,h,col);
    floorShapes(out,cx,cy,HW,HH,h,Math.max(2,Math.round(h/7)));
    if(id===FIRE_STATION){                                            // portón y banda blanca
      out.push(RECT(cx-6,cy-h-2,12,3,'rgba(255,255,255,0.9)'));
      out.push(POLY(rombo(cx,cy-h*0.32,HW*0.9,HH*0.9),'rgba(255,255,255,0.22)'));
    }else if(id===POLICE_STATION){
      out.push(POLY(rombo(cx,cy-h*0.34,HW*0.9,HH*0.9),'rgba(255,255,255,0.22)'));
      out.push(RECT(cx-2,cy-h-4,4,4,'#ffe36b'));
    }else if(id===SCHOOL){
      out.push(RECT(cx-8,cy-h-3,16,3,'rgba(255,255,255,0.75)'));
      out.push(RECT(cx+4,cy-h-1,HW*0.3,2,'#d8d8d8'));
    }else{
      out.push(RECT(cx-2,cy-h-8,4,14,'#fff'));                        // cruz en la azotea
      out.push(RECT(cx-7,cy-h-3,14,4,'#fff'));
    }
  }else if(id===RUBBLE){
    out.push(POLY(rombo(cx,cy,HW,HH),'#3a3a3a'));
    for(const [dx,dy,h] of [[-8,3,5],[7,-2,7],[2,8,3]]){
      prismShapes(out,cx+dx,cy+dy,HW*0.3,HH*0.35,h,hash2(x+dx,y+dy)>0.5?'#6d6d6d':'#5a5a5a');
    }
  }

  if(isZone(id)&&res[y][x]>0){                     // barra de desarrollo, sobre el borde del lote
    const w=HW*0.62,bx=cx-w/2,by=cy+HH-3;
    out.push(RECT(bx,by,w,3,'rgba(0,0,0,0.45)'));
    out.push(RECT(bx,by,w*stage,3,stage>0.66?'rgba(120,230,140,0.9)':(stage>0.33?'rgba(232,199,76,0.9)':'rgba(255,150,90,0.9)')));
  }
}

// Lo que se mueve solo (humo, ola del tanque, fuego): render.js lo rearma cada cuadro
function fxShapes(out,x,y){
  const [cx,cy]=tileCenter(x,y),id=g[y][x];
  const stage=isZone(id)?res[y][x]/MAX_STAGE:0;

  if(isInd(id)&&stage>0.3){                                  // humo de la chimenea
    const h=zoneHeight(x,y,id,stage),ch=5+stage*9,t=Date.now()*0.001;
    for(let i=0;i<3;i++){
      const p=((t*0.3+i/3)%1);
      out.push(CIRC(cx+6+Math.sin(p*6)*3,cy-h-ch-3-p*20,3+p*4,'rgba(205,205,205,0.5)'));
    }
  }
  if(id===WATER){                                            // ola sobre el tanque
    const h=BASEH[WATER],w=Date.now()*0.001,p=[];
    for(let i=0;i<=6;i++)p.push([cx-HW*0.45+HW*0.9*i/6,cy-h-6+Math.sin(w*1.6+i*0.7)*2]);
    out.push(LINE(p,'#2a5a8a',1.6));
  }
  if(burn[y][x]>0){                                          // incendio
    const sw=0.5+0.15*Math.sin(Date.now()/60+y*13+x*7);
    const by=cy-(stage>0?zoneHeight(x,y,id,stage):6);
    out.push(CIRC(cx,by-4,16,'rgba(255,120,40,0.28)'));
    out.push(POLY([[cx,by-24],[cx+9*sw,by+2],[cx-9*sw,by+2]],'#ff5a1f'));
    out.push(CIRC(cx,by-1,5,'rgba(255,200,80,0.9)'));
  }
}

// Vehículos: la carrocería se proyecta como paralelogramo (isométrico real), no rotada
function carShapes(out,list){
  for(const c of list){
    const dx=c.nx-c.x,dy=c.ny-c.y,[ox,oy]=laneOffset(dx,dy);
    const fx=c.x+0.5+dx*c.p+ox, fy=c.y+0.5+dy*c.p+oy;
    const L=c.camion?0.31:0.22, W=c.camion?0.15:0.13;      // semi largo y semi ancho, en celdas
    const corner=(a,b)=>gridPoint(fx+dx*L*a-dy*W*b, fy+dy*L*a+dx*W*b);
    const quad=(a0,a1,b0,b1)=>[corner(a0,b0),corner(a1,b0),corner(a1,b1),corner(a0,b1)];
    const sombra=POLY(quad(-1,1,-1,1),'rgba(0,0,0,0.28)');
    sombra.off=[2,2];                                      // render.js la corre 2px como el translate de antes
    out.push(sombra);
    out.push(POLY(quad(-1,1,-1,1),c.color));               // carrocería
    if(c.camion)out.push(POLY(quad(-0.95,-0.35,-0.95,0.95),'rgba(0,0,0,0.22)'));   // caja
    else out.push(POLY(quad(0.35,0.95,-0.85,0.85),'rgba(255,255,255,0.45)'));      // parabrisas
  }
}

// Celdas que caen dentro de la ventana: evita recorrer el mapa entero cuando hay zoom
function visibleTiles(){
  const inv=(sx,sy)=>{
    const wx=(sx-camX)/zoom, wy=(sy-camY)/zoom;
    return [(wx/HW+wy/HH+1)/2,(wy/HH+1-wx/HW)/2];
  };
  const c=[inv(0,0),inv(VW,0),inv(0,VH),inv(VW,VH)];
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  for(const [x,y] of c){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  return {x0:Math.max(0,Math.floor(x0)-2),x1:Math.min(N-1,Math.ceil(x1)+2),
          y0:Math.max(0,Math.floor(y0)-2),y1:Math.min(N-1,Math.ceil(y1)+2)};
}

// Vista previa de la herramienta sobre la celda que señala el mouse
function hoverShapes(out,x,y){
  const t=TILES[tool];
  const ok=t.id===EMPTY?g[y][x]!==EMPTY:(canPlace(t.id,x,y)&&money>=t.cost);
  const [cx,cy]=tileCenter(x,y);
  out.push(POLY(rombo(cx,cy,HW,HH),ok?'rgba(134,255,134,0.22)':'rgba(255,134,134,0.22)'));
  out.push(EDGE(rombo(cx,cy-1,HW-1,HH-1),ok?'#86ff86':'#ff8686',2));
}

// De noche se encienden las ventanas de los lotes desarrollados y las centrales
function nightShapes(out,x,y){
  const id=g[y][x],[cx,cy]=tileCenter(x,y);
  if(isZone(id)&&res[y][x]>1){
    const h=zoneHeight(x,y,id,res[y][x]/MAX_STAGE);
    windowShapes(out,cx,cy,HW,HH,h,Math.max(1,Math.round(h/9)),true);
  }
  if(id===POWER)out.push(CIRC(cx,cy-BASEH[POWER]-4,HW*0.16,'rgba(255,214,90,0.85)'));
}

// Faros: de noche los autos se delatan por la luz que llevan adelante
function headlightShapes(out){
  for(const c of cars){
    const dx=c.nx-c.x,dy=c.ny-c.y,[ox,oy]=laneOffset(dx,dy);
    const [px,py]=gridPoint(c.x+0.5+dx*c.p+ox,c.y+0.5+dy*c.p+oy);
    const [vx,vy]=worldDir(dx,dy);
    out.push(CIRC(px+vx*0.15,py+vy*0.15,T*0.07,'rgba(255,240,170,0.9)'));
  }
}

// El dibujo lo hace render.js (PixiJS); sin él (por ejemplo en las pruebas) no se pinta nada
function draw(){
  if(window.CiudadRender&&CiudadRender.ready)CiudadRender.frame();
}

/* ============================== Interfaz ============================== */
function updateHUD(){
  const moneyEl=document.getElementById('hm');
  moneyEl.innerHTML='<b>'+Math.floor(money)+'$</b>';
  moneyEl.className=money<0?'bad':'';
  document.getElementById('hp').innerHTML='<b>'+stats.pop+'</b>';
  const hh=((hour%24)+24)%24;
  document.getElementById('hd').innerHTML='<b>Día '+dayOf()+'</b> · '+(hh<10?'0':'')+hh+':00'+(speed===0?' · pausa':'');
  const incEl=document.getElementById('hinc');
  incEl.innerHTML='<b>'+(budget.net>=0?'+':'')+budget.net.toFixed(1)+'$/h</b>';
  incEl.className=budget.net<0?'bad':'ok';
  const hap=document.getElementById('hhap');
  hap.innerHTML='<b>'+Math.round(stats.happy)+'%</b>';
  hap.className=stats.happy<40?'bad':(stats.happy>70?'ok':'');
  const pol=document.getElementById('hpoll');
  pol.innerHTML='<b>'+Math.round(pollutionPeak)+'%</b>';
  pol.className=pollutionPeak>40?'bad':(pollutionPeak<15?'ok':'');
  const u=document.getElementById('hutil');
  const pr=util.powerRatio, wr=util.waterRatio;
  u.className=(pr<0.95||wr<0.95)?'bad':'ok';
  u.innerHTML='<b>'+Math.round(util.powerDemand)+'/'+util.powerSupply+'</b> · <b>'+Math.round(util.waterDemand)+'/'+util.waterSupply+'</b>';
}

function updateSidebar(){
  const setBar=(id,val)=>{
    const f=document.getElementById('demand-'+id);
    f.style.width=((val+100)/2)+'%';
    f.style.background=val>0?'#4caf50':'#f44336';
    document.getElementById('demand-'+id+'-label').textContent=Math.abs(val)+'%';
    document.getElementById('demand-'+id+'-text').textContent=val>15?'Alta':(val>0?'Leve':(val>-15?'Neutra':'Saturada'));
  };
  setBar('res',demand.res); setBar('com',demand.com); setBar('ind',demand.ind);

  document.getElementById('b-sub').textContent=budget.subsidy.toFixed(1)+'$';
  document.getElementById('b-res').textContent=budget.res.toFixed(1)+'$';
  document.getElementById('b-com').textContent=budget.com.toFixed(1)+'$';
  document.getElementById('b-ind').textContent=budget.ind.toFixed(1)+'$';
  document.getElementById('b-exp').textContent='-'+budget.expenses.toFixed(1)+'$';
  const net=document.getElementById('b-net');
  net.textContent=(budget.net>=0?'+':'')+budget.net.toFixed(1)+'$';

  document.getElementById('s-crime').textContent=Math.round(100-stats.crime)+'% segura';
  document.getElementById('s-edu').textContent=Math.round(stats.edu)+'%';
  document.getElementById('s-health').textContent=Math.round(stats.health)+'%';
  document.getElementById('s-fire').textContent=Math.round(stats.fire)+'%';
  document.getElementById('s-pop').textContent=stats.pop;
  document.getElementById('s-jobs').textContent=stats.jobs;
  document.getElementById('s-unemp').textContent=stats.unemp+'%';
  document.getElementById('s-dev').textContent=stats.dev+'%';
  const tr=document.getElementById('s-traffic');
  tr.textContent=Math.round(stats.traffic)+'% · '+cars.length+' veh';
  tr.className=stats.traffic>80?'bad':'';

  document.getElementById('tax-res-v').textContent=taxRate.res;
  document.getElementById('tax-com-v').textContent=taxRate.com;
  document.getElementById('tax-ind-v').textContent=taxRate.ind;

  document.getElementById('ord-cleanair').classList.toggle('active',ordinances.cleanair);
  document.getElementById('ord-reading').classList.toggle('active',ordinances.reading);
  document.getElementById('ord-health').classList.toggle('active',ordinances.health);

  // Herramientas sin fondos o inválidas
  [...document.getElementById('tools').querySelectorAll('button')].forEach(b=>{
    const t=TILES[+b.dataset.i];
    b.classList.toggle('active',+b.dataset.i===tool);
    b.disabled=!!t&&t.cost>money;
  });
}

function motivoDeCrecimiento(x,y){
  const id=g[y][x];
  if(!isZone(id))return '';
  if(!powerCoverage[y][x])return ' · sin energía';
  if(!waterCoverage[y][x]&&!isCom(id))return ' · sin agua';
  if(!nb4(x,y,ROAD))return ' · sin calle';
  if(burn[y][x]>0)return ' · ¡en llamas!';
  const objetivo=growthTarget[y][x];
  if(objetivo<=0.001)return ' · sin demanda';
  if(pollutionGrid[y][x]>40)return ' · contaminación alta';
  if(res[y][x]>=objetivo-0.01)return ' · al máximo por ahora';
  return ' · en obras';
}
function updateHoverInfo(){
  const el=document.getElementById('hoverinfo');
  if(!hover||!inB(hover[0],hover[1])){el.textContent='—';return;}
  const [x,y]=hover, id=g[y][x];
  const pct=isZone(id)?Math.round(res[y][x]/MAX_STAGE*100):0;
  const potencial=isZone(id)?Math.round(Math.max(res[y][x],growthTarget[y][x])/MAX_STAGE*100):0;
  el.textContent='('+x+','+y+') · '+tileName(id)
    +' · Valor '+landValue[y][x]
    +' · Cont. '+Math.round(pollutionGrid[y][x])
    +' · Energía '+(powerCoverage[y][x]?'sí':'no')
    +' · Agua '+(waterCoverage[y][x]?'sí':'no')
    +(isZone(id)?' · Desarrollo '+pct+'% (potencial '+potencial+'%)'+motivoDeCrecimiento(x,y):'')
    +(id===ROAD?' · Calle de doble mano · '+carDensity[y][x]+' vehículo'+(carDensity[y][x]===1?'':'s')+' · Congestión '+Math.round(stats.traffic)+'%':'');
}

function log(msg,kind){
  logs.push({msg,kind:kind||'info',day:dayOf()});
  if(logs.length>4)logs.shift();
  document.getElementById('log').innerHTML=logs.map(l=>'<span class="l-'+l.kind+'" title="día '+l.day+'">'+l.msg+'</span>').join('');
}

/* ============================== Íconos (SVG en línea) ============================== */
const I_SVG=p=>'<svg viewBox="0 0 24 24">'+p+'</svg>';
const S_BOLT='<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>';
const S_DROP='<path d="M12 3c3.2 4 6 7.4 6 10.5A6 6 0 0 1 6 13.5C6 10.4 8.8 7 12 3z"/>';
const S_FLAME='<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>';
const S_SHIELD='<path d="M12 3l7 2.6V12c0 4.6-3 7.8-7 9-4-1.2-7-4.4-7-9V5.6z"/>';
const S_BOOK='<path d="M3 9l9-4 9 4-9 4z"/><path d="M7 11.5V16c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4.5"/>';
const S_CROSS='<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M12 8.5v7M8.5 12h7"/>';
const ICON={
  tool:{
    [EMPTY]:I_SVG('<path d="M4 20l4-1 9-9-3-3-9 9-1 4z"/><path d="M14 7l3-3"/>'),
    [ROAD]:I_SVG('<path d="M7 21 9.5 3M17 21 14.5 3M12 6v2M12 11v2M12 16v2"/>'),
    [RES_LOW]:I_SVG('<path d="M5 11 12 5l7 6v9H5z"/><path d="M10 20v-5h4v5"/>'),
    [RES_MED]:I_SVG('<path d="M6 20V9h12v11z"/><path d="M6 9.5 12 5l6 4.5"/>'),
    [RES_HIGH]:I_SVG('<path d="M8 20V4h8v16z"/><path d="M8 9h8M8 14h8"/>'),
    [COM_LOW]:I_SVG('<path d="M4 9.5h16V20H4z"/><path d="M3.5 9.5 5 4h14l1.5 5.5"/>'),
    [COM_MED]:I_SVG('<path d="M4 9.5h16V20H4z"/><path d="M3.5 9.5 5 4h14l1.5 5.5M8 14h8"/>'),
    [COM_HIGH]:I_SVG('<path d="M6 20V5h12v15z"/><path d="M6 9.5h12M10 20v-4h4v4"/>'),
    [IND_LOW]:I_SVG('<path d="M4 20V11l5 3v-3l5 3V6h6v14z"/>'),
    [IND_MED]:I_SVG('<path d="M4 20V10l5 3v-3l5 3V5h6v15z"/><path d="M17 8V2.5"/>'),
    [IND_HIGH]:I_SVG('<path d="M3 20V11l4.5 3v-3l4.5 3V6h8v14z"/><path d="M15 9V3M18.5 9V3"/>'),
    [PARK]:I_SVG('<path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z"/><path d="M12 22v-3"/>'),
    [POWER]:I_SVG(S_BOLT),
    [WATER]:I_SVG(S_DROP),
    [FIRE_STATION]:I_SVG(S_FLAME),
    [POLICE_STATION]:I_SVG(S_SHIELD),
    [SCHOOL]:I_SVG(S_BOOK),
    [HOSPITAL]:I_SVG(S_CROSS)
  },
  view:{
    none:I_SVG('<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>'),
    land:I_SVG('<path d="M4 16l5-6 4 3 7-8M4 20h16"/>'),
    pollution:I_SVG('<path d="M4 8h9a3 3 0 1 0-3-3M4 13h13a3 3 0 1 1-3 3M4 18h6"/>'),
    density:I_SVG('<path d="M4 20V11h5v9M9 20V5h6v15M15 20v-7h5v7"/>'),
    traffic:I_SVG('<path d="M5 15V9.5A3.5 3.5 0 0 1 8.5 6h7A3.5 3.5 0 0 1 19 9.5V15"/><path d="M5 15h14v3H5z"/><circle cx="7.5" cy="20" r="1.4"/><circle cx="16.5" cy="20" r="1.4"/>'),
    power:I_SVG(S_BOLT),
    water:I_SVG(S_DROP),
    fire:I_SVG(S_FLAME),
    police:I_SVG(S_SHIELD),
    school:I_SVG(S_BOOK),
    hospital:I_SVG(S_CROSS)
  },
  speed:{
    0:I_SVG('<path d="M9 5v14M15 5v14"/>'),
    1:I_SVG('<path d="M8 5.5 18 12 8 18.5z"/>'),
    2:I_SVG('<path d="M6 5.5 13 12 6 18.5zM13 5.5 20 12 13 18.5z"/>'),
    3:I_SVG('<path d="M4 5.5 10 12 4 18.5zM10 5.5 16 12 10 18.5zM16 5.5 21.5 12 16 18.5z"/>')
  }
};

function renderTools(){
  const el=document.getElementById('tools');
  el.innerHTML='';
  let lastGroup=null;
  TILES.forEach((t,i)=>{
    if(lastGroup!==null&&t.group!==lastGroup){
      const s=document.createElement('span');
      s.className='sep';
      el.appendChild(s);
    }
    lastGroup=t.group;
    const b=document.createElement('button');
    b.dataset.i=i;
    b.title=(t.id===EMPTY?'Demoler (recupera escombros)':t.name+' — '+t.cost+'$')+' · tecla '+t.key.toUpperCase();
    b.innerHTML=(ICON.tool[t.id]||'')+(t.id===EMPTY?'':'<span>'+t.cost+'</span>');
    b.onclick=()=>{tool=i;syncTools();dirty=true;};
    el.appendChild(b);
  });
  syncTools();
}
function syncTools(){
  [...document.getElementById('tools').querySelectorAll('button')].forEach(b=>b.classList.toggle('active',+b.dataset.i===tool));
}
function renderViews(){
  const el=document.getElementById('views');
  el.innerHTML='';
  VIEWS.forEach(v=>{
    const b=document.createElement('button');
    b.title=v.name;
    b.innerHTML=ICON.view[v.id]||'';
    b.classList.toggle('active',v.id===view);
    b.onclick=()=>{view=v.id;renderViews();dirty=true;};
    el.appendChild(b);
  });
}
function renderSpeed(){
  const el=document.getElementById('speed');
  el.innerHTML='';
  [{v:0,n:'Pausa (Espacio)'},{v:1,n:'1x'},{v:2,n:'2x'},{v:3,n:'3x'}].forEach(s=>{
    const b=document.createElement('button');
    b.title=s.n;
    b.innerHTML=(ICON.speed[s.v]||'')+(s.v===0?'':'<span>'+s.n+'</span>');
    b.classList.toggle('active',speed===s.v);
    b.onclick=()=>{speed=s.v;renderSpeed();updateHUD();};
    el.appendChild(b);
  });
}
function syncTaxInputs(){
  document.getElementById('tax-res').value=taxRate.res;
  document.getElementById('tax-com').value=taxRate.com;
  document.getElementById('tax-ind').value=taxRate.ind;
  document.getElementById('tax-res-v').textContent=taxRate.res;
  document.getElementById('tax-com-v').textContent=taxRate.com;
  document.getElementById('tax-ind-v').textContent=taxRate.ind;
}
function updateTitle(){
  document.title='CiudadJS — '+(document.getElementById('name').value||'sin nombre');
}

/* ============================== Guardado ============================== */
function snapshot(){
  return {
    v:2,name:document.getElementById('name').value,
    g,res,burn,landValue,waterCoverage,powerCoverage,
    fireCoverage,policeCoverage,schoolCoverage,hospitalCoverage,
    money,hour,nextFire,pollutionPeak,taxRate,ordinances,view,speed,zoom,camX,camY
  };
}
function saveGame(key,silent){
  try{
    localStorage.setItem(key,JSON.stringify(snapshot()));
    if(!silent)log('Ciudad guardada.','ok');
  }catch(e){log('No se pudo guardar: '+e.message,'bad');}
}
function loadGame(key){
  let d=null;
  try{d=JSON.parse(localStorage.getItem(key)||'null');}catch(e){d=null;}
  if(!d||!d.g){if(!key.includes('auto'))log('No hay partida guardada.','info');return false;}
  if(d.g.length!==N){
    // Partida de un mapa de otro tamaño (guardado viejo): se coloca centrada en el nuevo.
    const off=Math.max(0,Math.floor((N-d.g.length)/2));
    const ng=makeGrid(EMPTY), nr=makeGrid(0), nb=makeGrid(0);
    for(let y=0;y<d.g.length;y++){
      const fila=d.g[y]||[];
      for(let x=0;x<fila.length;x++){
        if(!inB(x+off,y+off))continue;
        ng[y+off][x+off]=fila[x]||EMPTY;
        nr[y+off][x+off]=(d.res&&d.res[y]&&d.res[y][x])||0;
        nb[y+off][x+off]=(d.burn&&d.burn[y]&&d.burn[y][x])||0;
      }
    }
    d.g=ng; d.res=nr; d.burn=nb;
    d.camX=null; d.camY=null;      // la vista se recentra más abajo
  }
  g=d.g.map(r=>r.slice()); res=(d.res||makeGrid(0)).map(r=>r.slice());
  burn=(d.burn||makeGrid(0)).map(r=>r.slice());
  money=d.money!==undefined?d.money:3000;
  hour=d.hour||0; nextFire=d.nextFire||90;
  if(d.taxRate)taxRate=d.taxRate;
  if(d.ordinances)ordinances=d.ordinances;
  if(d.view)view=d.view;
  if(d.speed!==undefined)speed=d.speed;
  if(d.zoom)zoom=clamp(d.zoom,ZMIN,ZMAX);
  camX=d.camX||0; camY=d.camY||0;
  if(d.camX===null||d.camY===null)centrarCamara();   // partida migrada: apuntar a la ciudad
  document.getElementById('name').value=d.name||'';
  document.getElementById('name').value&&updateTitle();
  syncTaxInputs(); renderViews(); renderSpeed();
  undoStack=[]; cars=[]; carDensity=makeGrid(0);
  updateCoverages(); recalc(); fitCam();
  dirty=true; updateHUD(); updateSidebar(); renderTools();
  return true;
}
document.getElementById('save').onclick=()=>saveGame(SAVE_KEY,false);
document.getElementById('load').onclick=()=>{
  if(loadGame(SAVE_KEY))log('Ciudad cargada.','ok');
};
document.getElementById('reset').onclick=()=>{
  localStorage.removeItem(AUTOSAVE_KEY);
  init();
  resizeCanvas(true);
  log('Ciudad reiniciada.','info');
};

/* ============================== Controles ============================== */
cv.addEventListener('wheel',e=>{
  e.preventDefault();
  const r=cv.getBoundingClientRect();
  const mx=e.clientX-r.left, my=e.clientY-r.top;
  const wx=(mx-camX)/zoom, wy=(my-camY)/zoom;
  zoom=clamp(zoom*(e.deltaY<0?1.12:0.89),ZMIN,ZMAX);
  camX=mx-wx*zoom; camY=my-wy*zoom;
  fitCam(); dirty=true;
},{passive:false});

function centrarCamara(){       // el rombo del mapa, en el medio de la pantalla
  camX=VW/2;
  camY=VH/2-zoom*(N-1)*HH;
  fitCam();
}
function fitCam(){
  const loX=VW-zoom*(WORLD.minX+WORLD.w), hiX=-zoom*WORLD.minX;
  camX=loX>hiX?(loX+hiX)/2:clamp(camX,loX,hiX);
  const loY=VH-zoom*(WORLD.minY+WORLD.h), hiY=-zoom*WORLD.minY;
  camY=loY>hiY?(loY+hiY)/2:clamp(camY,loY,hiY);
}

/* ============================== Lienzo y encuadre ============================== */
let camReady=false;
// Cubrir: el rombo del mapa siempre tapa toda la ventana
const fitZoom=()=>clamp(Math.max(VW/WORLD.w,VH/WORLD.h),ZMIN,ZMAX);
function resizeCanvas(reset){
  const w=Math.max(320,window.innerWidth||960), h=Math.max(240,window.innerHeight||600);
  VW=w; VH=h;
  if(window.CiudadRender&&CiudadRender.ready)CiudadRender.resize(w,h);   // el lienzo lo maneja PixiJS
  else { cv.width=w; cv.height=h; cv.style.width=w+'px'; cv.style.height=h+'px'; }
  if(reset||!camReady){zoom=fitZoom();centrarCamara();camReady=true;}  // al abrir: cubre la ventana y apunta a la ciudad
  fitCam();
}
addEventListener('resize',()=>resizeCanvas(false));
// De píxeles de pantalla a celda: se deshace la cámara y la proyección 2:1
function screenToTile(e){
  const r=cv.getBoundingClientRect();
  const wx=(e.clientX-r.left-camX)/zoom, wy=(e.clientY-r.top-camY)/zoom;
  return [Math.floor((wx/HW+wy/HH+1)/2),Math.floor((wy/HH+1-wx/HW)/2)];
}

cv.addEventListener('mousedown',e=>{
  if(e.button===2||e.button===1){
    panBtn=e.button;
    drag={x:e.clientX,y:e.clientY,cx:camX,cy:camY};
    e.preventDefault();
    return;
  }
  if(e.button===0){
    painting=true; lastPaint=null;
    const [x,y]=screenToTile(e);
    if(applyTool(x,y,false))lastPaint=[x,y];
    dirty=true;
  }
});

addEventListener('mousemove',e=>{
  if(drag){
    camX=drag.cx+(e.clientX-drag.x);
    camY=drag.cy+(e.clientY-drag.y);
    fitCam();
  }
  hover=screenToTile(e);
  if(painting&&!drag){
    if(!lastPaint||lastPaint[0]!==hover[0]||lastPaint[1]!==hover[1]){
      if(applyTool(hover[0],hover[1],true))lastPaint=[hover[0],hover[1]];
    }
  }
  updateHoverInfo();
  dirty=true;
});

addEventListener('mouseup',()=>{drag=null;panBtn=null;painting=false;lastPaint=null;});
cv.addEventListener('contextmenu',e=>e.preventDefault());

addEventListener('keydown',e=>{
  const tag=(e.target.tagName||'').toLowerCase();
  if(tag==='input'||tag==='textarea')return;
  const k=e.key.toLowerCase();
  if((e.ctrlKey||e.metaKey)&&k==='z'){e.preventDefault();undo();return;}
  if((e.ctrlKey||e.metaKey)&&k==='s'){e.preventDefault();saveGame(SAVE_KEY,false);return;}
  if(k===' '){e.preventDefault();speed=speed===0?1:0;renderSpeed();updateHUD();return;}
  const idx=TILES.findIndex(t=>t.key===k);
  if(idx>=0){tool=idx;renderTools();dirty=true;return;}
  if(k==='v'||k==='n'){
    const i=VIEWS.findIndex(v=>v.id===view);
    view=VIEWS[(i+(k==='v'?1:VIEWS.length-1))%VIEWS.length].id;
    renderViews();dirty=true;
    return;
  }
  if(k==='h'){document.getElementById('helpbox').classList.toggle('hidden');}
});

document.getElementById('tax-res').addEventListener('input',e=>{taxRate.res=+e.target.value;syncTaxInputs();recalc();updateSidebar();updateHUD();dirty=true;});
document.getElementById('tax-com').addEventListener('input',e=>{taxRate.com=+e.target.value;syncTaxInputs();recalc();updateSidebar();updateHUD();dirty=true;});
document.getElementById('tax-ind').addEventListener('input',e=>{taxRate.ind=+e.target.value;syncTaxInputs();recalc();updateSidebar();updateHUD();dirty=true;});

document.getElementById('ord-cleanair').onclick=()=>{ordinances.cleanair=!ordinances.cleanair;updateCoverages();recalc();updateSidebar();updateHUD();dirty=true;};
document.getElementById('ord-reading').onclick=()=>{ordinances.reading=!ordinances.reading;recalc();updateSidebar();updateHUD();dirty=true;};
document.getElementById('ord-health').onclick=()=>{ordinances.health=!ordinances.health;recalc();updateSidebar();updateHUD();dirty=true;};

document.getElementById('togglePanel').onclick=()=>{
  document.getElementById('sidebar').classList.toggle('hidden');
};
document.getElementById('undo').onclick=()=>undo();
document.getElementById('help').onclick=()=>document.getElementById('helpbox').classList.toggle('hidden');

/* ============================== Bucle principal ============================== */
let lastTs=performance.now(), acc=0, frameAcc=0;
function loop(ts){
  const dt=Math.min(250,ts-lastTs); lastTs=ts;
  if(speed>0){
    acc+=dt;
    const stepMs=1000/speed;
    let guard=0;
    while(acc>=stepMs&&guard++<8){acc-=stepMs;tick();}
    stepTraffic(Math.min(dt,120)*speed);   // los vehículos circulan en tiempo real (y frenan en pausa)
  }
  frameAcc+=dt;
  if(frameAcc>=40){frameAcc=0;draw();}
  requestAnimationFrame(loop);
}

/* ============================== Arranque ============================== */
init();
updateTitle();
renderTools(); renderViews(); renderSpeed();
if(!loadGame(AUTOSAVE_KEY))log('Bienvenido: construí con clic o arrastrando sobre el mapa.','info');
else log('Partida autoguardada restaurada.','ok');
resizeCanvas(true);            // el lienzo ocupa toda la ventana y el mapa queda encuadrado
updateHUD(); updateSidebar(); updateHoverInfo();
requestAnimationFrame(loop);
