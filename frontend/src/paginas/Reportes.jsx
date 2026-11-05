import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { duracion, fechaISO, formatoFecha, formatoHora, primerDiaDelMes } from '../utilidades/formato.js'
import { descargarExcel } from '../reportes/excel.js'

const CLASE_OBSERVACION = {
  puntual: 'obs-ok',
  retardo: 'obs-alerta',
  anticipada: 'obs-alerta',
  extra: 'obs-extra',
  fuera: 'obs-neutra',
}

function categoria(m) {
  if (!m.en_horario) return 'fuera'
  if (m.tipo === 'entrada') return m.minutos_horario > 0 ? 'retardo' : 'puntual'
  if (m.minutos_horario > 0) return 'extra'
  if (m.minutos_horario < 0) return 'anticipada'
  return 'puntual'
}

function calcularTotales(filas) {
  // El tiempo extra se toma de la última salida de cada colaborador por día.
  const ultimaSalida = new Map()
  filas.filter((m) => m.tipo === 'salida').forEach((m) => ultimaSalida.set(`${m.colaborador_id}|${m.fecha}`, m))
  const extra = [...ultimaSalida.values()]
    .filter((m) => categoria(m) === 'extra')
    .reduce((suma, m) => suma + m.minutos_horario, 0)

  return {
    marcaciones: filas.length,
    retardos: filas.filter((m) => m.tipo === 'entrada' && categoria(m) === 'retardo').length,
    manuales: filas.filter((m) => !m.origen_biometrico).length,
    extra,
  }
}

function filtrosIniciales() {
  return { desde: primerDiaDelMes(), hasta: fechaISO(), colaborador_id: '', incluir_pruebas: true }
}

function pedirMarcaciones(f) {
  const parametros = new URLSearchParams({ desde: f.desde, hasta: f.hasta, incluir_pruebas: f.incluir_pruebas })
  if (f.colaborador_id) parametros.set('colaborador_id', f.colaborador_id)
  return api.get(`/api/marcaciones?${parametros}`)
}

export default function Reportes() {
  const [colaboradores, setColaboradores] = useState([])
  const [filtros, setFiltros] = useState(filtrosIniciales)
  const [filas, setFilas] = useState([])
  const [consultado, setConsultado] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [exportando, setExportando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const iniciales = filtrosIniciales()
    api.get('/api/colaboradores').then(setColaboradores).catch(() => {})
    pedirMarcaciones(iniciales)
      .then((datos) => {
        setFilas(datos)
        setConsultado({ desde: iniciales.desde, hasta: iniciales.hasta, colaborador_id: iniciales.colaborador_id })
      })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false))
  }, [])

  const cambiar = (campo) => (e) => {
    const valor = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setFiltros({ ...filtros, [campo]: valor })
  }

  async function consultar(evento) {
    evento.preventDefault()
    setCargando(true)
    setError('')
    try {
      setFilas(await pedirMarcaciones(filtros))
      setConsultado({ desde: filtros.desde, hasta: filtros.hasta, colaborador_id: filtros.colaborador_id })
    } catch (e) {
      setError(e.message)
      setFilas([])
    } finally {
      setCargando(false)
    }
  }

  const totales = calcularTotales(filas)

  async function exportar() {
    setExportando(true)
    setError('')
    try {
      const elegido = colaboradores.find((c) => String(c.id) === String(consultado.colaborador_id))
      await descargarExcel({
        filas,
        desde: consultado.desde,
        hasta: consultado.hasta,
        nombreColaborador: elegido ? `${elegido.codigo}, ${elegido.nombre}` : 'Todos',
        totales,
        categoria,
      })
    } catch (e) {
      setError(`No se pudo generar el archivo de Excel: ${e.message}`)
    } finally {
      setExportando(false)
    }
  }

  return (
    <section className="panel ancho">
      <form className="filtros-reporte" onSubmit={consultar}>
        <label>
          Desde
          <input type="date" value={filtros.desde} onChange={cambiar('desde')} required />
        </label>
        <label>
          Hasta
          <input type="date" value={filtros.hasta} onChange={cambiar('hasta')} required />
        </label>
        <label>
          Colaborador
          <select value={filtros.colaborador_id} onChange={cambiar('colaborador_id')}>
            <option value="">Todos</option>
            {colaboradores.map((c) => (
              <option key={c.id} value={c.id}>{c.codigo}, {c.nombre}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="boton primario" disabled={cargando}>
          {cargando ? 'Consultando...' : 'Consultar'}
        </button>
      </form>

      <label className="interruptor">
        <input type="checkbox" checked={filtros.incluir_pruebas} onChange={cambiar('incluir_pruebas')} />
        Incluir marcaciones de prueba
      </label>

      {error && <p className="aviso alerta" role="alert">{error}</p>}

      <div className="totales">
        <div><strong>{totales.marcaciones}</strong><span>Marcaciones</span></div>
        <div><strong>{totales.retardos}</strong><span>Retardos</span></div>
        <div><strong>{totales.manuales}</strong><span>Manuales (contingencia)</span></div>
        <div><strong>{duracion(totales.extra)}</strong><span>Tiempo extra</span></div>
      </div>

      <div className="tabla-contenedor tabla-reporte">
        <table className="tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Colaborador</th>
              <th>Tipo</th>
              <th>Hora</th>
              <th>Origen</th>
              <th>Observación</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((m) => (
              <tr key={m.id}>
                <td>{formatoFecha(m.fecha)}</td>
                <td><strong>{m.nombre}</strong><span className="codigo-tabla">{m.codigo}</span></td>
                <td className="capital">{m.tipo}</td>
                <td>{formatoHora(m.hora)}</td>
                <td>
                  <span className={`etiqueta ${m.origen_biometrico ? 'biometrico' : 'manual'}`}>
                    {m.origen_biometrico
                      ? `Biométrico${m.umbral_confianza != null ? ` ${Math.round(m.umbral_confianza * 100)}%` : ''}`
                      : 'Manual'}
                  </span>
                  {m.es_prueba && <span className="etiqueta prueba">Prueba</span>}
                </td>
                <td className={CLASE_OBSERVACION[categoria(m)]}>{m.observacion_horario}</td>
              </tr>
            ))}
            {!cargando && filas.length === 0 && (
              <tr><td colSpan={6} className="vacio">No hay marcaciones en el rango seleccionado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="acciones">
        <span className="sutil">
          {consultado ? `${filas.length} marcaciones del ${formatoFecha(consultado.desde)} al ${formatoFecha(consultado.hasta)}` : ''}
        </span>
        <button type="button" className="boton secundario" disabled={filas.length === 0 || exportando} onClick={exportar}>
          {exportando ? 'Generando...' : 'Descargar Excel'}
        </button>
      </div>
    </section>
  )
}