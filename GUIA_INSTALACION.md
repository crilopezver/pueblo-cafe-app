# Guía de instalación — Pueblo CaféBar en línea

Sigue estos pasos una sola vez y la app quedará publicada en una URL,
sincronizada en tiempo real entre todos los dispositivos.
Tiempo estimado: **20–30 minutos**. Todo es gratis en este tamaño de uso.

---

## Paso 1 — Subir el proyecto a GitHub (≈10 min)

1. Entra a [github.com](https://github.com) con tu cuenta y crea un repositorio nuevo:
   botón **New** → nombre `pueblo-cafe-app` → déjalo **Public** (necesario para
   GitHub Pages gratis) → **Create repository**.
2. Sube los archivos de esta carpeta. La vía fácil sin usar la terminal:
   en el repo, **Add file → Upload files** y arrastra TODO el contenido de
   `pueblo-cafe-app` (respetando las carpetas `css/` y `js/`). Luego **Commit changes**.
   - Si prefieres terminal: `git init` → `git add .` → `git commit -m "primera versión"`
     → `git remote add origin <url-del-repo>` → `git push -u origin main`.
3. Activa GitHub Pages: en el repo, **Settings → Pages** →
   en *Source* elige **Deploy from a branch** → rama `main`, carpeta `/ (root)` → **Save**.
4. Espera 1-2 minutos. Tu app quedará en:
   `https://TU-USUARIO.github.io/pueblo-cafe-app/`
   Ábrela: debe funcionar ya, con el aviso **"MODO LOCAL"** (aún sin sincronización).

## Paso 2 — Crear el proyecto de Firebase (≈10 min)

1. Entra a [console.firebase.google.com](https://console.firebase.google.com)
   con tu cuenta de Google → **Crear un proyecto** → nombre `pueblo-cafe`
   → puedes desactivar Google Analytics → crear.
2. **Crear la base de datos:** menú izquierdo **Compilación → Realtime Database**
   → **Crear base de datos** → ubicación por defecto (Estados Unidos) →
   empezar en **modo bloqueado** → Habilitar.
3. **Activar el acceso anónimo:** menú **Compilación → Authentication** →
   **Comenzar** → pestaña *Sign-in method* → habilita **Anónimo** → Guardar.
4. **Reglas de la base:** en Realtime Database → pestaña **Reglas**, pega esto y publica:

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

5. **Obtener la configuración:** rueda dentada ⚙ → **Configuración del proyecto**
   → sección *Tus apps* → icono **</>** (Web) → registra la app con el nombre
   `pueblo-cafe-web` (no hace falta Hosting) → copia el bloque `firebaseConfig`.

## Paso 3 — Conectar la app (≈5 min)

1. En GitHub, abre `js/config.js` → botón del lápiz (Edit).
2. Reemplaza `const FIREBASE_CONFIG = null;` por tu configuración:

```js
const FIREBASE_CONFIG = {
  apiKey: "AIzaSy...",
  authDomain: "pueblo-cafe.firebaseapp.com",
  databaseURL: "https://pueblo-cafe-default-rtdb.firebaseio.com",
  projectId: "pueblo-cafe",
  storageBucket: "pueblo-cafe.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};
```

3. **En el mismo archivo, cambia los PINES** (no dejes los de ejemplo).
4. **Commit changes**. En 1-2 minutos, recarga la app: el aviso debe cambiar a
   **"🟢 CONECTADO · sincronizado en tiempo real"**.

## Paso 4 — Probar la sincronización (2 min)

Abre la URL en dos dispositivos (o dos navegadores). Entra como Renato en uno
y digita un pedido con jugos; entra como Martín o Cristhian en el otro:
el pedido debe aparecer al instante en la cocina correspondiente. 🎉

---

## Preguntas frecuentes

**¿Cuánto cuesta?** Nada a esta escala. GitHub Pages es gratis; el plan
gratuito de Firebase (Spark) soporta muchísimo más que un café de 5 mesas.

**¿Es seguro?** Razonable para un piloto: la base exige autenticación y los
PINES controlan quién ve qué dentro de la app. La URL conviene no publicarla
en redes. Para producción "seria" se puede endurecer (usuarios reales de
Firebase Auth) — lo evaluamos después del piloto.

**¿Y si se corta el internet del local?** La app no podrá sincronizar hasta
que vuelva (Firebase reintenta solo). Si esto pasara seguido, el plan B es un
servidor local en la computadora del café — el código está preparado para ese cambio.

**¿Cómo agrego/cambio productos del menú?** Editando `js/menu.js` en GitHub
(misma mecánica del lápiz + commit). Los cambios llegan a todos al recargar.

**¿Cómo cambio usuarios o PINES?** En `js/config.js`, sección `PINS`.

**¿Cómo borro los datos de prueba antes de arrancar en serio?** Entra como
admin → REGISTRO/CAJA → "Reiniciar demo" (borra comandas; conserva recetas,
tareas y compras).
