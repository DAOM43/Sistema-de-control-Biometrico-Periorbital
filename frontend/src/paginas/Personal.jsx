import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api.js'

export default function Personal() {
  const navegar = useNavigate()
  const { state } = useLocation()

  const [colaboradores, setColaboradores] = useState([])
  const [buscar, setBuscar] = useState('')
  const [edicion, setEdicion] = useState(null)
  const [aviso, setAviso] = useState(state?.aviso ? { tipo: 'exito', texto: state.aviso } : null)

  const cargar = useCallback(async (texto = '') => {
    try {
      const ruta = texto ? `/api/colaboradores?buscar=${encodeURIComponent(texto)}` : '/api/colaboradores'
      setColaboradores(await api.get(ruta))
    } catch (e) {
      setAviso({ tipo: 'alerta', texto: e.message })
    }
  }, [])

  useEffect(() => {
    const id = setTimeout(() => cargar(buscar.trim()), 250)
    return () => clearTimeout(id)
  }, [buscar, cargar])

  function reemplazar(actualizado) {
    setColaboradores((lista) => lista.map((c) => (c.id === actualizado.id ? actualizado : c)))
  }

  async function cambiarEstado(colaborador) {
    const accion = colaborador.estado === 'activo' ? 'desactivar' : 'reactivar'
    try {
      const actualizado = await api.post(`/api/colaboradores/${colaborador.id}/${accion}`)
      reemplazar(actualizado)
      setAviso({ tipo: 'exito', texto: `${actualizado.nombre} quedó ${actualizado.estado}.` })
    } catch (e) {
      setAviso({ tipo: 'alerta', texto: e.message })
    }
  }

  async function guardarEdicion() {
    try {
      const actualizado = await api.put(`/api/colaboradores/${edicion.id}`,
        { nombre: edicion.nombre, puesto: edicion.puesto })
      reemplazar(actualizado)
      setEdicion(null)
      setAviso({ tipo: 'exito', texto: 'Cambios guardados.' })
    } catch (e) {
      setAviso({ tipo: 'alerta', texto: e.message })
    }
  }

  return (
    <section className="panel ancho">
      <div className="barra-herramientas">
        <input type="search" className="buscador" placeholder="Buscar por nombre o código"
          value={buscar} onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar colaborador" />
        <button type="button" className="boton primario" onClick={() => navegar('/enrolamiento')}>
          Nuevo colaborador
        </button>
      </div>

      {aviso && <p className={`aviso ${aviso.tipo}`} role="status">{aviso.texto}</p>}

      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Puesto</th>
              <th>Estado</th>
              <th className="derecha">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {colaboradores.map((c) => (
              edicion?.id === c.id ? (
                <tr key={c.id}>
                  <td className="sutil">{c.codigo}</td>
                  <td><input value={edicion.nombre} onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })} /></td>
                  <td><input value={edicion.puesto} onChange={(e) => setEdicion({ ...edicion, puesto: e.target.value })} /></td>
                  <td><span className={`insignia ${c.estado}`}>{c.estado}</span></td>
                  <td className="derecha">
                    <button type="button" className="boton-texto" onClick={guardarEdicion}>Guardar</button>
                    <button type="button" className="boton-texto" onClick={() => setEdicion(null)}>Cancelar</button>
                  </td>
                </tr>
              ) : (
                <tr key={c.id}>
                  <td className="sutil">{c.codigo}</td>
                  <td><strong>{c.nombre}</strong></td>
                  <td>{c.puesto}</td>
                  <td><span className={`insignia ${c.estado}`}>{c.estado}</span></td>
                  <td className="derecha">
                    <button type="button" className="boton-texto" onClick={() => setEdicion({ ...c })}>Editar</button>
                    <button type="button" className={`boton-texto ${c.estado === 'activo' ? 'peligro' : ''}`}
                      onClick={() => cambiarEstado(c)}>
                      {c.estado === 'activo' ? 'Desactivar' : 'Reactivar'}
                    </button>
                  </td>
                </tr>
              )
            ))}
            {colaboradores.length === 0 && (
              <tr>
                <td colSpan={5} className="vacio">No hay colaboradores. Use "Nuevo colaborador" para enrolar al primero.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}