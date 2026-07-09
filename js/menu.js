'use strict';
/* ===== MENÚ, MODIFICADORES Y PRODUCTOS RÁPIDOS — editar aquí ===== */
const GRUPOS = {
  temp:      {label:'Temperatura', opts:['Helado','Al tiempo','Tibio','Caliente'], def:'Helado'},
  azucar:    {label:'Azúcar', opts:['Sin azúcar','Poco dulce','Regular','Extra dulce'], def:'Regular'},
  hielo:     {label:'Hielo', opts:['Con hielo','Sin hielo']},
  frio:      {label:'Temperatura', opts:['Helada','Sin helar'], def:'Helada'},
  helado:    {label:'Helado a elección', opts:['Vainilla','Chocolate','Fresa','Stracciatella','Cookies & cream','Maracumango','Coco']},
  daiquiri:  {label:'Sabor', opts:['Fresa','Durazno','Maracuyá']},
  mojito:    {label:'Estilo', opts:['Clásico','Frutas de la zona']},
  pisco:     {label:'Estilo', opts:['Clásico','Maracuyá']},
  macchiato: {label:'Estilo', opts:['Clásico','Mocca','Avellana']},
  agua:      {label:'Tipo', opts:['Con gas','Sin gas']},
  salsa1:    {label:'Salsa (elige 1)', opts:['Clásica','BBQ','Chimichurri','Acebichada'], multi:1},
  salsa2:    {label:'Salsas (hasta 2 — si eliges 1, todas de ese sabor)', opts:['Clásica','BBQ','Chimichurri','Acebichada'], multi:2},
  salsa3:    {label:'Salsas (hasta 3 — si eliges 1, todas de ese sabor)', opts:['Clásica','BBQ','Chimichurri','Acebichada'], multi:3},
  salsa4:    {label:'Salsas (hasta 4 — si eliges 1, todas de ese sabor)', opts:['Clásica','BBQ','Chimichurri','Acebichada'], multi:4},
  aparte:    {label:'Presentación', opts:['Salsa aparte'], multi:1, opcional:true},
  batOpts:   {label:'Opciones (opcional)', opts:['Leche deslactosada'], multi:1, opcional:true},
  frapOpts:  {label:'Ajustes (opcional)', opts:['Sin crema','Sin fudge','Sin barquillo'], multi:3, opcional:true},
  mkOpts:    {label:'Ajustes (opcional)', opts:['Leche deslactosada','Sin crema','Sin barquillo','Sin fudge','Sin salsa especial','Con fudge'], multi:6, opcional:true},
  cafeOpts:  {label:'Ajustes (opcional)', opts:['Leche deslactosada','Con crema','Sin crema','Muy caliente'], multi:4, opcional:true},
  copaOpts:  {label:'Ajustes (opcional)', opts:['Sin crema','Sin barquillo','Sin fudge','Con fudge','Sin salsa especial','Con salsa especial','Sin frutos secos','Con frutos secos','Sin alguna fruta (indica cuál en la nota)'], multi:9, opcional:true},
  wafOpts:   {label:'Ajustes (opcional)', opts:['Con fudge','Sin fudge','Con leche condensada','Sin leche condensada','Sin alguna fruta (indica cuál en la nota)'], multi:5, opcional:true},
  sandOpts:  {label:'Ajustes (opcional)', opts:['Sin sarza','Sin mayonesa','Sin verduras','Sin palta','Sin queso','Sin tocino'], multi:6, opcional:true},
  alcohol:   {label:'Alcohol', opts:['Regular','Más alcohol','Poco alcohol','Sin alcohol'], def:'Regular', hideDef:true},
  hieloC:    {label:'Hielo', opts:['Normal','Poco hielo','Sin hielo'], def:'Normal', hideDef:true},
  dulzorC:   {label:'Dulzor', opts:['Regular','Sin dulce','Más dulce'], def:'Regular', hideDef:true},
};
/* La carta de abajo es la SEMILLA inicial: la primera vez se copia a la base de
   datos y desde ahí se edita en la app (Gestión → Carta). Cambios aquí solo
   aplican si la base aún no tiene carta guardada. */
