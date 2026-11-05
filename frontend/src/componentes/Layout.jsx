import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import VentanaPassword from './VentanaPassword.jsx'

const TITULOS = {
  '/marcaje': 'Marcaje',
  '/enrolamiento': 'Enrolamiento',
  '/personal': 'Personal',
  '/contingencia': 'Contingencia',
  '/reportes': 'Reportes',
  '/cuentas': 'Cuentas',
  '/configuracion': 'Configuración',
}

const ICONOS = {
  marcaje: 'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  enrolamiento: 'M15 19a6 6 0 0 0-12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6',
  personal: 'M17 20a5 5 0 0 0-10 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM21 20a4 4 0 0 0-3-3.9M3 20a4 4 0 0 1 3-3.9',
  contingencia: 'M9 4h6v3H9zM9 5H6v16h12V5h-3M9 12h6M9 16h4',
  reportes: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  cuentas: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4M12 15v2',
  configuracion: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
}

function Icono({ ruta }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ruta} />
    </svg>
  )
}

export function Logo({ tamano = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={tamano} height={tamano} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  )
}

function iniciales(nombre) {
  return nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
}

export default function Layout({ usuario, puedeGestionar, esAdmin, onSalir, onSesion }) {
  const { pathname } = useLocation()
  const [cambiandoPassword, setCambiandoPassword] = useState(false)

  const alCambiarPassword = (datos) => {
    onSesion(datos)
    setCambiandoPassword(false)
  }

  return (
    <div className="app">
      <aside className="lateral">
        <div className="marca">
          <span className="marca-logo" aria-hidden="true"><Logo /></span>
          <div>
            <strong>Centro de Salud</strong>
            <small>Guazacapán</small>
          </div>
        </div>

        <nav className="menu">
          <NavLink to="/marcaje"><Icono ruta={ICONOS.marcaje} />Marcaje</NavLink>
          {puedeGestionar && <NavLink to="/enrolamiento"><Icono ruta={ICONOS.enrolamiento} />Enrolamiento</NavLink>}
          {puedeGestionar && <NavLink to="/personal"><Icono ruta={ICONOS.personal} />Personal</NavLink>}
          {puedeGestionar && <NavLink to="/contingencia"><Icono ruta={ICONOS.contingencia} />Contingencia</NavLink>}
          {puedeGestionar && <NavLink to="/reportes"><Icono ruta={ICONOS.reportes} />Reportes</NavLink>}
          {esAdmin && <span className="menu-separador">Administración</span>}
          {esAdmin && <NavLink to="/cuentas"><Icono ruta={ICONOS.cuentas} />Cuentas</NavLink>}
          {esAdmin && <NavLink to="/configuracion"><Icono ruta={ICONOS.configuracion} />Configuración</NavLink>}
        </nav>

        <p className="version">v1.0</p>
      </aside>

      <div className="contenido">
        <header className="encabezado">
          <h1>{TITULOS[pathname] ?? ''}</h1>
          <div className="usuario">
            <span>{usuario.nombre_completo}</span>
            <span className="avatar">{iniciales(usuario.nombre_completo)}</span>
            {esAdmin && (
              <button type="button" className="boton-texto" onClick={() => setCambiandoPassword(true)}>Cambiar contraseña</button>
            )}
            <button type="button" className="boton-texto" onClick={onSalir}>Cerrar sesión</button>
          </div>
        </header>
        <main className="pagina">
          <Outlet />
        </main>
      </div>

      {cambiandoPassword && <VentanaPassword onListo={alCambiarPassword} onCerrar={() => setCambiandoPassword(false)} />}
    </div>
  )
}
