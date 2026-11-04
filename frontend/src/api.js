const CLAVE_SESION = 'cbp_sesion'

export function leerSesion() {
  try {
    return JSON.parse(sessionStorage.getItem(CLAVE_SESION))
  } catch {
    return null
  }
}

export function guardarSesion(sesion) {
  if (sesion) sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion))
  else sessionStorage.removeItem(CLAVE_SESION)
}

async function solicitar(metodo, ruta, cuerpo) {
  const sesion = leerSesion()
  const respuesta = await fetch(ruta, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(sesion?.token ? { Authorization: `Bearer ${sesion.token}` } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })

  if (respuesta.status === 401 && sesion) {
    guardarSesion(null)
    window.location.assign('/login')
  }

  const datos = await respuesta.json().catch(() => null)
  if (!respuesta.ok) {
    const detalle = Array.isArray(datos?.detail) ? 'Revise los datos ingresados.' : datos?.detail
    throw new Error(detalle || 'No fue posible completar la operación.')
  }
  return datos
}

export const api = {
  get: (ruta) => solicitar('GET', ruta),
  post: (ruta, cuerpo) => solicitar('POST', ruta, cuerpo),
  put: (ruta, cuerpo) => solicitar('PUT', ruta, cuerpo),
}