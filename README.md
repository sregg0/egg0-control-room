# SREGGO Control Room V17 — versión de revisión

Panel React + Vite con Node.js, para Render y salida OBS Browser Source (`/output`).

## Funcionalidades incluidas en esta entrega
- Menú Perfiles y escenas dentro de cada perfil; duplicación, cambio de orden, renombrado y borrado.
- Participantes independientes por escena, límite 10, posicionamiento XY y VDO.Ninja.
- Pizarra individual por participante, enlace de edición único (`/pizarra/<id>?token=...`).
- Alternar cámara/pizarra individualmente o todos los participantes visibles de la escena.
- Cuando una escena está al aire en `/output`, cambiar cámara/pizarra modifica también la salida activa sin reenviar la escena.
- Dibujos en tiempo casi real mediante polling; se conservan al ocultar pizarra.
- Estado compartido entre navegadores por `/api/studio` y almacenamiento JSON en servidor; sincronización por sondeo.
- Migración inicial desde escenas V16 guardadas en el navegador (`v8Scenes`).

## IMPORTANTE ANTES DE PUBLICAR
1. **No desplegar aún para un evento público** sin proteger las rutas `/api/studio`, `/api/program`, `/api/program/mode`, `/api/preload`, `/api/upload` y los enlaces de pizarra con autenticación efectiva. Esta base no trae gestión de permisos del staff ni protección de dichas rutas. El bloqueo de una página web no equivale a proteger una API.
2. Render puede usar un **disco efímero**: los archivos `.studio-state.json`, `.board-state.json`, `.program-state.json` y `uploads/` pueden perderse con reinicios/despliegues. Para producción hay que pasar el estado y assets a almacenamiento persistente (por ejemplo, Postgres y object storage).
3. El OBS en tu PC **no se controla remotamente todavía**. Las escenas se muestran con Browser Source en `https://egg0-control-room.onrender.com/output`, sin crear escenas de OBS. La conexión WebSocket desde el panel sigue siendo local al navegador y no funciona para el staff remoto.
4. Los cambios del editor se envían al servidor automáticamente. En ediciones simultáneas todavía pueden ocurrir conflictos (última escritura gana). Se requiere endurecer sincronización antes del evento.
5. El enlace de pizarra permite editar; compártelo solo con la persona correspondiente. La visualización de la pizarra es pública dentro de la salida OBS.

## Desarrollo y pruebas
`npm install`
`npm run dev`
Abrir `http://localhost:5173`; salida `http://localhost:5173/output`.

## Publicación
Antes de cambiar la rama `main`, probar esta versión en una rama nueva / servicio de staging. Hacer copia de seguridad del repositorio y del estado de producción. La integración con el sistema de acceso ya existente debe revisarse por separado.
