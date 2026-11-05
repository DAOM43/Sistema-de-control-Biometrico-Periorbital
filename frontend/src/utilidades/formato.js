export function formatoHora(hora) {
  if (!hora) return ''
  const [h, m] = hora.split(':').map(Number)
  const sufijo = h >= 12 ? 'PM' : 'AM'
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${sufijo}`
}

export function formatoFecha(fecha) {
  if (!fecha) return ''
  const [a, m, d] = fecha.split('-')
  return `${d}/${m}/${a}`
}

export function fechaISO(fecha = new Date()) {
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  return `${fecha.getFullYear()}-${m}-${d}`
}

export function primerDiaDelMes(fecha = new Date()) {
  return fechaISO(new Date(fecha.getFullYear(), fecha.getMonth(), 1))
}

export function duracion(minutos) {
  const horas = Math.floor(Math.abs(minutos) / 60)
  const resto = Math.abs(minutos) % 60
  return horas ? `${horas} h ${String(resto).padStart(2, '0')} min` : `${resto} min`
}