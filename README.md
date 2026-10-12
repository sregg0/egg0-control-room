# SREGGO Control Room V18 — Transiciones de televisión

V18 conserva perfiles, participantes y pizarras de V17.

- `/output` usa una única disolución de **300 ms** mediante Web Animations API.
- Mantiene la escena anterior montada hasta finalizar el efecto y conserva la entrante.
- Recibe avisos SSE de Render; rechaza eventos de versiones antiguas.
- No aplica precargas ni optimizadores.
- La carga de una nueva cámara VDO.Ninja puede tardar por causas de red: la disolución no asegura que una cámara sin imagen ya esté lista.
- **Prueba en una rama/servicio de ensayo antes de desplegar en producción.**
- Requiere una sola instancia de Render o un bus de eventos compartido para SSE si hay varias instancias.