let MENU = [
 {cat:'Triples', station:'salados', acomp:['Servilletas','Cubiertos','Salsas de mesa'], items:[
   {n:'Club sandwich', p:15, d:'Pollo, tocino, jamón, cheddar, huevo, verduras', mods:['sandOpts']},
   {n:'Triple clásico', p:10, d:'Huevo sancochado, palta, tomate', mods:['sandOpts']},
   {n:'Mixto', p:10, d:'Doble queso cheddar, doble jamón', mods:['sandOpts']}]},
 {cat:'Pan cajabambino', station:'salados', acomp:['Servilletas','Cubiertos','Salsas de mesa'], items:[
   {n:'Mixto de la casa', p:12, d:'Cerdo asado y lomo, queso suizo', mods:['sandOpts']},
   {n:'Asado', p:12, d:'Filetes de res', mods:['sandOpts']},
   {n:'Lomo asado', p:12, d:'Lomo de cerdo asado, sarza', mods:['sandOpts']},
   {n:'Butifarra', p:12, d:'Jamón del país, lechuga, sarza criolla', mods:['sandOpts']},
   {n:'Chicharrón de cerdo', p:12, d:'Con camote y sarza criolla', mods:['sandOpts']}]},
 {cat:'Hamburguesas', station:'salados', acomp:['Servilletas','Cubiertos','Salsas de mesa'], items:[
   {n:'Clásica', p:10, d:'Carne 100 g, lechuga, tomate, salsa especial'},
   {n:'Cheese', p:12, d:'+ queso'},
   {n:'Royal', p:12, d:'+ huevo frito'},
   {n:'Royal cheese', p:15, d:'+ huevo frito y queso'},
   {n:'Pueblerina', p:18, d:'Doble carne, doble cheddar, tocino, pepinillos'}]},
 {cat:'Alitas', station:'salados', acomp:['Servilletas','Cubiertos','Salsas elegidas'], items:[
   {n:'Alitas x 4', p:14, d:'Con papas fritas', mods:['salsa1','aparte']},
   {n:'Alitas x 6', p:18, d:'Con papas fritas', mods:['salsa2','aparte']},
   {n:'Alitas x 12', p:30, d:'Con papas fritas', mods:['salsa3','aparte']},
   {n:'Ronda de alitas (24)', p:50, d:'Con papas fritas', mods:['salsa4','aparte']}]},
 {cat:'Waffles', station:'dulces', acomp:['Cubiertos','Servilletas'], items:[
   {n:'Waffles clásico', p:10, d:'Fresa, plátano y miel', mods:['wafOpts']},
   {n:'Chocomania', p:12, d:'Waffle de chocolate, helado, fudge, brownie', mods:['wafOpts']},
   {n:'Dulce amor', p:12, d:'Fresas, crema, helado de vainilla', mods:['wafOpts']},
   {n:'Rock y nueces', p:12, d:'Frutos secos, helado de chocolate, caramelo', mods:['wafOpts']},
   {n:'Pueblerino', p:12, d:'Frutas locales, pecanas, fudge y manjar', mods:['helado','wafOpts']}]},
 {cat:'Copas de helado', station:'dulces', acomp:['Cucharita','Servilletas'], items:[
   {n:'Copa tropical', p:12, d:'Maracumango y coco, piña, maracuyá', mods:['copaOpts']},
   {n:'Copa tentación', p:12, d:'Chocolate y cookies & cream, brownie', mods:['copaOpts']},
   {n:'Copa fresa', p:12, d:'Fresa y stracciatella, culis de fresa', mods:['copaOpts']},
   {n:'Banana Split', p:15, d:'Fresa, chocolate y vainilla, plátano', mods:['copaOpts']}]},
 {cat:'Milkshakes', station:'dulces', acomp:['Sorbete','Servilletas'], items:[
   {n:'Milkshake clásico', p:10, mods:['helado','mkOpts']},
   {n:'Milkshake de oreo', p:12, mods:['mkOpts']},
   {n:'Milkshake de piña colada', p:12, mods:['mkOpts']},
   {n:'Milkshake de baileys', p:12, mods:['mkOpts']},
   {n:'Milkshake de café', p:12, mods:['mkOpts']}]},
 {cat:'Ensaladas de fruta', station:'dulces', acomp:['Cubiertos','Servilletas'], items:[
   {n:'Ensalada de frutas clásica', p:10, d:'Frutas, frutos secos, yogurt'},
   {n:'Ensalada de frutas especial', p:12, d:'+ salsa especial, coco rayado'},
   {n:'Ensalada de frutas pueblerina', p:15, d:'+ helado a elección', mods:['helado']},
   {n:'Parfait', p:10, d:'Yogurt griego, granola y miel'}]},
 {cat:'Postres de la semana', station:'dulces', acomp:['Cubiertos','Servilletas'], items:[
   {n:'Cuchareable de la semana', p:7, d:'Fuera de carta — escribe cuál en la nota (ej. Tres leches)', reqNote:true},
   {n:'Torta de la semana', p:7, d:'Fuera de carta — escribe cuál en la nota (ej. Torta de zanahoria)', reqNote:true}]},
 {cat:'Bebidas calientes', station:'dulces', acomp:['Azúcar / endulzante','Cucharita','Servilletas'], items:[
   {n:'Americano', p:5, mods:['cafeOpts']},{n:'Espresso', p:5, mods:['cafeOpts']},{n:'Latte', p:6, mods:['cafeOpts']},
   {n:'Mocca', p:8, mods:['cafeOpts']},{n:'Capuccino', p:8, mods:['cafeOpts']},{n:'Moccaccino', p:8, mods:['cafeOpts']},
   {n:'Macchiato', p:8, mods:['macchiato','cafeOpts']},
   {n:'Café al caramelo', p:10, d:'Café, caramelo, leche, crema', mods:['cafeOpts']},
   {n:'Affogato clásico', p:10, d:'Helado de vainilla, shot de espresso'}]},
 {cat:'Frappes', station:'dulces', acomp:['Sorbete','Servilletas'], items:[
   {n:'Frappe clásico', p:10, d:'Café, hielo, leche, crema', mods:['frapOpts']},
   {n:'Frappe caramelo', p:12, d:'+ caramelo salado', mods:['frapOpts']},
   {n:'Frappe oreo', p:12, mods:['frapOpts']},{n:'Frappe mocca', p:12, mods:['frapOpts']}]},
 {cat:'Batidos', station:'dulces', acomp:['Sorbete','Servilletas'], items:[
   {n:'Batido de fresa', p:8, mods:['temp','azucar','batOpts']},
   {n:'Batido de plátano', p:8, mods:['temp','azucar','batOpts']},
   {n:'Batido de mango', p:8, mods:['temp','azucar','batOpts']},
   {n:'Batido mango + durazno', p:10, mods:['temp','azucar','batOpts']},
   {n:'Batido fresa + mango', p:10, mods:['temp','azucar','batOpts']}]},
 {cat:'Jugos clásicos', station:'dulces', acomp:['Sorbete','Servilletas'], items:[
   {n:'Jugo de fresa', p:5, mods:['temp','azucar']},
   {n:'Jugo de papaya', p:5, mods:['temp','azucar']},
   {n:'Jugo de piña', p:5, mods:['temp','azucar']}]},
 {cat:'Jugos combinados', station:'dulces', acomp:['Sorbete','Servilletas'], items:[
   {n:'Jugo fresa + mango', p:8, mods:['temp','azucar']},
   {n:'Jugo piña + maracuyá', p:8, mods:['temp','azucar']},
   {n:'Jugo piña + papaya', p:8, mods:['temp','azucar']},
   {n:'Jugo surtido', p:8, mods:['temp','azucar']},
   {n:'Jugo especial', p:8, mods:['temp','azucar']}]},
 {cat:'Cocteles clásicos', station:'dulces', acomp:['Servilletas'], items:[
   {n:'Daiquiri', p:18, mods:['daiquiri','alcohol','hieloC','dulzorC']},
   {n:'Piña colada', p:16, mods:['alcohol','hieloC','dulzorC']},
   {n:'Mojito', p:16, mods:['mojito','alcohol','hieloC','dulzorC']},
   {n:'Pisco sour', p:18, mods:['pisco','alcohol','hieloC','dulzorC']},
   {n:'Algarrobina', p:18, mods:['alcohol','hieloC','dulzorC']},{n:'Chilcano', p:15, mods:['alcohol','hieloC','dulzorC']},{n:'Machu Picchu', p:20, mods:['alcohol','hieloC','dulzorC']}]},
 {cat:'Cocteles de la casa', station:'dulces', acomp:['Servilletas'], items:[
   {n:'Margarita passion', p:20, mods:['alcohol','hieloC','dulzorC']},{n:'Un solo viaje', p:25, mods:['alcohol','hieloC','dulzorC']},
   {n:'Liga del sueño', p:22, mods:['alcohol','hieloC','dulzorC']},{n:'Coco loco', p:18, mods:['alcohol','hieloC','dulzorC']}]},
 {cat:'Cervezas y otras', station:'dulces', acomp:['Vaso','Servilletas'], items:[
   {n:'Corona', p:10, mods:['frio']},{n:'Heineken', p:10, mods:['frio']},
   {n:'Agua', p:3, mods:['agua','frio']}]},
];
// productos de rápida elaboración (pedido de Martín: bebidas, postres porcionados, waffles)
const LATE_MIN = 10; // minutos para considerar retrasado un producto rápido (dulces/barra)
const SALADO_LATE_MIN = 20; // minutos para considerar retrasado un producto de salados
const RAPIDOS = new Set(['Waffles','Copas de helado','Milkshakes','Ensaladas de fruta','Postres de la semana',
  'Bebidas calientes','Frappes','Batidos','Jugos clásicos','Jugos combinados',
  'Cocteles clásicos','Cocteles de la casa','Cervezas y otras']);
