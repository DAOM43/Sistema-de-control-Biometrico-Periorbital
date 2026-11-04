import { BANDA, LIENZO, OVALO } from './geometria.js'

const TOLERANCIA_CENTRO = 0.08
const MARGEN_BANDA = 0.03
const ALTO_MIN = 0.26
const ALTO_MAX = 0.75

function aVista([x, y], g) {
  const escala = Math.max(g.vistaAncho / g.videoAncho, g.vistaAlto / g.videoAlto)
  const vx = (x * g.videoAncho * escala - (g.videoAncho * escala - g.vistaAncho) / 2) / g.vistaAncho
  const vy = (y * g.videoAlto * escala - (g.videoAlto * escala - g.vistaAlto) / 2) / g.vistaAlto
  return [1 - vx, vy]
}

export function revisarEncuadre(encuadre, geometria) {
  if (!encuadre || !geometria) return null

  const [ojoX, ojoY] = aVista(encuadre.ojos, geometria)
  const [, arriba] = aVista([0, encuadre.rostro[1]], geometria)
  const [, abajo] = aVista([0, encuadre.rostro[3]], geometria)

  if (Math.abs(ojoX - OVALO.cx / LIENZO.ancho) > TOLERANCIA_CENTRO) {
    return { pose: 'centrar', instruccion: 'Ubique su rostro dentro del contorno' }
  }

  const bandaArriba = BANDA.y / LIENZO.alto - MARGEN_BANDA
  const bandaAbajo = (BANDA.y + BANDA.alto) / LIENZO.alto + MARGEN_BANDA
  if (ojoY < bandaArriba || ojoY > bandaAbajo) {
    return { pose: 'centrar', instruccion: 'Alinee sus ojos con la franja del contorno' }
  }

  const alto = abajo - arriba
  if (alto < ALTO_MIN) return { pose: 'acercar', instruccion: 'Acérquese un poco más a la cámara' }
  if (alto > ALTO_MAX) return { pose: 'alejar', instruccion: 'Aléjese un poco de la cámara' }
  return null
}