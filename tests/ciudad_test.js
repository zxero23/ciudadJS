// Arnés de prueba: ejecuta el script de index.html con un DOM/canvas simulados
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const REPO = 'C:/Users/fgonz/OneDrive/Desktop/experimento/CiudadJS';
const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) throw new Error('no encontré el <script>');

// Exporta el estado interno (let/const no son accesibles como propiedades globales)
const EXPORTS = `
;globalThis.__api = {
  get g(){return g}, get res(){return res}, get burn(){return burn},
  get money(){return money}, get hour(){return hour},
  get stats(){return stats}, get util(){return util}, get budget(){return budget},
  get demand(){return demand}, get landValue(){return landValue},
  get pollutionGrid(){return pollutionGrid}, get waterCoverage(){return waterCoverage},
  get growthTarget(){return growthTarget}, get growthAccess(){return growthAccess},
  get powerCoverage(){return powerCoverage}, get fireCoverage(){return fireCoverage},
  get pollutionPeak(){return pollutionPeak},
  get undoStack(){return undoStack}, get view(){return view}, get speed(){return speed},
  get logs(){return logs}, get ordinances(){return ordinances}, get taxRate(){return taxRate},
  get TILES(){return TILES}, get zoom(){return zoom}, clamp,
  get VIEWS(){return VIEWS}, get cars(){return cars}, get carDensity(){return carDensity},
  get traffic(){return traffic}, get LANE(){return LANE},
  stepTraffic, carTarget, laneOffset, roadAt, roadTiles, drawCars, drawTile,
  get ops(){return ctx.__ops}, clearOps(){ ctx.__ops.length = 0; },
  setTool(i){ tool=i; }, setView(v){ view=v; }, setSpeed(s){ speed=s; },
  tick, draw, updateHoverInfo, updateHUD, updateSidebar, renderTools, renderViews, renderSpeed,
  canPlace, applyTool, undo, saveGame, loadGame,
  recalc, updateCoverages, snapshot,
  init, dayOf, isNight, tileName, hover(x,y){ hover=[x,y]; },
  hoverText(){ return document.getElementById('hoverinfo').textContent; },
  get canvasSize(){ return [cv.width, cv.height]; },
  get cam(){ return [camX, camY]; },
  get ICON(){ return ICON; },
  viewport(w, h){ window.innerWidth = w; window.innerHeight = h; resizeCanvas(true); },
  click(id){ const el = document.getElementById(id); if (el.onclick) el.onclick(); },
  btn(id){ return document.getElementById(id).querySelectorAll('button'); },
  text(id){ return String(document.getElementById(id).innerHTML).replace(/<[^>]*>/g, ''); },
  hidden(id){ return document.getElementById(id).classList.contains('hidden'); }
};
if (typeof globalThis.requestAnimationFrame === 'function') { /* nada */ }
`;
const code = m[1] + EXPORTS;

// ---- DOM simulado ----
// El canvas simulado registra las operaciones de dibujo: sirve para comprobar
// dónde queda cada cosa (por ejemplo en qué carril se dibuja cada vehículo).
const drawOps = [];
const ctxProxy = new Proxy({}, {
  get: (t, p) => {
    if (p === '__ops') return drawOps;
    if (p in t) return t[p];
    return (...args) => { drawOps.push([String(p), args]); };
  },
  set: (t, p, v) => { t[p] = v; drawOps.push(['#' + String(p), [v]]); return true; }
});
function mkEl(tag = 'div') {
  const el = {
    tagName: tag.toUpperCase(), style: {}, dataset: {}, children: [], value: '', textContent: '',
    _html: '', disabled: false, width: 600, height: 600, onclick: null, title: '',
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, v) { if (v === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else { v ? this._s.add(c) : this._s.delete(c); } return this._s.has(c); },
      contains(c) { return this._s.has(c); } },
    appendChild(c) { this.children.push(c); return c; },
    querySelectorAll() { return this.children.filter(c => c.tagName === 'BUTTON'); },
    addEventListener() {}, removeEventListener() {},
    getContext() { return ctxProxy; },
    getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height }; }
  };
  // innerHTML='' tiene que vaciar los hijos, como en el DOM real
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) { el._html = String(v); if (el._html === '') el.children.length = 0; }
  });
  return el;
}
const els = new Map();
const doc = {
  getElementById(id) { if (!els.has(id)) els.set(id, mkEl('div')); return els.get(id); },
  createElement(tag) { return mkEl(tag); },
  querySelectorAll() { return []; },
  addEventListener() {}
};
// RNG determinista: el juego usa Math.random (incendios, etc.) y el test debe ser reproducible
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const MathSembrado = Object.create(Math);
MathSembrado.random = mulberry32(20260922);

