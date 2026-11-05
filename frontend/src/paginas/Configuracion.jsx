import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { formatoFecha, formatoHora } from '../utilidades/formato.js'

const DIAS = [
  [1, 'Lun'], [2, 'Mar'], [3, 'Mié'], [4, 'Jue'], [5, 'Vie'], [6, 'Sáb'], [7, 'Dom'],
]

function aFormulario(c) {
  return {
    hora_entrada_oficial: c.hora_entrada_oficial.slice(0, 5),
    hora_salida_oficial: c.hora_salida_oficial.slice(0, 5),
    tolerancia_entrada_min: String(c.tolerancia_entrada_min),
    dias_laborales: c.dias_laborales,
    umbral: String(Math.round(c.umbral_reconocimiento * 100)),
    intervalo_anti_rebote_segundos: String(c.intervalo_anti_rebote_segundos),
    modo_pruebas: c.modo_pruebas,
  }
}

function validar(f) {
  const tolerancia = Number(f.tolerancia_entrada_min)
  const umbral = Number(f.umbral)
  const rebote = Number(f.intervalo_anti_rebote_segundos)
  if (!f.hora_entrada_oficial || !f.hora_salida_oficial) return 'Indique la hora de entrada y de salida.'
  if (f.hora_entrada_oficial >= f.hora_salida_oficial) return 'La hora de salida debe ser posterior a la hora de entrada.'
  if (!Number.isInteger(tolerancia) || tolerancia < 0 || tolerancia > 60) return 'La tolerancia debe estar entre 0 y 60 minutos.'
  if (f.dias_laborales.length === 0) return 'Seleccione al menos un día laboral.'
  if (!Number.isInteger(umbral) || umbral < 40 || umbral > 95) return 'El umbral debe estar entre 40 % y 95 %.'
  if (!Number.isInteger(rebote) || rebote < 5 || rebote > 3600) return 'El anti-rebote debe estar entre 5 y 3600 segundos.'
  return ''
}

