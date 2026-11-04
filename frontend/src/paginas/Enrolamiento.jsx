import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import Camara from '../componentes/Camara.jsx'

const MUESTRAS_REQUERIDAS = 5
const FORMULARIO_VACIO = { codigo: '', nombre: '', puesto: '' }

export default function Enrolamiento() {
  const navegar = useNavigate()
  const camara = useRef(null)

  const [datos, setDatos] = useState(FORMULARIO_VACIO)
  const [codigoDisponible, setCodigoDisponible] = useState(null)
  const [datosConfirmados, setDatosConfirmados] = useState(false)
  const [estadoCamara, setEstadoCamara] = useState('iniciando')
  const [muestras, setMuestras] = useState([])
  const [mensaje, setMensaje] = useState(null)
  const [procesando, setProcesando] = useState(false)

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
    setMensaje({ tipo: 'neutro', texto: 'Ubique el rostro dentro de la guía y capture la primera muestra.' })
  }

  async function capturarMuestra() {
    const imagen = camara.current?.capturar()
    if (!imagen) return
    setProcesando(true)
    try {
      const r = await api.post('/api/enrolamiento/muestra', { imagen })
      if (!r.valida) {
        setMensaje({ tipo: 'alerta', texto: r.mensaje })
        return
      }
      const nuevas = [...muestras, imagen]
      setMuestras(nuevas)
      setMensaje({
        tipo: 'exito',
        texto: nuevas.length < MUESTRAS_REQUERIDAS
          ? `Muestra ${nuevas.length} aceptada. Varíe ligeramente la posición de la cabeza.`
          : 'Muestras completas. Finalice el enrolamiento.',
      })
    } catch (e) {
      setMensaje({ tipo: 'alerta', texto: e.message })
    } finally {
      setProcesando(false)
    }
  }

  async function finalizar() {
    setProcesando(true)
    try {
      await api.post('/api/enrolamiento', { ...datos, codigo: datos.codigo.trim().toUpperCase(), muestras })
      navegar('/personal', { state: { aviso: `${datos.nombre} fue enrolado correctamente.` } })
    } catch (e) {
      setMuestras([])
      setMensaje({ tipo: 'alerta', texto: `${e.message} Las muestras se reiniciaron.` })
    } finally {
      setProcesando(false)
    }
  }

  function cancelar() {
    setDatos(FORMULARIO_VACIO)
    setCodigoDisponible(null)
    setDatosConfirmados(false)
    setMuestras([])
    setMensaje(null)
  }

  const progreso = (muestras.length / MUESTRAS_REQUERIDAS) * 100

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
          <button type="button" className="boton secundario" onClick={cancelar} disabled={procesando}>
            Cancelar enrolamiento
          </button>
        ) : (
          <button type="submit" className="boton primario" disabled={codigoDisponible !== true}>
            Guardar datos y continuar
          </button>
        )}
      </form>

      <section className="panel">
        <h2>Captura periorbital</h2>
        <Camara ref={camara} onEstado={setEstadoCamara} />

        <div className="progreso">
          <div className="progreso-texto">
            <span>Muestras capturadas</span>
            <span>{muestras.length} / {MUESTRAS_REQUERIDAS}</span>
          </div>
          <div className="barra"><div style={{ width: `${progreso}%` }} /></div>
        </div>

        {mensaje && <p className={`aviso ${mensaje.tipo}`} role="status">{mensaje.texto}</p>}

        <div className="acciones">
          {muestras.length < MUESTRAS_REQUERIDAS ? (
            <button type="button" className="boton primario" onClick={capturarMuestra}
              disabled={!datosConfirmados || estadoCamara !== 'lista' || procesando}>
              {procesando ? 'Validando...' : 'Capturar muestra'}
            </button>
          ) : (
            <button type="button" className="boton primario" onClick={finalizar} disabled={procesando}>
              {procesando ? 'Generando patrón...' : 'Finalizar enrolamiento'}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}