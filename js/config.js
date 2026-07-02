'use strict';
/* =====================================================================
   CONFIGURACIÓN — Pueblo CaféBar
   Este es el ÚNICO archivo que necesitas editar para poner la app en línea.
   ===================================================================== */

/* 1) FIREBASE — pega aquí la configuración de tu proyecto.
   (La consigues en: consola de Firebase → Configuración del proyecto →
    Tus apps → SDK de Firebase → Configuración. Ver GUIA_INSTALACION.md)

   Mientras esté en `null`, la app funciona en MODO LOCAL:
   todo se guarda solo en el dispositivo, sin sincronización.        */

const FIREBASE_CONFIG = null;
/* Ejemplo de cómo debe quedar (con TUS valores):
const FIREBASE_CONFIG = {
  apiKey: "AIzaSy...",
  authDomain: "pueblo-cafe.firebaseapp.com",
  databaseURL: "https://pueblo-cafe-default-rtdb.firebaseio.com",
  projectId: "pueblo-cafe",
  storageBucket: "pueblo-cafe.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123"
};
*/

/* 2) USUARIOS Y PINES — cada persona entra con su PIN de 4 dígitos.
   Roles disponibles:
     admin          → ve todo (pedidos, ambas cocinas, caja y gestión)
     barra_atencion → pedidos + cocina dulces/barra + caja + gestión
     atencion       → pedidos + caja + gestión
     cocina_salados → cocina salados + gestión
     cocina_dulces  → cocina dulces + gestión
   ¡CAMBIA estos PINES antes de usar en serio!                        */

const PINS = {
  '1111': { nombre: 'Martín',    rol: 'admin' },
  '2222': { nombre: 'Cristhian', rol: 'cocina_salados' },
  '3333': { nombre: 'Renato',    rol: 'barra_atencion' },
};

/* Qué vistas ve cada rol (puedes ajustar libremente) */
const ROL_VISTAS = {
  admin:          ['mesero','dulces','salados','registro','gestion'],
  barra_atencion: ['mesero','dulces','registro','gestion'],
  atencion:       ['mesero','registro','gestion'],
  cocina_salados: ['salados','gestion'],
  cocina_dulces:  ['dulces','gestion'],
};