// semilla limpia (copiada ANTES de indexar, para migrar a la base la primera vez)
const MENU_SEED = JSON.parse(JSON.stringify(MENU));
// index rápido (se reconstruye cada vez que la carta cambia)
let PROD = {};
function buildProdIndex(){
  PROD = {};
  MENU.forEach(c=>{
    c.items = Array.isArray(c.items) ? c.items.filter(Boolean) : Object.values(c.items || {});
    c.items.forEach(it=>{ it.cat=c.cat; it.station=c.station; it.acomp=c.acomp; it.rapido=RAPIDOS.has(c.cat); PROD[it.n]=it; });
  });
}
buildProdIndex();
/* reemplaza la carta activa por la guardada en la base (sincronizada) */
function setCarta(carta){
  if(!carta) return;
  const arr = Array.isArray(carta) ? carta.filter(Boolean) : Object.values(carta);
  if(!arr.length) return;
  MENU = arr;
  buildProdIndex();
}
function lateMinFor(it){
  // umbral de retraso según la cocina: salados 20 min, rápidos de dulces/barra 10 min.
  if(it.station==='salados') return SALADO_LATE_MIN;
  if(PROD[it.name] && PROD[it.name].rapido) return LATE_MIN;
  return null; // sin umbral definido → nunca marca retraso
}
function isLate(o, it){
  if(it.estado!=='pendiente' && it.estado!=='preparando') return false;
  const um = lateMinFor(it);
  if(um === null) return false;
  const ped = it.tsPed || o.ts;   // desde que se SOLICITÓ el ítem (no desde que abrió la comanda)
  return elapsedMin(ped, Date.now()) >= um;
}
