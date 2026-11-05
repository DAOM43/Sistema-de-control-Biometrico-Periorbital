import { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { guardarSesion, leerSesion } from './api.js'
import Layout from './componentes/Layout.jsx'
import Login from './paginas/Login.jsx'
import CambioObligatorio from './paginas/CambioObligatorio.jsx'
import Marcaje from './paginas/Marcaje.jsx'
import Enrolamiento from './paginas/Enrolamiento.jsx'
import Personal from './paginas/Personal.jsx'
import Contingencia from './paginas/Contingencia.jsx'
import Reportes from './paginas/Reportes.jsx'
import Cuentas from './paginas/Cuentas.jsx'
import Configuracion from './paginas/Configuracion.jsx'

const GESTION = ['administrador', 'personal_administrativo']

export default function App() {
  const [sesion, setSesion] = useState(leerSesion)

  const iniciar = (datos) => {
    guardarSesion(datos)
    setSesion(datos)
  }

  const cerrar = () => {
    guardarSesion(null)
    setSesion(null)
  }

  const actualizarUsuario = (cambios) => {
    iniciar({ ...sesion, usuario: { ...sesion.usuario, nombre_completo: cambios.nombre_completo } })
  }

  if (!sesion) {
    return (
      <Routes>
        <Route path="/login" element={<Login onIngreso={iniciar} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  if (sesion.usuario.debe_cambiar_password) {
    return (
      <Routes>
        <Route path="*" element={<CambioObligatorio usuario={sesion.usuario} onListo={iniciar} onSalir={cerrar} />} />
      </Routes>
    )
  }

  const puedeGestionar = GESTION.includes(sesion.usuario.rol)
  const esAdmin = sesion.usuario.rol === 'administrador'

  return (
    <Routes>
      <Route element={<Layout usuario={sesion.usuario} puedeGestionar={puedeGestionar} esAdmin={esAdmin}
        onSalir={cerrar} onSesion={iniciar} />}>
        <Route path="/marcaje" element={<Marcaje />} />
        {puedeGestionar && <Route path="/enrolamiento" element={<Enrolamiento />} />}
        {puedeGestionar && <Route path="/personal" element={<Personal />} />}
        {puedeGestionar && <Route path="/contingencia" element={<Contingencia />} />}
        {puedeGestionar && <Route path="/reportes" element={<Reportes />} />}
        {esAdmin && <Route path="/cuentas" element={<Cuentas usuario={sesion.usuario} onCuentaPropia={actualizarUsuario} />} />}
        {esAdmin && <Route path="/configuracion" element={<Configuracion />} />}
        <Route path="*" element={<Navigate to="/marcaje" replace />} />
      </Route>
    </Routes>
  )
}
