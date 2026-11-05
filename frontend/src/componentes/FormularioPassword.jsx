import { useState } from 'react'
import { api } from '../api.js'
import { REGLA_PASSWORD, problemaPassword } from '../utilidades/password.js'

export default function FormularioPassword({ etiquetaActual = 'Contraseña actual', textoBoton, onListo, onCancelar }) {
  const [datos, setDatos] = useState({ actual: '', nueva: '', confirmar: '' })
  const [ver, setVer] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const actualizar = (campo) => (e) => {
    setDatos({ ...datos, [campo]: e.target.value })
    setError('')
  }

  const problema = datos.nueva ? problemaPassword(datos.nueva) : ''
  const noCoincide = datos.confirmar && datos.confirmar !== datos.nueva
  const valido = datos.actual && datos.nueva && !problema && datos.confirmar === datos.nueva

  async function guardar(evento) {
    evento.preventDefault()
    setEnviando(true)
    setError('')
    try {
      onListo(await api.post('/api/auth/cambiar-password', { actual: datos.actual, nueva: datos.nueva }))
    } catch (e) {
      setError(e.message)
      setEnviando(false)
    }
  }

  const tipo = ver ? 'text' : 'password'

  return (
    <form className="formulario-password" onSubmit={guardar}>
      <label>
        {etiquetaActual}
        <input type={tipo} value={datos.actual} onChange={actualizar('actual')} autoComplete="current-password" autoFocus required />
      </label>
      <label>
        Contraseña nueva
        <input type={tipo} value={datos.nueva} onChange={actualizar('nueva')} autoComplete="new-password"
          aria-invalid={Boolean(problema)} required />
        <span className={`ayuda ${problema ? 'error' : ''}`}>{problema || REGLA_PASSWORD}</span>
      </label>
      <label>
        Confirmar contraseña nueva
        <input type={tipo} value={datos.confirmar} onChange={actualizar('confirmar')} autoComplete="new-password"
          aria-invalid={Boolean(noCoincide)} required />
        {noCoincide && <span className="ayuda error">Las contraseñas no coinciden.</span>}
      </label>
      <label className="interruptor">
        <input type="checkbox" checked={ver} onChange={(e) => setVer(e.target.checked)} />
        Mostrar contraseñas
      </label>

      {error && <p className="aviso alerta" role="alert">{error}</p>}

      <div className="botones-derecha">
        {onCancelar && <button type="button" className="boton secundario" onClick={onCancelar}>Cancelar</button>}
        <button type="submit" className="boton primario" disabled={!valido || enviando}>
          {enviando ? 'Guardando...' : textoBoton}
        </button>
      </div>
    </form>
  )
}