export default function Configuracion() {
  const [original, setOriginal] = useState(null)
  const [form, setForm] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    api.get('/api/configuracion')
      .then((c) => {
        setOriginal(c)
        setForm(aFormulario(c))
      })
      .catch((e) => setAviso({ tipo: 'alerta', texto: e.message }))
  }, [])

  if (!form) {
    return (
      <section className="panel ancho">
        {aviso ? <p className="aviso alerta" role="alert">{aviso.texto}</p> : <p className="sutil">Cargando configuración...</p>}
      </section>
    )
  }

  const actualizar = (campo) => (e) => {
    setForm({ ...form, [campo]: e.target.value })
    setAviso(null)
  }

  function alternarDia(dia) {
    const dias = form.dias_laborales.includes(dia)
      ? form.dias_laborales.filter((d) => d !== dia)
      : [...form.dias_laborales, dia].sort()
    setForm({ ...form, dias_laborales: dias })
    setAviso(null)
  }

  const error = validar(form)
  const modificado = JSON.stringify(form) !== JSON.stringify(aFormulario(original))
  const desactivaPruebas = original.modo_pruebas && !form.modo_pruebas

  async function guardar(evento) {
    evento.preventDefault()
    setEnviando(true)
    setAviso(null)
    try {
      const c = await api.put('/api/configuracion', {
        hora_entrada_oficial: form.hora_entrada_oficial,
        hora_salida_oficial: form.hora_salida_oficial,
        tolerancia_entrada_min: Number(form.tolerancia_entrada_min),
        dias_laborales: form.dias_laborales,
        umbral_reconocimiento: Number(form.umbral) / 100,
        intervalo_anti_rebote_segundos: Number(form.intervalo_anti_rebote_segundos),
        modo_pruebas: form.modo_pruebas,
      })
      setOriginal(c)
      setForm(aFormulario(c))
      setAviso({ tipo: 'exito', texto: 'Configuración guardada. Se aplica desde la siguiente marcación.' })
    } catch (e) {
      setAviso({ tipo: 'alerta', texto: e.message })
    } finally {
      setEnviando(false)
    }
  }

  const [fechaCambio, horaCambio] = original.actualizado_en.split('T')

  return (
    <form className="panel ancho configuracion" onSubmit={guardar}>
      <fieldset className="seccion-config">
        <legend>Horario laboral</legend>
        <div className="rejilla-config">
          <label>
            Hora de entrada
            <input type="time" value={form.hora_entrada_oficial} onChange={actualizar('hora_entrada_oficial')} required />
          </label>
          <label>
            Hora de salida
            <input type="time" value={form.hora_salida_oficial} onChange={actualizar('hora_salida_oficial')} required />
          </label>
          <label>
            Tolerancia de entrada
            <span className="campo-unidad">
              <input type="number" min="0" max="60" step="1" value={form.tolerancia_entrada_min}
                onChange={actualizar('tolerancia_entrada_min')} required />
              <span>min</span>
            </span>
          </label>
        </div>
        <div className="campo-grupo">
          <span>Días laborales</span>
          <div className="dias" role="group" aria-label="Días laborales">
            {DIAS.map(([numero, texto]) => (
              <button key={numero} type="button" aria-pressed={form.dias_laborales.includes(numero)}
                className={form.dias_laborales.includes(numero) ? 'activo' : ''} onClick={() => alternarDia(numero)}>
                {texto}
              </button>
            ))}
          </div>
        </div>
        <p className="sutil nota-panel">
          Una entrada después de la hora oficial más la tolerancia se registra como retardo. Las marcaciones en días no laborales
          se aceptan y se etiquetan como fuera de horario.
        </p>
      </fieldset>

      <fieldset className="seccion-config">
        <legend>Reconocimiento biométrico</legend>
        <div className="rejilla-config">
          <label>
            Umbral de reconocimiento
            <span className="campo-unidad">
              <input type="number" min="40" max="95" step="1" value={form.umbral} onChange={actualizar('umbral')} required />
              <span>%</span>
            </span>
          </label>
          <label>
            Intervalo anti-rebote
            <span className="campo-unidad">
              <input type="number" min="5" max="3600" step="1" value={form.intervalo_anti_rebote_segundos}
                onChange={actualizar('intervalo_anti_rebote_segundos')} required />
              <span>s</span>
            </span>
          </label>
        </div>
        <p className="sutil nota-panel">
          Un umbral más alto hace al sistema más estricto: disminuye el riesgo de aceptar a otra persona, pero aumenta los rechazos
          del colaborador correcto. El anti-rebote evita que un mismo colaborador registre dos marcaciones seguidas por error;
          en producción se recomiendan 120 segundos.
        </p>
      </fieldset>

      <fieldset className="seccion-config">
        <legend>Modo de pruebas</legend>
        {original.modo_pruebas ? (
          <>
            <label className="interruptor">
              <input type="checkbox" checked={form.modo_pruebas}
                onChange={(e) => { setForm({ ...form, modo_pruebas: e.target.checked }); setAviso(null) }} />
              Modo de pruebas activo: las marcaciones se guardan con la etiqueta Prueba
            </label>
            {desactivaPruebas && (
              <div className="aviso pendiente" role="status">
                <strong>Al guardar, el modo de pruebas se desactivará de forma permanente.</strong>
                <span>Las marcaciones nuevas contarán como asistencia real. Esta opción no puede volver a activarse desde el sistema.</span>
              </div>
            )}
          </>
        ) : (
          <p className="aviso exito">
            <strong>Modo de pruebas desactivado.</strong>
            <span>Las marcaciones cuentan como asistencia real.</span>
          </p>
        )}
      </fieldset>

      {aviso && <p className={`aviso ${aviso.tipo}`} role="status">{aviso.texto}</p>}
      {modificado && error && <p className="aviso alerta" role="alert">{error}</p>}

      <div className="acciones">
        <span className="sutil">
          Última modificación: {formatoFecha(fechaCambio)} {formatoHora(horaCambio)}
          {original.actualizado_por ? ` por ${original.actualizado_por}` : ''}
        </span>
        <div className="botones-derecha">
          <button type="button" className="boton secundario" disabled={!modificado || enviando}
            onClick={() => { setForm(aFormulario(original)); setAviso(null) }}>
            Descartar cambios
          </button>
          <button type="submit" className="boton primario" disabled={!modificado || Boolean(error) || enviando}>
            {enviando ? 'Guardando...' : desactivaPruebas ? 'Guardar y desactivar pruebas' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </form>
  )
}
