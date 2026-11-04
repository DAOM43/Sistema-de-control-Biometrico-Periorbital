import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { Logo } from '../componentes/Layout.jsx'

export default function Login({ onIngreso }) {
  const navegar = useNavigate()
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [verPassword, setVerPassword] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function ingresar(evento) {
    evento.preventDefault()
    setError('')
    setEnviando(true)
    try {
      const datos = await api.post('/api/auth/login', { nombre_usuario: usuario.trim(), password })
      onIngreso(datos)
      navegar('/marcaje', { replace: true })
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="login">
      <form className="login-tarjeta" onSubmit={ingresar}>
        <span className="marca-logo grande" aria-hidden="true"><Logo tamano={22} /></span>
        <h1>Control de Asistencias</h1>
        <p className="sutil">Centro de Salud de Guazacapán</p>

        <label>
          Usuario
          <input value={usuario} onChange={(e) => setUsuario(e.target.value)}
            autoComplete="username" autoFocus required />
        </label>

        <label>
          Contraseña
          <div className="campo-password">
            <input type={verPassword ? 'text' : 'password'} value={password}
              onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            <button type="button" className="boton-texto" onClick={() => setVerPassword(!verPassword)}>
              {verPassword ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
        </label>

        {error && <p className="aviso alerta" role="alert">{error}</p>}

        <button type="submit" className="boton primario" disabled={enviando}>
          {enviando ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}