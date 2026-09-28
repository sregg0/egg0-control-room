# SREGGO Control Room V16

V16 mantiene el motor estable de Output e introduce un renderer persistente.

- Panel: http://localhost:5173/
- Fuente OBS: http://localhost:5173/output
- Fuente OBS: 1920x1080
- VDO.Ninja se mantiene como iframe/WebRTC directo y no se desmonta al cambiar de escena.
- Las imágenes y videos de todas las escenas se precargan en Output.
- Cambiar escenas cambia visibilidad, capas y geometría; no reconecta la cámara.

## Inicio

```powershell
npm install
npm run dev
```

Mantén la terminal abierta mientras uses el panel.
