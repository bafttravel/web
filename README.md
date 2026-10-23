# 🚀 Viajes y Turismo

Aplicación web moderna y completa para agencia de viajes construida con Next.js 14, React 19, Firebase y Tailwind CSS. Sistema completo con frontend público y panel de administración..

## 📋 Tabla de Contenidos

- [Características](#-características)
- [Stack Tecnológico](#-stack-tecnológico)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Instalación](#-instalación)
- [Configuración](#-configuración)
- [Arquitectura](#-arquitectura)
- [Frontend](#-frontend)
- [Backend](#-backend)
- [Base de Datos](#-base-de-datos)
- [Deploy](#-deploy)
- [Desarrollo](#-desarrollo)
- [Troubleshooting](#-troubleshooting)

## ✨ Características

### Frontend Público
- 🏠 **Homepage** con hero section responsive (imágenes separadas para mobile/desktop)
- 📂 **Categorías** dinámicas con páginas individuales
- 🎫 **Paquetes turísticos** con páginas de detalle completas
- 🔍 **Sistema de búsqueda y filtros** avanzado (por categoría, tipo, destino, servicios)
- 📱 **Diseño 100% responsive** optimizado para mobile y desktop
- 💬 **Integración con WhatsApp** para consultas directas
- 📧 **Formulario de contacto** con validación
- 🖼️ **Galerías de imágenes** interactivas
- ⚡ **Optimización de rendimiento** con Next.js 14 App Router
- 🎨 **Diseño minimalista** en blanco y negro

### Panel de Administración
- 🔐 **Autenticación** con Firebase Auth
- 📊 **Dashboard** con estadísticas en tiempo real
- 📁 **CRUD completo de Categorías**
  - Crear, editar, eliminar
  - Subir imágenes (Vercel Blob)
  - Ordenar y destacar
  - Control de visibilidad
- 🎫 **CRUD completo de Paquetes**
  - Editor de texto rico (Tiptap)
  - Gestión de salidas y fechas
  - Sistema de "incluye/no incluye"
  - Galería múltiple de imágenes
  - **Destino automático** desde la categoría seleccionada
  - Control de precios, monedas, duración
  - Marcar como destacado (máximo 9)
  - Reordenamiento drag & drop
- 📬 **Gestión de Consultas**
  - Ver todas las consultas recibidas
  - Marcar como leídas/no leídas
  - Ver detalles completos
- 🖼️ **Gestión de Imágenes** con Vercel Blob

## 🛠️ Stack Tecnológico

### Frontend
- **Next.js 14** (App Router) - Framework React con SSR/SSG
- **React 19** - Biblioteca UI
- **TypeScript** - Tipado estático
- **Tailwind CSS 4** - Framework CSS utility-first
- **shadcn/ui** - Componentes UI accesibles
- **Framer Motion** - Animaciones fluidas
- **Tiptap** - Editor de texto rico
- **React Hook Form** + **Zod** - Formularios y validación
- **Lucide React** - Iconos

### Backend
- **Firebase Authentication** - Autenticación de usuarios
- **Cloud Firestore** - Base de datos NoSQL
- **Vercel Blob** - Almacenamiento de imágenes

### Herramientas
- **ESLint** - Linter
- **Git** - Control de versiones

## 📁 Estructura del Proyecto

```
ovni_viajes/
├── app/                          # Next.js App Router
│   ├── admin/                    # Panel de administración
│   │   ├── login/                # Página de login
│   │   ├── page.tsx              # Dashboard
│   │   ├── categorias/           # CRUD de categorías
│   │   ├── paquetes/             # CRUD de paquetes
│   │   └── consultas/            # Gestión de consultas
│   ├── paquete/[slug]/           # Página de detalle de paquete
│   ├── paquetes/                 # Listado de paquetes
│   ├── categoria/[slug]/         # Página de categoría
│   ├── contacto/                 # Página de contacto
│   ├── layout.tsx                # Layout principal
│   └── page.tsx                  # Homepage
├── components/                   # Componentes React
│   ├── admin/                    # Componentes del admin
│   │   ├── AdminLayout.tsx       # Layout del panel admin
│   │   ├── ProtectedRoute.tsx    # Protección de rutas
│   │   ├── RichTextEditor.tsx     # Editor Tiptap
│   │   ├── ImageUploader.tsx     # Subida de imágenes
│   │   ├── SalidasManager.tsx    # Gestión de salidas
│   │   └── DragDropOrderManager.tsx # Reordenamiento
│   ├── ui/                       # Componentes shadcn/ui
│   ├── Hero.tsx                  # Hero section responsive
│   ├── Navbar.tsx                # Navegación principal
│   ├── Footer.tsx                # Pie de página
│   ├── PaqueteCard.tsx           # Tarjeta de paquete
│   ├── PaqueteSidebar.tsx        # Sidebar de detalle
│   ├── PaqueteHero.tsx           # Hero de paquete
│   ├── PaquetesClient.tsx        # Cliente de listado
│   ├── ImageGallery.tsx          # Galería de imágenes
│   ├── WhatsAppButton.tsx        # Botón flotante WhatsApp
│   └── ...
├── lib/                          # Utilidades y configuraciones
│   ├── firebase.ts               # Configuración Firebase
│   ├── constants.ts              # Constantes (contacto, redes)
│   ├── utils/                    # Funciones utilitarias
│   │   ├── upload.ts             # Upload a Vercel Blob
│   │   ├── slugify.ts            # Generación de slugs
│   │   └── serialize.ts          # Serialización Firestore
├── types/                        # Definiciones TypeScript
│   └── index.ts                  # Interfaces y tipos
├── public/                       # Archivos estáticos
│   └── images/                   # Imágenes del sitio
│       ├── ovni-logo.svg         # Logo principal
│       ├── banner_mobile.jpg     # Hero mobile
│       ├── banner_desktop.jpg    # Hero desktop
│       └── ...
├── .env.local                    # Variables de entorno (no commitear)
├── package.json                  # Dependencias
├── tsconfig.json                  # Configuración TypeScript
├── tailwind.config.ts            # Configuración Tailwind
└── README.md                     # Este archivo
```

## 📋 Instalación

### Prerrequisitos
- Node.js 18+ y npm
- Cuenta de Firebase
- Cuenta de Vercel (para Blob Storage)

### 1. Clonar el repositorio

```bash
git clone <repository-url>
cd ovni_viajes
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Crea un archivo `.env.local` en la raíz del proyecto:

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=tu_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=tu_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=tu_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=tu_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=tu_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=tu_app_id

# Vercel Blob Storage
BLOB_READ_WRITE_TOKEN=tu_vercel_blob_token

# Site URL (opcional, para producción)
NEXT_PUBLIC_SITE_URL=https://tu-dominio.com

# Traducción automática server-only del contenido CMS (opcional)
DEEPL_API_KEY=tu_deepl_api_key
DEEPL_API_URL=https://api-free.deepl.com

# Mercado Pago
MERCADO_PAGO_ACCESS_TOKEN=tu_access_token
MERCADO_PAGO_PUBLIC_KEY=tu_public_key

# Emails
RESEND_API_KEY=tu_resend_api_key
RESEND_FROM_EMAIL=reservas@tu-dominio.com
SUPPORT_EMAIL=soporte@tu-dominio.com

# Endpoint protegido de tareas programadas
CRON_SECRET=un_secreto_largo_y_aleatorio

# WeeTravel (opcional)
# Partner API key, no es la contraseña del panel web
WETRAVEL_API_KEY=tu_partner_api_key
WETRAVEL_API_URL=https://api.wetravel.com/v3
WETRAVEL_AUTH_URL=https://api.wetravel.com/v2/auth/tokens/access
WETRAVEL_PARTICIPANT_FEES=service
WETRAVEL_WEBHOOK_SECRET=tu_secreto_de_webhook
```

### Idiomas del frontend

El sitio público utiliza `/es/...` y `/en/...`; las rutas antiguas sin prefijo redirigen con HTTP 308 al idioma detectado. Admin, Vendedor, APIs y webhooks permanecen fuera del prefijo. `DEEPL_API_KEY` solo se usa en el servidor para traducir contenido CMS y las traducciones se cachean en Firestore en `translationCache`. Si DeepL no está configurado o falla, se muestra el contenido original en español.

Los títulos, botones, formularios y secciones del inicio se traducen desde `messages/es.json` y `messages/en.json` y no requieren DeepL. Los títulos y descripciones cargados desde Admin sí requieren una clave válida de **DeepL API** (una suscripción al traductor web no equivale a acceso API). Configurar `DEEPL_API_KEY` y `DEEPL_API_URL` en `.env.local`, reiniciar `npm run dev`, y configurar las mismas variables en el entorno de despliegue antes de volver a desplegar. No usar el prefijo `NEXT_PUBLIC_` para la clave.

`npm test` comprueba las referencias literales a mensajes en los componentes públicos, además de la paridad ES/EN. Para comprobar el inicio en navegador, ejecutar `npx playwright test e2e/i18n.spec.ts`; verifica títulos, tarjetas, cambio de idioma con query/hash y viewport móvil.

### Tareas programadas con GitHub Actions

Las tareas programadas no se ejecutan en Vercel. GitHub Actions llama los endpoints protegidos de la aplicación:

- `GET /api/cron/email`: procesa los emails pendientes.
- `POST /api/cron/cleanup-reservation-holds`: libera holds vencidos.
- `POST /api/cron/wetravel-reconcile`: reconcilia Payment Links WeeTravel pendientes.

En el repositorio de GitHub, configurá estos Actions secrets:

| Secret | Valor |
| --- | --- |
| `APP_URL` | URL pública de producción, sin `/` final. Ej.: `https://www.tudominio.com` |
| `CRON_SECRET` | Exactamente el mismo valor configurado en Vercel para `CRON_SECRET` |

Los workflows son `.github/workflows/cron-emails.yml`, `.github/workflows/cron-cleanup-holds.yml` y `.github/workflows/cron-wetravel-reconcile.yml`. Se pueden ejecutar manualmente desde la pestaña **Actions** para verificar la configuración. El workflow de emails corre cada 5 minutos, el de limpieza cada hora y la reconciliación WeeTravel cada 10 minutos.

No agregues `crons` en `vercel.json`: Vercel solo hospeda los endpoints.

### Configuración y prueba de WeeTravel

La integración usa la Partner API v3 y crea un Payment Link por checkout. Necesitás una cuenta WeeTravel con acceso a Partner APIs y una **Partner API key** generada desde `Profile → Partner API Integration`. La API key se canjea automáticamente por un access token temporal de una hora; no uses la contraseña del panel ni pegues la key en el frontend. Configurá en Vercel y local:

```env
WETRAVEL_API_KEY=...
WETRAVEL_API_URL=https://api.demo.wetravel.to/v3
WETRAVEL_AUTH_URL=https://api.demo.wetravel.to/v2/auth/tokens/access
WETRAVEL_PARTICIPANT_FEES=service
WETRAVEL_WEBHOOK_SECRET=...
```

Para probar el sandbox:

1. Ingresá al sandbox web que te entregó soporte y confirmá que la cuenta tenga habilitado **Partner API Integration**. La URL de la web y sus credenciales sirven para operar el panel, pero no reemplazan la Partner API key.
2. Publicá la aplicación en una URL HTTPS accesible desde Internet. WeeTravel no puede llamar `localhost`; para desarrollo podés usar un túnel HTTPS temporal.
3. En WeeTravel habilitá **Webhooks**, agregá `https://TU_DOMINIO/api/wetravel/webhook` y suscribite a `payment.created`, `payment.updated`, `booking.created` y `booking.updated`.
4. Configurá `WETRAVEL_WEBHOOK_SECRET` únicamente si WeeTravel entrega un secreto y firma documentada para tu cuenta. Si no hay firma oficial, dejalo vacío; la integración no inventa una validación HMAC.
5. En el checkout elegí **WeTravel**, completá una reserva de prueba y verificá que la redirección abra el Payment Link con importe y moneda correctos.
6. Desde el panel de WeeTravel completá el pago y verificá que el webhook responda HTTP 200. Los eventos recibidos se guardan en Firestore en `wetravelEvents`.
7. Verificá que el evento exitoso cree una reserva, genere un código y cree tres documentos en `emailJobs` con prefijo `wt_`.
8. Reenviá el mismo evento y comprobá que no se genere una segunda reserva ni emails duplicados.

La ruta `GET /api/wetravel/status?intentId=...` permite consultar el estado local del checkout. La confirmación real depende del webhook o de la reconciliación protegida por `CRON_SECRET`; llegar a `/checkout/success` no convierte por sí solo un pago pendiente en aprobado.

Para producción reemplazá la key y los endpoints demo por una Partner API key productiva. La key compartida por soporte para `demo.wetravel.to` no debe reutilizarse para cobrar en vivo.

### 4. Configurar Firebase

#### 4.1. Crear proyecto en Firebase Console
1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Crea un nuevo proyecto
3. Habilita **Authentication** (Email/Password)
4. Crea una base de datos **Firestore**

#### 4.2. Configurar reglas de Firestore

Ve a Firebase Console → Firestore → Reglas y pega:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Permitir lectura pública de categorías y paquetes visibles
    match /categorias/{document} {
      allow read: if resource.data.activa == true;
      allow write: if request.auth != null;
    }
    match /paquetes/{document} {
      allow read: if resource.data.visible == true;
      allow write: if request.auth != null;
    }
    // Consultas solo para admin
    match /consultas/{document} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**⚠️ IMPORTANTE:** Estas reglas permiten lectura pública de contenido visible. Ajusta según tus necesidades de seguridad.

#### 4.3. Crear usuario administrador

1. Ve a Firebase Console → Authentication → Users
2. Click en "Add user"
3. Email: `admin@ovniviajes.com` (o el que prefieras)
4. Contraseña: (elige una segura)
5. Guarda las credenciales

### 5. Configurar Vercel Blob Storage

1. Ve a [Vercel Dashboard](https://vercel.com/dashboard)
2. Ve a Storage → Create Store
3. Selecciona "Blob"
4. Copia el token y agrégalo a `.env.local` como `BLOB_READ_WRITE_TOKEN`

### 6. Agregar imágenes del sitio

Coloca las siguientes imágenes en `public/images/`:

- `ovni-logo.svg` - Logo principal (REQUERIDO)
- `banner_mobile.jpg` - Hero section para mobile
- `banner_desktop.jpg` - Hero section para desktop
- `hero-default.jpg` - Imagen por defecto (opcional)

### 7. Personalizar información

Edita `lib/constants.ts` con tu información:

```typescript
export const CONTACT_INFO = {
  direccion: "Tu dirección",
  horario: "Lunes a Viernes 9 a 15hs",
  email: "tu-email@ejemplo.com",
  telefono: "+54 9 1234567890",
  whatsapp: "5491234567890", // Sin + ni espacios
};

export const SOCIAL_MEDIA = {
  facebook: "https://www.facebook.com/tu-pagina",
  instagram: "https://www.instagram.com/tu-cuenta",
};
```

## 🚀 Ejecutar

### Desarrollo

```bash
npm run dev
```

Accede a:
- **Sitio público:** http://localhost:3000
- **Panel admin:** http://localhost:3000/admin/login

### Producción

```bash
npm run build
npm start
```

## 🏗️ Arquitectura

### Frontend Architecture

El proyecto usa **Next.js 14 App Router** con las siguientes características:

- **Server Components** por defecto para mejor rendimiento
- **Client Components** (`'use client'`) solo cuando es necesario (interactividad, hooks)
- **Rutas dinámicas** con `[slug]` para páginas de categorías y paquetes
- **Metadata dinámico** para SEO con `generateMetadata`
- **Revalidación** configurada para datos dinámicos

### Backend Architecture

- **Firebase Firestore** como base de datos NoSQL
- **Firebase Auth** para autenticación
- **Vercel Blob** para almacenamiento de imágenes
- **Validación** con Zod en formularios
- **Serialización** de datos Firestore para compatibilidad con Next.js

### Flujo de Datos

```
Usuario → Next.js Page → Firebase Firestore → Serialización → Componente React
```

## 🎨 Frontend

### Componentes Principales

#### Hero Component
Componente hero section con soporte para imágenes responsive:

```tsx
<Hero
  title="Título"
  subtitle="Subtítulo"
  backgroundImageMobile="/images/banner_mobile.jpg"
  backgroundImageDesktop="/images/banner_desktop.jpg"
  ctaText="Botón"
  ctaLink="/ruta"
  height="xl"
/>
```

**Características:**
- Muestra imagen mobile en pantallas < 768px
- Muestra imagen desktop en pantallas ≥ 768px
- Fallback a `backgroundImage` si no se especifican las separadas

#### PaqueteCard
Tarjeta reutilizable para mostrar paquetes en listados:

```tsx
<PaqueteCard paquete={paquete} index={0} />
```

#### PaqueteSidebar
Sidebar del detalle de paquete con:
- Precio y moneda
- Destino (obtenido automáticamente de la categoría)
- Duración y tipo
- Botones de WhatsApp y consulta
- Modal de consulta

**En Mobile:** Aparece antes de la galería de imágenes
**En Desktop:** Aparece en sidebar sticky a la derecha

### Sistema de Filtros

El componente `PaquetesClient` incluye un sistema de filtros avanzado:

- **Búsqueda por texto:** Título, destino, descripción
- **Filtro por categoría:** Múltiples selecciones
- **Filtro por tipo:** Individual, Grupal, A Medida
- **Filtro por destino:** Basado en categorías
- **Filtro por servicios:** Basado en palabras clave en "incluye"

### Responsive Design

- **Mobile First:** Diseño optimizado para móviles
- **Breakpoints Tailwind:**
  - `sm`: 640px
  - `md`: 768px
  - `lg`: 1024px
  - `xl`: 1280px

### Optimizaciones

- **Image Optimization:** Next.js Image component
- **Code Splitting:** Automático con App Router
- **Lazy Loading:** Componentes y imágenes
- **SEO:** Metadata dinámico en cada página

## 🔧 Backend

### Firebase Firestore

#### Colecciones

**`categorias`**
```typescript
{
  id: string;
  nombre: string;
  slug: string;
  descripcion: string;
  orden: number;
  destacada: boolean;
  activa: boolean;
  imagen?: string; // URL de Vercel Blob
  fechaCreacion: Timestamp;
}
```

**`paquetes`**
```typescript
{
  id: string;
  titulo: string;
  slug: string;
  descripcion: string; // HTML del editor rico
  descripcionCorta?: string;
  destino: string; // ⚠️ Se obtiene automáticamente del nombre de la categoría
  categoriaId: string;
  tipo: 'individual' | 'grupal' | 'a-medida';
  precio: number;
  moneda: 'USD' | 'ARS' | 'EUR';
  mostrarDesde: boolean;
  duracion: string;
  incluye: string[];
  noIncluye: string[];
  salidas: Salida[];
  imagenPrincipal: string; // URL de Vercel Blob
  galeria: string[]; // URLs de Vercel Blob
  visible: boolean;
  destacado: boolean;
  fechaCreacion: Timestamp;
  orden: number;
  ctaWhatsApp: boolean;
}
```

**`salidas`** (subcolección de paquetes)
```typescript
{
  id: string;
  fecha: string; // YYYY-MM-DD
  fechaVuelta?: string; // YYYY-MM-DD
  ciudadSalida: string;
  precio: number;
  moneda: 'USD' | 'ARS' | 'EUR';
  cupo?: number; // legacy: ya no limita ni bloquea reservas
  observaciones?: string;
}
```

**`consultas`**
```typescript
{
  id?: string;
  nombre: string;
  email: string;
  telefono: string;
  mensaje: string;
  paquete?: string; // Título del paquete
  paqueteId?: string; // Slug del paquete
  fechaCreacion: Timestamp;
  leida: boolean;
}
```

### Funcionalidades Clave

#### Destino Automático
El campo `destino` de los paquetes se llena automáticamente con el nombre de la categoría seleccionada. **No hay campo manual de destino** en los formularios de creación/edición.

**Implementación:**
```typescript
// Al crear/editar paquete
const categoriaSeleccionada = categorias.find(cat => cat.id === data.categoriaId);
const nombreCategoria = categoriaSeleccionada?.nombre || 'Destino';
// Se guarda como destino: nombreCategoria
```

#### Gestión de Imágenes
- **Upload:** `lib/utils/upload.ts` maneja la subida a Vercel Blob
- **Múltiples imágenes:** Soporte para galerías
- **Optimización:** Las imágenes se optimizan automáticamente

#### Validación
- **Zod schemas** en todos los formularios
- **Validación en cliente y servidor**
- **Mensajes de error personalizados**

### Autenticación

- **Firebase Auth** con Email/Password
- **Protected Routes** con `ProtectedRoute` component
- **Middleware** para verificar autenticación
- **Sesión persistente** en el navegador

## 📊 Base de Datos

### Índices Recomendados en Firestore

Para optimizar las consultas, crea estos índices en Firebase Console:

1. **paquetes:**
   - `visible` (Ascending) + `destacado` (Ascending) + `orden` (Ascending)
   - `categoriaId` (Ascending) + `visible` (Ascending) + `orden` (Ascending)

2. **categorias:**
   - `activa` (Ascending) + `destacada` (Ascending) + `orden` (Ascending)

### Queries Principales

```typescript
// Obtener paquetes visibles y destacados
query(collection(db, 'paquetes'), 
  where('visible', '==', true),
  where('destacado', '==', true)
)

// Obtener paquetes por categoría
query(collection(db, 'paquetes'),
  where('categoriaId', '==', categoriaId),
  where('visible', '==', true)
)

// Obtener categorías activas
query(collection(db, 'categorias'),
  where('activa', '==', true)
)
```

## 🚀 Deploy

### Vercel (Recomendado)

1. **Conectar repositorio:**
   - Ve a [Vercel Dashboard](https://vercel.com/dashboard)
   - Importa tu repositorio de GitHub

2. **Configurar variables de entorno:**
   - Agrega todas las variables de `.env.local`
   - Especialmente `BLOB_READ_WRITE_TOKEN`

3. **Deploy:**
   - Vercel detecta Next.js automáticamente
   - Deploy en cada push a `main`

4. **Configurar dominio:**
   - Agrega tu dominio personalizado
   - Actualiza `NEXT_PUBLIC_SITE_URL` en variables de entorno

### Otras Plataformas

El proyecto puede deployarse en cualquier plataforma que soporte Next.js:
- Netlify
- AWS Amplify
- Railway
- DigitalOcean App Platform

## 💻 Desarrollo

### Comandos Disponibles

```bash
# Desarrollo
npm run dev          # Inicia servidor de desarrollo

# Producción
npm run build        # Construye la aplicación
npm start            # Inicia servidor de producción

# Linting
npm run lint         # Ejecuta ESLint
```

### Estructura de Código

#### Convenciones

- **Componentes:** PascalCase (`PaqueteCard.tsx`)
- **Utilidades:** camelCase (`slugify.ts`)
- **Tipos:** PascalCase interfaces (`Paquete`, `Categoria`)
- **Constantes:** UPPER_SNAKE_CASE (`WHATSAPP_NUMBER`)

#### Mejores Prácticas

1. **Server Components por defecto**
   - Usa `'use client'` solo cuando necesites hooks o interactividad

2. **TypeScript estricto**
   - Define tipos para todos los datos
   - Usa interfaces de `types/index.ts`

3. **Componentes reutilizables**
   - Crea componentes en `components/`
   - Usa props tipadas

4. **Manejo de errores**
   - Usa try/catch en operaciones async
   - Muestra mensajes de error al usuario

5. **Optimización de imágenes**
   - Usa `next/image` para imágenes
   - Especifica tamaños apropiados

### Agregar Nueva Funcionalidad

1. **Crear tipos** en `types/index.ts`
2. **Crear componentes** en `components/`
3. **Crear páginas** en `app/`
4. **Actualizar Firestore** si es necesario
5. **Documentar** en este README

## 🐛 Troubleshooting

### Problemas Comunes

#### Error: "Firebase not initialized"
- Verifica que todas las variables de entorno estén en `.env.local`
- Reinicia el servidor de desarrollo

#### Error: "Unauthorized" en admin
- Verifica que el usuario esté creado en Firebase Auth
- Verifica las reglas de Firestore

#### Imágenes no se suben
- Verifica `BLOB_READ_WRITE_TOKEN` en `.env.local`
- Verifica que el Blob Store esté creado en Vercel

#### Paquetes no aparecen
- Verifica que `visible: true` en Firestore
- Verifica las reglas de Firestore para lectura pública

#### Error de build en producción
- Verifica que todas las variables de entorno estén en Vercel
- Revisa los logs de build en Vercel Dashboard

### Debug

```bash
# Ver logs de Firebase
# En el código, usa:
console.log('Debug:', data);

# Verificar conexión Firebase
# Abre DevTools → Console
# Deberías ver logs de Firebase
```

## 📝 Notas Importantes

### Limitaciones Conocidas

- Máximo 9 paquetes destacados en homepage
- Las imágenes se almacenan en Vercel Blob (no en Firebase Storage)
- El destino se sincroniza con la categoría, pero no se actualiza automáticamente si cambias el nombre de la categoría

### Próximas Mejoras Sugeridas

- [ ] Actualización automática de destino cuando cambia el nombre de categoría
- [ ] Sistema de notificaciones para nuevas consultas
- [ ] Exportación de consultas a CSV
- [ ] Sistema de backup automático
- [ ] Analytics integrado
- [ ] Sistema de comentarios/reviews

## 📞 Soporte

Para problemas o preguntas:
- **Email:** tucsdigital@gmail.com
- **WhatsApp:** +54 9 11-22533111

## 📄 Licencia

Este proyecto es privado y propiedad de Ovni Viajes y Turismo.

---

**Desarrollado con ❤️ de Tucs Digital para Ovni Viajes y Turismo**
