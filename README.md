# Quiniela Mundial 2026

App familiar para pronosticar partidos del Mundial 2026 y ver una tabla de posiciones.

## Funciones

- Participantes con nombre y contrasena.
- Pronosticos de marcador por partido.
- Cierre automatico de pronosticos cuando empieza cada partido.
- Tabla de puntos automatica.
- Vista separada de admin con PIN para capturar resultados reales.
- Persistencia en Vercel KV/Upstash mediante API serverless.
- Modo servidor local en desarrollo si aun no configuras KV.

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

La vista de administrador esta en `http://localhost:3000/admin`.
La vista publica de posiciones esta en `http://localhost:3000/posiciones`.

## Registro de participantes

Cada participante crea una cuenta con nombre y contrasena desde la pagina principal.

La contrasena no se guarda en texto plano. El servidor guarda un `passwordHash` y un `passwordSalt` dentro del estado persistido. Al iniciar sesion, el servidor devuelve un token firmado que el navegador guarda en `sessionStorage` y usa para autorizar pronosticos.

En produccion configura `AUTH_SECRET` para firmar esos tokens. Si cambias `AUTH_SECRET`, las sesiones abiertas dejan de ser validas y los usuarios tendran que entrar otra vez.

## Despliegue en Vercel

1. Sube este repositorio a GitHub.
2. Importa el proyecto en Vercel.
3. Agrega una base Vercel KV o Upstash Redis.
4. Configura estas variables de entorno:

```text
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
ADMIN_PIN=180799
AUTH_SECRET=una-frase-larga-y-secreta
```

5. Despliega. Comparte la URL con familiares y amigos.

## Cambiar partidos

Edita `lib/matches.js`. Puedes agregar todos los partidos del Mundial usando el mismo formato.

Los partidos de eliminatoria pueden quedarse como placeholders con `teamsConfirmed: false`; se muestran en la quiniela, pero no aceptan pronosticos hasta que reemplaces los nombres y cambies ese campo a `true`.

## Resultados automaticos

Puedes configurar una fuente externa de resultados con estas variables:

```text
RESULTS_API_URL=...
RESULTS_API_TOKEN=...
```

La app espera resultados finalizados con `matchId`, `homeScore`, `awayScore` y `status`/`finished`. Si no configuras una fuente, puedes seguir capturando resultados desde `/admin`.
