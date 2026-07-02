'use strict';
/* =====================================================================
   CONFIGURACIÓN — Pueblo CaféBar
   Este es el ÚNICO archivo que necesitas editar para poner la app en línea.
   ===================================================================== */

/* 1) FIREBASE — configuración del proyecto "pueblo-cafe".
   Estas claves web son públicas por diseño (van en el frontend); la
   seguridad la dan las reglas de la base de datos + la autenticación.   */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAmB1Iwg3f2HuMlVW7gIFTcUH_y7lfRWRY",
  authDomain: "pueblo-cafe.firebaseapp.com",
  databaseURL: "https://pueblo-cafe-default-rtdb.firebaseio.com",
  projectId: "pueblo-cafe",
  storageBucket: "pueblo-cafe.firebasestorage.app",
  messagingSenderId: "692760524460",
  appId: "1:692760524460:web:b90b40f217c2683f3ad109"
};

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
