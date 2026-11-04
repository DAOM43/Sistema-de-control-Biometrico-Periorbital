export const PASOS = [
  { etiqueta: 'Frente', pose: 'frente', instruccion: 'Mire de frente a la cámara' },
  { etiqueta: 'Derecha', pose: 'derecha', instruccion: 'Gire ligeramente a la derecha' },
  { etiqueta: 'Izquierda', pose: 'izquierda', instruccion: 'Gire ligeramente a la izquierda' },
  { etiqueta: 'Frente', pose: 'frente', instruccion: 'Vuelva a mirar de frente' },
  { etiqueta: 'Final', pose: 'quieto', instruccion: 'Mire de frente y permanezca quieto' },
]

export const SEGUNDOS_CUENTA = 3

const CORRECCIONES = [
  { patron: /acérquese/i, pose: 'acercar', instruccion: 'Acérquese un poco más a la cámara' },
  { patron: /borrosa/i, pose: 'quieto', instruccion: 'Permanezca quieto durante la captura' },
  { patron: /más de una persona/i, pose: 'centrar', instruccion: 'Solo una persona frente a la cámara' },
  { patron: /landmarks|oculares/i, pose: 'frente', instruccion: 'Mire de frente con los ojos abiertos' },
  { patron: /no se detectó/i, pose: 'centrar', instruccion: 'Ubique su rostro dentro del contorno' },
]

export function correccionPara(mensaje) {
  const encontrada = CORRECCIONES.find((c) => c.patron.test(mensaje))
  return encontrada ?? { pose: 'centrar', instruccion: mensaje }
}