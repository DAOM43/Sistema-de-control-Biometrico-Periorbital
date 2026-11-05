export const REGLA_PASSWORD = 'Mínimo 8 caracteres, con letras y números.'

export function problemaPassword(valor) {
  if (valor.length < 8) return 'Debe tener al menos 8 caracteres.'
  if (!/[A-Za-z]/.test(valor)) return 'Debe incluir al menos una letra.'
  if (!/\d/.test(valor)) return 'Debe incluir al menos un número.'
  return ''
}

const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz'
const DIGITOS = '23456789'

function elegir(fuente, cantidad) {
  const valores = crypto.getRandomValues(new Uint32Array(cantidad))
  return Array.from(valores, (v) => fuente[v % fuente.length]).join('')
}

// Sin caracteres ambiguos (0/O, 1/l/I) para dictarla sin confusiones.
export function generarTemporal() {
  return `${elegir(LETRAS, 5)}${elegir(DIGITOS, 4)}`
}
