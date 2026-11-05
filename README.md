# Sistema de Control Biométrico Periorbital

Sistema de registro y control de asistencia del personal del Centro de Salud de Guazacapán mediante reconocimiento de la región periorbital (zona de los ojos y cejas).

El colaborador digita su código y el sistema verifica, con la cámara, que la región periorbital corresponda al patrón biométrico registrado para ese código (verificación 1 a 1). La primera marcación del día se registra como entrada y las siguientes como salida.

## Arquitectura

| Capa | Tecnología |
|---|---|
| Base de datos | PostgreSQL 16 |
| Backend (API REST) | Python, FastAPI, SQLAlchemy 2, Pydantic 2 |
| Biometría | OpenCV, dlib, face_recognition (embeddings de 128 dimensiones) |
| Frontend | React 19, Vite, React Router |
| Seguridad | Contraseñas con bcrypt, sesiones con JWT, roles por cuenta |

```
control-biometrico-periorbital/
├── backend/
│   ├── app/
│   │   ├── biometria/periorbital.py   Detección, aislamiento periorbital y embeddings
│   │   ├── routers/                   Endpoints de la API por módulo
│   │   ├── horario.py                 Evaluación de puntualidad, retardo y tiempo extra
│   │   ├── servicios.py               Reglas de marcaje entrada y salida
│   │   ├── security.py                Autenticación, roles y cifrado
│   │   ├── models.py / schemas.py     Modelos de base de datos y validación de datos
│   │   └── main.py                    Punto de entrada de la API
│   ├── scripts/                       Pruebas y utilidades de mantenimiento
│   ├── requirements.txt
│   └── .env.example
├── database/                          Scripts SQL en orden de ejecución
├── docs/                              Entregables del proyecto de graduación
└── frontend/
    └── src/
        ├── paginas/                   Pantallas del sistema
        ├── componentes/               Componentes compartidos
        └── utilidades/                Formatos de fecha, hora y contraseñas
```

## Roles y cuentas

El sistema maneja una cuenta fija por puesto. El nombre de la persona responsable se actualiza desde la pantalla Cuentas cuando cambia quien ocupa el puesto.

| Usuario | Rol | Acceso |
|---|---|---|
| `admin` | Administrador | Todo el sistema, Cuentas y Configuración |
| `administrativo` | Personal administrativo | Marcaje, Enrolamiento, Personal, Contingencia y Reportes |
| `recepcion` | Recepción | Marcaje |

Contraseñas iniciales: `Admin2026`, `Personal2026` y `Recepcion2026`. Deben cambiarse al instalar el sistema.

Solo el administrador puede cambiar su contraseña libremente. Para las demás cuentas, el administrador asigna una contraseña temporal desde Cuentas y la persona debe reemplazarla al iniciar sesión. Cinco intentos fallidos bloquean la cuenta durante 15 minutos.

## Requisitos

- Windows 10 u 11 con cámara web
- Python 3.12
- Node.js 22 LTS
- PostgreSQL 16 con pgAdmin 4

## Instalación

### 1. Base de datos

Los scripts se ejecutan con el usuario `postgres`, desde pgAdmin (Query Tool) o con `psql`.

| Orden | Script | Base de datos | Propósito |
|---|---|---|---|
| 1 | `00_crear_base.sql` | `postgres` | Crea el rol `cbp_app` y la base `control_biometrico` |
| 2 | `01_esquema.sql` | `control_biometrico` | Tablas principales |
| 3 | `02_intentos_no_reconocidos.sql` | `control_biometrico` | Registro de intentos rechazados |
| 4 | `03_datos_iniciales.sql` | `control_biometrico` | Cuentas y configuración inicial |
| 5 | `04_reglas_marcaje.sql` | `control_biometrico` | Horario, secuencia entrada y salida, modo de pruebas |
| 6 | `06_cuentas_y_configuracion.sql` | `control_biometrico` | Cambio obligatorio de contraseña y límites de configuración |
| 7 | `07_usuario_administrativo.sql` | `control_biometrico` | Usuario fijo del puesto administrativo |
| 8 | `08_evaluacion_guardada.sql` | `control_biometrico` | Evaluación de horario guardada en cada marcación |

El script `05_limpiar_pruebas.sql` no forma parte de la instalación; se usa al pasar a producción.

Antes de instalar en producción, cambie la contraseña de `cbp_app` en `00_crear_base.sql`.

### 2. Backend

```
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
pip install face_recognition==1.3.0 --no-deps
copy .env.example .env
```

Edite `.env` con la contraseña de `cbp_app` y una clave `JWT_SECRETO` propia. Después:

```
python scripts\guardar_evaluaciones.py
uvicorn app.main:app --reload
```

La API queda en `http://localhost:8000` y su documentación en `http://localhost:8000/docs`.

### 3. Frontend

```
cd frontend
npm install
npm run dev
```

El sistema se abre en `http://localhost:5173`.

## Pantallas

| Pantalla | Función |
|---|---|
| Marcaje | Digitar código y verificar el rostro para registrar entrada o salida |
| Enrolamiento | Registrar un colaborador con 5 capturas guiadas de la región periorbital |
| Personal | Editar, desactivar y reactivar colaboradores |
| Contingencia | Transcribir la planilla física cuando falla la cámara o la energía |
| Reportes | Consultar marcaciones con retardos, salidas anticipadas y tiempo extra; exportar a Excel |
| Cuentas | Cambiar responsable, restablecer contraseñas y desbloquear cuentas |
| Configuración | Horario, tolerancia, días laborales, umbral, anti-rebote y modo de pruebas |

## Reglas principales

- La primera marcación del día es entrada y las siguientes son salida. La base de datos impide dos entradas el mismo día y salidas sin entrada.
- Una marcación fuera de horario o en día no laboral se registra y se etiqueta; no se bloquea.
- La evaluación de horario se guarda al registrar la marcación, por lo que un cambio posterior de horario no altera los reportes anteriores.
- No se almacenan imágenes: solo el patrón numérico de 128 dimensiones de cada colaborador.
- Al enrolar se compara contra todos los patrones registrados para impedir que una persona tenga dos códigos. Si dos personas distintas se parecen (por ejemplo, familiares), solo el administrador puede confirmar el registro.

## Pruebas

Desde `backend`, con el entorno virtual activo:

| Script | Propósito |
|---|---|
| `python scripts\prueba_secuencia.py` | Valida la regla entrada y salida, el horario y las protecciones de la base de datos |
| `python scripts\prueba_verificacion.py` | Intentos genuinos e impostores con la cámara para calcular FAR y FRR |
| `python scripts\revisar_duplicados.py` | Lista colaboradores con patrones demasiado parecidos entre sí |

## Paso a producción

1. Ejecutar `05_limpiar_pruebas.sql`: elimina marcaciones e intentos de prueba y desactiva el modo de pruebas.
2. Desactivar desde Personal a los colaboradores registrados solo para pruebas.
3. En Configuración, verificar el horario y fijar el anti-rebote en 120 segundos.
4. Cambiar las contraseñas iniciales de las tres cuentas.
5. Programar un respaldo diario de la base con `pg_dump`.
