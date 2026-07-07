'use strict';
/* ===== LÓGICA DE LA APP — Pueblo CaféBar =====
   El menú vive en js/menu.js · la sincronización en js/sync.js · la configuración en js/config.js */

/* ================= DATOS DEL MENÚ (transcrito de la carta) =================
   station: 'salados' = cocina de salados | 'dulces' = cocina de dulces, jugos, cafés y barra */
/* menú y modificadores: ver js/menu.js */

/* ================= ESTADO (gestionado por js/sync.js) ================= */
let state = { orders:[], compras:[], tareas:[], recetas:[], caja:null, modo:'real', historial:[], noDisponible:[], carta:[] };
let user = null;
try{ const u = localStorage.getItem('pc_user'); if(u) user = JSON.parse(u); }catch(e){}

let view = 'home';          // home | mesero | cocina | registro
let station = null;         // dulces | salados
let tab = MENU[0].cat;
let cart = [];              // items de la comanda en curso
let mesa = '';              // mesa seleccionada (tipo mesa) o nombre del cliente (tipo llevar)
let tipo = 'mesa';          // mesa | llevar
// Lista de mesas (5 por defecto). Se puede sobreescribir con MESAS_CONFIG en js/config.js
let mesasList = (typeof MESAS_CONFIG !== 'undefined' && Array.isArray(MESAS_CONFIG) && MESAS_CONFIG.length)
  ? MESAS_CONFIG.slice()
  : Array.from({length:5}, (_,i)=>'Mesa ' + (i+1));
let query = '';             // texto del buscador
let modal = null;           // {item, qty, sel:{}, notas, editIdx?}
let customModal = null;     // producto fuera de carta {desc, precio, qty, station, notas}
let chkModal = null;        // {orderId, itemUid}
let cuentaId = null;        // comanda mostrada en "cuenta"
let recetaModal = null;     // receta abierta desde cocina
let armAnular = null;       // id de comanda con anulación armada (doble toque)
let armAnularItem = null;   // {oid, uid} de ítem con anulación armada
let selEntrega = new Set(); // uids marcados para entrega conjunta
let addTargetId = null;     // pedido al que se le están agregando ítems (null = pedido nuevo)
let splitModal = null;      // división de cuenta {oid, personas:[], asign:{}, nextId}
let cierreMode = false;     // caja en modo cierre (mostrando inputs de conteo)
let boletaEdit = false;     // en la cuenta: formulario de boleta desplegado
let armBorrarP = false;     // borrar pedidos de práctica (doble toque)
let armArchivar = false;    // archivar el día (doble toque)
let histDay = null;         // día expandido en el historial (solo lectura)
let quitarMode = false;     // en la cuenta: sección "quitar ítem" desplegada
let manualAddModal = null;  // agregar ítem servido a una cuenta (admin) {oid, desc, precio, qty, notas}
let ventaModal = null;      // registrar venta manual completa (admin)
let snapModal = null;       // ver versión anterior de una cuenta editada {oid}

let toastTimer = null;
function toast(msg){
  document.querySelectorAll('.toast').forEach(t=>t.remove());
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.remove(), 2200);
}

const money = v => 'S/ ' + (v % 1 ? v.toFixed(2) : v);
const hhmm = ts => { const d = new Date(ts); return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); };
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function modsTxt(it){
  const parts = [];
  for(const g in it.mods){
    const v = it.mods[g], G = GRUPOS[g];
    if(Array.isArray(v)){ if(v.length) parts.push(v.join(' + ')); continue; }
    if(G && G.hideDef && v === G.def) continue;  // ocultar valores por defecto (ej. cóctel todo regular)
    if(v) parts.push(v);
  }
  if(it.notas) parts.push('Nota: ' + it.notas);
  return parts.join(' · ');
}

/* ================= RENDER ================= */
const app = document.getElementById('app');
function render(){
  if(!user){ app.innerHTML = rLogin(); return; }
  let h = '';
  if(view === 'home') h = rHome();
  else if(view === 'mesero') h = rMesero();
  else if(view === 'cocina') h = rCocina();
  else if(view === 'registro') h = rRegistro();
  else if(view === 'historial') h = rHistorial();
  else if(view === 'gestion') h = rGestion();
  if(modal) h += rModal();
  if(customModal) h += rCustom();
  if(chkModal) h += rChk();
  if(cuentaId !== null) h += rCuenta();
  if(recetaModal) h += rRecetaModal();
  if(splitModal) h += rSplit();
  if(manualAddModal) h += rManualAdd();
  if(ventaModal) h += rVentaManual();
  if(snapModal) h += rSnap();
  if(cartaModal) h += rCartaModal();
  if(mesaModal) h += rMesaModal();
  if(unirModal) h += rUnir();
  if(descModal) h += rDesc();
  app.innerHTML = h;
}

/* ================= CAJA (apertura / cierre) ================= */
function dayKey(d){ d = d ? new Date(d) : new Date(); return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate(); }
function cajaHoyAbierta(){ const c = state.caja; return !!(c && c.estado === 'abierta' && c.fecha === dayKey()); }

/* ================= MODO PRÁCTICA / REAL ================= */
function enPractica(){ return state.modo === 'practica'; }
function esAdmin(){ return user && user.rol === 'admin'; }
function modoBanner(){
  if(!enPractica()) return '';
  return `<div class="practbanner">🧪 MODO PRÁCTICA · los pedidos son de entrenamiento y NO se guardan como ventas</div>`;
}
function setModo(m){
  if(!esAdmin()){ toast('Solo el administrador puede cambiar el modo'); return; }
  store.saveModo(m);
  toast(m==='practica' ? '🧪 Modo práctica activado' : '✅ Pedidos reales activados');
  render();
}

/* ================= PAGOS (soporta pago simple y dividido) ================= */
function pagosDe(o){
  if(Array.isArray(o.pagos)) return o.pagos;
  if(o.pago) return [{ monto: orderTotal(o), metodo: o.pago }];   // compat. con modelo viejo
  return [];
}
function pagadoDe(o){ return pagosDe(o).reduce((s,p)=>s+(p.monto||0),0); }
/* cuenta oculta: vaciada por una unión o eliminada como duplicada (queda en la base como rastro) */
function esFantasma(o){ return (!!o.unidaEn && (!o.items || !o.items.length)) || !!o.eliminada; }
/* descuento aplicado a la cuenta (porcentaje o monto fijo) */
function descMonto(o){
  if(!o.descuento) return 0;
  const bruto = orderTotal(o), d = o.descuento;
  const m = d.tipo === 'pct' ? bruto * (parseFloat(d.valor)||0) / 100 : (parseFloat(d.valor)||0);
  return Math.min(Math.round(m*100)/100, bruto);
}
function netDe(o){ return Math.max(0, Math.round((orderTotal(o) - descMonto(o))*100)/100); }
function pendienteDe(o){ return Math.max(0, netDe(o) - pagadoDe(o)); }
function estaPagado(o){ return orderTotal(o) > 0 && pendienteDe(o) < 0.005; }
function ventasMetodo(metodo){
  // excluye prácticas y pagos marcados noCaja (ventas de días anteriores cuyo dinero no está en la caja de hoy)
  return state.orders.filter(o=>!o.anulada && !o.practica && !esFantasma(o)).reduce((s,o)=>
    s + pagosDe(o).filter(p=>p.metodo===metodo && !p.noCaja).reduce((a,p)=>a+(p.monto||0),0), 0);
}

function bannerTxt(){
  return store.mode === 'firebase'
    ? '🟢 CONECTADO · sincronizado en tiempo real entre dispositivos'
    : 'MODO LOCAL · sin conexión configurada — los datos viven solo en este dispositivo';
}
function rHeader(title, pill){
  return `<header>
    <button class="back" onclick="go('home')">←</button>
    <h1>${title}</h1><span class="pill">${pill}</span>
  </header>
  <div class="demo-banner">${bannerTxt()}</div>${modoBanner()}`;
}

const VISTAS = {
  mesero:  { fn:"go('mesero')",        cls:'rol-pedidos', t:'PEDIDOS', s:'Vista del mesero: tomar y entregar pedidos' },
  dulces:  { fn:"goCocina('dulces')",  cls:'rol-dulces',  t:'COCINA DULCES', s:'Jugos, cafés, waffles, copas y barra' },
  salados: { fn:"goCocina('salados')", cls:'rol-salados', t:'COCINA SALADOS', s:'Triples, pan cajabambino, hamburguesas, alitas' },
  registro:{ fn:"go('registro')",      cls:'rol-caja',    t:'REGISTRO / CAJA', s:'Comandas del día, totales, pagos y exportación' },
  gestion: { fn:"go('gestion')",       cls:'',            t:'GESTIÓN DEL CAFÉ', s:'Lista de compras, tareas de apertura/cierre y recetas' },
};
function vistasDe(rol){ return (typeof ROL_VISTAS !== 'undefined' && ROL_VISTAS[rol]) || Object.keys(VISTAS); }
function rHome(){
  const botones = vistasDe(user.rol).map(v=>{
    const V = VISTAS[v]; if(!V) return '';
    const style = V.cls ? '' : ' style="background:var(--cafemed)"';
    return `<button class="rolbtn ${V.cls}"${style} onclick="${V.fn}">${V.t}<small>${V.s}</small></button>`;
  }).join('');
  return `<div class="demo-banner">${bannerTxt()}</div>${modoBanner()}<main>
    <div class="home-logo"><div class="circ">Pueblo<small>CAFE BAR</small></div></div>
    <div class="home-sub">Hola, <b>${esc(user.nombre)}</b> · ${esc(user.rol)}</div>
    ${botones}
    <div class="home-note">Los pedidos digitados en PEDIDOS aparecen al instante en la cocina que corresponde.</div>
    <button class="csvbtn" style="background:var(--gris);margin-top:6px" onclick="logout()">Cambiar de usuario</button>
  </main>`;
}
/* ---------- LOGIN POR PIN ---------- */
let pinBuf = '';
function rLogin(){
  const dots = [0,1,2,3].map(i=>`<span style="display:inline-block;width:16px;height:16px;border-radius:50%;margin:0 7px;border:2px solid var(--cafe);background:${i<pinBuf.length?'var(--cafe)':'transparent'}"></span>`).join('');
  const key = d => `<button onclick="pinPress('${d}')" style="width:72px;height:72px;border-radius:50%;border:none;background:var(--blanco);border:1.5px solid #D8CBA4;font-size:26px;font-weight:700;color:var(--cafe)">${d}</button>`;
  return `<div class="demo-banner">${bannerTxt()}</div><main style="text-align:center">
    <div class="home-logo"><div class="circ">Pueblo<small>CAFE BAR</small></div></div>
    <div class="home-sub">Ingresa tu PIN para entrar</div>
    <div style="margin:18px 0">${dots}</div>
    <div style="display:grid;grid-template-columns:repeat(3,72px);gap:14px;justify-content:center">
      ${['1','2','3','4','5','6','7','8','9'].map(key).join('')}
      <span></span>${key('0')}
      <button onclick="pinBack()" style="width:72px;height:72px;border-radius:50%;border:none;background:var(--cremaosc);font-size:22px">⌫</button>
    </div>
  </main>`;
}
function pinPress(d){
  pinBuf += d;
  if(pinBuf.length >= 4){
    const u = (typeof PINS !== 'undefined') ? PINS[pinBuf] : null;
    if(u){ user = u; try{ localStorage.setItem('pc_user', JSON.stringify(u)); }catch(e){}
      pinBuf = ''; view = 'home'; toast('Hola, ' + u.nombre + ' 👋'); }
    else { pinBuf = ''; toast('PIN incorrecto'); }
  }
  render();
}
function pinBack(){ pinBuf = pinBuf.slice(0,-1); render(); }
function logout(){ user = null; pinBuf = ''; try{ localStorage.removeItem('pc_user'); }catch(e){} render(); }

