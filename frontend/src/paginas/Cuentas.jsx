import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { formatoFecha, formatoHora } from '../utilidades/formato.js'
import { REGLA_PASSWORD, generarTemporal, problemaPassword } from '../utilidades/password.js'

const ROLES = {
  administrador: 'Administrador',
  personal_administrativo: 'Personal administrativo',
  recepcion: 'Recepción',
}

function bloqueada(cuenta) {
  return cuenta.bloqueado_hasta && new Date(cuenta.bloqueado_hasta) > new Date()
}

function fechaHora(valor) {
  const [fecha, hora] = valor.split('T')
  return `${formatoFecha(fecha)} ${formatoHora(hora)}`
}

function Estado({ cuenta }) {
  if (bloqueada(cuenta)) {
    return <span className="insignia bloqueada">Bloqueada hasta {formatoHora(cuenta.bloqueado_hasta.split('T')[1])}</span>
  }
  if (cuenta.debe_cambiar_password) return <span className="insignia pendiente">Cambio de contraseña pendiente</span>
  return <span className="insignia activo">Activa</span>
}

function FilaCuenta({ cuenta, esPropia, onActualizada }) {
  const [modo, setModo] = useState(null)
  const [nombre, setNombre] = useState(cuenta.nombre_completo)
  const [temporal, setTemporal] = useState('')
  const [entregada, setEntregada] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  function abrir(nuevoModo) {
    setModo(nuevoModo)
    setError('')
    setEntregada('')
    setNombre(cuenta.nombre_completo)
    setTemporal(nuevoModo === 'restablecer' ? generarTemporal() : '')
  }

  async function ejecutar(accion) {
    setEnviando(true)
    setError('')
    try {
      onActualizada(await accion())
      return true
    } catch (e) {
      setError(e.message)
      return false
    } finally {
      setEnviando(false)
    }
  }

  async function guardarNombre(evento) {
    evento.preventDefault()
    if (await ejecutar(() => api.put(`/api/cuentas/${cuenta.id}`, { nombre_completo: nombre.trim() }))) setModo(null)
  }

  async function restablecer(evento) {
    evento.preventDefault()
    const ok = await ejecutar(() => api.post(`/api/cuentas/${cuenta.id}/restablecer-password`, { password_temporal: temporal }))
    if (ok) {
      setEntregada(temporal)
      setModo(null)
    }
  }

  const problemaTemporal = temporal ? problemaPassword(temporal) : ''

  return (
    <>
      <tr>
        <td>
          <strong>{cuenta.nombre_usuario}</strong>
          <span className="codigo-tabla">{ROLES[cuenta.rol] ?? cuenta.rol}</span>
        </td>
        <td>{cuenta.nombre_completo}{esPropia && <span className="codigo-tabla">Su cuenta</span>}</td>
        <td><Estado cuenta={cuenta} /></td>
        <td className="sin-salto">{fechaHora(cuenta.password_actualizado_en)}</td>
        <td className="derecha">
          <button type="button" className="boton-texto" onClick={() => abrir('editar')}>Cambiar responsable</button>
          {!esPropia && (
            <button type="button" className="boton-texto" onClick={() => abrir('restablecer')}>Restablecer contraseña</button>
          )}
          {bloqueada(cuenta) && (
            <button type="button" className="boton-texto" disabled={enviando}
              onClick={() => ejecutar(() => api.post(`/api/cuentas/${cuenta.id}/desbloquear`))}>
              Desbloquear
            </button>
          )}
        </td>
      </tr>

      {(modo || entregada || error) && (
        <tr className="fila-detalle">
          <td colSpan={5}>
            {modo === 'editar' && (
              <form className="detalle-cuenta" onSubmit={guardarNombre}>
                <label>
                  Nombre de la persona responsable de la cuenta {cuenta.nombre_usuario}
                  <input value={nombre} onChange={(e) => setNombre(e.target.value)} minLength={3} maxLength={150} autoFocus required />
                </label>
                <div className="botones-derecha">
                  <button type="button" className="boton secundario" onClick={() => setModo(null)}>Cancelar</button>
                  <button type="submit" className="boton primario"
                    disabled={enviando || nombre.trim().length < 3 || nombre.trim() === cuenta.nombre_completo}>
                    Guardar
                  </button>
                </div>
              </form>
            )}

            {modo === 'restablecer' && (
              <form className="detalle-cuenta" onSubmit={restablecer}>
                <label>
                  Contraseña temporal para {cuenta.nombre_usuario}
                  <div className="campo-con-boton">
                    <input value={temporal} onChange={(e) => setTemporal(e.target.value)} autoComplete="off" autoFocus required />
                    <button type="button" className="boton secundario" onClick={() => setTemporal(generarTemporal())}>Generar otra</button>
                  </div>
                  <span className={`ayuda ${problemaTemporal ? 'error' : ''}`}>
                    {problemaTemporal || `${REGLA_PASSWORD} La persona deberá cambiarla al iniciar sesión.`}
                  </span>
                </label>
                <div className="botones-derecha">
                  <button type="button" className="boton secundario" onClick={() => setModo(null)}>Cancelar</button>
                  <button type="submit" className="boton primario" disabled={enviando || Boolean(problemaTemporal) || !temporal}>
                    Restablecer
                  </button>
                </div>
              </form>
            )}

            {entregada && (
              <div className="aviso exito" role="status">
                <strong>Contraseña restablecida: {entregada}</strong>
                <span>
                  Entréguela a {cuenta.nombre_completo}. Al iniciar sesión deberá crear su propia contraseña.
                  Las sesiones abiertas con esta cuenta se cerraron.
                </span>
                <button type="button" className="boton-texto alinear-inicio" onClick={() => setEntregada('')}>Entendido</button>
              </div>
            )}

            {error && <p className="aviso alerta" role="alert">{error}</p>}
          </td>
        </tr>
      )}
    </>
  )
}

export default function Cuentas({ usuario, onCuentaPropia }) {
  const [cuentas, setCuentas] = useState([])
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    api.get('/api/cuentas')
      .then(setCuentas)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false))
  }, [])

  function reemplazar(actualizada) {
    setCuentas((lista) => lista.map((c) => (c.id === actualizada.id ? actualizada : c)))
    if (actualizada.id === usuario.id) onCuentaPropia(actualizada)
  }

  return (
    <section className="panel ancho">
      <div className="titulo-panel">
        <h2>Cuentas del sistema</h2>
        <p className="sutil nota-panel">
          Una cuenta por puesto. Cuando cambie la persona a cargo, actualice el responsable y restablezca la contraseña.
        </p>
      </div>

      {error && <p className="aviso alerta" role="alert">{error}</p>}

      <div className="tabla-contenedor">
        <table className="tabla tabla-cuentas">
          <thead>
            <tr>
              <th>Cuenta</th>
              <th>Responsable</th>
              <th>Estado</th>
              <th>Contraseña actualizada</th>
              <th className="derecha">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cuentas.map((c) => (
              <FilaCuenta key={c.id} cuenta={c} esPropia={c.id === usuario.id} onActualizada={reemplazar} />
            ))}
            {!cargando && cuentas.length === 0 && (
              <tr><td colSpan={5} className="vacio">No hay cuentas registradas.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="sutil nota-panel">
        Para cambiar la contraseña de su propia cuenta use la opción Cambiar contraseña en la parte superior.
      </p>
    </section>
  )
}
