"""Detección facial, aislamiento de la región periorbital y generación del embedding."""

import base64
import binascii

import cv2
import dlib
import face_recognition
import face_recognition_models
import numpy as np

TAM_MIN_ROSTRO = 110
NITIDEZ_MIN = 25.0
DISPERSION_MAX_MUESTRAS = 0.45
MARGEN_NO_ENROLADO = 0.15

_predictor_5 = dlib.shape_predictor(face_recognition_models.pose_predictor_five_point_model_location())
_codificador = dlib.face_recognition_model_v1(face_recognition_models.face_recognition_model_location())
_clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))


class ErrorCaptura(Exception):
    pass


def decodificar_imagen(imagen_b64: str) -> np.ndarray:
    if "," in imagen_b64:
        imagen_b64 = imagen_b64.split(",", 1)[1]
    try:
        datos = base64.b64decode(imagen_b64, validate=True)
    except (binascii.Error, ValueError):
        raise ErrorCaptura("La imagen recibida no tiene un formato válido.")
    imagen = cv2.imdecode(np.frombuffer(datos, np.uint8), cv2.IMREAD_COLOR)
    if imagen is None:
        raise ErrorCaptura("No fue posible leer la imagen capturada.")
    return imagen


def _normalizar_iluminacion(bgr: np.ndarray) -> np.ndarray:
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    lab = cv2.merge((_clahe.apply(l), a, b))
    return cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)


def _validar_nitidez(bgr: np.ndarray, ubicacion) -> None:
    arriba, derecha, abajo, izquierda = ubicacion
    recorte = cv2.cvtColor(bgr[arriba:abajo, izquierda:derecha], cv2.COLOR_BGR2GRAY)
    if recorte.size == 0 or cv2.Laplacian(recorte, cv2.CV_64F).var() < NITIDEZ_MIN:
        raise ErrorCaptura("Imagen borrosa. Permanezca quieto frente a la cámara.")


def _localizar_rostro(rgb: np.ndarray):
    ubicaciones = face_recognition.face_locations(rgb, number_of_times_to_upsample=1, model="hog")
    if not ubicaciones:
        raise ErrorCaptura("No se detectó un rostro. Colóquese de frente a la cámara.")
    if len(ubicaciones) > 1:
        raise ErrorCaptura("Hay más de una persona frente a la cámara.")
    arriba, derecha, abajo, izquierda = ubicaciones[0]
    if (abajo - arriba) < TAM_MIN_ROSTRO:
        raise ErrorCaptura("Acérquese un poco más a la cámara.")
    return ubicaciones[0]


def _aislar_region_periorbital(rgb: np.ndarray, puntos: dict) -> np.ndarray:
    for clave in ("left_eye", "right_eye", "left_eyebrow", "right_eyebrow", "nose_bridge"):
        if not puntos.get(clave):
            raise ErrorCaptura("No se identificaron los landmarks oculares.")

    # Corte a la altura media del puente nasal: debajo de esta línea nada aporta al descriptor.
    corte = int(puntos["nose_bridge"][2][1])
    enmascarada = rgb.copy()
    enmascarada[max(corte, 0):, :] = 128
    return np.ascontiguousarray(enmascarada)


def generar_embedding(imagen_b64: str) -> np.ndarray:
    bgr = decodificar_imagen(imagen_b64)
    rgb = _normalizar_iluminacion(bgr)
    ubicacion = _localizar_rostro(rgb)
    _validar_nitidez(bgr, ubicacion)

    puntos = face_recognition.face_landmarks(rgb, [ubicacion])[0]
    region = _aislar_region_periorbital(rgb, puntos)

    # La alineación usa el rostro completo; el descriptor se calcula sobre la región aislada.
    arriba, derecha, abajo, izquierda = ubicacion
    forma = _predictor_5(rgb, dlib.rectangle(izquierda, arriba, derecha, abajo))
    descriptor = _codificador.compute_face_descriptor(region, forma, 1)
    return np.asarray(descriptor, dtype=np.float64)


def consolidar_muestras(embeddings: list[np.ndarray]) -> np.ndarray:
    matriz = np.vstack(embeddings)
    promedio = matriz.mean(axis=0)
    dispersion = face_recognition.face_distance(matriz, promedio)
    if float(dispersion.max()) > DISPERSION_MAX_MUESTRAS:
        raise ErrorCaptura("Las muestras no son consistentes entre sí. Repita la captura.")
    return promedio


def a_bytes(embedding: np.ndarray) -> bytes:
    return embedding.astype(np.float64).tobytes()


def desde_bytes(datos: bytes) -> np.ndarray:
    return np.frombuffer(datos, dtype=np.float64)


def confianza(distancia: float) -> float:
    return round(max(0.0, min(1.0, 1.0 - distancia)), 4)


def mejor_coincidencia(embedding: np.ndarray, patrones: list[tuple[int, bytes]]):
    if not patrones:
        return None, 0.0
    ids = [p[0] for p in patrones]
    matriz = np.vstack([desde_bytes(p[1]) for p in patrones])
    distancias = face_recognition.face_distance(matriz, embedding)
    indice = int(np.argmin(distancias))
    return ids[indice], confianza(float(distancias[indice]))