/* ---------- MESERO ---------- */
function rMesero(){
  // bloqueo: sin caja abierta no se atiende (excepto en modo práctica)
  if(!enPractica() && !cajaHoyAbierta()){
    const irCaja = vistasDe(user.rol).includes('registro')
      ? `<button class="rolbtn rol-caja" onclick="go('registro')">Ir a abrir caja</button>` : '';
    return rHeader('Pedidos — Mesero','PEDIDOS') + `<main>
      <div class="latebanner" style="animation:none;background:var(--acento)">🔒 La caja está cerrada</div>
      <div class="empty">Para empezar a atender, primero abre la caja del día.<br>Ve a <b>REGISTRO / CAJA → Abrir caja</b> e ingresa los fondos de efectivo y Yape.</div>
      ${irCaja}
    </main>`;
  }
  const enAgregar = addTargetId !== null;
  const oAdd = enAgregar ? state.orders.find(x=>x.id===addTargetId) : null;
  const visibles = MENU.filter(c=>c.items.some(i=>!i.off));
  const cats = visibles.map(c=>`<button class="${tab===c.cat?'act':''}" onclick="setTab('${esc(c.cat)}')">${esc(c.cat)}</button>`).join('');
  let cat = MENU.find(c=>c.cat===tab);
  if(!cat || !cat.items.some(i=>!i.off)){ cat = visibles[0] || MENU[0]; tab = cat.cat; }
  const prods = cat.items.filter(it=>!it.off).map((it,i)=>{
    const off = noHay(it.n);
    return `<div class="prod${off?' agotado':''}" onclick="pickProd('${esc(it.n)}')">
      <div><div class="nm">${esc(it.n)}${off?' <span class="agottag">AGOTADO</span>':''}</div>${it.d?`<div class="ds">${esc(it.d)}</div>`:''}</div>
      <div class="pr">${money(it.p)}</div>
    </div>`;
  }).join('');
  const cartItems = cart.map((it,i)=>`
    <div class="citem" onclick="openEdit(${i})" style="cursor:pointer">
      <div><b>${it.qty}× ${esc(it.name)}</b> <span style="color:var(--acento)">${money(it.price*it.qty)}</span>
        <div class="det">${esc(modsTxt(it))||'—'} <span style="color:var(--azul)">✎ toca para editar</span></div></div>
      <button class="rm" onclick="event.stopPropagation();rmCart(${i})">✕</button>
    </div>`).join('');
  const tot = cart.reduce((s,it)=>s+it.price*it.qty,0);
  const pend = pendingOrders();
  let encabezado;
  if(enAgregar){
    encabezado = `<div class="latebanner" style="animation:none;background:var(--verde)">➕ Agregando ítems al pedido #${addTargetId} · ${tipoTxt(oAdd)}
        <button class="cls" style="color:#fff;margin:6px 0 0" onclick="cancelAgregar()">Cancelar</button></div>`;
  } else {
    const tabs = `<div class="tabs" style="padding-bottom:6px">
        <button class="${tipo==='mesa'?'act':''}" onclick="setTipo('mesa')">🍽 Para mesa</button>
        <button class="${tipo==='llevar'?'act':''}" onclick="setTipo('llevar')">🥡 Para llevar</button>
      </div>`;
    let sel;
    if(tipo==='llevar'){
      sel = `<div class="fieldrow"><input id="mesa" placeholder="Nombre del cliente" value="${esc(mesa)}" oninput="mesa=this.value"></div>`;
    } else if(mesa){
      sel = `<div class="mesasel">🍽 Mesa: <b>${esc(mesa)}</b> <button class="linklike" onclick="pickMesa('')">cambiar mesa</button></div>`;
    } else {
      sel = `<div class="mesahint">Selecciona una mesa para empezar la comanda:</div>${rMesaSelector()}`;
    }
    encabezado = tabs + sel;
  }
  // sólo se puede tomar la comanda si: se están agregando ítems, es para llevar, o ya hay mesa elegida
  const puedeOrdenar = enAgregar || tipo==='llevar' || !!mesa;
  const accion = enAgregar
    ? `<button class="sendbtn" onclick="agregarItems()">Agregar al pedido #${addTargetId} · ${money(tot)}</button>`
    : `<button class="sendbtn" onclick="sendOrder()">Enviar a cocina · ${money(tot)}</button>`;
  const zonaComanda = puedeOrdenar ? `
    <div class="srchrow">
      <input id="buscar" type="search" placeholder="🔍 Buscar producto (ej. fresa, alitas, mojito…)" value="${esc(query)}" oninput="doSearch(this.value)">
      <button class="clr" onclick="document.getElementById('buscar').value='';doSearch('')">✕</button>
    </div>
    <button class="fctabtn" onclick="openCustom()">➕ Producto fuera de carta</button>
    <div id="srchres">${query.trim()?rResults():''}</div>
    <div id="catwrap" style="${query.trim()?'display:none':''}">
      <div class="tabs">${cats}</div>
      ${prods}
    </div>
    ${cart.length?`<div class="h2s">${enAgregar?'Ítems a agregar':'Comanda en curso'}</div>${cartItems}${accion}`:''}` : '';
  const offList = (state.noDisponible || []).filter(n=>PROD[n]);
  const dispBanner = offList.length ? `<div class="agotbanner">⚠ Hoy NO hay: ${offList.map(esc).join(' · ')}</div>` : '';
  return rHeader('Pedidos — Mesero','PEDIDOS') + `<main>
    ${dispBanner}
    ${encabezado}
    ${zonaComanda}
    ${!enAgregar && pend.length?`<div class="h2s">Pedidos activos</div>${pend.map(rOrdMesero).join('')}`:''}
    </main>
    ${puedeOrdenar && cart.length?`<div class="cartbar"><span>${cart.reduce((s,i)=>s+i.qty,0)} ítem(s) · ${money(tot)}</span><button onclick="${enAgregar?'agregarItems()':'sendOrder()'}">${enAgregar?'AGREGAR':'ENVIAR'}</button></div>`:''}`;
}
function rOrdMesero(o){
  const items = o.items.map(it=>{
    if(it.estado==='anulado'){
      return `<div class="kitem itanulado"><span class="badge b-anulado">ANULADO</span>
        <span class="knm"> ${it.qty}× ${esc(it.name)}</span></div>`;
    }
    let btn = '';
    if(it.estado==='listo'){
      btn = `<div class="chkitem"><input type="checkbox" ${selEntrega.has(it.uid)?'checked':''} onclick="toggleEntrega(${it.uid})"> marcar para entrega conjunta</div>
        <button class="stbtn st-listo" onclick="openChk(${o.id},${it.uid})">Entregar solo este ✓</button>`;
    }
    // anular ítem individual (doble toque, con aviso si ya está en preparación)
    const arm = armAnularItem && armAnularItem.oid===o.id && armAnularItem.uid===it.uid;
    let txtArm = '¿Anular este ítem? Toca de nuevo';
    if(it.estado==='preparando' || it.estado==='listo') txtArm = '⚠ Ya se está preparando — coordina con cocina. ¿Anular igual?';
    const anBtn = `<button class="anularbtn mini ${arm?'armado':''}" onclick="anularItem(${o.id},${it.uid})">${arm?txtArm:'Anular ítem'}</button>`;
    const t = it.tsListo ? ` · salió en ${elapsedMin(o.ts, it.tsListo)} min` : '';
    const late = isLate(o, it) ? ` <span class="late">⏰ RETRASADO</span>` : '';
    return `<div class="kitem"><span class="badge b-${it.estado}">${it.estado.toUpperCase()}</span>${late}<span style="font-size:11px;color:var(--gris)">${t}</span>
      <span class="knm"> ${it.qty}× ${esc(it.name)}</span>
      <div class="kmods">${esc(modsTxt(it))||''}</div>${btn} ${anBtn}</div>`;
  }).join('');
  const listos = o.items.filter(it=>it.estado==='listo');
  const nSel = listos.filter(it=>selEntrega.has(it.uid)).length;
  const allSel = listos.length>0 && nSel===listos.length;
  const armado = armAnular === o.id;
  const col = colorFor(o);
  return `<div class="ordcard" style="border:2.5px solid ${col};border-left:9px solid ${col};background:${col}14">
    <div class="ohead" style="background:${col};color:#fff;margin:-12px -14px 10px;padding:10px 14px;border-radius:6px 6px 0 0;font-size:14.5px">
      <span>#${o.id} · ${tipoTxt(o)} ${practTag(o)}</span><span>${hhmm(o.ts)} · hace ${elapsedMin(o.ts, Date.now())} min</span></div>${items}
    <button class="stbtn st-preparando" style="margin-top:8px;width:100%" onclick="startAgregar(${o.id})">➕ Agregar ítems a este pedido</button>
    ${listos.length>1?`<button class="stbtn ${allSel?'st-pendiente':'st-preparando'}" style="margin-top:8px" onclick="toggleAllListos(${o.id})">${allSel?'Quitar selección':'☑ Seleccionar todos los listos ('+listos.length+')'}</button>`:''}
    ${nSel>1?`<button class="entregarSel" onclick="openChkMulti(${o.id})">Entregar los ${nSel} marcados juntos ✓</button>`:''}
    <button class="anularbtn ${armado?'armado':''}" onclick="anular(${o.id})">${armado?'¿Seguro? Toca de nuevo para anular todo':'Anular pedido completo'}</button></div>`;
}
/* ---------- AGREGAR ÍTEMS A UN PEDIDO ENVIADO ---------- */
function startAgregar(oid){ addTargetId = oid; cart = []; query = ''; tab = MENU[0].cat; toast('Agregando ítems al pedido #'+oid); render(); }
function cancelAgregar(){ addTargetId = null; cart = []; render(); }
function agregarItems(){
  if(!enPractica() && !cajaHoyAbierta()){ toast('Abre la caja primero'); return; }
  if(!cart.length) return;
  const o = state.orders.find(x=>x.id===addTargetId);
  if(!o){ addTargetId = null; render(); return; }
  const base = o.items.reduce((m,i)=>Math.max(m, i.uid), 0);
  cart.forEach((it,k)=> o.items.push({ uid: base+k+1, ...it, estado:'pendiente' }));
  store.saveOrder(o);
  const id = o.id; addTargetId = null; cart = [];
  toast('Ítems agregados al pedido #'+id+' ✓'); render();
}
const PALETA = ['#B5722A','#2E5D7D','#2E7D46','#B03A2E','#742284','#8A6D00','#0E7C7B','#37474F'];
function colorFor(o){
  // rotación por número de comanda: pedidos consecutivos siempre tienen colores distintos
  return PALETA[o.id % PALETA.length];
}
function toggleAllListos(oid){
  const o = state.orders.find(x=>x.id===oid); if(!o) return;
  const listos = o.items.filter(it=>it.estado==='listo');
  const allSel = listos.every(it=>selEntrega.has(it.uid));
  listos.forEach(it=>{ if(allSel) selEntrega.delete(it.uid); else selEntrega.add(it.uid); });
  render();
}
function toggleEntrega(uid){
  if(selEntrega.has(uid)) selEntrega.delete(uid); else selEntrega.add(uid);
  render();
}
function anularItem(oid, uid){
  const key = {oid, uid};
  if(!(armAnularItem && armAnularItem.oid===oid && armAnularItem.uid===uid)){
    armAnularItem = key; render();
    setTimeout(()=>{ if(armAnularItem && armAnularItem.oid===oid && armAnularItem.uid===uid){ armAnularItem=null; render(); } }, 4000);
    return;
  }
  const o = state.orders.find(x=>x.id===oid); if(!o) return;
  const it = o.items.find(i=>i.uid===uid); if(!it) return;
  it.estado = 'anulado'; selEntrega.delete(uid);
  if(o.items.every(i=>i.estado==='anulado')) o.anulada = true;
  armAnularItem = null; store.saveOrder(o); toast('Ítem anulado' + (o.anulada?' — pedido completo anulado':'')); render();
}
function tipoTxt(o){
  return (o.tipo==='llevar'?'🥡 LLEVAR · ':'') + esc(o.mesa||'—');
}
function practTag(o){ return o.practica ? `<span class="practag">🧪 PRÁCTICA</span>` : ''; }
function setTipo(t){ tipo = t; mesa = ''; render(); }
/* ---------- SELECCIÓN DE MESA ---------- */
function ordersDeMesa(nombre){
  return state.orders.filter(o=>!o.anulada && !esFantasma(o) && o.tipo==='mesa' && o.mesa===nombre);
}
function mesaOcupada(nombre){
  // ocupada = tiene un pedido sin saldar o con ítems aún no entregados
  return ordersDeMesa(nombre).some(o=>
    pendienteDe(o) > 0.005 || o.items.some(i=>i.estado!=='entregado' && i.estado!=='anulado'));
}
let mesaModal = null;   // aviso de mesa ocupada {mesa}
function pickMesa(m){
  // si la mesa tiene cuentas abiertas, preguntar antes de crear otra comanda
  const abiertas = cuentasAbiertasDe(m);
  if(abiertas.length){ mesaModal = { mesa: m }; render(); return; }
  mesa = m; render();
}
function cuentasAbiertasDe(nombre){
  return ordersDeMesa(nombre).filter(o=>
    pendienteDe(o) > 0.005 || o.items.some(i=>i.estado!=='entregado' && i.estado!=='anulado'));
}
function mesaNueva(m){ mesaModal = null; mesa = m; render(); }
function rMesaModal(){
  const m = mesaModal.mesa;
  const abiertas = cuentasAbiertasDe(m);
  if(!abiertas.length){ mesaModal = null; return ''; }
  const rows = abiertas.map(o=>`
    <button class="stbtn st-preparando" style="width:100%;margin:4px 0;text-align:left" onclick="mesaModal=null;startAgregar(${o.id})">
      ➕ Agregar a la cuenta #${o.id} · ${money(orderTotal(o))} · hace ${elapsedMin(o.ts, Date.now())} min
    </button>`).join('');
  return `<div class="ovl" onclick="if(event.target===this){mesaModal=null;render()}"><div class="modal">
    <h3>⚠ ${esc(m)} tiene cuenta abierta</h3>
    <div class="mp" style="font-size:12.5px;color:var(--cafemed);font-weight:400">Para no partir la cuenta en varias comandas, lo normal es <b>agregar</b> a la que ya existe. Crea una nueva solo si es otro grupo distinto en la misma mesa.</div>
    ${rows}
    <button class="splitbtn" style="background:var(--cafemed)" onclick="mesaNueva('${esc(m)}')">🆕 Crear cuenta NUEVA (otro grupo)</button>
    <button class="cls" onclick="mesaModal=null;render()">Cancelar</button>
  </div></div>`;
}
function rMesaSelector(){
  const btns = mesasList.map(m=>{
    const occ = mesaOcupada(m), sel = mesa===m;
    return `<button class="mesabtn ${sel?'sel':''} ${occ?'occ':'free'}" onclick="pickMesa('${esc(m)}')">
      ${esc(m)}<small>${occ?'● ocupada':'○ libre'}</small></button>`;
  }).join('');
  return `<div class="mesagrid">${btns}</div>`;
}

/* ---------- BUSCADOR ---------- */
const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function doSearch(q){
  query = q;
  const w = document.getElementById('catwrap'), r = document.getElementById('srchres');
  if(!w || !r) return;
  if(q.trim()){ w.style.display = 'none'; r.innerHTML = rResults(); }
  else { w.style.display = ''; r.innerHTML = ''; }
}
function rResults(){
  const toks = norm(query).split(/\s+/).filter(Boolean);
  const scored = [];
  MENU.forEach(c => c.items.forEach(it => {
    if(it.off) return;                         // retirados de la carta no aparecen
    const nm = norm(it.n), cat = norm(c.cat), ds = norm(it.d || '');
    let score = 0;
    for(const t of toks){
      if(nm.startsWith(t)) score += 4;
      else if(nm.split(' ').some(w => w.startsWith(t))) score += 3;
      else if(nm.includes(t)) score += 2;
      else if(cat.includes(t) || ds.includes(t)) score += 1;
      else { score = -1; break; }   // cada palabra debe coincidir en algo
    }
    if(score > 0) scored.push({it, score});
  }));
  scored.sort((a,b) => b.score - a.score);
  if(!scored.length) return `<div class="empty">Sin resultados para “${esc(query)}”.<br>Prueba con otra palabra (ej. fresa, alitas, café…)</div>`;
  return scored.slice(0, 20).map(({it}) => {
    const off = noHay(it.n);
    return `<div class="prod${off?' agotado':''}" onclick="pickProd('${esc(it.n)}')">
      <div><div class="nm">${esc(it.n)}${off?' <span class="agottag">AGOTADO</span>':''}<span class="srchtag">${esc(it.cat)}</span></div>${it.d?`<div class="ds">${esc(it.d)}</div>`:''}</div>
      <div class="pr">${money(it.p)}</div>
    </div>`;
  }).join('');
}
function anular(id){
  if(armAnular !== id){ armAnular = id; render(); setTimeout(()=>{ if(armAnular===id){armAnular=null; render();} }, 3500); return; }
  const o = state.orders.find(x=>x.id===id);
  if(o){ o.anulada = true; o.items.forEach(it=>{ if(it.estado!=='entregado') it.estado='anulado'; }); store.saveOrder(o); }
  armAnular = null; toast('Pedido #'+id+' anulado'); render();
}

