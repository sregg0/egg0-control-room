import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [selectedScene, setSelectedScene] = useState('INTRO');
  const [programStatus, setProgramStatus] = useState('');

  const handleSelectScene = (scene) => {
    setSelectedScene(scene);
  };

  const sendToProgram = async () => {
    try {
      const response = await fetch('/api/program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneName: selectedScene, layers: [], participants: [] })
      });
      const data = await response.json();
      if (data.success) {
        setProgramStatus(`¡Escena ${selectedScene} enviada al aire con éxito!`);
      }
    } catch (err) {
      console.error("Error al enviar al aire:", err);
    }
  };

  return (
    <div>
      <div className="brutal-box" style={{ marginBottom: '20px' }}>
        <h2>Escena Seleccionada (Preview): <span style={{ color: '#ffee00' }}>{selectedScene}</span></h2>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {['INTRO', 'CAMARA', 'JUEGO', 'PARTICIPANTES', 'BRB', 'FINAL'].map((scene) => (
            <button key={scene} className="brutal-btn" onClick={() => handleSelectScene(scene)}>
              {scene}
            </button>
          ))}
        </div>
      </div>

      <div className="brutal-box">
        <button className="brutal-btn btn-go" onClick={sendToProgram}>
          🚀 ACTUALIZAR / ENVIAR AL AIRE (PROGRAM)
        </button>
        {programStatus && <p style={{ marginTop: '15px', color: '#ffee00', fontWeight: 'bold' }}>{programStatus}</p>}
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root') || document.body.appendChild(document.createElement('div')));
root.render(<App />);