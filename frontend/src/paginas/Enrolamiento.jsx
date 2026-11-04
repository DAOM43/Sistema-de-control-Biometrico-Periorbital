import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import Camara from '../componentes/Camara.jsx'
import GuiaEnrolamiento, { PasosCaptura } from '../componentes/GuiaEnrolamiento.jsx'
import { PASOS, SEGUNDOS_CUENTA, correccionPara } from '../enrolamiento/pasos.js'
import { revisarEncuadre } from '../enrolamiento/encuadre.js'

const MUESTRAS_REQUERIDAS = PASOS.length
const FORMULARIO_VACIO = { codigo: '', nombre: '', puesto: '' }
const PAUSA_TRAS_ACEPTAR_MS = 900

function instruccionActual(fase, muestras, correccion) {
  if (fase === 'inactiva') return { pose: null, instruccion: 'Complete los datos del colaborador para iniciar' }
  if (fase === 'rechazada') return correccion
  if (fase === 'aceptada') return { pose: null, instruccion: `Muestra ${muestras} aceptada` }
  if (fase === 'completa') return { pose: null, instruccion: 'Capturas completas. Finalice el enrolamiento.' }
  return PASOS[muestras]
}

export default function Enrolamiento() {
  const navegar = useNavigate()
  const camara = useRef(null)
  const ocupado = useRef(false)

  const [datos, setDatos] = useState(FORMULARIO_VACIO)
  const [codigoDisponible, setCodigoDisponible] = useState(null)
  const [datosConfirmados, setDatosConfirmados] = useState(false)
  const [estadoCamara, setEstadoCamara] = useState('iniciando')
  const [muestras, setMuestras] = useState([])
  const [mensaje, setMensaje] = useState(null)
  const [procesando, setProcesando] = useState(false)

  // inactiva | esperando | cuenta | validando | aceptada | rechazada | completa
  const [fase, setFase] = useState('inactiva')
  const [segundos, setSegundos] = useState(SEGUNDOS_CUENTA)
  const [claveCuenta, setClaveCuenta] = useState(0)
  const [correccion, setCorreccion] = useState(null)

  const actualizar = (campo) => (e) => {
    setDatos({ ...datos, [campo]: e.target.value })
    if (campo === 'codigo') setCodigoDisponible(null)
  }

  async function verificarCodigo() {
    const codigo = datos.codigo.trim().toUpperCase()
    if (!codigo) return
    try {
      const r = await api.get(`/api/colaboradores/verificar-codigo?codigo=${encodeURIComponent(codigo)}`)
      setCodigoDisponible(r.disponible)
    } catch (e) {
      setMensaje({ tipo: 'alerta', texto: e.message })
    }
  }

  function confirmarDatos(evento) {
    evento.preventDefault()
    if (codigoDisponible !== true) return
    setDatosConfirmados(true)
    setFase('esperando')
    setMensaje({
      tipo: 'neutro',
      texto: 'Si el colaborador usa lentes, realice las capturas con los lentes puestos. '
        + 'Presione "Iniciar capturas" cuando esté frente a la cámara.',
    })
  }

  function iniciarCuenta() {
    setMensaje(null)
    setCorreccion(null)
    setSegundos(SEGUNDOS_CUENTA)
    setClaveCuenta((c) => c + 1)
    setFase('cuenta')
  }

  const capturarMuestra = useCallback(async () => {
    if (ocupado.current) return
    const imagen = camara.current?.capturar()
    const geometria = camara.current?.geometria()
    if (!imagen) {
      setCorreccion({ pose: 'centrar', instruccion: 'La cámara aún no está lista. Intente de nuevo.' })
      setFase('rechazada')
      return
    }

    ocupado.current = true
    setFase('validando')
    try {
      const r = await api.post('/api/enrolamiento/muestra', { imagen })
      const ajuste = r.valida ? revisarEncuadre(r.encuadre, geometria) : null
      if (ajuste) {
        setCorreccion(ajuste)
        setFase('rechazada')
      } else if (r.valida) {
        setMuestras((previas) => [...previas, imagen])
        setFase('aceptada')
      } else {
        setCorreccion(correccionPara(r.mensaje))
        setFase('rechazada')
      }
    } catch (e) {
      setCorreccion({ pose: 'centrar', instruccion: e.message })
      setFase('rechazada')
    } finally {
      ocupado.current = false
    }
  }, [])

  useEffect(() => {
    if (fase !== 'cuenta') return
    if (segundos === 0) {
      capturarMuestra()
      return
    }
    const id = setTimeout(() => setSegundos((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [fase, segundos, capturarMuestra])

  useEffect(() => {
    if (fase !== 'aceptada') return
    const id = setTimeout(() => {
      if (muestras.length < MUESTRAS_REQUERIDAS) iniciarCuenta()
      else setFase('completa')
    }, PAUSA_TRAS_ACEPTAR_MS)
    return () => clearTimeout(id)
  }, [fase, muestras.length])

  async function finalizar() {
    setProcesando(true)
    try {
      await api.post('/api/enrolamiento', { ...datos, codigo: datos.codigo.trim().toUpperCase(), muestras })
      navegar('/personal', { state: { aviso: `${datos.nombre} fue enrolado correctamente.` } })
    } catch (e) {
      setMuestras([])
      setFase('esperando')
      setMensaje({ tipo: 'alerta', texto: `${e.message} Las muestras se reiniciaron.` })
    } finally {
      setProcesando(false)
    }
  }

  function repetirCapturas() {
    setMuestras([])
    setCorreccion(null)
    setFase('esperando')
  }

  function cancelar() {
    setDatos(FORMULARIO_VACIO)
    setCodigoDisponible(null)
    setDatosConfirmados(false)
    setMuestras([])
    setCorreccion(null)
    setFase('inactiva')
    setMensaje(null)
  }

  const guia = instruccionActual(fase, muestras.length, correccion)
  const camaraLista = estadoCamara === 'lista'
  const enCurso = fase === 'cuenta' || fase === 'validando' || fase === 'aceptada'

  return (
    <div className="rejilla-enrolamiento">
      <form className="panel" onSubmit={confirmarDatos}>
        <h2>Datos del colaborador</h2>

        <label>
          Código
          <input value={datos.codigo} onChange={actualizar('codigo')} onBlur={verificarCodigo}
            placeholder="CS-0142" maxLength={20} disabled={datosConfirmados} required />
        </label>
        <label>
          Nombre completo
          <input value={datos.nombre} onChange={actualizar('nombre')} maxLength={150}
            minLength={3} disabled={datosConfirmados} required />
        </label>
        <label>
          Puesto
          <input value={datos.puesto} onChange={actualizar('puesto')} maxLength={100}
            minLength={2} disabled={datosConfirmados} required />
        </label>

        <p className={`verificacion ${codigoDisponible === false ? 'ocupado' : ''}`}>
          Verificación de duplicado en base de datos:{' '}
          {codigoDisponible === null ? 'pendiente' : codigoDisponible ? 'sin coincidencias' : 'el código ya existe'}
        </p>

        {datosConfirmados ? (
          <button type="button" className="boton secundario" onClick={cancelar} disabled={procesando || enCurso}>
            Cancelar enrolamiento
          </button>
        ) : (
          <button type="submit" className="boton primario" disabled={codigoDisponible !== true}>
            Guardar datos y continuar
          </button>
        )}
      </form>

      <section className="panel">
        <div className="encabezado-captura">
          <h2>Captura periorbital</h2>
          <span className="sutil">
            {fase === 'completa' ? 'Listo' : `Paso ${Math.min(muestras.length + 1, MUESTRAS_REQUERIDAS)} de ${MUESTRAS_REQUERIDAS}`}
          </span>
        </div>

        <Camara ref={camara} onEstado={setEstadoCamara}>
          <GuiaEnrolamiento
            fase={fase}
            pose={guia.pose}
            instruccion={guia.instruccion}
            segundos={segundos}
            claveCuenta={claveCuenta}
            duracionCuenta={SEGUNDOS_CUENTA}
          />
        </Camara>
        <p className="solo-lector" aria-live="polite">{guia.instruccion}</p>

        <PasosCaptura pasos={PASOS} completadas={muestras.length}
          activa={fase !== 'inactiva' && fase !== 'completa'} />

        {estadoCamara === 'falla' && (
          <p className="aviso alerta">No es posible enrolar sin cámara. Verifique la conexión del dispositivo.</p>
        )}
        {mensaje && <p className={`aviso ${mensaje.tipo}`} role="status">{mensaje.texto}</p>}

        <div className="acciones">
          {(fase === 'inactiva' || fase === 'esperando') && (
            <button type="button" className="boton primario" onClick={iniciarCuenta}
              disabled={fase === 'inactiva' || !camaraLista}>
              {muestras.length ? 'Continuar capturas' : 'Iniciar capturas'}
            </button>
          )}

          {fase === 'cuenta' && (
            <>
              <button type="button" className="boton secundario" onClick={() => setFase('esperando')}>Pausar</button>
              <button type="button" className="boton primario" onClick={() => setSegundos(0)}>Capturar ahora</button>
            </>
          )}

          {(fase === 'validando' || fase === 'aceptada') && (
            <button type="button" className="boton primario" disabled>Validando muestra...</button>
          )}

          {fase === 'rechazada' && (
            <button type="button" className="boton primario" onClick={iniciarCuenta} disabled={!camaraLista}>
              Reintentar toma
            </button>
          )}

          {fase === 'completa' && (
            <>
              <button type="button" className="boton secundario" onClick={repetirCapturas} disabled={procesando}>
                Repetir capturas
              </button>
              <button type="button" className="boton primario" onClick={finalizar} disabled={procesando}>
                {procesando ? 'Generando patrón...' : 'Finalizar enrolamiento'}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}