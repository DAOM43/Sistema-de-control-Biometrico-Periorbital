import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { fechaISO, formatoFecha, formatoHora } from '../utilidades/formato.js'

const DIAS_RECIENTES = 30

function formularioVacio() {
  return { colaborador_id: '', fecha: fechaISO(), hora: '', tipo: 'entrada', observacion: '' }
}

async function obtenerRecientes() {
  const desde = new Date()
  desde.setDate(desde.getDate() - DIAS_RECIENTES)
  try {
    const filas = await api.get(`/api/marcaciones?desde=${fechaISO(desde)}&hasta=${fechaISO()}&incluir_pruebas=true`)
    return filas.filter((m) => !m.origen_biometrico).reverse().slice(0, 10)
  } catch {
    return []
  }
}

export default function Contingencia() {
  const [colaboradores, setColaboradores] = useState([])
  const [datos, setDatos] = useState(formularioVacio)
  const [aviso, setAviso] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [recientes, setRecientes] = useState([])

  useEffect(() => {
    api.get('/api/colaboradores').then(setColaboradores).catch((e) => setAviso({ tipo: 'alerta', texto: e.message }))
    obtenerRecientes().then(setRecientes)
  }, [])

  const actualizar = (campo) => (e) => {
    setDatos({ ...datos, [campo]: e.target.value })
    setAviso(null)
  }

  async function registrar(evento) {
    evento.preventDefault()
    setEnviando(true)
    setAviso(null)
    try {
      const r = await api.post('/api/marcaje/contingencia', {
        ...datos,
        colaborador_id: Number(datos.colaborador_id),
        observacion: datos.observacion.trim(),
      })
      setAviso({ tipo: 'exito', titulo: `Marcación transcrita: ${datos.tipo}.`, texto: `${r.detalle} Queda como manual, no biométrica.` })
      setDatos({ ...formularioVacio(), fecha: datos.fecha })
      setRecientes(await obtenerRecientes())
    } catch (e) {
      setAviso({ tipo: 'alerta', titulo: e.message })
    } finally {
      setEnviando(false)
    }
  }

  const completo = datos.colaborador_id && datos.fecha && datos.hora && datos.observacion.trim().length >= 5

  return (
    <div className="rejilla-marcaje">
      <form className="panel" onSubmit={registrar}>
        <h2>Transcribir marcación de la planilla</h2>
        <p className="sutil nota-panel">
          Para días con falla de cámara o de energía, cuando el personal firmó la planilla física.
        </p>

        <label>
          Colaborador
          <select value={datos.colaborador_id} onChange={actualizar('colaborador_id')} required>
            <option value="">Seleccione un colaborador</option>
            {colaboradores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo}, {c.nombre}{c.estado === 'inactivo' ? ' (inactivo)' : ''}
              </option>
            ))}
          </select>
        </label>

        <div className="dos-columnas">
          <label>
            Fecha
            <input type="date" value={datos.fecha} max={fechaISO()} onChange={actualizar('fecha')} required />
          </label>
          <label>
            Hora (según planilla)
            <input type="time" value={datos.hora} onChange={actualizar('hora')} required />
          </label>
        </div>

        <div className="campo-grupo">
          <span>Tipo</span>
          <div className="segmentado" role="radiogroup" aria-label="Tipo de marcación">
            {['entrada', 'salida'].map((t) => (
              <button key={t} type="button" role="radio" aria-checked={datos.tipo === t}
                className={datos.tipo === t ? 'activo' : ''}
                onClick={() => { setDatos({ ...datos, tipo: t }); setAviso(null) }}>
                {t === 'entrada' ? 'Entrada' : 'Salida'}
              </button>
            ))}
          </div>
        </div>

        <label>
          Observación
          <textarea value={datos.observacion} onChange={actualizar('observacion')} maxLength={500}
            placeholder="Motivo y referencia de la planilla, por ejemplo: corte de energía, folio 12." required />
        </label>

        {aviso && (
          <div className={`aviso ${aviso.tipo}`} role="status">
            {aviso.titulo && <strong>{aviso.titulo}</strong>}
            {aviso.texto && <span>{aviso.texto}</span>}
          </div>
        )}

        <button type="submit" className="boton primario" disabled={!completo || enviando}>
          {enviando ? 'Registrando...' : 'Registrar transcripción'}
        </button>
      </form>

      <section className="panel">
        <h2>Transcripciones recientes</h2>
        {recientes.length === 0 && <p className="sutil">No hay marcaciones manuales en los últimos {DIAS_RECIENTES} días.</p>}
        <ul className="lista-marcaciones">
          {recientes.map((m) => (
            <li key={m.id}>
              <strong>{m.nombre}</strong>
              <span className="linea">{formatoFecha(m.fecha)}, {m.tipo} a las {formatoHora(m.hora)}</span>
              <span className="linea sutil">{m.observacion_horario}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}