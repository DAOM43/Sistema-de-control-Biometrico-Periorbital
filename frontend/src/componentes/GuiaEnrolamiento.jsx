import IconoPose from './IconoPose.jsx'
import { BANDA, LIENZO, OVALO } from '../enrolamiento/geometria.js'

// El contorno parte desde arriba para que el anillo de la cuenta regresiva avance en sentido horario.
const ARCOS = `a${OVALO.rx} ${OVALO.ry} 0 1 1 0 ${OVALO.ry * 2} a${OVALO.rx} ${OVALO.ry} 0 1 1 0 ${-OVALO.ry * 2}`
const CONTORNO = `M${OVALO.cx} ${OVALO.cy - OVALO.ry} ${ARCOS}Z`
const MASCARA = `M0 0H${LIENZO.ancho}V${LIENZO.alto}H0Z ${CONTORNO}`

export default function GuiaEnrolamiento({ fase, pose, instruccion, segundos, claveCuenta, duracionCuenta }) {
  return (
    <div className={`guia-enrol fase-${fase}`} aria-hidden="true">
      <svg className="guia-lienzo" viewBox={`0 0 ${LIENZO.ancho} ${LIENZO.alto}`} preserveAspectRatio="xMidYMid slice">
        <path className="guia-sombra" d={MASCARA} fillRule="evenodd" />
        <rect className="guia-banda" x={BANDA.x} y={BANDA.y} width={BANDA.ancho} height={BANDA.alto} rx={BANDA.alto / 2} />
        <path className="guia-ovalo" d={CONTORNO} />
        {fase === 'cuenta' && (
          <path
            key={claveCuenta}
            className="guia-progreso"
            d={CONTORNO}
            pathLength="100"
            style={{ animationDuration: `${duracionCuenta}s` }}
          />
        )}
        {(fase === 'aceptada' || fase === 'completa') && (
          <g transform={`translate(${OVALO.cx} ${OVALO.cy})`}>
            <g className="guia-check">
              <circle r="54" />
              <path d="M-22 2 l14 14 l28 -30" pathLength="100" />
            </g>
          </g>
        )}
      </svg>

      {instruccion && (
        <div className="guia-tarjeta">
          <div key={`${pose}-${instruccion}`} className="guia-mensaje">
            {pose && <IconoPose pose={pose} />}
            <span>{instruccion}</span>
          </div>
          {fase === 'cuenta' && segundos > 0 && (
            <span key={segundos} className="guia-numero">{segundos}</span>
          )}
          {fase === 'validando' && <span className="guia-validando" />}
        </div>
      )}
    </div>
  )
}

export function PasosCaptura({ pasos, completadas, activa }) {
  return (
    <ol className="pasos-captura">
      {pasos.map((paso, i) => {
        const estado = i < completadas ? 'hecho' : i === completadas && activa ? 'actual' : 'pendiente'
        return (
          <li key={i} className={`paso-${estado}`}>
            <span className="paso-marca">{estado === 'hecho' ? '' : i + 1}</span>
            <span className="paso-texto">{paso.etiqueta}</span>
          </li>
        )
      })}
    </ol>
  )
}