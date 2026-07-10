'use strict';
/* =====================================================================
   CAPA DE SINCRONIZACIÓN — Pueblo CaféBar
   Dos modos, misma interfaz:
   · FirebaseStore → si hay FIREBASE_CONFIG en js/config.js: los datos
     se sincronizan en tiempo real entre todos los dispositivos.
   · LocalStore    → sin configuración: todo vive en este dispositivo
     (igual que el demo original). Útil para probar sin instalar nada.
   ===================================================================== */

function uniqueId(prefix){
  return prefix + Date.now().toString(36) + Math.floor(Math.random()*1e4).toString(36);
}

const SEED_TAREAS = [
  {id:'t1', txt:'Encender equipos y revisar temperatura de neveras', turno:'apertura', asignado:'', hecho:false},
  {id:'t2', txt:'Limpiar y desinfectar estaciones de trabajo', turno:'apertura', asignado:'', hecho:false},
  {id:'t3', txt:'Cuadrar caja y archivar comandas del día', turno:'cierre', asignado:'', hecho:false},
  {id:'t4', txt:'Sacar residuos y dejar áreas limpias', turno:'cierre', asignado:'', hecho:false},
];
const SEED_RECETAS = [
  {id:'r1',  nombre:'Jugo Normal (base)', texto:'250 gramos de fruta + 200 ml de agua + 1/2 oz de jarabe de goma'},
  {id:'rjf', nombre:'Jugo de fresa',  texto:'250 gramos de fresa + 200 ml de agua + 1/2 oz de jarabe de goma'},
  {id:'rjp', nombre:'Jugo de papaya', texto:'250 gramos de papaya + 200 ml de agua + 1/2 oz de jarabe de goma'},
  {id:'rjn', nombre:'Jugo de piña',   texto:'250 gramos de piña + 200 ml de agua + 1/2 oz de jarabe de goma'},
];

/* normaliza un pedido leído de la base (Firebase omite claves vacías) */
function normOrder(o){
  if(!o) return null;
  o.items = Array.isArray(o.items) ? o.items.filter(Boolean) : Object.values(o.items || {});
  // descartar comandas vacías (p. ej. las generadas por un doble envío durante un cuelgue):
  // sin ítems y sin pagos no representan una venta real
  if(!o.items.length && !(o.pagos && (Array.isArray(o.pagos) ? o.pagos.length : Object.keys(o.pagos).length))) return null;
  o.items.forEach(it => { it.mods = it.mods || {}; it.notas = it.notas || ''; });
  o.mesa = o.mesa || ''; o.tipo = o.tipo || 'mesa';
  if(o.pagos){
    o.pagos = Array.isArray(o.pagos) ? o.pagos.filter(Boolean) : Object.values(o.pagos);
    o.pagos.forEach(p => { if(p && p.unitKeys && !Array.isArray(p.unitKeys)) p.unitKeys = Object.values(p.unitKeys); });
  }
  if(o.snapAnterior){
    o.snapAnterior = Array.isArray(o.snapAnterior) ? o.snapAnterior.filter(Boolean) : Object.values(o.snapAnterior);
    o.snapAnterior.forEach(s => { if(s && s.items && !Array.isArray(s.items)) s.items = Object.values(s.items); });
  }
  return o;
}
function clean(obj){ return JSON.parse(JSON.stringify(obj)); }

/* ------------------------- MODO LOCAL ------------------------- */
function LocalStore(){
  let data = { orders:[], compras:[], tareas:clean(SEED_TAREAS), recetas:clean(SEED_RECETAS), caja:null, modo:'real', historial:[], cajas:[], noDisponible:[], carta:clean(MENU_SEED), seq:1 };
  try{
    const s = localStorage.getItem('pc_demo');
    if(s){
      const old = JSON.parse(s);
      data.orders  = (old.orders  || []).map(normOrder).filter(Boolean);
      data.compras = old.compras || [];
      data.tareas  = (old.tareas  && old.tareas.length)  ? old.tareas  : data.tareas;
      data.recetas = (old.recetas && old.recetas.length) ? old.recetas : data.recetas;
      data.caja    = old.caja || null;
      data.modo    = old.modo || 'real';
      data.historial = old.historial || [];
      data.cajas = old.cajas || [];
      data.noDisponible = old.noDisponible || [];
      data.carta   = (old.carta && old.carta.length) ? old.carta : data.carta;
      data.seq     = old.seq || (Math.max(0, ...data.orders.map(o=>o.id)) + 1);
      // completar recetas de jugos si faltan (migración)
      SEED_RECETAS.forEach(r => { if(!data.recetas.some(x => x.nombre.toLowerCase() === r.nombre.toLowerCase())) data.recetas.push(clean(r)); });
    }
  }catch(e){}
  let notify = () => {};
  const persist = () => { try{ localStorage.setItem('pc_demo', JSON.stringify(data)); }catch(e){} };
  return {
    mode: 'local',
    init(cb){ notify = () => cb(data); notify(); },
    async nextOrderId(){ return data.seq++; },
    saveOrder(o){
      const i = data.orders.findIndex(x => x.id === o.id);
      if(i >= 0) data.orders[i] = o; else data.orders.push(o);
      persist(); notify();
    },
    clearOrders(){ data.orders = []; data.seq = 1; persist(); notify(); },
    saveList(name, arr){ data[name] = arr; persist(); notify(); },
    saveCaja(c){ data.caja = c; persist(); notify(); },
    saveModo(m){ data.modo = m; persist(); notify(); },
    deletePractica(){ data.orders = data.orders.filter(o=>!o.practica); persist(); notify(); },
    archivarDia(){
      const reales = data.orders.filter(o=>!o.practica);
      data.historial = (data.historial || []).concat(reales);
      // archivar también la caja del día (fondo, contado, gastos, cierre) para el historial
      if(data.caja && data.caja.fecha){
        data.cajas = (data.cajas || []).filter(x => x.fecha !== data.caja.fecha).concat([clean(data.caja)]);
      }
      data.orders = []; data.seq = 1;
      persist(); notify();
    },
  };
}

