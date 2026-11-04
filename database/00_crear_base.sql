-- Ejecutar como postgres, conectado a la base "postgres".
CREATE ROLE cbp_app WITH LOGIN PASSWORD 'cbp_desarrollo_2026';

CREATE DATABASE control_biometrico
    WITH OWNER = cbp_app
    ENCODING = 'UTF8'
    TEMPLATE = template0;