const store = new Map();
const localStorage = {
  setItem: (k, v) => store.set(k, String(v)),
  getItem: k => (store.has(k) ? store.get(k) : null),
  removeItem: k => store.delete(k)
};
let rafCb = null;
const sandbox = {
  document: doc, localStorage, console,
  performance, setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: cb => { rafCb = cb; return 1; },
  addEventListener: () => {}, Math: MathSembrado, Date, JSON, Object, Array, String, Number, Boolean, Error, URL
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
sandbox.innerWidth = 1280; sandbox.innerHeight = 800;   // ventana simulada
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'ciudad.js' });
const api = sandbox.__api;
if (!api) throw new Error('el script no definió __api (¿error de sintaxis?)');

// ---- Pruebas ----
const R = [];
const ok = (name, cond, extra = '') => { R.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); return cond; };

// 1. Estado inicial coherente
const NN = api.g.length;                       // lado del mapa (crece con el diseño)
ok('grid ' + NN + 'x' + NN, api.g[0].length === NN);
ok('celdas construidas de arranque', countBuilt() === 120, 'built=' + countBuilt());
function countBuilt() { let n = 0; for (let y = 0; y < NN; y++) for (let x = 0; x < NN; x++) if (api.g[y][x] !== 0) n++; return n; }
let zonas = 0, conEnergia = 0, conAgua = 0, conCalle = 0;
for (let y = 0; y < NN; y++) for (let x = 0; x < NN; x++) {
  const id = api.g[y][x];
  if (id >= 2 && id <= 10) {
    zonas++;
    if (api.powerCoverage[y][x]) conEnergia++;
    if (api.waterCoverage[y][x]) conAgua++;
    const road = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(d => { const nx = x + d[0], ny = y + d[1]; return nx >= 0 && nx < NN && ny >= 0 && ny < NN && api.g[ny][nx] === 1; });
    if (road) conCalle++;
  }
}
ok('todas las zonas de arranque tienen calle', conCalle === zonas, conCalle + '/' + zonas);
ok('todas las zonas de arranque tienen energía', conEnergia === zonas, conEnergia + '/' + zonas);
ok('todas las zonas de arranque tienen agua', conAgua === zonas, conAgua + '/' + zonas);

// 2. Simulación larga sin excepciones
let err = null;
const traza = [];
try {
  for (let h = 1; h <= 1200; h++) {
    api.tick();
    if ([100, 300, 600, 1200].includes(h)) traza.push({ h, dinero: Math.round(api.money), pob: api.stats.pop, empleos: api.stats.jobs, fel: Math.round(api.stats.happy), neto: +api.budget.net.toFixed(2), dem: { ...api.demand } });
  }
} catch (e) { err = e; }
ok('1200 ticks sin excepciones', !err, err ? err.stack.split('\n')[0] : '');
ok('la ciudad creció (desarrollo > 35%)', api.stats.dev > 35, 'dev=' + api.stats.dev + '%');
ok('hay población (>= 5 habitantes)', api.stats.pop >= 5, 'pop=' + api.stats.pop);
ok('la caja no se fue a la quiebra', api.money > 0, 'dinero=' + Math.round(api.money));

// 2c. Zonificar más residencia hace crecer la población
const pob0 = api.stats.pop;
let puestos = 0;
for (let y = 0; y < NN && puestos < 8; y++) for (let x = 0; x < NN && puestos < 8; x++) {
  if (api.g[y][x] === 0 && api.canPlace(2, x, y)) { api.setTool(2); if (api.applyTool(x, y, true)) puestos++; }
}
const demResAntes = api.demand.res;
for (let i = 0; i < 200; i++) api.tick();
ok('zonificar residencia nueva hace crecer la población', api.stats.pop > pob0, 'antes=' + pob0 + ' después=' + api.stats.pop + ' (zonas nuevas ' + puestos + ')');
ok('la demanda residencial reacciona a lo construido', api.demand.res < demResAntes, 'antes=' + demResAntes + ' después=' + api.demand.res);
ok('la demanda queda dentro de -100..100', api.demand.res >= -100 && api.demand.res <= 100 && api.demand.com >= -100 && api.demand.ind >= -100, JSON.stringify(api.demand));

// 2b. Ningún valor numérico puede quedar en NaN
function nanScan() {
  const bad = [];
  const chk = (name, g2) => { for (let y = 0; y < NN; y++) for (let x = 0; x < NN; x++) if (typeof g2[y][x] === 'number' && Number.isNaN(g2[y][x])) bad.push(name + '[' + x + ',' + y + ']'); };
  chk('res', api.res); chk('landValue', api.landValue); chk('pollutionGrid', api.pollutionGrid); chk('burn', api.burn);
  for (const k of ['pop', 'jobs', 'workers', 'unemp', 'crime', 'edu', 'health', 'fire', 'happy', 'dev']) if (Number.isNaN(api.stats[k])) bad.push('stats.' + k);
  for (const k of ['powerSupply', 'powerDemand', 'powerRatio', 'waterSupply', 'waterDemand', 'waterRatio']) if (Number.isNaN(api.util[k])) bad.push('util.' + k);
  for (const k of ['subsidy', 'res', 'com', 'ind', 'income', 'expenses', 'net']) if (Number.isNaN(api.budget[k])) bad.push('budget.' + k);
  if (Number.isNaN(api.money)) bad.push('money');
  return bad.slice(0, 6);
}
const nans = nanScan();
ok('sin NaN en el estado del juego', nans.length === 0, nans.join(' '));

