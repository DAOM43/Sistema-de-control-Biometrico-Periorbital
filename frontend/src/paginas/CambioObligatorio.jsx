import { Logo } from '../componentes/Layout.jsx'
import FormularioPassword from '../componentes/FormularioPassword.jsx'

export default function CambioObligatorio({ usuario, onListo, onSalir }) {
  return (
    <div className="login">
      <div className="login-tarjeta cambio-obligatorio">
        <span className="marca-logo grande" aria-hidden="true"><Logo tamano={22} /></span>
        <h1>Cree su contraseña</h1>
        <p className="sutil">
          {usuario.nombre_completo}, el administrador restableció la contraseña de la cuenta
          <strong> {usuario.nombre_usuario}</strong>. Para continuar, defina una contraseña que solo usted conozca.
        </p>
        <FormularioPassword etiquetaActual="Contraseña temporal" textoBoton="Guardar y continuar" onListo={onListo} />
        <button type="button" className="boton-texto" onClick={onSalir}>Cerrar sesión</button>
      </div>
    </div>
  )
}
