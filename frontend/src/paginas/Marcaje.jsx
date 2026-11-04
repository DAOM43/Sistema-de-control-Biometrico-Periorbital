import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import Camara from '../componentes/Camara.jsx'
import { formatoHora } from '../utils/formatoHora'

const INTERVALO_CAPTURA_MS = 1500
const PAUSA_TRAS_RESULTADO_MS = 4000

const ESTILO_RESULTADO = {
  registrada: 'exito',
  doble_marcaje: 'pendiente',
  no_reconocido: 'alerta',
  no_enrolado: 'alerta',
  captura_fallida: 'neutro',
}

export default function Marcaje() {
  const camara = useRef(null)
  const ocupado = useRef(false)
  const pausaHasta = useRef(0)

  const [estadoCamara, setEstadoCamara] = useState('iniciando')
  const [automatico, setAutomatico] = useState(true)
  const [resultado, setResultado] = useState(null)
  const [hoy, setHoy] = useState([])

  const cargarHoy = useCallback(() => {
    api.get('/api/marcaciones/hoy').then(setHoy).catch(() => {})
  }, [])

  useEffect(cargarHoy, [cargarHoy])

  const marcar = useCallback(async (manual = false) => {
    if (ocupado.current || (!manual && Date.now() < pausaHasta.current)) return
    const imagen = camara.current?.capturar()
    if (!imagen) return

    ocupado.current = true
    try {
      const datos = await api.post('/api/marcaje', { imagen })
      // En modo automático los fotogramas sin rostro no interrumpen la pantalla.
      if (datos.resultado === 'captura_fallida' && !manual) return
      setResultado(datos)
      pausaHasta.current = Date.now() + PAUSA_TRAS_RESULTADO_MS
      if (datos.resultado === 'registrada') cargarHoy()
    } catch (e) {
      setResultado({ resultado: 'no_reconocido', mensaje: e.message })
    } finally {
      ocupado.current = false
    }
  }, [cargarHoy])

  useEffect(() => {
    if (!automatico || estadoCamara !== 'lista') return
    const id = setInterval(() => marcar(false), INTERVALO_CAPTURA_MS)
    return () => clearInterval(id)
  }, [automatico, estadoCamara, marcar])

  return (
    <div className="rejilla-marcaje">
      <section className="panel">
        <h2>Punto de marcaje</h2>
        <Camara ref={camara} onEstado={setEstadoCamara} />

        {estadoCamara === 'falla' && (
          <p className="aviso alerta">
            Falla de hardware. Registre la asistencia en la planilla de contingencia y notifique al personal administrativo.
          </p>
        )}

        {resultado && (
          <div className={`aviso ${ESTILO_RESULTADO[resultado.resultado]}`} role="status">
            <strong>{resultado.mensaje}</strong>
            {resultado.colaborador && (
              <span>
                {resultado.colaborador.nombre}, {formatoHora(resultado.hora)}
                {resultado.confianza != null && `, confianza ${(resultado.confianza * 100).toFixed(1)}%`}
              </span>
            )}
            {resultado.detalle && <span>{resultado.detalle}</span>}
          </div>
        )}

        <div className="acciones">
          <label className="interruptor">
            <input type="checkbox" checked={automatico} onChange={(e) => setAutomatico(e.target.checked)} />
            Captura automática
          </label>
          <button type="button" className="boton primario" onClick={() => marcar(true)}
            disabled={estadoCamara !== 'lista'}>
            Marcar ahora
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Marcaciones de hoy</h2>
        {hoy.length === 0 && <p className="sutil">Aún no hay marcaciones registradas hoy.</p>}
        <ul className="lista-marcaciones">
          {hoy.map((m) => (
            <li key={m.colaborador_id}>
              <strong>{m.nombre}</strong>
              <span className="linea">Entrada: {formatoHora(m.entrada) || 'sin registro'}</span>
              <span className={`linea ${m.salida ? '' : 'pendiente'}`}>
                Salida: {m.salida ? formatoHora(m.salida) : 'pendiente'}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}