/* ------------------------ MODO FIREBASE ------------------------ */
function FirebaseStore(cfg){
  firebase.initializeApp(cfg);
  const db = firebase.database();
  const data = { orders:[], compras:[], tareas:[], recetas:[], caja:null, modo:'real', historial:[], cajas:[], noDisponible:[], carta:[] };
  let notify = () => {};

  function listen(){
    db.ref('orders').on('value', snap => {
      const v = snap.val() || {};
      data.orders = Object.values(v).map(normOrder).filter(Boolean).sort((a,b)=>a.id-b.id);
      notify();
    });
    ['compras','tareas','recetas','noDisponible','carta'].forEach(name => {
      db.ref(name).on('value', snap => {
        const v = snap.val();
        data[name] = Array.isArray(v) ? v.filter(Boolean) : Object.values(v || {});
        notify();
      });
    });
    db.ref('caja').on('value', snap => { data.caja = snap.val() || null; notify(); });
    db.ref('modo').on('value', snap => { data.modo = snap.val() || 'real'; notify(); });
    db.ref('historial').on('value', snap => {
      const v = snap.val();
      data.historial = Array.isArray(v) ? v.filter(Boolean) : Object.values(v || {});
      notify();
    });
    db.ref('cajas').on('value', snap => {
      const v = snap.val();
      data.cajas = Array.isArray(v) ? v.filter(Boolean) : Object.values(v || {});
      notify();
    });
    // sembrar tareas y recetas la primera vez
    db.ref('tareas').once('value', s => { if(!s.exists()) db.ref('tareas').set(clean(SEED_TAREAS)); });
    db.ref('recetas').once('value', s => { if(!s.exists()) db.ref('recetas').set(clean(SEED_RECETAS)); });
    // migración: la primera vez, la carta del código se copia a la base (de ahí se edita en la app)
    db.ref('carta').once('value', s => { if(!s.exists()) db.ref('carta').set(clean(MENU_SEED)); });
  }

  // autenticación anónima (las reglas de la base exigen auth != null)
  if(firebase.auth){
    firebase.auth().signInAnonymously().catch(e => console.error('Auth:', e.message));
    firebase.auth().onAuthStateChanged(u => { if(u) listen(); });
  } else { listen(); }

  return {
    mode: 'firebase',
    init(cb){ notify = () => cb(data); notify(); },
    nextOrderId(){
      return db.ref('seq').transaction(v => (v || 0) + 1).then(r => r.snapshot.val());
    },
    saveOrder(o){
      const i = data.orders.findIndex(x => x.id === o.id);           // actualización optimista
      if(i >= 0) data.orders[i] = o; else { data.orders.push(o); data.orders.sort((a,b)=>a.id-b.id); }
      notify();
      db.ref('orders/' + o.id).set(clean(o));
    },
    clearOrders(){ data.orders = []; notify(); db.ref('orders').remove(); db.ref('seq').set(0); },
    saveList(name, arr){ data[name] = arr; notify(); db.ref(name).set(clean(arr)); },
    saveCaja(c){ data.caja = c; notify(); db.ref('caja').set(clean(c)); },
    saveModo(m){ data.modo = m; notify(); db.ref('modo').set(m); },
    deletePractica(){
      const reales = data.orders.filter(o=>!o.practica);
      data.orders = reales; notify();
      const obj = {}; reales.forEach(o=>obj[o.id] = clean(o));
      db.ref('orders').set(obj);
    },
    archivarDia(){
      const reales = data.orders.filter(o=>!o.practica).map(clean);
      const hist = (data.historial || []).concat(reales);
      data.historial = hist; data.orders = [];
      // archivar también la caja del día (fondo, contado, gastos, cierre) para el historial
      if(data.caja && data.caja.fecha){
        data.cajas = (data.cajas || []).filter(x => x.fecha !== data.caja.fecha).concat([clean(data.caja)]);
        db.ref('cajas').set(data.cajas.map(clean));
      }
      notify();
      db.ref('historial').set(hist.map(clean));
      db.ref('orders').remove(); db.ref('seq').set(0);
    },
  };
}

/* ------------------------- SELECCIÓN ------------------------- */
const store = (typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG && typeof firebase !== 'undefined')
  ? FirebaseStore(FIREBASE_CONFIG)
  : LocalStore();