/* ---------- MODAL PRODUCTO ---------- */
/* ---------- DISPONIBILIDAD (productos agotados hoy) ---------- */
function noHay(name){ return (state.noDisponible || []).includes(name); }
function pickProd(name){
  if(noHay(name)){ toast('“' + name + '” está marcado como AGOTADO hoy'); return; }
  openItem(name);
}
function openItem(name){
  const it = PROD[name];
  const sel = {};
  (it.mods||[]).forEach(g=>{ sel[g] = GRUPOS[g].multi ? [] : (GRUPOS[g].def || GRUPOS[g].opts[0]); });
  modal = {item:it, qty:1, sel, notas:'', editIdx:null};
  render();
}
function openEdit(i){
  const c = cart[i];
  modal = {item:PROD[c.name], qty:c.qty, sel:JSON.parse(JSON.stringify(c.mods)), notas:c.notas, editIdx:i};
  render();
}
function splitCart(){
  const i = modal.editIdx, c = cart[i], q = modal.qty;
  const unidades = [];
  for(let k=0;k<q;k++) unidades.push({...c, qty:1, mods:JSON.parse(JSON.stringify(modal.sel)), notas:modal.notas.trim()});
  cart.splice(i, 1, ...unidades);
  modal = null; toast('Separado en '+q+' unidades — edita cada una'); render();
}
function rModal(){
  const m = modal, it = m.item;
  const grps = (it.mods||[]).map(g=>{
    const G = GRUPOS[g];
    const btns = G.opts.map(o=>{
      const on = G.multi ? m.sel[g].includes(o) : m.sel[g]===o;
      return `<button class="${on?'sel':''}" onclick="pick('${g}','${esc(o)}')">${esc(o)}</button>`;
    }).join('');
    return `<div class="grp"><div class="gl">${esc(G.label)}</div><div class="opts">${btns}</div></div>`;
  }).join('');
  return `<div class="ovl" onclick="if(event.target===this){modal=null;render()}"><div class="modal">
    <h3>${esc(it.n)}</h3><div class="mp">${money(it.p)} · ${esc(it.cat)}</div>
    ${grps}
    <div class="grp"><div class="gl">Cantidad</div><div class="qty">
      <button onclick="modal.qty=Math.max(1,modal.qty-1);render()">−</button><span>${m.qty}</span>
      <button onclick="modal.qty++;render()">+</button></div></div>
    <div class="grp"><div class="gl">${it.reqNote?'¿Cuál es? (obligatorio)':'Notas (alergias, sin cebolla, etc.)'}</div>
      <textarea oninput="modal.notas=this.value" placeholder="${it.reqNote?'Ej. Tres leches, Torta de zanahoria':''}">${esc(m.notas)}</textarea></div>
    <button class="add" onclick="addCart()">${m.editIdx!==null?'Guardar cambios':'Agregar a la comanda'} · ${money(it.p*m.qty)}</button>
    ${m.editIdx!==null && m.qty>1?`<button class="splitbtn" onclick="splitCart()">Separar en ${m.qty} unidades (para variar cada una)</button>`:''}
    <button class="cls" onclick="modal=null;render()">Cancelar</button>
  </div></div>`;
}
function pick(g, o){
  const G = GRUPOS[g];
  if(G.multi){
    const a = modal.sel[g], i = a.indexOf(o);
    if(i>=0) a.splice(i,1); else { if(a.length>=G.multi) a.shift(); a.push(o); }
  } else modal.sel[g] = o;
  render();
}
function addCart(){
  const m = modal, it = m.item;
  for(const g of (it.mods||[])){
    const G = GRUPOS[g];
    if(G.multi && !G.opcional && m.sel[g].length < 1){ toast('Elige al menos una opción en: ' + G.label); return; }
  }
  if(it.reqNote && !m.notas.trim()){ toast('Escribe cuál es (ej. Tres leches)'); return; }
  const linea = {name:it.n, price:it.p, station:it.station, cat:it.cat, qty:m.qty, mods:m.sel, notas:m.notas.trim()};
  if(m.editIdx !== null) cart[m.editIdx] = linea; else cart.push(linea);
  modal = null; render();
}
function rmCart(i){ cart.splice(i,1); render(); }
function setTab(c){ tab = c; render(); }

/* ---------- PRODUCTO FUERA DE CARTA ---------- */
function openCustom(){ customModal = { desc:'', precio:'', qty:1, station:'salados', notas:'' }; render(); }
function rCustom(){
  const m = customModal;
  return `<div class="ovl" onclick="if(event.target===this){customModal=null;render()}"><div class="modal">
    <h3>➕ Producto fuera de carta</h3>
    <div class="mp" style="font-size:12px;color:var(--gris);font-weight:400">Para algo que no está en la carta pero sí se puede vender (ej. una porción de papas).</div>
    <div class="grp"><div class="gl">Descripción</div>
      <input id="cDesc" placeholder="Ej. Porción de papas fritas" value="${esc(m.desc)}" oninput="customModal.desc=this.value"></div>
    <div class="grp"><div class="gl">Precio (S/)</div>
      <input id="cPrecio" type="number" inputmode="decimal" placeholder="Ej. 8" value="${m.precio}" oninput="customModal.precio=this.value"></div>
    <div class="grp"><div class="gl">¿A qué cocina va?</div>
      <div class="opts">
        <button class="${m.station==='salados'?'sel':''}" onclick="customModal.station='salados';render()">🍟 Salados</button>
        <button class="${m.station==='dulces'?'sel':''}" onclick="customModal.station='dulces';render()">🍰 Dulces / barra</button>
      </div></div>
    <div class="grp"><div class="gl">Cantidad</div><div class="qty">
      <button onclick="customModal.qty=Math.max(1,customModal.qty-1);render()">−</button><span>${m.qty}</span>
      <button onclick="customModal.qty++;render()">+</button></div></div>
    <div class="grp"><div class="gl">Notas (opcional)</div>
      <textarea oninput="customModal.notas=this.value" placeholder="Ej. sin sal, con mayonesa aparte">${esc(m.notas)}</textarea></div>
    <button class="add" onclick="addCustom()">Agregar a la comanda${(parseFloat(m.precio)>0)?' · '+money(Math.round(parseFloat(m.precio)*100)/100*m.qty):''}</button>
    <button class="cls" onclick="customModal=null;render()">Cancelar</button>
  </div></div>`;
}
function addCustom(){
  const m = customModal;
  const desc = (m.desc || '').trim();
  const precio = parseFloat(m.precio);
  if(!desc){ toast('Escribe la descripción del producto'); return; }
  if(isNaN(precio) || precio <= 0){ toast('Ingresa un precio válido (mayor a 0)'); return; }
  cart.push({ name: desc, price: Math.round(precio*100)/100, station: m.station, cat:'Fuera de carta',
    qty: m.qty, mods:{}, notas:(m.notas || '').trim(), fueraCarta:true });
  customModal = null; toast('Producto fuera de carta agregado ✓'); render();
}

let _sending = false;   // candado: evita crear comandas duplicadas/vacías por doble toque o lag
async function sendOrder(){
  if(!enPractica() && !cajaHoyAbierta()){ toast('Abre la caja primero para atender'); return; }
  if(_sending) return;                     // ya hay un envío en curso: ignora toques extra
  if(!cart.length) return;
  _sending = true;
  // capturar la comanda ANTES de la espera de red; así, aunque llegue otro toque,
  // no se puede crear una comanda vacía ni perder la actual
  const cartSnap = cart.slice();
  const mesaSnap = mesa.trim(), tipoSnap = tipo, practicaSnap = enPractica();
  cart = []; mesa = ''; tipo = 'mesa';     // limpia la UI de inmediato
  render();
  try{
    const id = await store.nextOrderId();
    const o = { id, mesa: mesaSnap, tipo: tipoSnap, ts: Date.now(),
      mesero: user ? user.nombre : '', practica: practicaSnap,
      items: cartSnap.map((it,i)=>({uid:i+1, ...it, estado:'pendiente'})) };
    store.saveOrder(o);
    toast('Comanda #' + o.id + ' enviada a cocina ✓');
  }catch(e){
    // si falla la red, devolver la comanda al carrito para no perderla
    cart = cartSnap; mesa = mesaSnap; tipo = tipoSnap;
    toast('No se pudo enviar la comanda, reintenta');
  }finally{
    _sending = false;
    render();
  }
}
function pendingOrders(){
  return state.orders.filter(o=>!o.anulada && !esFantasma(o) && o.items.some(it=>it.estado!=='entregado')).slice().reverse();
}

