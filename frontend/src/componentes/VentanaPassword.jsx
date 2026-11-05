import { useEffect } from 'react'
import FormularioPassword from './FormularioPassword.jsx'

export default function VentanaPassword({ onListo, onCerrar }) {
  useEffect(() => {
    const alPresionar = (e) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', alPresionar)
    return () => window.removeEventListener('keydown', alPresionar)
  }, [onCerrar])

  return (
    <div className="modal-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-password">
        <h2 id="titulo-password">Cambiar mi contraseña</h2>
        <p className="sutil nota-panel">Al guardar, las demás sesiones abiertas con esta cuenta se cerrarán.</p>
        <FormularioPassword textoBoton="Cambiar contraseña" onListo={onListo} onCancelar={onCerrar} />
      </div>
    </div>
  )
}
