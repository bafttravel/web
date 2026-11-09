# BAFT Travel

Aplicación web de BAFT para publicar experiencias turísticas, gestionar reservas y centralizar operaciones comerciales y administrativas.

## Funcionalidades

- Sitio público en español e inglés, con catálogo de paquetes, excursiones, destinos, contenido editorial y flujo de reservas.
- Checkout con integraciones de pago de Mercado Pago y WeeTravel.
- Panel de administración para contenidos, clientes, reservas, vendedores, hoteles, proveedores, pagos y reportes.
- Portal de vendedores para consultar y gestionar reservas.
- Emails transaccionales con Resend y traducción opcional de contenido CMS con DeepL.

## Tecnologías

- Next.js 16, React 19, TypeScript y Tailwind CSS 4.
- `next-intl` para los idiomas públicos.
- Firebase Authentication y Firestore; Firebase Admin para operaciones del servidor.
- Cloudflare R2 para archivos, mediante la API compatible con S3.
- Mercado Pago, WeeTravel, Resend y DeepL para integraciones externas.

## Requisitos

- Node.js 20.9 o superior y npm.
- Un proyecto de Firebase para las funciones que usan autenticación y Firestore.
- Credenciales de los servicios externos que se quieran habilitar. Pagos, emails, traducción y tareas programadas dependen de sus respectivas credenciales.

## Desarrollo local

```bash
git clone https://github.com/bafttravel/web.git
cd web
npm ci
```

Crea `.env.local` en la raíz y agrega las variables necesarias para los servicios que vayas a probar. El archivo está excluido de Git: **no guardes credenciales en el repositorio**.

```bash
npm run dev
```

El sitio público redirige las rutas sin idioma a `/es/...` o `/en/...`, según la preferencia del visitante. Las rutas de administración, vendedores y API no llevan prefijo de idioma.

## Variables de entorno

Configura solo las integraciones que vayas a utilizar. Los valores secretos deben permanecer en el servidor y en el entorno local o de despliegue; no deben llevar el prefijo `NEXT_PUBLIC_`.

### Firebase

Para el cliente, configura:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

Para Firebase Admin, configura **una** de estas opciones:

- `FIREBASE_SERVICE_ACCOUNT` con el JSON de la cuenta de servicio, o `FIREBASE_SERVICE_ACCOUNT_B64` con ese JSON codificado en Base64; o
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` y `FIREBASE_PRIVATE_KEY`.

### Archivos y URL del sitio

- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` y `R2_ENDPOINT` para Cloudflare R2.
- `R2_PUBLIC_BASE` para la URL pública de los archivos.
- `NEXT_PUBLIC_SITE_URL` para enlaces absolutos, callbacks y tareas del servidor.

### Integraciones opcionales

- **Mercado Pago:** `MERCADO_PAGO_ACCESS_TOKEN`.
- **WeeTravel:** `WETRAVEL_API_KEY`, `WETRAVEL_API_URL`, `WETRAVEL_AUTH_URL` y, según la cuenta, `WETRAVEL_PARTICIPANT_FEES` y `WETRAVEL_WEBHOOK_SECRET`. La API key alternativa `WETRAVEL_API_TOKEN` también es aceptada. Ver [configuración de WeeTravel](docs/wetravel-production.md).
- **Emails:** `RESEND_API_KEY`; opcionalmente `RESEND_FROM_EMAIL`, `SUPPORT_EMAIL` y `BRAND_NAME`.
- **Traducción del CMS:** `DEEPL_API_KEY` y, opcionalmente, `DEEPL_API_URL`.
- **Tareas programadas:** `CRON_SECRET`. Para GitHub Actions también se necesita `APP_URL` como secret del repositorio.
- **Acceso administrativo:** `NEXT_PUBLIC_ADMIN_DOMAINS` o `NEXT_PUBLIC_ADMIN_DOMAIN`, y la lista de emails permitidos configurada para el entorno (`ADMIN_EMAILS` o `ADMIN_EMAIL`, según el flujo).

Las credenciales de Firebase Admin, R2, pagos, WeeTravel y Resend son privadas. No las incluyas en el cliente ni en capturas o logs públicos.

## Despliegue y tareas programadas

La aplicación está configurada para desplegarse en Vercel. Configura allí las variables de entorno de Firebase, R2 y de cada integración habilitada. `vercel.json` define la región y los recursos de la ruta de carga de archivos.

Los trabajos programados se ejecutan desde GitHub Actions, no desde Vercel. Configura `APP_URL` y `CRON_SECRET` en **Settings → Secrets and variables → Actions**; `CRON_SECRET` debe coincidir con el del entorno de despliegue. Los workflows procesan emails, liberan holds vencidos y reconcilian pagos de WeeTravel.

La llegada a la página de éxito del checkout no confirma por sí sola un pago pendiente. La confirmación se procesa mediante las notificaciones y verificaciones del proveedor. Para los pasos de producción de WeeTravel, consulta [docs/wetravel-production.md](docs/wetravel-production.md).

## Seguridad y operación

- Revisa las reglas de Firestore antes de publicar. No uses reglas genéricas que permitan escribir a cualquier usuario autenticado; las APIs administrativas requieren controles propios.
- No subas `.env.local`, cuentas de servicio ni tokens. Usa secretos de entorno en Vercel y GitHub Actions.
- Las reglas monetarias, permisos y flujos del panel están documentados en [docs/BAFT-ADMIN.md](docs/BAFT-ADMIN.md).
- La configuración de marca, SEO y contenido inicial está en `site-config.json`.
