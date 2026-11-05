import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import Camara from '../componentes/Camara.jsx'
import GuiaEnrolamiento from '../componentes/GuiaEnrolamiento.jsx'
import { correccionPara } from '../enrolamiento/pasos.js'

const INTERVALO_CAPTURA_MS = 1500
const TIEMPO_MAXIMO_MS = 20000
const MAX_RECHAZOS = 3
const PAUSA_RESULTADO_MS = 5000
const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CS-', '0', 'Borrar']

const ESTILO_RESULTADO = {
  registrada: 'exito',
  doble_marcaje: 'pendiente',
  no_reconocido: 'alerta',
  error: 'alerta',
}

function formatoHora(hora) {
  if (!hora) return ''
  const [h, m] = hora.split(':').map(Number)
  const sufijo = h >= 12 ? 'PM' : 'AM'
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${sufijo}`
}

function iniciales(nombre) {
  return nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
}

function guiaPara(fase, validando, ajuste, resultado) {
  if (fase === 'codigo') return { fase: 'inactiva', pose: null, instruccion: 'Digite su código para marcar' }
  if (fase === 'resultado') {
    const exito = resultado.resultado === 'registrada' || resultado.resultado === 'doble_marcaje'
    return { fase: exito ? 'aceptada' : 'rechazada', pose: null, instruccion: resultado.mensaje }
  }
  if (validando) return { fase: 'validando', pose: 'frente', instruccion: ajuste?.instruccion ?? 'Verificando identidad' }
  return { fase: 'esperando', pose: ajuste?.pose ?? 'frente', instruccion: ajuste?.instruccion ?? 'Mire de frente a la cámara' }
}

export default function Marcaje() {
  const camara = useRef(null)
  const campoCodigo = useRef(null)
  const ocupado = useRef(false)
  const rechazos = useRef(0)
  const inicio = useRef(0)
  const turno = useRef(0)

  const [estadoCamara, setEstadoCamara] = useState('iniciando')
  // codigo | verificando | resultado
  const [fase, setFase] = useState('codigo')
  const [codigo, setCodigo] = useState('')
  const [errorCodigo, setErrorCodigo] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [colaborador, setColaborador] = useState(null)
  const [validando, setValidando] = useState(false)
  const [ajuste, setAjuste] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [hoy, setHoy] = useState([])

  const cargarHoy = useCallback(() => {
    api.get('/api/marcaciones/hoy').then(setHoy).catch(() => {})
  }, [])

  useEffect(cargarHoy, [cargarHoy])

  const reiniciar = useCallback(() => {
    turno.current += 1
    setFase('codigo')
    setCodigo('')
    setErrorCodigo('')
    setColaborador(null)
    setAjuste(null)
    setResultado(null)
    setTimeout(() => campoCodigo.current?.focus(), 0)
  }, [])

  function pulsar(tecla) {
    setErrorCodigo('')
    if (tecla === 'Borrar') setCodigo((c) => c.slice(0, -1))
    else if (tecla === 'CS-') setCodigo((c) => (c.startsWith('CS-') ? c : `CS-${c}`))
    else setCodigo((c) => (c + tecla).slice(0, 20))
    campoCodigo.current?.focus()
  }

  async function confirmarCodigo(evento) {
    evento.preventDefault()
    const limpio = codigo.trim().toUpperCase()
    if (!limpio) return
    setBuscando(true)
    try {
      const encontrado = await api.get(`/api/marcaje/colaborador/${encodeURIComponent(limpio)}`)
      turno.current += 1
      rechazos.current = 0
      inicio.current = Date.now()
      setColaborador(encontrado)
      setAjuste(null)
      setFase('verificando')
    } catch (e) {
      setErrorCodigo(e.message)
    } finally {
      setBuscando(false)
    }
  }

  const mostrarResultado = useCallback((datos) => {
    setResultado(datos)
    setFase('resultado')
    if (datos.resultado === 'registrada') cargarHoy()
  }, [cargarHoy])

  const intentar = useCallback(async () => {
    if (ocupado.current || !colaborador) return
    if (Date.now() - inicio.current > TIEMPO_MAXIMO_MS) {
      mostrarResultado({ resultado: 'error', mensaje: 'Tiempo agotado. Digite su código de nuevo.' })
      return
    }
    const imagen = camara.current?.capturar()
    if (!imagen) return

    const miTurno = turno.current
    ocupado.current = true
    setValidando(true)
    try {
      const r = await api.post('/api/marcaje', { codigo: colaborador.codigo, imagen })
      if (miTurno !== turno.current) return
      if (r.resultado === 'captura_fallida') {
        setAjuste(correccionPara(r.mensaje))
        return
      }
      if (r.resultado === 'no_reconocido') {
        rechazos.current += 1
        if (rechazos.current < MAX_RECHAZOS) {
          setAjuste({ pose: 'frente', instruccion: 'Mire de frente y permanezca quieto' })
          return
        }
      }
      mostrarResultado(r)
    } catch (e) {
      if (miTurno === turno.current) mostrarResultado({ resultado: 'error', mensaje: e.message })
    } finally {
      ocupado.current = false
      setValidando(false)
    }
  }, [colaborador, mostrarResultado])

  useEffect(() => {
    if (fase !== 'verificando' || estadoCamara !== 'lista') return
    const id = setInterval(intentar, INTERVALO_CAPTURA_MS)
    return () => clearInterval(id)
  }, [fase, estadoCamara, intentar])

  useEffect(() => {
    if (fase !== 'resultado') return
    const id = setTimeout(reiniciar, PAUSA_RESULTADO_MS)
    return () => clearTimeout(id)
  }, [fase, reiniciar])

  const guia = guiaPara(fase, validando, ajuste, resultado)
  const persona = resultado?.colaborador ?? colaborador

  return (
    <div className="rejilla-marcaje">
      <section className="panel">
        <h2>Punto de marcaje</h2>

        {fase === 'codigo' ? (
          <form className="entrada-codigo" onSubmit={confirmarCodigo}>
            <label>
              Ingrese su código de colaborador
              <input ref={campoCodigo} className="campo-codigo" value={codigo} autoFocus
                onChange={(e) => { setCodigo(e.target.value.toUpperCase()); setErrorCodigo('') }}
                placeholder="CS-0000" maxLength={20} autoComplete="off" />
            </label>
            <div className="teclado">
              {TECLAS.map((t) => (
                <button key={t} type="button" className="tecla" onClick={() => pulsar(t)}>{t}</button>
              ))}
            </div>
            {errorCodigo && <p className="aviso alerta" role="alert">{errorCodigo}</p>}
            <button type="submit" className="boton primario" disabled={!codigo.trim() || buscando || estadoCamara !== 'lista'}>
              {buscando ? 'Buscando...' : 'Continuar'}
            </button>
          </form>
        ) : (
          <div className="identidad">
            <span className="avatar">{iniciales(persona.nombre)}</span>
            <div>
              <strong>{persona.nombre}</strong>
              <span className="sutil">
                {persona.codigo}{fase === 'verificando' ? ', verificando identidad' : ''}
              </span>
            </div>
            <button type="button" className="boton-texto" onClick={reiniciar}>
              {fase === 'resultado' ? 'Siguiente' : 'Cancelar'}
            </button>
          </div>
        )}

        <Camara ref={camara} onEstado={setEstadoCamara}>
          <GuiaEnrolamiento fase={guia.fase} pose={guia.pose} instruccion={guia.instruccion} />
        </Camara>
        <p className="solo-lector" aria-live="polite">{guia.instruccion}</p>

        {estadoCamara === 'falla' && (
          <p className="aviso alerta">
            Falla de hardware. Registre la asistencia en la planilla de contingencia y notifique al personal administrativo.
          </p>
        )}

        {fase === 'resultado' && (
          <div className={`aviso ${ESTILO_RESULTADO[resultado.resultado] ?? 'alerta'}`} role="status">
            <strong>{resultado.mensaje}</strong>
            {resultado.hora && <span>{persona.nombre}, {formatoHora(resultado.hora)}</span>}
            {resultado.confianza != null && <span>Confianza {(resultado.confianza * 100).toFixed(1)}%</span>}
            {resultado.detalle && <span>{resultado.detalle}</span>}
          </div>
        )}
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