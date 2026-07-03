# Pueblo CaféBar — Sistema de Comandas 

Aplicación web para la gestión operativa de Pueblo CaféBar (Cajabamba):
toma de pedidos con modificadores, cocinas separadas (salados / dulces-barra),
caja con pagos y tiempos, y gestión interna (compras, apertura/cierre, recetas).

## Características

- **Pedidos**: buscador de productos, modificadores reales del café (temperatura
  con 4 niveles, azúcar, salsas, ajustes por categoría), mesa o para llevar,
  edición y separación de ítems, anulación por ítem o pedido completo.
- **Cocinas**: cola en tiempo real por estación, estados (pendiente → preparando
  → listo), sugerencia de preparación por lotes para jugos/batidos, recetas a un
  toque, alerta de **pedido retrasado** (>10 min en productos rápidos).
- **Caja**: registro del día, cuenta imprimible, pago Efectivo/Yape, totales por
  método, tiempos de salida, exportación CSV.
- **Gestión**: lista de compras colaborativa, checklist de apertura/cierre con
  responsables, repositorio de recetas (conectado a cocina por nombre de producto).
- **Login por PIN** con roles (admin, atención/barra, cocinas).
- **Dos modos**: local (sin configuración, datos por dispositivo) o
  **sincronizado** con Firebase Realtime Database (multi-dispositivo).

## Estructura

```
index.html            página única (carga todo)
css/estilos.css       estilos
js/config.js          ⚙ CONFIGURACIÓN: Firebase + usuarios/PINes  ← editar aquí
js/menu.js            🍔 menú, precios y modificadores             ← editar aquí
js/sync.js            capa de sincronización (Firebase o local)
js/app.js             lógica de la interfaz
GUIA_INSTALACION.md   cómo publicar en GitHub Pages + Firebase
```

## Puesta en marcha

Ver **GUIA_INSTALACION.md**. Resumen: subir a GitHub → activar Pages →
crear proyecto Firebase (Realtime DB + auth anónima) → pegar la config en
`js/config.js` → cambiar los PINes.

Sin configurar Firebase, la app funciona igualmente en modo local
(útil para probar en un solo dispositivo).

---
Proyecto interno de Pueblo CaféBar · v1 (piloto)