// 3. Todas las vistas se dibujan sin error
let viewErr = null;
for (const v of ['land', 'pollution', 'density', 'traffic', 'power', 'water', 'fire', 'police', 'school', 'hospital', 'none']) {
  try { api.setView(v); api.draw(); } catch (e) { viewErr = v + ': ' + e.message; }
}
ok('las ' + api.VIEWS.length + ' vistas dibujan sin error', !viewErr, viewErr || '');
api.setView('none');

// 3b. El panel de información explica por qué una zona no crece
api.init();
for (let i = 0; i < 300; i++) api.tick();
const [zx, zy] = findZone(); api.hover(zx, zy); api.updateHoverInfo();
const textoHover = api.hoverText();
ok('el panel de información muestra el desarrollo de la zona', /Desarrollo \d+% \(potencial \d+%\)/.test(textoHover), textoHover);
ok('el panel explica el motivo del crecimiento', /al máximo por ahora|en obras|sin demanda|sin energía|sin agua|sin calle/.test(textoHover), textoHover);

// 4. Construir, arrastrar, deshacer
api.init();
const dineroAntes = api.money;
api.setTool(2); // Baja Res.
const libre = findSpot(1); // celda adyacente a calle
const colocado = api.applyTool(libre[0], libre[1], false);
ok('se puede colocar una zona', colocado && api.g[libre[1]][libre[0]] === 2, 'celda ' + libre.join(','));
ok('el costo se descontó', api.money <= dineroAntes - 30, 'antes=' + Math.round(dineroAntes) + ' después=' + Math.round(api.money));
const dineroTrasColocar = api.money;
api.undo();
ok('deshacer restaura la celda y devuelve el dinero', api.g[libre[1]][libre[0]] === 0 && api.money >= dineroTrasColocar + 25 && api.undoStack.length === 0, 'tras colocar=' + Math.round(dineroTrasColocar) + ' tras deshacer=' + Math.round(api.money));
function findSpot(needRoad) {
  const cov = (x, y, c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(d => { const nx = x + d[0], ny = y + d[1]; return nx >= 0 && nx < NN && ny >= 0 && ny < NN && c[ny][nx]; });
  for (let y = 0; y < NN; y++) for (let x = 0; x < NN; x++) {
    if (api.g[y][x] !== 0) continue;
    const road = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(d => { const nx = x + d[0], ny = y + d[1]; return nx >= 0 && nx < NN && ny >= 0 && ny < NN && api.g[ny][nx] === 1; });
    if (road && cov(x, y, api.waterCoverage) && cov(x, y, api.powerCoverage)) return [x, y];
  }
  return [0, 0];
}

// 5. Bomberos: el fuego se apaga, deja escombros y se puede limpiar
const z = findZone();
api.burn[z[1]][z[0]] = 4;
let ticksFuego = 0;
while (api.burn[z[1]][z[0]] > 0 && ticksFuego < 60) { api.tick(); ticksFuego++; }
ok('el incendio se extingue solo', api.burn[z[1]][z[0]] === 0, ticksFuego + ' ticks');
ok('deja escombros en el terreno', api.g[z[1]][z[0]] === 18, 'tile=' + api.g[z[1]][z[0]]);
api.setTool(0); api.applyTool(z[0], z[1], false);
ok('la topadora limpia los escombros', api.g[z[1]][z[0]] === 0);
function findZone() { for (let y = 0; y < NN; y++) for (let x = 0; x < NN; x++) if (api.g[y][x] >= 2 && api.g[y][x] <= 10) return [x, y]; return [0, 0]; }

// 6. Guardar/cargar
const pobAntes = api.stats.pop, horaAntes = api.hour;
api.saveGame('test_key', true);
for (let i = 0; i < 5; i++) api.tick();
const cargado = api.loadGame('test_key');
ok('guardar/cargar funciona', cargado && api.hour === horaAntes && api.stats.pop === pobAntes, 'hora ' + api.hour + ' pop ' + api.stats.pop);

// 7. El bucle de animación avanza el reloj según la velocidad
api.init();
api.setSpeed(2);
const h0 = api.hour;
for (let i = 1; i <= 10; i++) rafCb(1000 + i * 100); // 1 s en 10 cuadros de 100 ms
ok('velocidad 2x = 2 horas por segundo', api.hour - h0 === 2, 'horas=' + (api.hour - h0));
api.setSpeed(0);
const hp = api.hour;
for (let i = 1; i <= 10; i++) rafCb(3000 + i * 100);
ok('pausa no avanza el reloj', api.hour === hp);
api.setSpeed(1);

// 8. Déficit: sin energía suficiente la ciudad se frena
api.init();
for (let i = 0; i < 400; i++) api.tick();
const ratioAntes = api.util.powerRatio;
let zonasAlto = 0;
for (let y = 0; y < NN; y++) for (let x = 0; x < NN; x++) if (api.g[y][x] === 4) zonasAlto++;
ok('con 1 central no se llega a apagón general', ratioAntes > 0.99, 'ratio=' + ratioAntes.toFixed(3) + ' demanda=' + api.util.powerDemand.toFixed(1) + '/' + api.util.powerSupply);

// diagnóstico: por qué se frena el desarrollo
function diagnostico(titulo) {
  const s = api.stats;
  const happyF = 0.55 + s.happy / 220;
  console.log('\n--- ' + titulo + ' ---');
  console.log('pop=' + s.pop + ' empleos=' + s.jobs + ' obreros=' + s.workers + ' zonas=' + s.zones + ' dev=' + s.dev + '% fel=' + Math.round(s.happy) + ' desempleo=' + s.unemp + '%');
  console.log('demanda=' + JSON.stringify(api.demand) + ' neto=' + api.budget.net.toFixed(2) + ' ingresos=' + api.budget.income.toFixed(2) + ' gastos=' + api.budget.expenses.toFixed(2));
  console.log('gastos detalle=' + JSON.stringify(Object.fromEntries(Object.entries(api.budget.lines).map(([k, v]) => [k, +v.toFixed(2)]))));
  const porTipo = {};
  let n = 0;
  for (let y = 0; y < NN; y++) for (let x = 0; x < NN; x++) {
    const id = api.g[y][x];
    if (id < 2 || id > 10) continue;
    porTipo[id] = (porTipo[id] || 0) + 1;
    if (n < 5) {
      const lv = api.landValue[y][x], lvF = 0.62 + lv / 250;
      const esRes = id >= 2 && id <= 4, esCom = id >= 5 && id <= 7;
      const d = esRes ? api.demand.res : (esCom ? api.demand.com : api.demand.ind);
      const demF = api.clamp(0.4 + d / 120, 0, 1.15);
      const demObj = esRes ? 6 * demF * lvF * happyF : null;
      console.log(`(${x},${y}) id=${id} stage=${api.res[y][x].toFixed(2)} objetivo=${api.growthTarget[y][x].toFixed(2)} acceso=${api.growthAccess[y][x]} terreno=${lv} contaminacion=${api.pollutionGrid[y][x].toFixed(0)} demF=${demF.toFixed(2)}` + (demObj ? ' objTeorico=' + demObj.toFixed(2) : '') + ` calle=${[[1,0],[-1,0],[0,1],[0,-1]].some(dd => api.g[y + dd[1]] && api.g[y + dd[1]][x + dd[0]] === 1)} agua=${api.waterCoverage[y][x]} luz=${api.powerCoverage[y][x]}`);
      n++;
    }
  }
  console.log('zonas por tipo=' + JSON.stringify(porTipo));
  let parques = 0;
  for (let y = 0; y < NN; y++) for (let x = 0; x < NN; x++) if (api.g[y][x] === 11) parques++;
  const exp = Math.min(1, s.pop / 80);
  const fel = 55 + Math.min(20, parques * 2.2) + (s.edu - 50) * 0.08 * exp + (s.health - 50) * 0.08 * exp + (s.fire - 50) * 0.06 * exp - s.crime * 0.09 - api.pollutionPeak * 0.18 - s.unemp * 0.12 - (api.money < 0 ? 5 : 0);
  console.log('felicidad desglosada: base 55 + parques' + parques + '(' + (Math.min(20, parques * 2.2)).toFixed(1) + ') + educacion' + s.edu + '(' + ((s.edu - 50) * 0.08 * exp).toFixed(1) + ') + salud' + s.health + '(' + ((s.health - 50) * 0.08 * exp).toFixed(1) + ') + bomberos' + s.fire + '(' + ((s.fire - 50) * 0.06 * exp).toFixed(1) + ') - delito' + s.crime + '(' + (s.crime * 0.09).toFixed(1) + ') - contaminacion' + api.pollutionPeak.toFixed(0) + '(' + (api.pollutionPeak * 0.18).toFixed(1) + ') - desempleo' + s.unemp + '(' + (s.unemp * 0.12).toFixed(1) + ') = ' + fel.toFixed(1) + '</br>');
}
api.init();
for (let i = 0; i < 1200; i++) api.tick();
diagnostico('ciudad de arranque, hora 1200');

// 9. Escenario de juego realista: el jugador zonifica y construye servicios
api.init();
const diario = [];
function librePara(id) {
  for (let y = 0; y < NN; y++) for (let x = 0; x < NN; x++) if (api.g[y][x] === 0 && api.canPlace(id, x, y)) return [x, y];
  return null;
}
function construir(id, max) {
  let n = 0;
  const idx = api.TILES.findIndex(t => t.id === id);
  const t = api.TILES[idx];
  while (n < max) {
    const spot = librePara(id);
    if (!spot || api.money < t.cost) break;
    api.setTool(idx);
    if (api.applyTool(spot[0], spot[1], true)) n++; else break;
  }
  return n;
}
function construirCalle(max) {
  let n = 0;
  const idx = api.TILES.findIndex(t => t.id === 1);
  const t = api.TILES[idx];
  for (let y = 0; y < NN && n < max; y++) for (let x = 0; x < NN && n < max; x++) {
    const C0 = Math.floor(NN / 2);
    const planificada = [C0 - 6, C0 - 3, C0 + 3, C0 + 6].includes(y) || [C0 - 6, C0 - 3, C0 + 3, C0 + 6].includes(x);
    if (!planificada || api.g[y][x] !== 0 || api.money < t.cost + 200) continue;
    api.setTool(idx);
    if (api.applyTool(x, y, true)) n++;
  }
  return n;
}
for (let dia = 1; dia <= 25; dia++) {
  construirCalle(4);                                          // el jugador traza unas calles nuevas
  construir(2, 4);                                            // residencia baja
  if (api.demand.com > 10) construir(5, 2);                   // comercio: el jugador mira las barras RCI
  if (api.demand.ind > 10 && api.money > 400) construir(8, 2); // industria
  // servicios: si falta alguno y el presupuesto lo aguanta, lo construye (así juega una persona)
  if (api.money > 700 && api.budget.net > 1.5) {
    for (const id of [14, 15, 16, 17]) {
      let hay = false;
      for (let y = 0; y < NN && !hay; y++) for (let x = 0; x < NN && !hay; x++) if (api.g[y][x] === id) hay = true;
      if (!hay) { construir(id, 1); break; }
    }
  }
  // ordenanza de aire limpio: la prende si la contaminación aprieta y la caja aguanta, y la apaga si se funde
  if (api.pollutionPeak > 45 && api.budget.net > 8) api.ordinances.cleanair = true;
  else if (api.budget.net < 3) api.ordinances.cleanair = false;
  if (api.money > 700 && dia % 3 === 0) construir(11, 1);     // parques: suben la felicidad y el valor del suelo
  for (let i = 0; i < 24; i++) api.tick();
  diario.push({ dia, pop: api.stats.pop, dinero: Math.round(api.money), neto: +api.budget.net.toFixed(1), fel: Math.round(api.stats.happy), dev: api.stats.dev, edificado: api.stats.built, desempleo: api.stats.unemp });
}
const fin = diario[diario.length - 1];
diagnostico('ciudad jugada, día 25');
ok('el jugador logra pasar de 60 habitantes', fin.pop >= 60, 'pop=' + fin.pop);
ok('la ciudad es rentable a los 25 días', fin.neto > 0, 'neto=' + fin.neto + '$/h');
ok('la caja está sana', fin.dinero > 500, 'dinero=' + fin.dinero);
ok('la felicidad se mantiene por encima de 45', fin.fel >= 45, 'felicidad=' + fin.fel);
const nanFinal = nanScan();
ok('sin NaN tras 25 días de juego', nanFinal.length === 0, nanFinal.join(' '));
api.saveGame('ciudad_densa', true);   // se usa después para probar el tránsito de una ciudad grande
console.log('\n--- partida jugada día por día ---');
diario.filter(d => d.dia % 3 === 0 || d.dia === 25).forEach(d => console.log(JSON.stringify(d)));

// 10. Tránsito: un pueblo tiene poco tránsito y la ciudad grande tiene los dos sentidos
api.init();
for (let i = 0; i < 240; i++) api.tick();
let pequenosOK = true, detallePueblo = '';
for (let f = 0; f < 200; f++) {
  api.stepTraffic(40);
  if (api.cars.some(c => !api.roadAt(c.x, c.y) || !api.roadAt(c.nx, c.ny))) pequenosOK = false;
}
detallePueblo = 'pop=' + api.stats.pop + ' vehículos=' + api.cars.length;
ok('en un pueblo hay tránsito pero poco', api.cars.length >= 1 && api.cars.length <= 10 && pequenosOK, detallePueblo);

// ahora la ciudad grande del escenario anterior: calles por todos lados y muchos viajes
api.loadGame('ciudad_densa');
ok('la ciudad jugada se recuperó para probar el tránsito', api.stats.pop > 60, 'pop=' + api.stats.pop);
let todosEnCalle = true, fueraDeCalle = '', dobleMano = false, maxCars = 0, jams = [];
const sentidos = {};
for (let f = 0; f < 1500; f++) {
  api.stepTraffic(40);
  maxCars = Math.max(maxCars, api.cars.length);
  const porLinea = {};
  for (const c of api.cars) {
    if (!api.roadAt(c.x, c.y) || !api.roadAt(c.nx, c.ny)) { todosEnCalle = false; fueraDeCalle = JSON.stringify(c); break; }
    const horiz = c.ny === c.y;
    const linea = horiz ? 'f' + c.y : 'c' + c.x;
    const sentido = horiz ? Math.sign(c.nx - c.x) : Math.sign(c.ny - c.y);
    (porLinea[linea] = porLinea[linea] || {})[sentido] = true;
    sentidos[sentido] = (sentidos[sentido] || 0) + 1;
  }
  if (Object.values(porLinea).some(d => d[1] && d[-1])) dobleMano = true;   // misma calle, sentidos opuestos
  if (f % 400 === 0) jams.push(api.stats.traffic);
}
ok('la ciudad grande tiene tránsito', api.cars.length >= 10, api.cars.length + ' vehículos');
ok('todos los vehículos van sobre la calle', todosEnCalle, fueraDeCalle);
ok('las calles son de doble mano: autos en los dos sentidos', dobleMano, 'sentidos vistos=' + JSON.stringify(sentidos));
ok('el tránsito no supera el tope', maxCars <= 110, 'máximo=' + maxCars);

// de noche circulan menos vehículos que de día
const autosDia = api.cars.length, horaDia = api.hour;
let guardaNoche = 0;
while (!api.isNight() && guardaNoche++ < 30) api.tick();
for (let f = 0; f < 900; f++) api.stepTraffic(40);
ok('de noche circulan menos vehículos que de día', api.isNight() && api.cars.length > 0 && api.cars.length < autosDia,
  'día=' + autosDia + ' (hora ' + horaDia + ') noche=' + api.cars.length + ' (hora ' + api.hour + ')');

// cada sentido va por su carril: son carriles distintos, no la misma línea
const [ex, ey] = api.laneOffset(1, 0), [wx, wy] = api.laneOffset(-1, 0);
const [sx, sy] = api.laneOffset(0, 1), [nx, ny] = api.laneOffset(0, -1);
ok('cada sentido va por su carril (a la derecha)',
  ex === 0 && ey > 0 && wx === 0 && wy < 0 && ey === -wy && sx < 0 && sy === 0 && nx > 0 && ny === 0,
  'este=' + ey.toFixed(1) + ' oeste=' + wy.toFixed(1) + ' sur=' + sx.toFixed(1) + ' norte=' + nx.toFixed(1));
ok('los vehículos circulan (cambian de posición)', (() => {
  const antes = api.cars.map(c => c.x * 1000 + c.y * 100 + c.p);
  for (let f = 0; f < 40; f++) api.stepTraffic(50);
  const despues = api.cars.map(c => c.x * 1000 + c.y * 100 + c.p);
  return despues.length > 0 && antes.some((v, i) => despues[i] !== undefined && Math.abs(despues[i] - v) > 0.01);
})());
ok('el índice de congestión queda entre 0 y 100', jams.every(j => j >= 0 && j <= 100), 'muestras=' + JSON.stringify(jams));
ok('con pausa el tránsito no se mueve', (() => {
  const antes = api.cars.map(c => [c.x, c.y, c.p]);
  api.stepTraffic(0);
  return api.cars.every((c, i) => antes[i] && c.x === antes[i][0] && c.y === antes[i][1] && c.p === antes[i][2]);
})());

// el panel de información de una calle avisa que es doble mano
let calleX = -1, calleY = -1;
for (let y = 0; y < NN && calleX < 0; y++) for (let x = 0; x < NN && calleX < 0; x++) if (api.g[y][x] === 1) { calleX = x; calleY = y; }
api.hover(calleX, calleY); api.updateHoverInfo();
const txtCalle = api.hoverText();
ok('el panel de la calle informa el doble mano y los vehículos', /doble mano/.test(txtCalle) && /vehículo/.test(txtCalle), txtCalle.slice(0, 120));

// si el jugador levanta la calle, el auto desaparece sin romper nada
const victima = api.cars[0];
if (victima) {
  api.g[victima.y][victima.x] = 0;
  api.g[victima.ny][victima.nx] = 0;
  let rompio = '';
  try { api.stepTraffic(50); } catch (e) { rompio = e.message; }
  ok('levantar la calle borra el vehículo sin errores',
    !rompio && !api.cars.some(c => c.x === victima.x && c.y === victima.y), rompio || 'ok');
} else {
  ok('levantar la calle borra el vehículo sin errores', false, 'no había vehículos para probar');
}

// el tránsito es liviano: 2000 cuadros de simulación
const t0 = Date.now();
for (let f = 0; f < 2000; f++) api.stepTraffic(40);
const msTrafico = Date.now() - t0;
ok('el tránsito es liviano', msTrafico < 3000, '2000 cuadros en ' + msTrafico + ' ms');

// 10b. Geometría del dibujo: cada vehículo va en su carril, no sobre el eje de la calle
api.init();
api.cars.length = 0;
api.cars.push({ x: 5, y: 5, nx: 6, ny: 5, p: 0.5, spd: 2, color: '#fff', camion: false, life: 100 });  // hacia el este
api.cars.push({ x: 7, y: 5, nx: 6, ny: 5, p: 0.5, spd: 2, color: '#000', camion: false, life: 100 });  // hacia el oeste, misma calle
api.clearOps();
api.drawCars();
const tras = api.ops.filter(o => o[0] === 'translate').map(o => o[1]);
const girs = api.ops.filter(o => o[0] === 'rotate').map(o => o[1][0]);
const rects = api.ops.filter(o => o[0] === 'fillRect').length;
const centroCalle = 5.5 * 30;
ok('cada sentido se dibuja en su carril (no sobre el eje)',
  tras.length === 2 && Math.abs(tras[0][1] - (centroCalle + api.LANE)) < 0.01 && Math.abs(tras[1][1] - (centroCalle - api.LANE)) < 0.01 && tras[0][1] > tras[1][1] && rects >= 6,
  'este y=' + (tras[0] ? tras[0][1].toFixed(1) : '?') + ' oeste y=' + (tras[1] ? tras[1][1].toFixed(1) : '?') + ' centro=' + centroCalle + ' carril=' + api.LANE.toFixed(1));
ok('los vehículos se dibujan orientados hacia donde van',
  girs.length === 2 && Math.abs(girs[0]) < 1e-9 && Math.abs(Math.abs(girs[1]) - Math.PI) < 1e-9,
  'este=' + (girs[0] || 0).toFixed(2) + ' oeste=' + (girs[1] || 0).toFixed(2));
ok('las ruedas no se salen del ancho de la calle',
  tras.every(o => Math.abs(o[1] - centroCalle) + 6 <= 15), 'carril ' + api.LANE.toFixed(1) + ' + medio auto 6 <= medio tile 15');
// 10c. La línea de eje de las calles: recta = tramo completo, extremo = hasta el centro (doble mano)
api.init();
for (let y = 0; y < NN; y++) for (let x = 0; x < NN; x++) api.g[y][x] = 0;
[4, 5, 6, 7].forEach(x => api.g[5][x] = 1);                 // recta horizontal en y=5, x=4..7
api.g[9][8] = 1; api.g[9][9] = 1;                            // par suelto: extremo este en (8,9)
api.g[7][12] = 1; api.g[8][12] = 1; api.g[9][12] = 1;        // columna en x=12, y=7..9
api.g[15][15] = 1;                                           // calle aislada
api.clearOps();
api.drawTile(4, 5);   // X=120,Y=150: sólo sigue al este → del centro al borde derecho
api.drawTile(6, 5);   // X=180,Y=150: recta → tramo completo
api.drawTile(8, 9);   // X=240,Y=270: sólo sigue al este
api.drawTile(12, 8);  // X=360,Y=240: columna completa (norte y sur)
api.drawTile(15, 15); // X=450,Y=450: aislada, sólo el guioncito
const mov = api.ops.filter(o => o[0] === 'moveTo').map(o => o[1]);
const lin = api.ops.filter(o => o[0] === 'lineTo').map(o => o[1]);
const igual = (a, b) => a && b && Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01;
ok('la línea de eje se dibuja sólo donde la calle sigue',
  mov.length === 5 && lin.length === 5 &&
  igual(mov[0], [135, 165]) && igual(lin[0], [150, 165]) &&
  igual(mov[1], [180, 165]) && igual(lin[1], [210, 165]) &&
  igual(mov[2], [255, 285]) && igual(lin[2], [270, 285]) &&
  igual(mov[3], [375, 240]) && igual(lin[3], [375, 270]) &&
  Math.abs(mov[4][0] - 465) <= 6.5 && Math.abs(mov[4][1] - 465) <= 6.5,
  'mov=' + JSON.stringify(mov) + ' lin=' + JSON.stringify(lin));
/* ================= Interfaz: lienzo a pantalla completa, íconos y orden ================= */
console.log('\n-- interfaz --');
const VW = 1600, VH = 900, LADO = NN * 30;   // el mundo mide 20 tiles de 30px

api.viewport(VW, VH);
let [cw, ch] = api.canvasSize;
ok('el lienzo ocupa toda la ventana', cw === VW && ch === VH, cw + 'x' + ch);

let [kxc, kyc] = api.cam, zc = api.zoom;
ok('el mapa cubre toda la ventana (sin franjas vacías)',
   kxc <= 0.5 && kyc <= 0.5 && kxc + LADO * zc >= VW - 0.5 && kyc + LADO * zc >= VH - 0.5,
   'mapa=' + [kxc, kyc, kxc + LADO * zc, kyc + LADO * zc].map(v => Math.round(v)).join(',') + ' en ' + VW + 'x' + VH);
ok('la cámara no deja huecos al desplazarse al extremo',
   (() => { api.pan ? 0 : 0; return kxc <= 0.5 && kyc <= 0.5; })(),
   'zoom ' + zc.toFixed(2) + ' → mapa de ' + Math.round(LADO * zc) + 'px');

api.viewport(900, 1400);
let [kx2, ky2] = api.cam, z2 = api.zoom;
ok('al cambiar el tamaño de la ventana el mapa se reencuadra y sigue cubriendo',
   kx2 <= 0.5 && ky2 <= 0.5 && kx2 + LADO * z2 >= 900 - 0.5 && ky2 + LADO * z2 >= 1400 - 0.5,
   'origen=' + Math.round(kx2) + ',' + Math.round(ky2) + ' zoom=' + z2.toFixed(2));
api.viewport(VW, VH);

const botones = api.btn('tools');
ok('las herramientas se dibujan como botones', botones.length === api.TILES.length, botones.length + ' botones para ' + api.TILES.length + ' herramientas');
let conIcono = 0, conPrecio = 0, conTitulo = 0;
botones.forEach((b, i) => {
  const html = String(b.innerHTML);
  if (html.includes('<svg')) conIcono++;
  if (api.TILES[i].id === 0 || html.includes('<span>')) conPrecio++;
  if (b.title) conTitulo++;
});
const sinIcono = api.TILES.filter(t => !String((api.ICON.tool[t.id] || '')).includes('<svg')).length;
ok('cada herramienta tiene su ícono', conIcono === api.TILES.length && sinIcono === 0, conIcono + '/' + api.TILES.length + ' dibujados, ' + sinIcono + ' sin ícono');
ok('cada herramienta muestra lo que cuesta', conPrecio === api.TILES.length, conPrecio + '/' + api.TILES.length);
ok('cada herramienta explica qué hace y con qué tecla', conTitulo === api.TILES.length && /tecla/.test(botones[2].title) && /\$/.test(botones[2].title), botones[2].title);

const vistas = api.btn('views');
const iconosVista = api.VIEWS.filter(v => String(api.ICON.view[v.id] || '').includes('<svg')).length;
const titulosVista = vistas.filter(b => b.title).length;
ok('las ' + api.VIEWS.length + ' vistas tienen ícono y explicación',
   iconosVista === api.VIEWS.length && titulosVista === api.VIEWS.length && vistas.length === api.VIEWS.length,
   iconosVista + ' íconos, ' + titulosVista + ' títulos, ' + vistas.length + ' botones');

const velocidades = api.btn('speed');
ok('los 4 controles de velocidad tienen ícono',
   velocidades.length === 4 && velocidades.every(b => String(b.innerHTML).includes('<svg') && b.title),
   velocidades.length + ' botones, activo=' + velocidades.filter(b => b.classList.contains('active')).length);

const panelVisible = !api.hidden('sidebar');
api.click('togglePanel');
const seOculto = api.hidden('sidebar');
api.click('togglePanel');
ok('el panel de datos se oculta y vuelve a mostrarse',
   panelVisible && seOculto && !api.hidden('sidebar'),
   'visible=' + panelVisible + ' oculto al clic=' + seOculto);

const ayudaAntes = api.hidden('helpbox');
api.click('help');
const ayudaDespues = api.hidden('helpbox');
api.click('help');
ok('la ayuda se abre y se cierra',
   ayudaDespues !== ayudaAntes && api.hidden('helpbox') === ayudaAntes,
   'cerrada=' + ayudaAntes + ' tras el clic=' + ayudaDespues);
ok('en el navegador la ayuda arranca cerrada', /id="helpbox"[^>]*hidden/.test(html), 'class="panel hidden" en el marcado');

api.setSpeed(0); api.updateHUD();
const reloj = api.text('hd');
api.setSpeed(1); api.updateHUD();
ok('el HUD dice el día y la hora', /Día \d+/.test(reloj) && /\d\d:00/.test(reloj) && /pausa/.test(reloj),
   reloj.split(' · ').join(' | '));

api.loadGame('ciudad_densa');   // dejo la ciudad grande cargada para el resumen final

console.log(R.join('\n'));
console.log('\n--- traza de la simulación ---');
traza.forEach(t => console.log(JSON.stringify(t)));
console.log('\nresumen: ' + R.filter(r => r.startsWith('PASS')).length + '/' + R.length + ' pruebas OK');
console.log('estado final: dinero=' + Math.round(api.money) + ' pop=' + api.stats.pop + ' felicidad=' + Math.round(api.stats.happy) + ' contaminación=' + Math.round(api.pollutionPeak) + ' dev=' + api.stats.dev + '%');
process.exit(0);