/* ---------- COCINA ---------- */
function goCocina(st){ station = st; view = 'cocina'; render(); }
function rCocina(){
  const name = station==='dulces' ? 'Cocina Dulces · Jugos · Barra' : 'Cocina Salados';
  const activo = it => it.estado!=='entregado' && it.estado!=='anulado';
  const ords = state.orders.filter(o=>!o.anulada && !esFantasma(o) && o.items.some(it=>it.station===station && activo(it)));
  // sugerencia de lotes: agrupar ítems pendientes/preparando del mismo producto
  const act = [];
  ords.forEach(o=>o.items.forEach(it=>{ if(it.station===station && (it.estado==='pendiente'||it.estado==='preparando')) act.push({o,it}); }));
  const byProd = {};
  act.forEach(x=>{ (byProd[x.it.name] = byProd[x.it.name]||[]).push(x); });
  let lotes = '';
  for(const nm in byProd){
    const xs = byProd[nm];
    const totQ = xs.reduce((s,x)=>s+x.it.qty,0);
    if(totQ>1 && /^(Jugo|Batido)/.test(nm)){
      const vars = xs.map(x=>`${x.it.qty}× ${modsTxt(x.it)||'estándar'} (#${x.o.id})`).join(' · ');
      lotes += `<div class="lote">💡 <b>Sugerencia de lote — ${totQ}× ${esc(nm)}:</b> licúa toda la base junta, sin azúcar ni hielo. Sirve primero los calientes y “al tiempo”; al resto añade hielo y vuelve a licuar; endulza al final vaso por vaso según cada pedido.<br><span style="font-size:12px">${esc(vars)}</span></div>`;
    }
  }
  const cards = ords.map(o=>{
    const items = o.items.filter(it=>it.station===station && activo(it)).map(it=>{
      let btn='';
      if(it.estado==='pendiente') btn = `<button class="stbtn st-pendiente" onclick="setEstado(${o.id},${it.uid},'preparando')">Empezar ▶</button>`;
      else if(it.estado==='preparando') btn = `<button class="stbtn st-preparando" onclick="setEstado(${o.id},${it.uid},'listo')">Marcar listo ✓</button>`;
      else btn = `<span class="badge b-listo">LISTO en ${elapsedMin(o.ts, it.tsListo)} min — esperando entrega</span>`;
      const rec = recetaFor(it.name);
      const recBtn = rec ? `<button class="stbtn" style="background:var(--cafemed)" onclick="verReceta('${esc(it.name)}')">📖 Ver receta</button>` : '';
      const late = isLate(o, it) ? `<span class="late">⏰ PEDIDO RETRASADO · ${elapsedMin(o.ts, Date.now())} min</span> ` : '';
      return `<div class="kitem">${late}<div class="knm">${it.qty}× ${esc(it.name)}${it.fueraCarta?' <span class="fctatag">fuera de carta</span>':''}</div>
        <div class="kmods">${esc(modsTxt(it))||'Sin modificadores'}</div>${btn}${recBtn}</div>`;
    }).join('');
    if(!items) return '';
    const espera = elapsedMin(o.ts, Date.now());
    return `<div class="ordcard ${station}"><div class="ohead"><span>#${o.id} · ${tipoTxt(o)} ${practTag(o)}</span><span>${hhmm(o.ts)} · hace ${espera} min</span></div>${items}</div>`;
  }).join('');
  // banner de retrasados: ítems rápidos con más de 10 min sin estar listos
  let nLate = 0;
  ords.forEach(o=>o.items.forEach(it=>{ if(it.station===station && isLate(o, it)) nLate++; }));
  const lateBanner = nLate ? `<div class="latebanner">⏰ ¡${nLate} pedido(s) rápido(s) retrasado(s)! Pasaron más de ${LATE_MIN} minutos.</div>` : '';
  const cronosHtml = station === 'salados' ? rCronos() : '';
  return rHeader(name, station.toUpperCase()) + `<main>
    ${cronosHtml}
    ${lateBanner}
    ${lotes}
    ${cards || `<div class="empty">No hay pedidos en cola.<br>Los pedidos que el mesero digite para esta cocina aparecerán aquí.</div>`}
  </main>`;
}
/* ---------- CRONÓMETROS DE COCCIÓN (locales al dispositivo, cuentan hacia arriba) ---------- */
let cronos = [
  { nombre:'Alitas', run:false, base:0, t0:0 },
  { nombre:'Papas fritas', run:false, base:0, t0:0 },
  { nombre:'Panini', run:false, base:0, t0:0 },
];
function cronoMs(c){ return c.base + (c.run ? Date.now() - c.t0 : 0); }
function fmtCrono(ms){ const s = Math.floor(ms/1000); return String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0'); }
function cronoToggle(i){ const c = cronos[i]; if(c.run){ c.base = cronoMs(c); c.run = false; } else { c.t0 = Date.now(); c.run = true; } render(); }
function cronoReset(i){ const c = cronos[i]; c.run = false; c.base = 0; c.t0 = 0; render(); }
function cronoName(i, v){ cronos[i].nombre = v; }   // sin render para no perder el foco del input
function rCronos(){
  const cards = cronos.map((c,i)=>`
    <div class="cronocard ${c.run?'run':''}">
      <input class="cronon" value="${esc(c.nombre)}" oninput="cronoName(${i},this.value)">
      <div class="cronot" id="cronot${i}">${fmtCrono(cronoMs(c))}</div>
      <div class="cronobtns">
        <button class="stbtn ${c.run?'st-preparando':'st-listo'}" onclick="cronoToggle(${i})">${c.run?'⏸ Pausar':'▶ Iniciar'}</button>
        <button class="stbtn" style="background:var(--cafemed)" onclick="cronoReset(${i})">↺ Reiniciar</button>
      </div>
    </div>`).join('');
  return `<div class="h2s">⏱ Cronómetros de cocción</div><div class="cronowrap">${cards}</div>`;
}
function setEstado(oid, uid, st){
  const o = state.orders.find(o=>o.id===oid); if(!o) return;
  const it = o.items.find(i=>i.uid===uid); if(!it) return;
  it.estado = st;
  if(st === 'listo') it.tsListo = Date.now();
  store.saveOrder(o); render();
}
function elapsedMin(a, b){ return Math.max(0, Math.round(((b||Date.now()) - a) / 60000)); }
function recetaFor(nombre){
  return state.recetas.find(r => norm(r.nombre) === norm(nombre)) || null;
}
function verReceta(nombre){ const r = recetaFor(nombre); if(r){ recetaModal = r; render(); } }
function rRecetaModal(){
  const r = recetaModal;
  return `<div class="ovl" onclick="if(event.target===this){recetaModal=null;render()}"><div class="modal">
    <h3>📖 ${esc(r.nombre)}</h3>
    <div class="mp" style="font-size:12px;color:var(--gris);font-weight:400">Receta de Gestión del Café → Recetas</div>
    <div style="background:var(--crema);border-radius:12px;padding:14px;font-size:16px;line-height:1.7;white-space:pre-wrap">${esc(r.texto)}</div>
    <button class="cls" onclick="recetaModal=null;render()">Cerrar</button>
  </div></div>`;
}
function salioEn(o){
  const ts = o.items.filter(i=>i.tsListo).map(i=>i.tsListo);
  return ts.length ? elapsedMin(o.ts, Math.max(...ts)) : null;
}
function orderTotal(o){
  return o.items.filter(i=>i.estado!=='anulado').reduce((s,i)=>s+i.price*i.qty,0);
}
function setPago(oid, metodo){
  const o = state.orders.find(x=>x.id===oid); if(!o) return;
  const pend = pendienteDe(o);
  if(pend <= 0.005){ toast('La cuenta ya está saldada'); return; }
  o.pagos = pagosDe(o).slice();
  o.pagos.push({ monto: Math.round(pend*100)/100, metodo });
  delete o.pago;
  store.saveOrder(o); toast('Pago registrado: ' + money(pend) + ' ' + (metodo==='yape'?'Yape':'Efectivo')); render();
}

/* ---------- APERTURA / CIERRE DE CAJA ---------- */
function abrirCaja(){
  const ef = parseFloat((document.getElementById('cajaEf')||{}).value);
  const ya = parseFloat((document.getElementById('cajaYa')||{}).value);
  if(isNaN(ef) || isNaN(ya)){ toast('Ingresa ambos fondos: efectivo y Yape'); return; }
  store.saveCaja({ fecha: dayKey(), estado:'abierta', fondoEfectivo:ef, fondoYape:ya,
    aperturaTs: Date.now(), aperturaPor: user?user.nombre:'', efectivoContado:null, yapeContado:null, cierreTs:null, cierrePor:'' });
  cierreMode = false; toast('Caja abierta ✓'); render();
}
function cerrarCaja(){
  const ef = parseFloat((document.getElementById('cierreEf')||{}).value);
  const ya = parseFloat((document.getElementById('cierreYa')||{}).value);
  if(isNaN(ef) || isNaN(ya)){ toast('Ingresa el efectivo y el Yape contados'); return; }
  store.saveCaja({ ...state.caja, estado:'cerrada', efectivoContado:ef, yapeContado:ya, cierreTs: Date.now(), cierrePor: user?user.nombre:'' });
  cierreMode = false; toast('Caja cerrada ✓'); render();
}
function reabrirCaja(){ store.saveCaja({ ...state.caja, estado:'abierta' }); toast('Caja reabierta'); render(); }
function rCaja(){
  const c = state.caja, hoy = dayKey();
  const vef = ventasMetodo('efectivo'), vya = ventasMetodo('yape');
  const dtxt = d => Math.abs(d) < 0.005 ? 'cuadra ✓' : (d > 0 ? 'sobra ' + money(d) : 'falta ' + money(-d));
  if(c && c.estado==='abierta' && c.fecha===hoy){
    const espEf = c.fondoEfectivo + vef, espYa = c.fondoYape + vya;
    if(!cierreMode){
      return `<div class="cajabox abierta">
        <div class="cajah">🟢 Caja abierta</div>
        <div class="cajarow"><span>Fondo inicial</span><span>💵 ${money(c.fondoEfectivo)} · 📱 ${money(c.fondoYape)}</span></div>
        <div class="cajarow"><span>Ventas hasta ahora</span><span>💵 ${money(vef)} · 📱 ${money(vya)}</span></div>
        <div class="cajarow" style="font-weight:800"><span>Esperado en caja</span><span>💵 ${money(espEf)} · 📱 ${money(espYa)}</span></div>
        <div style="font-size:11px;color:var(--gris);margin-top:4px">Abrió ${esc(c.aperturaPor)||'—'} · ${hhmm(c.aperturaTs)}</div>
        <button class="csvbtn" style="background:var(--rojo);margin-top:8px" onclick="cierreMode=true;render()">Cerrar caja</button>
      </div>`;
    }
    return `<div class="cajabox abierta">
      <div class="cajah">Cierre de caja</div>
      <div style="font-size:12px;color:var(--cafemed);margin-bottom:6px">Cuenta el dinero real y regístralo:</div>
      <div class="fieldrow"><input id="cierreEf" type="number" inputmode="decimal" placeholder="Efectivo contado (S/)"></div>
      <div class="fieldrow"><input id="cierreYa" type="number" inputmode="decimal" placeholder="Yape contado (S/)"></div>
      <div class="cajarow"><span>Esperado</span><span>💵 ${money(espEf)} · 📱 ${money(espYa)}</span></div>
      <button class="sendbtn" onclick="cerrarCaja()">Confirmar cierre</button>
      <button class="cls" onclick="cierreMode=false;render()">Cancelar</button>
    </div>`;
  }
  if(c && c.estado==='cerrada' && c.fecha===hoy){
    const espEf = c.fondoEfectivo + vef, espYa = c.fondoYape + vya;
    return `<div class="cajabox cerrada">
      <div class="cajah">🔒 Caja cerrada hoy</div>
      <div class="cajarow"><span>Efectivo</span><span>esp. ${money(espEf)} · cont. ${money(c.efectivoContado)} · <b>${dtxt((c.efectivoContado||0)-espEf)}</b></span></div>
      <div class="cajarow"><span>Yape</span><span>esp. ${money(espYa)} · cont. ${money(c.yapeContado)} · <b>${dtxt((c.yapeContado||0)-espYa)}</b></span></div>
      <div style="font-size:11px;color:var(--gris);margin-top:4px">Cerró ${esc(c.cierrePor)||'—'} · ${hhmm(c.cierreTs)}</div>
      <button class="csvbtn" style="background:var(--cafemed);margin-top:8px" onclick="reabrirCaja()">Reabrir caja (pruebas)</button>
    </div>`;
  }
  return `<div class="cajabox">
    <div class="cajah">Abrir caja del día</div>
    <div style="font-size:12px;color:var(--cafemed);margin-bottom:6px">Registra los fondos con los que arrancas. Sin caja abierta no se pueden tomar pedidos.</div>
    <div class="fieldrow"><input id="cajaEf" type="number" inputmode="decimal" placeholder="Fondo efectivo (S/)"></div>
    <div class="fieldrow"><input id="cajaYa" type="number" inputmode="decimal" placeholder="Saldo inicial Yape (S/)"></div>
    <button class="sendbtn" onclick="abrirCaja()">Abrir caja</button>
  </div>`;
}

/* ---------- CHECKLIST DE ENTREGA ---------- */
function openChk(oid, uid){ chkModal = {oid, uids:[uid]}; render(); }
function openChkMulti(oid){
  const o = state.orders.find(x=>x.id===oid); if(!o) return;
  const uids = o.items.filter(it=>it.estado==='listo' && selEntrega.has(it.uid)).map(it=>it.uid);
  if(!uids.length) return;
  chkModal = {oid, uids}; render();
}
function rChk(){
  const o = state.orders.find(o=>o.id===chkModal.oid);
  const its = o.items.filter(i=>chkModal.uids.includes(i.uid));
  // acompañamientos combinados, sin repetir
  const set = new Set();
  its.forEach(it=>{ (PROD[it.name] ? PROD[it.name].acomp : ['Servilletas']).forEach(a=>set.add(a)); });
  if(o.tipo === 'llevar') set.add('Envase / bolsa para llevar');
  const list = [...set].map((a,i)=>`<label><input type="checkbox" id="chk${i}"> ${esc(a)}</label>`).join('');
  const nombres = its.map(it=>`${it.qty}× ${esc(it.name)}`).join('  ·  ');
  return `<div class="ovl" onclick="if(event.target===this){chkModal=null;render()}"><div class="modal">
    <h3>Antes de entregar…</h3>
    <div class="mp">${nombres}</div>
    <div style="font-size:12.5px;color:var(--cafemed);margin-bottom:8px">${esc(o.mesa||'#'+o.id)}${its.length>1?` · entrega conjunta de ${its.length} ítems`:''}</div>
    <div style="font-size:13px;color:var(--cafemed);margin-bottom:10px">Confirma que llevas todo lo que acompaña ${its.length>1?'estos pedidos':'este pedido'}:</div>
    <div class="chk">${list}</div>
    <button class="add" onclick="deliver()">Entregado${its.length>1?' (los '+its.length+')':''} ✓</button>
    <button class="cls" onclick="chkModal=null;render()">Volver</button>
  </div></div>`;
}
function deliver(){
  const o = state.orders.find(o=>o.id===chkModal.oid);
  o.items.forEach(it=>{
    if(chkModal.uids.includes(it.uid)){ it.estado = 'entregado'; it.tsEnt = Date.now(); selEntrega.delete(it.uid); }
  });
  chkModal = null; store.saveOrder(o); render();
}

/* ---------- REGISTRO / CAJA ---------- */
function rRegistro(){
  const os = state.orders.filter(o=>!esFantasma(o)).slice().reverse();
  const validas = state.orders.filter(o=>!o.anulada && !o.practica && !esFantasma(o));   // ventas reales
  const nPract = state.orders.filter(o=>o.practica && !o.anulada && !esFantasma(o)).length;
  const tot = validas.reduce((s,o)=>s+netDe(o),0);
  const totEf = ventasMetodo('efectivo'), totYa = ventasMetodo('yape');
  const sinPago = tot - totEf - totYa;
  const cards = os.map(o=>{
    const t = netDe(o);
    const done = o.items.every(i=>i.estado==='entregado' || i.estado==='anulado');
    const badge = o.anulada ? '<span class="badge b-anulado" style="float:right">ANULADA</span>'
      : `<span class="badge ${done?'b-entregado':'b-pendiente'}" style="float:right">${done?'ENTREGADA':'ACTIVA'}</span>`;
    let pagoBadge = '';
    if(!o.anulada){
      const metodos = [...new Set(pagosDe(o).map(p=>p.metodo))];
      if(estaPagado(o)){
        const lbl = metodos.length>1 ? '💵/📱 DIVIDIDA' : (metodos[0]==='yape' ? '📱 YAPE' : '💵 EFECTIVO');
        pagoBadge = `<span class="badge b-${metodos.length>1?'entregado':metodos[0]}" style="float:right;margin-right:6px">${lbl}</span>`;
      } else if(pagadoDe(o) > 0){
        pagoBadge = `<span class="badge b-pendiente" style="float:right;margin-right:6px">PARCIAL ${money(pagadoDe(o))}/${money(t)}</span>`;
      }
    }
    const sal = salioEn(o);
    const anulados = o.items.filter(i=>i.estado==='anulado').length;
    const manTag = (o.manual ? '<span class="badge b-manualtag">✏️ MANUAL</span>' : (o.editado ? '<span class="badge b-manualtag">✏️ EDITADA</span>' : ''))
      + (o.descuento ? ' <span class="badge" style="background:#B5722A">🏷 DESC −'+money(descMonto(o))+'</span>' : '');
    return `<div class="regcard${o.practica?' practcard':''}"><b>#${o.id}</b> · ${tipoTxt(o)} ${practTag(o)}${manTag}${o.mesero?' · '+esc(o.mesero):''} · ${new Date(o.ts).toLocaleDateString()} ${hhmm(o.ts)}
      ${badge}${pagoBadge}<br>
      <span style="color:var(--cafemed)">${o.items.map(i=>(i.estado==='anulado'?'<s>':'')+i.qty+'× '+esc(i.name)+(i.estado==='anulado'?'</s>':'')).join(', ')}</span>
      ${anulados && !o.anulada?`<div style="font-size:11.5px;color:var(--rojo)">${anulados} ítem(s) anulado(s), descontado(s) del total</div>`:''}
      ${sal!==null && !o.anulada ? `<div style="font-size:12px;color:var(--verde);font-weight:700">⏱ Salió en ${sal} min</div>`:''}
      <div style="font-weight:800;color:var(--acento);margin-top:4px">${money(t)}
        ${!o.anulada?`<button class="stbtn st-preparando" style="float:right" onclick="cuentaId=${o.id};render()">Ver cuenta 🧾</button>`:''}
      </div></div>`;
  }).join('');
  const anuladas = state.orders.filter(o=>o.anulada).length;
  const nHist = (state.historial||[]).length;
  // control de modo (solo admin)
  const modoCtrl = esAdmin()
    ? `<div class="modoctrl">
        <div class="modoc-t">Modo de trabajo: <b>${enPractica()?'🧪 PRÁCTICA':'✅ PEDIDOS REALES'}</b></div>
        ${enPractica()
          ? `<button class="stbtn st-listo" onclick="setModo('real')">Volver a pedidos reales</button>`
          : `<button class="stbtn" style="background:var(--cafemed)" onclick="setModo('practica')">🧪 Activar modo práctica (entrenamiento)</button>`}
        <div class="modoc-h">En modo práctica los pedidos llegan a la cocina para entrenar, pero no cuentan como ventas ni en la caja.</div>
      </div>`
    : (enPractica()?`<div class="modoc-h" style="text-align:center;margin:6px 0">🧪 Modo práctica activo (lo cambia el administrador).</div>`:'');
  return rHeader('Registro del día','CAJA') + `<main>
    ${rCaja()}
    ${modoCtrl}
    ${esAdmin()?`<button class="csvbtn" style="background:#0E7C7B" onclick="openVentaManual()">✏️ Registrar venta manual (olvido / falla del sistema)</button>`:''}
    <div class="regtot"><span>${validas.length} venta(s)${anuladas?` · ${anuladas} anulada(s)`:''}${nPract?` · ${nPract} práctica`:''}</span><span>Total: ${money(tot)}</span></div>
    ${tot>0?`<div class="regtot" style="background:var(--cafemed);font-size:13px"><span>💵 Efectivo: ${money(totEf)}</span><span>📱 Yape: ${money(totYa)}</span><span>Sin cobrar: ${money(sinPago)}</span></div>`:''}
    ${cards || '<div class="empty">Aún no hay comandas registradas.</div>'}
    ${state.orders.length?`<button class="csvbtn" onclick="csv()">Descargar CSV para cuadre</button>`:''}
    ${nHist?`<button class="csvbtn" style="background:var(--cafemed)" onclick="go('historial')">📅 Ver historial de días archivados</button>`:''}
    ${esAdmin() && nPract?`<button class="csvbtn" style="background:${armBorrarP?'#7a1f14':'var(--rojo)'}" onclick="borrarPractica()">${armBorrarP?'¿Seguro? Toca de nuevo — borrar SOLO prácticas':'🧪 Borrar pedidos de práctica ('+nPract+')'}</button>`:''}
    ${esAdmin() && validas.length?`<button class="csvbtn" style="background:${armArchivar?'#7a1f14':'var(--acento)'}" onclick="archivarDia()">${armArchivar?'¿Seguro? Toca de nuevo — archivar y empezar limpio':'📦 Cerrar y archivar el día'}</button>`:''}
  </main>`;
}
function borrarPractica(){
  if(!esAdmin()){ toast('Solo el administrador'); return; }
  if(!armBorrarP){ armBorrarP = true; render(); setTimeout(()=>{ if(armBorrarP){armBorrarP=false; render();} }, 3500); return; }
  selEntrega.clear();
  armBorrarP = false; store.deletePractica(); toast('Pedidos de práctica borrados ✓'); render();
}
function archivarDia(){
  if(!esAdmin()){ toast('Solo el administrador'); return; }
  if(!armArchivar){ armArchivar = true; render(); setTimeout(()=>{ if(armArchivar){armArchivar=false; render();} }, 3500); return; }
  selEntrega.clear();
  armArchivar = false; store.archivarDia(); toast('Día archivado — se guardó en el historial ✓'); render();
}
function csvHistorial(){ csvDe(state.historial || [], 'historial_pueblo_cafe.csv'); }

/* ---------- HISTORIAL DE DÍAS (solo lectura) ---------- */
function toggleHistDay(k){ histDay = (histDay===k) ? null : k; render(); }
function rHistorial(){
  const hist = (state.historial || []).filter(o=>!o.practica && !esFantasma(o));
  if(!hist.length){
    return rHeader('Historial de días','HISTORIAL') + `<main>
      <div class="empty">Aún no hay días archivados.<br>Cuando uses <b>“Cerrar y archivar el día”</b> en Caja, el día quedará guardado aquí para consultarlo.</div>
    </main>`;
  }
  const byDay = {};
  hist.forEach(o=>{ const k = dayKey(o.ts); (byDay[k] = byDay[k] || []).push(o); });
  const dias = Object.keys(byDay).sort().reverse();
  const cards = dias.map(k=>{
    const os = byDay[k];
    const validas = os.filter(o=>!o.anulada);
    const anul = os.length - validas.length;
    const tot = validas.reduce((s,o)=>s+netDe(o),0);
    let ef=0, ya=0;
    validas.forEach(o=> pagosDe(o).forEach(p=>{ if(p.metodo==='efectivo') ef+=p.monto||0; else if(p.metodo==='yape') ya+=p.monto||0; }));
    const sinCobrar = tot - ef - ya;
    const fechaTxt = new Date(os[0].ts).toLocaleDateString();
    const abierto = histDay===k;
    const detalle = abierto ? os.slice().reverse().map(o=>{
      const t = netDe(o);
      const badge = o.anulada ? '<span class="badge b-anulado" style="float:right">ANULADA</span>' : '';
      return `<div class="regcard" style="margin:8px 0">
        <b>#${o.id}</b> · ${tipoTxt(o)}${o.mesero?' · '+esc(o.mesero):''} · ${hhmm(o.ts)} ${badge}<br>
        <span style="color:var(--cafemed)">${o.items.map(i=>(i.estado==='anulado'?'<s>':'')+i.qty+'× '+esc(i.name)+(i.estado==='anulado'?'</s>':'')).join(', ')}</span>
        ${o.boleta?`<div style="font-size:11.5px;color:var(--cafemed)">🧾 Boleta · DNI ${esc(o.boleta.dni)}${o.boleta.nombre?' · '+esc(o.boleta.nombre):''}</div>`:''}
        ${o.manual||o.editado?`<div style="font-size:11.5px;color:#0E7C7B;font-weight:700">✏️ ${o.manual?'Agregada':'Modificada'} manualmente${o.manualPor?' por '+esc(o.manualPor):''}${o.manualTs?' el '+new Date(o.manualTs).toLocaleDateString():''}</div>`:''}
        <div style="font-weight:800;color:var(--acento)">${money(t)}</div>
      </div>`;
    }).join('') : '';
    return `<div class="histcard">
      <div class="histhead" onclick="toggleHistDay('${k}')">
        <div><b>${fechaTxt}</b><div style="font-size:12px;color:var(--cafemed)">${validas.length} venta(s)${anul?` · ${anul} anulada(s)`:''} · toca para ${abierto?'ocultar':'ver'}</div></div>
        <div style="text-align:right">
          <div style="font-weight:800;color:var(--acento);font-size:16px">${money(tot)}</div>
          <div style="font-size:11.5px;color:var(--cafemed)">💵 ${money(ef)} · 📱 ${money(ya)}${sinCobrar>0.005?` · sin cobrar ${money(sinCobrar)}`:''}</div>
        </div>
        <span class="histarrow">${abierto?'▲':'▼'}</span>
      </div>
      ${detalle}
    </div>`;
  }).join('');
  return rHeader('Historial de días','HISTORIAL') + `<main>
    <p style="font-size:13px;color:var(--cafemed)">Días ya cerrados y archivados · solo lectura. Toca un día para ver sus comandas.</p>
    ${cards}
    <button class="csvbtn" style="background:var(--verde)" onclick="csvHistorial()">📦 Descargar todo el historial (CSV)</button>
    <button class="csvbtn" style="background:var(--gris)" onclick="go('registro')">← Volver a Caja</button>
  </main>`;
}
function rCuenta(){
  const o = state.orders.find(x=>x.id===cuentaId);
  if(!o) return '';
  const t = orderTotal(o);
  const lines = o.items.filter(i=>i.estado!=='anulado').map(i=>`
    <div class="tline"><span>${i.qty}× ${esc(i.name)}</span><span>${money(i.price*i.qty)}</span></div>
    ${modsTxt(i)?`<div class="tdet">${esc(modsTxt(i))}</div>`:''}
    ${i.manual?`<div class="tdet">✏ agregado manualmente</div>`:''}`).join('');
  const sal = salioEn(o);
  const pendientesEntrega = o.items.some(i=>i.estado!=='entregado' && i.estado!=='anulado');
  const pgs = pagosDe(o), pend = pendienteDe(o);
  const pagosLineas = pgs.map(p=>`<div class="tline"><span>${p.metodo==='yape'?'📱 Yape':'💵 Efectivo'}${p.detalle?' ('+esc(p.detalle)+')':''}</span><span>${money(p.monto)}</span></div>`).join('');
  const bol = o.boleta || null;
  const boletaTicket = bol
    ? `<hr><div class="tline"><span>BOLETA · DNI/RUC</span><span>${esc(bol.dni)}</span></div>
       ${bol.nombre?`<div class="tline"><span>Cliente</span><span>${esc(bol.nombre)}</span></div>`:''}
       ${bol.contacto?`<div class="tline"><span>Enviar a</span><span>${esc(bol.contacto)}</span></div>`:''}`
    : '';
  const boletaSection = (bol && !boletaEdit)
    ? `<div class="boletabox saved">
        <div><b>🧾 Boleta solicitada</b></div>
        <div class="det">DNI/RUC ${esc(bol.dni)}${bol.nombre?' · '+esc(bol.nombre):''}${bol.contacto?' · '+esc(bol.contacto):''}</div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="stbtn" style="flex:1;background:var(--cafemed)" onclick="toggleBoleta()">Editar datos</button>
          <button class="stbtn" style="flex:1;background:var(--rojo)" onclick="quitarBoleta(${o.id})">Quitar boleta</button>
        </div></div>`
    : boletaEdit
    ? `<div class="boletabox">
        <div class="gl" style="font-weight:700;color:var(--cafemed);margin-bottom:6px">🧾 Datos para la boleta</div>
        <div class="fieldrow"><input id="bolDni" inputmode="numeric" placeholder="DNI (8 díg.) o RUC (11) — obligatorio" value="${bol?esc(bol.dni):''}"></div>
        <div class="fieldrow"><input id="bolNombre" placeholder="Nombre (opcional)" value="${bol?esc(bol.nombre):''}"></div>
        <div class="fieldrow"><input id="bolContacto" placeholder="Celular o correo (para enviarla)" value="${bol?esc(bol.contacto):''}"></div>
        <button class="add" onclick="guardarBoleta(${o.id})">Guardar datos de boleta</button>
        <button class="cls" onclick="toggleBoleta()">Cancelar</button></div>`
    : `<button class="splitbtn" style="background:var(--cafemed)" onclick="toggleBoleta()">🧾 ¿Desea boleta? Registrar datos del cliente</button>`;
  return `<div class="ovl" onclick="if(event.target===this){cuentaId=null;boletaEdit=false;quitarMode=false;render()}"><div class="modal">
    <div class="ticket" id="ticketPrint">
      <div style="text-align:center;font-weight:800">PUEBLO CAFE BAR</div>
      <div style="text-align:center;font-size:11px">Sabor, tradición y buenos momentos</div>
      <hr>
      <div class="tline"><span>Comanda #${o.id}</span><span>${new Date(o.ts).toLocaleDateString()} ${hhmm(o.ts)}</span></div>
      <div class="tline"><span>${o.tipo==='llevar'?'PARA LLEVAR':'Mesa'}</span><span>${esc(o.mesa||'—')}</span></div>
      ${sal!==null?`<div class="tline"><span>Tiempo de salida</span><span>${sal} min</span></div>`:''}
      <hr>
      ${lines}
      <hr>
      ${descMonto(o)>0.005?`<div class="tline"><span>Subtotal</span><span>${money(t)}</span></div>
      <div class="tline"><span>Descuento${o.descuento.tipo==='pct'?' ('+o.descuento.valor+'%)':''}</span><span>−${money(descMonto(o))}</span></div>`:''}
      <div class="tline" style="font-weight:800;font-size:15px"><span>TOTAL</span><span>${money(netDe(o))}</span></div>
      ${pagosLineas ? '<hr>' + pagosLineas + (pend>0.005?`<div class="tline"><span>Pendiente</span><span>${money(pend)}</span></div>`:'') : ''}
      ${boletaTicket}
      <div style="text-align:center;font-size:11px;margin-top:6px">¡Gracias por su visita!</div>
    </div>
    ${o.manual?`<div class="manualbadge">✏️ Cuenta AGREGADA MANUALMENTE${o.manualPor?' por '+esc(o.manualPor):''}${o.manualTs?' · '+new Date(o.manualTs).toLocaleDateString()+' '+hhmm(o.manualTs):''}</div>`:''}
    ${o.editado?`<div class="manualbadge">✏️ MODIFICADA MANUALMENTE · <button class="linklike" onclick="openSnap(${o.id})">ver anterior</button></div>`:''}
    ${(o.unidaDe && o.unidaDe.length)?`<div class="manualbadge" style="border-color:#5E3A82;background:#F3EDFA;color:#4A2B68">🔗 Incluye la(s) cuenta(s) ${o.unidaDe.map(u=>'#'+u.id).join(', ')} unida(s) aquí</div>`:''}
    ${o.descuento?`<div class="manualbadge" style="border-color:#B5722A;background:#FBF3E7;color:#7A4A12">🏷 Descuento ${o.descuento.tipo==='pct'?o.descuento.valor+'%':money(parseFloat(o.descuento.valor))} (−${money(descMonto(o))})${o.descuento.por?' · '+esc(o.descuento.por):''}
      ${pgs.length===0?` · <button class="linklike" onclick="quitarDescuento(${o.id})">quitar</button>`:''}</div>`:''}
    ${rQuitarSec(o)}
    ${pend>0.005 ? `
      <div class="gl" style="margin-top:12px;font-size:12px;font-weight:700;color:var(--cafemed)">COBRAR ${money(pend)}</div>
      <div class="pagochips">
        <button onclick="setPago(${o.id},'efectivo')">💵 Efectivo</button>
        <button onclick="setPago(${o.id},'yape')">📱 Yape</button>
      </div>
      ${!o.descuento?`<button class="splitbtn" onclick="openSplit(${o.id})">➗ Dividir cuenta por ítems</button>`:''}
      ${pgs.length===0 && !o.descuento?`<button class="splitbtn" style="background:#B5722A" onclick="openDesc(${o.id})">🏷 Aplicar descuento</button>`:''}
      ${pgs.length===0?`<button class="splitbtn" style="background:#5E3A82" onclick="openUnir(${o.id})">🔗 Unir con otra cuenta</button>`:''}`
    : `<div style="text-align:center;color:var(--verde);font-weight:800;margin:12px 0">✓ Cuenta saldada</div>`}
    ${esAdmin() && !o.anulada ? `<button class="splitbtn" style="background:#0E7C7B" onclick="openManualAdd(${o.id})">✏️ Agregar ítem servido (manual, sin cocina)</button>`:''}
    ${esAdmin() && pgs.length===0 ? `<button class="anularbtn ${armEliminar===o.id?'armado':''}" onclick="eliminarCuenta(${o.id})">${armEliminar===o.id?'¿Seguro? Se ocultará de todas las listas (queda rastro)':'🗑 Eliminar cuenta (duplicada / errónea)'}</button>`:''}
    ${boletaSection}
    <button class="add" onclick="window.print()">🖨 Imprimir / guardar PDF</button>
    ${pendientesEntrega?`<button class="splitbtn" style="background:var(--cafemed)" onclick="entregarTodo(${o.id})">Marcar todo entregado</button>`:''}
    <button class="cls" onclick="cuentaId=null;boletaEdit=false;quitarMode=false;render()">Cerrar</button>
  </div></div>`;
}
/* ---------- QUITAR ÍTEM ANTES DE COBRAR (anulación con rastro) ---------- */
function rQuitarSec(o){
  const puedeQuitar = !o.anulada && pagadoDe(o) === 0 && o.items.some(i=>i.estado!=='anulado');
  if(!puedeQuitar) return '';
  if(!quitarMode) return `<button class="cls" style="display:block;width:100%" onclick="quitarMode=true;render()">➖ Quitar un ítem que no se llevó (antes de cobrar)…</button>`;
  const rows = o.items.filter(i=>i.estado!=='anulado').map(i=>{
    const arm = armAnularItem && armAnularItem.oid===o.id && armAnularItem.uid===i.uid;
    return `<div class="uline"><span>${i.qty}× ${esc(i.name)} <span style="color:var(--acento)">${money(i.price*i.qty)}</span></span>
      <button class="anularbtn mini ${arm?'armado':''}" style="margin:0" onclick="anularItem(${o.id},${i.uid})">${arm?'¿Seguro? Toca de nuevo':'Quitar (anular)'}</button></div>`;
  }).join('');
  return `<div class="boletabox">
    <div class="gl" style="font-weight:700;color:var(--cafemed)">Quitar ítem — queda ANULADO (tachado), no se borra</div>
    ${rows}
    <button class="cls" onclick="quitarMode=false;render()">Listo</button></div>`;
}
/* ---------- BOLETA / DATOS DE FACTURACIÓN ---------- */
function toggleBoleta(){ boletaEdit = !boletaEdit; render(); }
function guardarBoleta(oid){
  const dni      = ((document.getElementById('bolDni')||{}).value || '').trim();
  const nombre   = ((document.getElementById('bolNombre')||{}).value || '').trim();
  const contacto = ((document.getElementById('bolContacto')||{}).value || '').trim();
  if(!dni){ toast('El DNI es obligatorio para la boleta'); return; }
  if(!/^(\d{8}|\d{11})$/.test(dni)){ toast('DNI = 8 dígitos · RUC = 11 dígitos'); return; }
  const o = state.orders.find(x=>x.id===oid); if(!o) return;
  o.boleta = { dni, nombre, contacto, ts: Date.now(), por: user?user.nombre:'' };
  store.saveOrder(o); boletaEdit = false; toast('Datos de boleta guardados ✓'); render();
}
function quitarBoleta(oid){
  const o = state.orders.find(x=>x.id===oid); if(!o) return;
  delete o.boleta; store.saveOrder(o); boletaEdit = false; toast('Datos de boleta eliminados'); render();
}

/* ---------- EDICIÓN MANUAL DE CUENTAS (solo admin, con auditoría) ---------- */
const prodDatalist = () => `<datalist id="prodlist">${Object.keys(PROD).map(n=>`<option value="${esc(n)}">`).join('')}</datalist>`;
function openManualAdd(oid){
  if(!esAdmin()){ toast('Solo el administrador puede editar cuentas'); return; }
  manualAddModal = { oid, desc:'', precio:'', qty:1, notas:'' }; render();
}
function rManualAdd(){
  const m = manualAddModal;
  return `<div class="ovl" onclick="if(event.target===this){manualAddModal=null;render()}"><div class="modal">
    <h3>✏️ Agregar ítem servido</h3>
    <div class="mp" style="font-size:12px;color:var(--gris);font-weight:400">Para algo que se sirvió pero no se mandó a comanda. Entra como ENTREGADO, no pasa por cocina, y queda marcado "agregado manualmente".</div>
    ${prodDatalist()}
    <div class="grp"><div class="gl">Producto (elige de la carta o escribe libre)</div>
      <input id="mDesc" list="prodlist" placeholder="Ej. Club sandwich" value="${esc(m.desc)}"
        oninput="manualAddModal.desc=this.value; var p=PROD[this.value]; if(p){ manualAddModal.precio=p.p; document.getElementById('mPrecio').value=p.p; }"></div>
    <div class="grp"><div class="gl">Precio (S/)</div>
      <input id="mPrecio" type="number" inputmode="decimal" placeholder="Ej. 15" value="${m.precio}" oninput="manualAddModal.precio=this.value"></div>
    <div class="grp"><div class="gl">Cantidad</div><div class="qty">
      <button onclick="manualAddModal.qty=Math.max(1,manualAddModal.qty-1);render()">−</button><span>${m.qty}</span>
      <button onclick="manualAddModal.qty++;render()">+</button></div></div>
    <div class="grp"><div class="gl">Nota (opcional, ej. motivo)</div>
      <textarea oninput="manualAddModal.notas=this.value" placeholder="Ej. se sirvió sin comanda">${esc(m.notas)}</textarea></div>
    <button class="add" onclick="addManualItem()">Agregar a la cuenta</button>
    <button class="cls" onclick="manualAddModal=null;render()">Cancelar</button>
  </div></div>`;
}
function addManualItem(){
  const m = manualAddModal;
  const desc = (m.desc||'').trim(), precio = parseFloat(m.precio);
  if(!desc){ toast('Escribe el producto'); return; }
  if(isNaN(precio) || precio <= 0){ toast('Ingresa un precio válido'); return; }
  const o = state.orders.find(x=>x.id===m.oid); if(!o){ manualAddModal=null; render(); return; }
  // snapshot de la cuenta ANTES de editar (para "ver anterior")
  o.snapAnterior = (o.snapAnterior || []).concat([{ ts: Date.now(), por: user?user.nombre:'', items: JSON.parse(JSON.stringify(o.items)) }]);
  const uid = o.items.reduce((mx,i)=>Math.max(mx,i.uid),0) + 1;
  const p = PROD[desc];
  o.items.push({ uid, name: desc, price: Math.round(precio*100)/100, station: p?p.station:'salados', cat: p?p.cat:'Manual',
    qty: m.qty, mods:{}, notas:(m.notas||'').trim(), estado:'entregado', tsEnt: Date.now(),
    manual:true, manualPor: user?user.nombre:'', manualTs: Date.now() });
  o.editado = true;
  store.saveOrder(o); manualAddModal = null;
  toast('Ítem agregado manualmente ✓ (marcado en la cuenta)'); render();
}
function openSnap(oid){ snapModal = { oid }; render(); }
function rSnap(){
  const o = state.orders.find(x=>x.id===snapModal.oid);
  if(!o || !(o.snapAnterior||[]).length){ snapModal=null; return ''; }
  const vers = o.snapAnterior.map((s,k)=>{
    const tot = (s.items||[]).filter(i=>i.estado!=='anulado').reduce((a,i)=>a+i.price*i.qty,0);
    const rows = (s.items||[]).map(i=>`<div class="tline"><span>${i.estado==='anulado'?'<s>':''}${i.qty}× ${esc(i.name)}${i.estado==='anulado'?'</s>':''}</span><span>${money(i.price*i.qty)}</span></div>`).join('');
    return `<div class="boletabox" style="background:var(--blanco)">
      <div class="gl" style="font-weight:700;color:var(--cafemed)">Versión ${k+1} · antes de la edición del ${new Date(s.ts).toLocaleDateString()} ${hhmm(s.ts)}${s.por?' ('+esc(s.por)+')':''}</div>
      ${rows}<div class="tline" style="font-weight:800"><span>TOTAL entonces</span><span>${money(tot)}</span></div></div>`;
  }).join('');
  return `<div class="ovl" onclick="if(event.target===this){snapModal=null;render()}"><div class="modal">
    <h3>📜 Versiones anteriores · #${o.id}</h3>
    <div class="mp" style="font-size:12px;color:var(--gris);font-weight:400">Solo lectura. La cuenta actual no se altera.</div>
    ${vers}
    <button class="cls" onclick="snapModal=null;render()">Cerrar</button>
  </div></div>`;
}

/* ---------- ELIMINAR CUENTA (duplicada/errónea: se oculta con rastro) ---------- */
let armEliminar = null;
function eliminarCuenta(oid){
  if(!esAdmin()){ toast('Solo el administrador puede eliminar cuentas'); return; }
  const o = state.orders.find(x=>x.id===oid); if(!o) return;
  if(pagosDe(o).length){ toast('La cuenta tiene cobros: no se puede eliminar'); return; }
  if(armEliminar !== oid){ armEliminar = oid; render(); setTimeout(()=>{ if(armEliminar===oid){ armEliminar=null; render(); } }, 4000); return; }
  o.eliminada = { ts: Date.now(), por: user?user.nombre:'', motivo: 'duplicada/errónea' };
  armEliminar = null; store.saveOrder(o); cuentaId = null;
  toast('Cuenta #'+oid+' eliminada de las listas (queda registrada en la base)'); render();
}

/* ---------- DESCUENTO AL COBRAR (% o monto, firmado) ---------- */
let descModal = null;   // {oid, tipo:'pct'|'monto', valor}
function openDesc(oid){
  const o = state.orders.find(x=>x.id===oid); if(!o) return;
  if(pagosDe(o).length){ toast('La cuenta ya tiene cobros: no se puede descontar'); return; }
  descModal = { oid, tipo:'pct', valor:'' }; render();
}
function rDesc(){
  const o = state.orders.find(x=>x.id===descModal.oid);
  if(!o){ descModal = null; return ''; }
  const bruto = orderTotal(o);
  return `<div class="ovl" onclick="if(event.target===this){descModal=null;render()}"><div class="modal">
    <h3>🏷 Aplicar descuento · #${o.id}</h3>
    <div class="mp" style="font-size:12px;color:var(--gris);font-weight:400">Total actual: <b>${money(bruto)}</b>. El descuento queda registrado con tu nombre.</div>
    <div class="grp"><div class="gl">Tipo</div><div class="opts">
      <button class="${descModal.tipo==='pct'?'sel':''}" onclick="descModal.tipo='pct';render()">% Porcentaje</button>
      <button class="${descModal.tipo==='monto'?'sel':''}" onclick="descModal.tipo='monto';render()">S/ Monto fijo</button></div></div>
    <div class="grp"><div class="gl">${descModal.tipo==='pct'?'Porcentaje (1 a 100)':'Monto (S/)'}</div>
      <input id="descValor" type="number" inputmode="decimal" placeholder="${descModal.tipo==='pct'?'Ej. 10':'Ej. 5'}" value="${descModal.valor}" oninput="descModal.valor=this.value;descPreview()"></div>
    <div class="splitfoot" id="descPrev">${descPrevTxt()}</div>
    <button class="add" onclick="aplicarDescuento()">Aplicar descuento</button>
    <button class="cls" onclick="descModal=null;render()">Cancelar</button>
  </div></div>`;
}
function descPrevTxt(){
  const o = state.orders.find(x=>x.id===descModal.oid); if(!o) return '';
  const bruto = orderTotal(o), v = parseFloat(descModal.valor);
  if(isNaN(v) || v <= 0) return 'Escribe el descuento para ver el nuevo total';
  const prev = Math.min(descModal.tipo==='pct' ? bruto*v/100 : v, bruto);
  return `Descuento: −${money(Math.round(prev*100)/100)} · Nuevo total: <b>${money(Math.max(0, Math.round((bruto-prev)*100)/100))}</b>`;
}
function descPreview(){ const el = document.getElementById('descPrev'); if(el) el.innerHTML = descPrevTxt(); }
function aplicarDescuento(){
  const o = state.orders.find(x=>x.id===descModal.oid); if(!o) return;
  const v = parseFloat(descModal.valor);
  if(isNaN(v) || v <= 0){ toast('Ingresa un valor válido'); return; }
  if(descModal.tipo==='pct' && v > 100){ toast('El porcentaje máximo es 100'); return; }
  if(descModal.tipo==='monto' && v > orderTotal(o)){ toast('El monto no puede superar el total'); return; }
  o.descuento = { tipo: descModal.tipo, valor: v, por: user?user.nombre:'', ts: Date.now() };
  store.saveOrder(o); descModal = null;
  toast('Descuento aplicado: −' + money(descMonto(o)) + ' ✓'); render();
}
function quitarDescuento(oid){
  const o = state.orders.find(x=>x.id===oid); if(!o) return;
  if(pagosDe(o).length){ toast('Ya hay cobros con este descuento'); return; }
  delete o.descuento; store.saveOrder(o); toast('Descuento quitado'); render();
}

/* ---------- UNIR CUENTAS (lo inverso de dividir) ---------- */
let unirModal = null;   // {oid, sel}
function openUnir(oid){
  const o = state.orders.find(x=>x.id===oid); if(!o) return;
  if(pagosDe(o).length){ toast('Esta cuenta ya tiene cobros: no se puede unir'); return; }
  if(o.descuento){ toast('Quita el descuento antes de unir cuentas'); return; }
  unirModal = { oid, sel: null }; render();
}
function unirCandidatas(o){
  return state.orders.filter(x=>
    !x.anulada && !esFantasma(x) && x.id !== o.id && !!x.practica === !!o.practica &&
    pagosDe(x).length === 0 && !x.descuento && x.items.some(i=>i.estado!=='anulado'));
}
function rUnir(){
  const o = state.orders.find(x=>x.id===unirModal.oid);
  if(!o){ unirModal = null; return ''; }
  const cands = unirCandidatas(o);
  const rows = cands.map(c=>`
    <label class="uline" style="cursor:pointer">
      <span><input type="radio" name="unirsel" ${unirModal.sel===c.id?'checked':''} onclick="unirModal.sel=${c.id};render()">
        <b>#${c.id}</b> · ${tipoTxt(c)} · ${money(orderTotal(c))} · ${hhmm(c.ts)}</span>
      <span class="det">${c.items.filter(i=>i.estado!=='anulado').map(i=>i.qty+'× '+esc(i.name)).join(', ')}</span>
    </label>`).join('');
  return `<div class="ovl" onclick="if(event.target===this){unirModal=null;render()}"><div class="modal">
    <h3>🔗 Unir cuentas · #${o.id} (${tipoTxt(o)})</h3>
    <div class="mp" style="font-size:12px;color:var(--gris);font-weight:400">Los ítems de la cuenta que elijas se pasan a ESTA cuenta (#${o.id}) y quedará una sola por pagar. Solo se pueden unir cuentas sin cobros. La unión queda registrada.</div>
    ${rows || '<div class="empty" style="padding:14px">No hay otras cuentas sin cobrar para unir.</div>'}
    ${cands.length?`<button class="add" onclick="unirCuentas()">Unir a la cuenta #${o.id}</button>`:''}
    <button class="cls" onclick="unirModal=null;render()">Cancelar</button>
  </div></div>`;
}
function unirCuentas(){
  const o = state.orders.find(x=>x.id===unirModal.oid);
  const src = state.orders.find(x=>x.id===unirModal.sel);
  if(!o || !src){ toast('Elige la cuenta a unir'); return; }
  if(pagosDe(o).length || pagosDe(src).length){ toast('Una de las cuentas ya tiene cobros'); return; }
  // pasar ítems renumerando uids para no chocar
  let base = o.items.reduce((m,i)=>Math.max(m,i.uid),0);
  src.items.forEach(it=>{ it.uid = ++base; o.items.push(it); });
  // rastro de auditoría en la cuenta destino
  o.unidaDe = (o.unidaDe||[]).concat([{ id: src.id, mesa: src.mesa||'', ts: Date.now(), por: user?user.nombre:'' }]);
  if(src.boleta && !o.boleta) o.boleta = src.boleta;           // conservar datos de boleta si solo la otra los tenía
  // la cuenta origen queda vacía y marcada (normOrder la oculta de las listas; queda en la base como rastro)
  src.items = []; src.unidaEn = o.id;
  store.saveOrder(o); store.saveOrder(src);
  const sid = src.id; unirModal = null; cuentaId = o.id;
  toast('Cuenta #'+sid+' unida a la #'+o.id+' ✓'); render();
}

/* ---------- VENTA MANUAL COMPLETA (olvido / falla del sistema) ---------- */
function hoyISO(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function openVentaManual(){
  if(!esAdmin()){ toast('Solo el administrador'); return; }
  ventaModal = { fecha: hoyISO(), mesa:'', items:[], metodo:'efectivo', enCaja:true, d:'', p:'', q:1 }; render();
}
function vmAddItem(){
  const v = ventaModal, desc=(v.d||'').trim(), precio=parseFloat(v.p);
  if(!desc){ toast('Escribe el producto'); return; }
  if(isNaN(precio)||precio<=0){ toast('Precio válido, por favor'); return; }
  v.items.push({ name:desc, price:Math.round(precio*100)/100, qty:v.q });
  v.d=''; v.p=''; v.q=1; render();
}
function vmRmItem(i){ ventaModal.items.splice(i,1); render(); }
function rVentaManual(){
  const v = ventaModal;
  const esHoy = v.fecha === hoyISO();
  const tot = v.items.reduce((s,i)=>s+i.price*i.qty,0);
  const itemRows = v.items.map((i,k)=>`<div class="uline"><span>${i.qty}× ${esc(i.name)} <span style="color:var(--acento)">${money(i.price*i.qty)}</span></span><button class="rm" onclick="vmRmItem(${k})">✕</button></div>`).join('');
  return `<div class="ovl" onclick="if(event.target===this){ventaModal=null;render()}"><div class="modal">
    <h3>✏️ Registrar venta manual</h3>
    <div class="mp" style="font-size:12px;color:var(--gris);font-weight:400">Para ventas que no se registraron (olvido o falla del sistema). Queda marcada "agregada manualmente" y no pasa por cocina.</div>
    ${prodDatalist()}
    <div class="grp"><div class="gl">Fecha real de la venta</div>
      <input id="vmFecha" type="date" value="${v.fecha}" max="${hoyISO()}" oninput="ventaModal.fecha=this.value;render()"></div>
    <div class="grp"><div class="gl">Mesa / cliente (opcional)</div>
      <input placeholder="Ej. Mesa 3 o nombre" value="${esc(v.mesa)}" oninput="ventaModal.mesa=this.value"></div>
    <div class="grp"><div class="gl">Ítems</div>
      ${itemRows || '<div class="det" style="margin-bottom:6px">Aún sin ítems.</div>'}
      <div class="fieldrow"><input id="vmD" list="prodlist" placeholder="Producto" value="${esc(v.d)}"
        oninput="ventaModal.d=this.value; var p=PROD[this.value]; if(p){ ventaModal.p=p.p; document.getElementById('vmP').value=p.p; }"></div>
      <div class="fieldrow"><input id="vmP" type="number" inputmode="decimal" placeholder="Precio S/" value="${v.p}" oninput="ventaModal.p=this.value" style="max-width:120px">
        <span style="align-self:center">×</span>
        <input type="number" min="1" value="${v.q}" oninput="ventaModal.q=Math.max(1,parseInt(this.value)||1)" style="max-width:70px">
        <button class="stbtn st-listo" style="margin:0;padding:10px 14px" onclick="vmAddItem()">+ Añadir</button></div></div>
    <div class="grp"><div class="gl">Cobro</div><div class="opts">
      <button class="${v.metodo==='efectivo'?'sel':''}" onclick="ventaModal.metodo='efectivo';render()">💵 Efectivo</button>
      <button class="${v.metodo==='yape'?'sel':''}" onclick="ventaModal.metodo='yape';render()">📱 Yape</button>
      <button class="${v.metodo===null?'sel':''}" onclick="ventaModal.metodo=null;render()">Sin cobrar</button></div></div>
    ${v.metodo && !esHoy ? `<div class="grp"><div class="gl">¿Ese dinero está en la caja de HOY?</div><div class="opts">
      <button class="${v.enCaja?'sel':''}" onclick="ventaModal.enCaja=true;render()">Sí, suma a la caja de hoy</button>
      <button class="${!v.enCaja?'sel':''}" onclick="ventaModal.enCaja=false;render()">No, solo registrar la venta</button></div>
      <div class="det" style="margin-top:4px">Si el dinero ya se contó en el cierre de ese día (salió como "sobra"), elige NO para no descuadrar la caja de hoy.</div></div>`:''}
    <button class="add" onclick="guardarVentaManual()">Guardar venta manual · ${money(tot)}</button>
    <button class="cls" onclick="ventaModal=null;render()">Cancelar</button>
  </div></div>`;
}
async function guardarVentaManual(){
  const v = ventaModal;
  if(!v.items.length){ toast('Agrega al menos un ítem'); return; }
  if(!v.fecha){ toast('Elige la fecha real de la venta'); return; }
  const esHoy = v.fecha === hoyISO();
  const ts = esHoy ? Date.now() : new Date(v.fecha + 'T12:00:00').getTime();
  const id = await store.nextOrderId();
  const total = Math.round(v.items.reduce((s,i)=>s+i.price*i.qty,0)*100)/100;
  const o = { id, mesa: (v.mesa||'').trim() || 'Venta manual', tipo:'mesa', ts, practica:false,
    mesero: user?user.nombre:'', manual:true, manualPor: user?user.nombre:'', manualTs: Date.now(),
    items: v.items.map((i,k)=>({ uid:k+1, name:i.name, price:i.price, station: PROD[i.name]?PROD[i.name].station:'salados',
      cat: PROD[i.name]?PROD[i.name].cat:'Manual', qty:i.qty, mods:{}, notas:'', estado:'entregado', tsEnt: ts,
      manual:true, manualPor:user?user.nombre:'', manualTs: Date.now() })) };
  if(v.metodo){
    const pago = { monto: total, metodo: v.metodo, detalle: 'venta manual' + (esHoy?'':' del '+v.fecha) };
    if(!esHoy && !v.enCaja) pago.noCaja = true;
    o.pagos = [pago];
  }
  store.saveOrder(o); ventaModal = null;
  toast('Venta manual #'+id+' registrada ✓'); render();
}
/* ---------- DIVIDIR CUENTA POR ÍTEMS ---------- */
function splitUnits(o){
  const u = [];
  o.items.filter(i=>i.estado!=='anulado').forEach(it=>{
    for(let n=0;n<it.qty;n++) u.push({ key: it.uid+'#'+n, uid: it.uid, name: it.name, price: it.price, mods: modsTxt(it) });
  });
  return u;
}
function openSplit(oid){
  const o = state.orders.find(x=>x.id===oid); if(!o) return;
  if(o.descuento){ toast('Cuenta con descuento: se cobra completa (o quita el descuento)'); return; }
  if(estaPagado(o)){ toast('La cuenta ya está saldada'); return; }
  const personas = [], asign = {};
  pagosDe(o).forEach((p, idx)=>{
    if(p.unitKeys){ const pid = 'p'+idx; personas.push({ id: pid, metodo: p.metodo, pagado: true }); p.unitKeys.forEach(k=>asign[k]=pid); }
  });
  let nid = personas.length;
  personas.push({ id:'p'+(nid++), metodo:null, pagado:false });
  personas.push({ id:'p'+(nid++), metodo:null, pagado:false });
  splitModal = { oid, personas, asign, nextId: nid };
  cuentaId = null; render();
}
function splitAssign(k, pid){
  const cur = splitModal.asign[k];
  if(cur){ const cp = splitModal.personas.find(p=>p.id===cur); if(cp && cp.pagado){ toast('Esa unidad ya fue cobrada'); return; } }
  const tp = splitModal.personas.find(p=>p.id===pid); if(!tp || tp.pagado) return;
  splitModal.asign[k] = (cur === pid) ? null : pid;   // volver a tocar la misma = desasignar
  render();
}
function splitAddPersona(){ splitModal.personas.push({ id:'p'+(splitModal.nextId++), metodo:null, pagado:false }); render(); }
function splitSetMetodo(pid, metodo){ const p = splitModal.personas.find(x=>x.id===pid); if(p && !p.pagado){ p.metodo = metodo; render(); } }
function splitCobrar(pid){
  const o = state.orders.find(x=>x.id===splitModal.oid); if(!o) return;
  const p = splitModal.personas.find(x=>x.id===pid); if(!p || p.pagado) return;
  if(!p.metodo){ toast('Elige método de pago para esta persona'); return; }
  const units = splitUnits(o).filter(u=>splitModal.asign[u.key]===pid);
  if(!units.length){ toast('Asigna ítems a esta persona primero'); return; }
  const monto = Math.round(units.reduce((s,u)=>s+u.price,0)*100)/100;
  o.pagos = pagosDe(o).slice();
  o.pagos.push({ monto, metodo: p.metodo, unitKeys: units.map(u=>u.key), detalle: units.map(u=>u.name).join(', ') });
  delete o.pago;
  p.pagado = true;
  store.saveOrder(o);
  toast('Cobrado ' + money(monto) + ' (' + (p.metodo==='yape'?'Yape':'Efectivo') + ')');
  if(pendienteDe(o) < 0.005 && splitUnits(o).every(u=>splitModal.asign[u.key])){ splitModal = null; cuentaId = o.id; toast('Cuenta saldada ✓'); }
  render();
}
const PCOL = ['#2E5D7D','#B5722A','#2E7D46','#742284','#B03A2E','#0E7C7B','#8A6D00','#37474F'];
function rSplit(){
  const o = state.orders.find(x=>x.id===splitModal.oid); if(!o){ splitModal=null; return ''; }
  const units = splitUnits(o);
  const total = orderTotal(o), pagado = pagadoDe(o), pend = pendienteDe(o);
  const asignado = units.filter(u=>splitModal.asign[u.key]).reduce((s,u)=>s+u.price,0);
  const unitRows = units.map(u=>{
    const cur = splitModal.asign[u.key];
    const chips = splitModal.personas.map((p,i)=>{
      const on = cur===p.id;
      return `<button class="pchip ${on?'sel':''}" style="${on?`background:${PCOL[i%8]};color:#fff;border-color:${PCOL[i%8]}`:''}" onclick="splitAssign('${u.key}','${p.id}')">P${i+1}${p.pagado?'✓':''}</button>`;
    }).join('');
    return `<div class="uline"><div><b>${esc(u.name)}</b> <span style="color:var(--acento)">${money(u.price)}</span>${u.mods?`<div class="det">${esc(u.mods)}</div>`:''}</div><div class="pchips">${chips}</div></div>`;
  }).join('');
  const personaCards = splitModal.personas.map((p,i)=>{
    const sub = units.filter(u=>splitModal.asign[u.key]===p.id).reduce((s,u)=>s+u.price,0);
    if(p.pagado){
      return `<div class="pcard" style="border-color:${PCOL[i%8]};opacity:.7"><b>Persona ${i+1}</b> · ${money(sub)} · ${p.metodo==='yape'?'📱 Yape':'💵 Efectivo'} <span class="badge b-entregado">COBRADO</span></div>`;
    }
    return `<div class="pcard" style="border-color:${PCOL[i%8]}">
      <b>Persona ${i+1}</b> · Subtotal <b>${money(sub)}</b>
      <div class="pagochips" style="margin:6px 0">
        <button class="${p.metodo==='efectivo'?'sel':''}" onclick="splitSetMetodo('${p.id}','efectivo')">💵 Efectivo</button>
        <button class="${p.metodo==='yape'?'sel':''}" onclick="splitSetMetodo('${p.id}','yape')">📱 Yape</button>
      </div>
      <button class="stbtn st-listo" style="width:100%" onclick="splitCobrar('${p.id}')">Cobrar ${money(sub)}</button>
    </div>`;
  }).join('');
  return `<div class="ovl" onclick="if(event.target===this){splitModal=null;render()}"><div class="modal">
    <h3>Dividir cuenta · #${o.id}</h3>
    <div class="mp" style="font-size:12px;color:var(--gris);font-weight:400">Asigna cada ítem a una persona (P1, P2…) y cobra por separado.</div>
    <div class="splitfoot">Total ${money(total)} · Pagado ${money(pagado)} · <b>Pendiente ${money(pend)}</b>${asignado<total-0.005?` · <span style="color:var(--rojo)">sin asignar ${money(total-asignado)}</span>`:''}</div>
    <div class="gl">Ítems</div>
    ${unitRows}
    <div class="gl" style="margin-top:10px;display:flex;align-items:center;gap:8px">Personas <button class="pchip" onclick="splitAddPersona()">+ Persona</button></div>
    ${personaCards}
    <button class="cls" onclick="splitModal=null;render()">Cerrar</button>
  </div></div>`;
}
function entregarTodo(oid){
  const o = state.orders.find(x=>x.id===oid); if(!o) return;
  o.items.forEach(i=>{ if(i.estado!=='anulado'){ if(!i.tsListo) i.tsListo = Date.now(); i.estado='entregado'; i.tsEnt = Date.now(); } });
  store.saveOrder(o); toast('Comanda #'+oid+' cerrada'); render();
}
function csvDe(orders, filename){
  let rows = [['Comanda','Tipo','Mesa/Cliente','Mesero','Modo','Fecha','Hora','Producto','Cant','Detalle','Precio','Subtotal','Estado','MinSalida','Pagos','BoletaDNI','BoletaNombre','BoletaContacto','RegistroManual','Descuento']];
  (orders||[]).forEach(o=>{
    const pagosTxt = pagosDe(o).map(p=>p.metodo+':'+p.monto+(p.noCaja?'(noCaja)':'')).join(' | ');
    const b = o.boleta || {};
    o.items.forEach(i=>{
      const d = new Date(o.ts);
      const man = o.manual ? 'cuenta manual' + (o.manualPor?' ('+o.manualPor+')':'') : (i.manual ? 'item manual' + (i.manualPor?' ('+i.manualPor+')':'') : '');
      rows.push([o.id, o.tipo==='llevar'?'Llevar':'Mesa', o.mesa||'', o.mesero||'', o.practica?'practica':'real', d.toLocaleDateString(), hhmm(o.ts), i.name, i.qty,
        modsTxt(i).replace(/,/g,';'), i.price, i.price*i.qty, o.anulada?'anulado':i.estado,
        i.tsListo?elapsedMin(o.ts,i.tsListo):'', pagosTxt, b.dni||'', (b.nombre||'').replace(/,/g,';'), b.contacto||'', man.replace(/,/g,';'),
        o.descuento?((o.descuento.tipo==='pct'?o.descuento.valor+'%':'S/'+o.descuento.valor)+' = -'+descMonto(o)):'']);
    });
  });
  const txt = rows.map(r=>r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿'+txt], {type:'text/csv;charset=utf-8'}));
  a.download = filename; a.click();
}
function csv(){ csvDe(state.orders, 'comandas_pueblo_cafe.csv'); }

/* ---------- GESTIÓN DEL CAFÉ ---------- */
let gtab = 'compras';   // compras | tareas | recetas
function setGtab(t){ gtab = t; render(); }
function rGestion(){
  const nOff = (state.noDisponible||[]).length;
  const tabs = `<div class="tabs">
    <button class="${gtab==='disp'?'act':''}" onclick="setGtab('disp')">🍽 Disponibilidad${nOff?` (${nOff})`:''}</button>
    ${esAdmin()?`<button class="${gtab==='carta'?'act':''}" onclick="setGtab('carta')">🍔 Carta</button>`:''}
    <button class="${gtab==='compras'?'act':''}" onclick="setGtab('compras')">🛒 Lista de compras</button>
    <button class="${gtab==='tareas'?'act':''}" onclick="setGtab('tareas')">🔑 Apertura y cierre</button>
    <button class="${gtab==='recetas'?'act':''}" onclick="setGtab('recetas')">📖 Recetas</button>
  </div>`;
  let body = '';
  if(gtab==='disp') body = rDisponibilidad();
  else if(gtab==='carta' && esAdmin()) body = rCartaEditor();
  else if(gtab==='compras') body = rCompras();
  else if(gtab==='tareas') body = rTareas();
  else body = rRecetas();
  return rHeader('Gestión del Café','GESTIÓN') + `<main>${tabs}${body}</main>`;
}

/* ---------- EDITOR DE CARTA (solo admin, sincronizado) ---------- */
let cartaModal = null;   // {mode:'add'|'edit', cat, idx?, n, d, p}
let armRetirar = null;   // 'cat|idx' armado para retirar (doble toque)
function saveCarta(){ store.saveList('carta', MENU); setCarta(state.carta); }
function rCartaEditor(){
  const bloques = MENU.map(c=>{
    const rows = c.items.map((it,idx)=>{
      const key = c.cat + '|' + idx;
      if(it.off){
        return `<div class="dispitem off">
          <span class="dispnm"><b>${esc(it.n)}</b> <span class="det">${money(it.p)} · <span style="color:var(--gris);font-weight:800">RETIRADO</span></span></span>
          <button class="stbtn st-listo" style="padding:8px 12px;margin:0;white-space:nowrap" onclick="restaurarProd('${esc(c.cat)}',${idx})">↩ Restaurar</button>
        </div>`;
      }
      const arm = armRetirar === key;
      return `<div class="dispitem">
        <span class="dispnm"><b>${esc(it.n)}</b> <span class="det">${money(it.p)}${it.d?' · '+esc(it.d):''}</span></span>
        <button class="stbtn st-preparando" style="padding:8px 10px;margin:0" onclick="editProd('${esc(c.cat)}',${idx})">✎</button>
        <button class="anularbtn mini ${arm?'armado':''}" style="margin:0;white-space:nowrap" onclick="retirarProd('${esc(c.cat)}',${idx})">${arm?'¿Seguro?':'Retirar'}</button>
      </div>`;
    }).join('');
    return `<div class="h2s" style="display:flex;align-items:center;gap:8px">${esc(c.cat)}
      <button class="pchip" onclick="addProd('${esc(c.cat)}')">+ Añadir producto</button></div>${rows || '<div class="det" style="padding:6px 0">Sin productos.</div>'}`;
  }).join('');
  return `
    <p style="font-size:13px;color:var(--cafemed)">Edita la carta: los cambios llegan al instante a todos los equipos. "Retirar" solo la oculta (se puede restaurar); las ventas pasadas no se alteran.</p>
    ${bloques}`;
}
function addProd(cat){ cartaModal = { mode:'add', cat, n:'', d:'', p:'' }; render(); }
function editProd(cat, idx){
  const c = MENU.find(x=>x.cat===cat); if(!c || !c.items[idx]) return;
  const it = c.items[idx];
  cartaModal = { mode:'edit', cat, idx, n: it.n, d: it.d||'', p: it.p }; render();
}
function retirarProd(cat, idx){
  const key = cat + '|' + idx;
  if(armRetirar !== key){ armRetirar = key; render(); setTimeout(()=>{ if(armRetirar===key){ armRetirar=null; render(); } }, 3500); return; }
  const c = MENU.find(x=>x.cat===cat); if(!c || !c.items[idx]) return;
  const it = c.items[idx];
  it.off = true;
  state.noDisponible = (state.noDisponible||[]).filter(n=>n!==it.n);   // limpiar agotados
  store.saveList('noDisponible', state.noDisponible);
  armRetirar = null; saveCarta();
  toast('“'+it.n+'” retirado de la carta (se puede restaurar)'); render();
}
function restaurarProd(cat, idx){
  const c = MENU.find(x=>x.cat===cat); if(!c || !c.items[idx]) return;
  delete c.items[idx].off; saveCarta();
  toast('“'+c.items[idx].n+'” de vuelta en la carta ✓'); render();
}
function rCartaModal(){
  const m = cartaModal;
  return `<div class="ovl" onclick="if(event.target===this){cartaModal=null;render()}"><div class="modal">
    <h3>${m.mode==='add'?'＋ Añadir producto':'✎ Editar producto'}</h3>
    <div class="mp" style="font-size:12px;color:var(--gris);font-weight:400">Categoría: <b>${esc(m.cat)}</b>${m.mode==='add'?' · heredará los modificadores de su categoría':''}</div>
    <div class="grp"><div class="gl">Nombre</div>
      <input id="cpNombre" placeholder="Ej. Jugo de lúcuma" value="${esc(m.n)}" oninput="cartaModal.n=this.value"></div>
    <div class="grp"><div class="gl">Precio (S/)</div>
      <input type="number" inputmode="decimal" placeholder="Ej. 6" value="${m.p}" oninput="cartaModal.p=this.value"></div>
    <div class="grp"><div class="gl">Descripción (opcional)</div>
      <input placeholder="Ej. Con leche o agua" value="${esc(m.d)}" oninput="cartaModal.d=this.value"></div>
    <button class="add" onclick="guardarProd()">${m.mode==='add'?'Añadir a la carta':'Guardar cambios'}</button>
    <button class="cls" onclick="cartaModal=null;render()">Cancelar</button>
  </div></div>`;
}
function guardarProd(){
  const m = cartaModal;
  const n = (m.n||'').trim(), p = parseFloat(m.p), d = (m.d||'').trim();
  if(!n){ toast('Escribe el nombre del producto'); return; }
  if(isNaN(p) || p <= 0){ toast('Ingresa un precio válido'); return; }
  const c = MENU.find(x=>x.cat===m.cat); if(!c){ cartaModal=null; render(); return; }
  const repetido = MENU.some(cc=>cc.items.some((it,k)=> it.n.toLowerCase()===n.toLowerCase() && !(m.mode==='edit' && cc.cat===m.cat && k===m.idx)));
  if(repetido){ toast('Ya existe un producto con ese nombre'); return; }
  if(m.mode === 'add'){
    const hermano = c.items.find(i=>!i.off && i.mods && i.mods.length);
    const nuevo = { n, p: Math.round(p*100)/100 };
    if(d) nuevo.d = d;
    if(hermano) nuevo.mods = hermano.mods.slice();   // hereda modificadores de la categoría
    c.items.push(nuevo);
    toast('“'+n+'” añadido a '+m.cat+' ✓');
  } else {
    const it = c.items[m.idx]; if(!it){ cartaModal=null; render(); return; }
    const nombreViejo = it.n;
    it.n = n; it.p = Math.round(p*100)/100;
    if(d) it.d = d; else delete it.d;
    if(nombreViejo !== n && (state.noDisponible||[]).includes(nombreViejo)){
      state.noDisponible = state.noDisponible.map(x=>x===nombreViejo?n:x);
      store.saveList('noDisponible', state.noDisponible);
    }
    toast('Producto actualizado ✓');
  }
  cartaModal = null; saveCarta(); render();
}

/* ---------- DISPONIBILIDAD DE LA CARTA ---------- */
function toggleDisp(name){
  const arr = (state.noDisponible || []).slice();
  const i = arr.indexOf(name);
  if(i >= 0) arr.splice(i,1); else arr.push(name);
  store.saveList('noDisponible', arr);
  toast(i>=0 ? '“'+name+'” disponible otra vez' : '“'+name+'” marcado como agotado hoy');
  render();
}
function resetDisp(){ store.saveList('noDisponible', []); toast('Todos los productos marcados como disponibles'); render(); }
function rDisponibilidad(){
  const nOff = (state.noDisponible||[]).length;
  const bloques = MENU.map(c=>{
    const rows = c.items.filter(it=>!it.off).map(it=>{
      const off = noHay(it.n);
      return `<div class="dispitem${off?' off':''}">
        <span class="dispnm"><b>${esc(it.n)}</b> <span class="det">${money(it.p)}${off?' · <span class="agot">AGOTADO HOY</span>':''}</span></span>
        <button class="stbtn ${off?'st-pendiente':'st-listo'}" style="padding:8px 12px;margin:0;white-space:nowrap" onclick="toggleDisp('${esc(it.n)}')">${off?'✓ Hay':'Marcar agotado'}</button>
      </div>`;
    }).join('');
    return `<div class="h2s">${esc(c.cat)}</div>${rows}`;
  }).join('');
  return `
    <p style="font-size:13px;color:var(--cafemed)">Marca lo que se agotó hoy. Al mesero le aparece un aviso arriba y no puede pedir esos productos. Cualquiera del equipo puede actualizarlo.</p>
    ${nOff?`<button class="csvbtn" style="background:var(--verde)" onclick="resetDisp()">✓ Marcar TODO disponible (inicio de día)</button>`:'<div class="empty" style="padding:12px">Todo disponible por ahora. 🎉</div>'}
    ${bloques}`;
}
function rCompras(){
  const items = state.compras.map(c=>`
    <div class="citem" style="align-items:center">
      <label style="display:flex;align-items:center;gap:10px;flex:1;${c.hecho?'opacity:.5;text-decoration:line-through':''}">
        <input type="checkbox" style="width:20px;height:20px" ${c.hecho?'checked':''} onclick="toggleCompra('${c.id}')">
        <span><b>${esc(c.txt)}</b>${c.por?`<div class="det">reportado por ${esc(c.por)}</div>`:''}</span>
      </label>
      <button class="rm" onclick="delCompra('${c.id}')">✕</button>
    </div>`).join('');
  return `
    <p style="font-size:13px;color:var(--cafemed)">Cualquiera del equipo puede reportar lo que falte comprar. Se marca ☑ cuando ya se compró.</p>
    <div class="fieldrow"><input id="compraTxt" placeholder="¿Qué falta comprar? (ej. azúcar rubia)"></div>
    <div class="fieldrow"><input id="compraPor" placeholder="¿Quién reporta? (tu nombre)">
      <button class="stbtn st-listo" style="padding:10px 18px" onclick="addCompra()">Agregar</button></div>
    ${items || '<div class="empty">No hay nada pendiente de comprar. 🎉</div>'}
    ${state.compras.some(c=>c.hecho)?`<button class="csvbtn" style="background:var(--verde)" onclick="clearCompras()">🧹 Limpiar comprados (${state.compras.filter(c=>c.hecho).length})</button>`:''}`;
}
function clearCompras(){
  const n = state.compras.filter(c=>c.hecho).length;
  state.compras = state.compras.filter(c=>!c.hecho);
  store.saveList('compras', state.compras); toast(n + ' comprado(s) eliminados de la lista'); render();
}
function addCompra(){
  const txt = (document.getElementById('compraTxt')||{}).value || '';
  const por = (document.getElementById('compraPor')||{}).value || '';
  if(!txt.trim()){ toast('Escribe qué falta comprar'); return; }
  state.compras.unshift({id:uniqueId('c'), txt:txt.trim(), por:por.trim(), hecho:false});
  store.saveList('compras', state.compras); toast('Agregado a la lista de compras'); render();
}
function toggleCompra(id){ const c = state.compras.find(x=>x.id===id); if(c){ c.hecho = !c.hecho; store.saveList('compras', state.compras); render(); } }
function delCompra(id){ state.compras = state.compras.filter(x=>x.id!==id); store.saveList('compras', state.compras); render(); }

function rTareas(){
  const bloque = (turno, titulo) => {
    const ts = state.tareas.filter(t=>t.turno===turno);
    const rows = ts.map(t=>`
      <div class="citem" style="align-items:center">
        <label style="display:flex;align-items:center;gap:10px;flex:1;${t.hecho?'opacity:.5;text-decoration:line-through':''}">
          <input type="checkbox" style="width:20px;height:20px" ${t.hecho?'checked':''} onclick="toggleTarea('${t.id}')">
          <span><b>${esc(t.txt)}</b><div class="det">${t.asignado?'Asignado a: '+esc(t.asignado):'Sin asignar'}</div></span>
        </label>
        <button class="rm" onclick="delTarea('${t.id}')">✕</button>
      </div>`).join('');
    return `<div class="h2s">${titulo}</div>${rows || '<div class="empty" style="padding:14px">Sin tareas.</div>'}`;
  };
  return `
    <p style="font-size:13px;color:var(--cafemed)">Checklist diario con responsable. En la versión final, cada quien vería sus tareas al entrar con su usuario.</p>
    <div class="fieldrow"><input id="tareaTxt" placeholder="Nueva tarea (ej. revisar stock de vasos)"></div>
    <div class="fieldrow"><input id="tareaAsig" placeholder="Asignar a… (nombre)">
      <button class="stbtn st-pendiente" style="padding:10px 12px" onclick="addTarea('apertura')">+ Apertura</button>
      <button class="stbtn st-preparando" style="padding:10px 12px" onclick="addTarea('cierre')">+ Cierre</button></div>
    ${bloque('apertura','🌅 Apertura')}
    ${bloque('cierre','🌙 Cierre')}
    <button class="csvbtn" style="background:var(--cafemed)" onclick="resetTareas()">Desmarcar todo (nuevo día)</button>`;
}
function addTarea(turno){
  const txt = (document.getElementById('tareaTxt')||{}).value || '';
  const asig = (document.getElementById('tareaAsig')||{}).value || '';
  if(!txt.trim()){ toast('Escribe la tarea'); return; }
  state.tareas.push({id:uniqueId('t'), txt:txt.trim(), turno, asignado:asig.trim(), hecho:false});
  store.saveList('tareas', state.tareas); toast('Tarea agregada a ' + turno); render();
}
function toggleTarea(id){ const t = state.tareas.find(x=>x.id===id); if(t){ t.hecho = !t.hecho; store.saveList('tareas', state.tareas); render(); } }
function delTarea(id){ state.tareas = state.tareas.filter(x=>x.id!==id); store.saveList('tareas', state.tareas); render(); }
function resetTareas(){ state.tareas.forEach(t=>t.hecho=false); store.saveList('tareas', state.tareas); toast('Checklist reiniciado para el nuevo día'); render(); }

function rRecetas(){
  const cards = state.recetas.map(r=>`
    <div class="regcard">
      <b>${esc(r.nombre)}</b>
      <button class="rm" style="float:right" onclick="delReceta('${r.id}')">✕</button>
      <div style="color:var(--cafemed);margin-top:4px;white-space:pre-wrap">${esc(r.texto)}</div>
    </div>`).join('');
  return `
    <p style="font-size:13px;color:var(--cafemed)">Repositorio de recetas, consultable desde cocina sin tocar la computadora. Aquí se irá cargando el recetario completo.</p>
    <div class="fieldrow"><input id="recNombre" placeholder="Nombre de la receta (ej. Jugo Normal)"></div>
    <textarea id="recTexto" style="width:100%;border:1px solid #D8CBA4;border-radius:10px;padding:10px;font-size:14px;background:var(--blanco);min-height:70px;font-family:inherit;margin-bottom:8px" placeholder="Ingredientes y preparación…"></textarea>
    <button class="stbtn st-listo" style="padding:10px 18px;margin-bottom:14px" onclick="addReceta()">Guardar receta</button>
    ${cards || '<div class="empty">Aún no hay recetas guardadas.</div>'}`;
}
function addReceta(){
  const n = (document.getElementById('recNombre')||{}).value || '';
  const t = (document.getElementById('recTexto')||{}).value || '';
  if(!n.trim() || !t.trim()){ toast('Completa nombre y contenido'); return; }
  state.recetas.unshift({id:uniqueId('r'), nombre:n.trim(), texto:t.trim()});
  store.saveList('recetas', state.recetas); toast('Receta guardada'); render();
}
function delReceta(id){ state.recetas = state.recetas.filter(x=>x.id!==id); store.saveList('recetas', state.recetas); render(); }

/* ---------- NAV ---------- */
function go(v){ view = v; modal = null; customModal = null; chkModal = null; cuentaId = null; recetaModal = null; splitModal = null; armAnular = null; armAnularItem = null; armBorrarP = false; armArchivar = false; addTargetId = null; cierreMode = false; boletaEdit = false; histDay = null; quitarMode = false; manualAddModal = null; ventaModal = null; snapModal = null; cartaModal = null; armRetirar = null; mesaModal = null; unirModal = null; descModal = null; armEliminar = null; render(); }
window.go = go; window.goCocina = goCocina; window.setTab = setTab; window.openItem = openItem;
window.pick = pick; window.addCart = addCart; window.rmCart = rmCart; window.sendOrder = sendOrder;
window.setEstado = setEstado; window.openChk = openChk; window.deliver = deliver; window.csv = csv;
window.setTipo = setTipo; window.openEdit = openEdit; window.splitCart = splitCart; window.anular = anular;
window.entregarTodo = entregarTodo; window.doSearch = doSearch;
window.setModo = setModo; window.borrarPractica = borrarPractica; window.archivarDia = archivarDia; window.csvHistorial = csvHistorial; window.toggleHistDay = toggleHistDay;
window.pickProd = pickProd; window.toggleDisp = toggleDisp; window.resetDisp = resetDisp;
window.openCustom = openCustom; window.addCustom = addCustom;
window.openManualAdd = openManualAdd; window.addManualItem = addManualItem; window.openSnap = openSnap;
window.addProd = addProd; window.editProd = editProd; window.retirarProd = retirarProd; window.restaurarProd = restaurarProd; window.guardarProd = guardarProd;
window.openVentaManual = openVentaManual; window.vmAddItem = vmAddItem; window.vmRmItem = vmRmItem; window.guardarVentaManual = guardarVentaManual;
window.toggleEntrega = toggleEntrega; window.anularItem = anularItem; window.openChkMulti = openChkMulti;
window.setPago = setPago; window.setGtab = setGtab;
window.addCompra = addCompra; window.toggleCompra = toggleCompra; window.delCompra = delCompra; window.clearCompras = clearCompras;
window.verReceta = verReceta; window.toggleAllListos = toggleAllListos;
window.addTarea = addTarea; window.toggleTarea = toggleTarea; window.delTarea = delTarea; window.resetTareas = resetTareas;
window.addReceta = addReceta; window.delReceta = delReceta;
window.startAgregar = startAgregar; window.cancelAgregar = cancelAgregar; window.agregarItems = agregarItems;
window.abrirCaja = abrirCaja; window.cerrarCaja = cerrarCaja; window.reabrirCaja = reabrirCaja;
window.openSplit = openSplit; window.splitAssign = splitAssign; window.splitAddPersona = splitAddPersona;
window.splitSetMetodo = splitSetMetodo; window.splitCobrar = splitCobrar;
window.cronoToggle = cronoToggle; window.cronoReset = cronoReset; window.cronoName = cronoName;
window.pickMesa = pickMesa; window.mesaNueva = mesaNueva; window.toggleBoleta = toggleBoleta; window.guardarBoleta = guardarBoleta; window.quitarBoleta = quitarBoleta;
window.openUnir = openUnir; window.unirCuentas = unirCuentas;
window.openDesc = openDesc; window.aplicarDescuento = aplicarDescuento; window.quitarDescuento = quitarDescuento;
window.eliminarCuenta = eliminarCuenta;

window.pinPress = pinPress; window.pinBack = pinBack; window.logout = logout;

// refresca los contadores de tiempo ("hace X min") cada 30 s
setInterval(()=>{ if((view==='cocina' || view==='mesero') && !modal && !chkModal && cuentaId===null && !splitModal) render(); }, 30000);
// tick de 1 s para los cronómetros de cocción (actualiza solo el texto, sin re-render)
setInterval(()=>{
  if(view==='cocina' && station==='salados'){
    cronos.forEach((c,i)=>{ if(c.run){ const el = document.getElementById('cronot'+i); if(el) el.textContent = fmtCrono(cronoMs(c)); } });
  }
}, 1000);

// arranque: el store notifica cada cambio de datos (local o Firebase)
store.init(s => { state = s; setCarta(s.carta); render(); });
render();
