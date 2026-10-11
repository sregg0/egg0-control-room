# SREGGO Control Room V16 — Paso 1 (Render)

**Panel web:** https://egg0-control-room.onrender.com/  
**Salida para fuente de navegador de OBS:** https://egg0-control-room.onrender.com/output  
**Tamaño en OBS:** 1920 × 1080

La pantalla del panel calcula automáticamente la URL de Output usando el dominio donde está abierta. El servidor utiliza `process.env.PORT` en Render (con 5173 como valor predeterminado local).

## Publicar en Render

Sube los archivos a la rama `main` del repositorio conectado a Render. Mantén la configuración actual del servicio si ya funciona con `npm run dev`.

## OBS (tu PC)

En OBS, añade una **Fuente de navegador** apuntando a `https://egg0-control-room.onrender.com/output`, con ancho `1920` y alto `1080`.

**Importante:** este paso NO conecta el OBS local de forma remota al personal del staff. La opción OBS WebSocket `ws://127.0.0.1:4455` solo sirve desde el navegador ejecutado en la misma computadora de OBS (y puede estar bloqueada por las restricciones de seguridad de un sitio HTTPS). El puente remoto se implementará en un paso posterior.

## Ejecutar localmente (solo pruebas)

```powershell
npm install
npm run dev
```

El estado de escenas todavía se guarda en localStorage por navegador, y el backend conserva estado y archivos en disco efímero. Estos puntos requieren los siguientes pasos antes de depender del sistema para producción.
