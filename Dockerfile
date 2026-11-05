# Imagen para el ambiente de demostración en la nube: compila el frontend y lo sirve junto con la API.

FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
# CST6 equivale a la hora de Guatemala (UTC-6, sin horario de verano).
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TZ=CST6
WORKDIR /app/backend

COPY backend/requirements.txt ./
# En servidores sin pantalla se usa la versión headless de OpenCV.
RUN pip install --no-cache-dir -r requirements.txt \
 && pip install --no-cache-dir face_recognition==1.3.0 --no-deps \
 && pip uninstall -y opencv-python \
 && pip install --no-cache-dir opencv-python-headless==4.10.0.84

COPY backend/ ./
COPY --from=frontend /app/frontend/dist /app/frontend/dist

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
