**V18.12:** orden estable de los iframes de VDO.Ninja en /output. Antes, al cambiar de escena React podía reordenar los iframes del pool; mover un iframe en el DOM lo recarga, y la cámara se veía pegada o negra mientras VDO.Ninja se reconectaba. Ahora los iframes nuevos se añaden al final y nunca se reordenan. Además, los participantes ocultos se aparcan a tamaño completo (antes 320×180), detrás del fondo de la escena.

**V18.11:** modos de prueba `&park=none|tiny|faint` en /output, panel de diagnóstico abajo a la izquierda (tecla D) y estadísticas de video de VDO.Ninja.

**V18.10:** los participantes ocultos ya no usan opacity:0 (congelaba el video); se parquean detrás de la escena con z-index negativo.

**V18.9:** el panel de diagnóstico ya no se llena con view-stats de VDO.Ninja (una sola línea de estadísticas por cámara).

**V18.8:** diagnóstico ampliado en /output?debug=1 (posición real de cada cámara y mensajes que envía VDO.Ninja). Añade &nomute=1 para desactivar el mensaje de silenciado.

**V18.7:** modo «Siempre cargados» (por defecto): todos los participantes del perfil quedan conectados y ocultos en /output. Se guarda en el servidor, así que se reconectan solos si recargas OBS.

**V18.6:** los participantes de la escena anterior se mantienen conectados un corte más (volver a la escena anterior es instantáneo). Se bloquea usar la URL de /output como participante.

**Diagnóstico:** abre `/output?debug=1` para ver montajes/cargas de cada iframe VDO.Ninja y si la página se recarga.

# SREGGO Control Room V18.6 — Diagnóstico + Precarga

El cambio de escenas en `/output` es instantáneo: no hay fade, desvanecimiento, espera de precarga ni animaciones de transición. La escena publicada reemplaza directamente a la anterior.

**Nota:** las fuentes externas (VDO.Ninja, videos y archivos remotos) pueden tardar en cargar aunque no exista una transición. Mantén OBS apuntando a `/output`.

# SREGGO Control Room V18.1 — TV Output

## Qué cambia
- Desvanecimiento **único** de 300 ms en `/output`, no en OBS.
- Sin esperas artificiales ni optimizadores o precarga automática de escenas.
- Conserva la escena saliente mientras se decodifican las imágenes de la entrante.
- Una vez completado el desvanecimiento, el DOM de la escena nueva sigue montado; evita volver a iniciar cámaras por ese motivo.
- Canal de eventos en tiempo real de Render a `/output` y respaldo si se cae la conexión.

## Importante
- Las imágenes nuevas pueden necesitar descargarse antes de empezar el desvanecimiento; no hay espera fija, pero tampoco podemos prometer 0 ms de red.
- El inicio de video de VDO.Ninja (WebRTC) no puede certificarse con `iframe.onload`; se debe comprobar con participantes reales.
- Esta versión NO implementa control remoto global de OBS y no debe confundirse el estado del navegador con el de OBS.
- El servidor aún almacena estado y archivos en disco local. En Render, esto requiere persistencia configurada para sobrevivir despliegues/reinicios.
- **Prueba en una rama o instancia de Render independiente antes de sustituir producción.**


## V18.4 - Anti-negro, precarga y menos retraso
- Pestaña **Precarga**: los participantes quedan conectados y ocultos en /output; al enviar la escena solo se reposicionan. Modo automático: sigue a la escena seleccionada.
- Al seleccionar una escena, /output calienta sus imágenes/videos (evento `warm`).
- «Enviar al aire» difunde por SSE antes de escribir en disco (escritura asíncrona).

## V18.4 (anti-negro) + Precarga de participantes
Nueva pestaña **Precarga**: los participantes marcados quedan conectados y ocultos en /output; al enviar la escena al aire solo se posicionan. Los iframes de VDO.Ninja viven en un pool persistente y no se desmontan al cambiar de escena.

## V18.4 (anti-negro)
En /output la escena anterior permanece hasta que las imágenes nuevas se decodifican (corte directo, sin fade). Los archivos de /uploads ahora se cachean (nombres únicos), así que no se vuelven a descargar en cada cambio.

## V18.3 - Corte instantáneo, sin transiciones
En `/output` se renderiza solamente la escena actual con `SceneRenderer`. No se usan fundidos, capas de transición, temporizadores de espera ni precarga. La recepción de órdenes se hace por SSE y GET de respaldo. Las fuentes nuevas (incluyendo VDO.Ninja) pueden tener latencia de carga propia.
