// Cabeza estilizada que demuestra el movimiento solicitado. La animación depende de la clase pose-*.
export default function IconoPose({ pose }) {
  return (
    <svg className={`icono-pose pose-${pose}`} viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">
      <g className="ip-cabeza">
        <ellipse className="ip-contorno" cx="32" cy="33" rx="15" ry="19" />
        <g className="ip-rasgos">
          <path className="ip-ceja" d="M22 25 q4 -2.5 8 0" />
          <path className="ip-ceja" d="M34 25 q4 -2.5 8 0" />
          <g className="ip-ojos">
            <ellipse cx="26" cy="30" rx="2.4" ry="2" />
            <ellipse cx="38" cy="30" rx="2.4" ry="2" />
          </g>
          <path className="ip-nariz" d="M32 32 v6 h-2" />
        </g>
      </g>
      <path className="ip-flecha ip-flecha-der" d="M52 24 q6 8 0 16 M49 38 l3 2.5 l1.5 -3.5" />
      <path className="ip-flecha ip-flecha-izq" d="M12 24 q-6 8 0 16 M15 38 l-3 2.5 l-1.5 -3.5" />
      <circle className="ip-anillo" cx="32" cy="33" r="26" pathLength="100" />
    </svg>
  )
}