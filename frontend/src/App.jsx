import { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { guardarSesion, leerSesion } from './api.js'
import Layout from './componentes/Layout.jsx'
import Login from './paginas/Login.jsx'
import Marcaje from './paginas/Marcaje.jsx'
import Enrolamiento from './paginas/Enrolamiento.jsx'
import Personal from './paginas/Personal.jsx'

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

  if (!sesion) {
    return (
      <Routes>
        <Route path="/login" element={<Login onIngreso={iniciar} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  const puedeGestionar = GESTION.includes(sesion.usuario.rol)

  return (
    <Routes>
      <Route element={<Layout usuario={sesion.usuario} puedeGestionar={puedeGestionar} onSalir={cerrar} />}>
        <Route path="/marcaje" element={<Marcaje />} />
        {puedeGestionar && <Route path="/enrolamiento" element={<Enrolamiento />} />}
        {puedeGestionar && <Route path="/personal" element={<Personal />} />}
        <Route path="*" element={<Navigate to="/marcaje" replace />} />
      </Route>
    </Routes>
  )
}