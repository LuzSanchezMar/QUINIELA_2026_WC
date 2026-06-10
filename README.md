# Quiniela Mundial 2026

App familiar para pronosticar partidos del Mundial 2026 y ver una tabla de posiciones.

## Funciones

- Participantes por nombre, sin cuentas.
- Pronosticos de marcador por partido.
- Tabla de puntos automatica.
- Panel de admin con PIN para capturar resultados reales.
- Persistencia en Vercel KV/Upstash mediante API serverless.
- Modo local de respaldo con `localStorage` si aun no configuras KV.

## Reglas de puntos

- 3 puntos por marcador exacto.
- 1 punto por acertar ganador o empate.
- 0 puntos si no coincide el resultado.

## Desarrollo local

Instala dependencias y ejecuta Next.js:

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`.

## Despliegue en Vercel

1. Sube este repositorio a GitHub.
2. Importa el proyecto en Vercel.
3. Agrega una base Vercel KV o Upstash Redis.
4. Configura estas variables de entorno:

```text
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
ADMIN_PIN=1234
```

5. Despliega. Comparte la URL con familiares y amigos.

## Cambiar partidos

Edita `lib/matches.js`. Puedes agregar todos los partidos del Mundial usando el mismo formato.
