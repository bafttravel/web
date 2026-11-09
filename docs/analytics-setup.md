# Analítica y consentimiento

## Identificadores instalados

- Dominio permitido: `www.baftravel.com` y subdominios de `baftravel.com`.
- Microsoft Clarity: proyecto `zb406n8sbe`.
- Google Tag Manager: contenedor `GTM-5VXXFZ8J`.
- GA4: flujo web `16306530153`, ID de medición `G-Z09FPGMT1D`.

Los scripts no se solicitan hasta que la persona acepta analíticas. La preferencia se guarda localmente por 180 días; al retirarla se deniega el consentimiento, se eliminan las cookies analíticas conocidas y se recarga la página. En localhost y previews de Vercel las etiquetas no se cargan para no contaminar las cuentas de producción.

## Configurar y publicar GTM

El código de la aplicación envía eventos a `dataLayer`; para que aparezcan en GA4, el contenedor debe publicar una etiqueta de Google con el ID `G-Z09FPGMT1D` y etiquetas de evento GA4 asociadas a estos eventos personalizados:

- `page_view`: parámetros `page_path` y `page_location` (la aplicación omite query strings).
- `whatsapp_click`: `link_location`, `page_path` y, cuando existe, `item_slug`.
- `booking_start`: `link_location`, `page_path` y, cuando existe, `item_slug`.
- `begin_checkout`: `page_path`.
- `purchase`: `transaction_id`, `value`, `currency` y `items` si están disponibles. Solo se envía tras confirmar pago y reserva; el evento usa una clave de transacción opaca y protección de duplicados.

Antes de publicar:

1. Crear una variable de capa de datos `baft_ga4_measurement_id` y una etiqueta **Google tag** que use esa variable (su valor es `G-Z09FPGMT1D`), activada en todas las páginas del contenedor. La app carga GTM solo tras el consentimiento.
2. Desactivar el envío automático de `page_view` en esa etiqueta y las pageviews automáticas por cambios de historial en GA4 Enhanced Measurement. La aplicación envía una pageview limpia por navegación para evitar duplicados y excluir parámetros de checkout.
3. Crear etiquetas de evento GA4 para los eventos listados arriba con disparadores **Custom Event** del mismo nombre. Mapear los parámetros a variables de capa de datos.
4. Revisar la pestaña **Consent settings** de las etiquetas: las etiquetas analíticas deben requerir `analytics_storage`. No activar etiquetas publicitarias; el código mantiene `ad_storage`, `ad_user_data` y `ad_personalization` denegados.
5. Probar con GTM Preview y GA4 DebugView, y luego publicar el contenedor.
6. En GA4, marcar `purchase` y `whatsapp_click` como eventos clave si se quieren reportar como conversiones; WhatsApp mide un clic/intención de consulta, no un mensaje enviado.
7. Añadir los dominios de pago externos (Mercado Pago y WeTravel) a la lista de referencias no deseadas del flujo GA4 para reducir atribuciones de sesión como referidos de pago.

## Configurar Clarity y privacidad

1. En el proyecto Clarity, habilitar el modo de consentimiento desde **Settings → Setup** si está disponible. El sitio pasa consentimiento con `clarity('consentv2', ...)` y borra cookies con `clarity('consent', false)` al retirarlo.
2. Revisar **Settings → Masking** y confirmar que el modo de enmascaramiento protege el contenido sensible. El sitio marca el contenido principal con `data-clarity-mask` en páginas sensibles y suspende Clarity antes de entrar al checkout, consulta de reservas, cuentas o administración. Validar esto en grabaciones reales.
3. Clarity no oculta automáticamente parámetros de URL en todas las URLs capturadas. El sitio no carga Clarity inicialmente en páginas sensibles y lo suspende antes de navegar a ellas; si cambia el checkout o se agregan datos sensibles a otras URLs, revisar ese flujo antes de publicarlo.
4. Validar el aviso de cookies y el aviso de privacidad con el titular/asesor legal antes de publicar. El contenido técnico no determina por sí solo los requisitos legales aplicables ni sustituye una política de privacidad completa.

## Prueba de aceptación

- En un perfil limpio, antes de aceptar, no debe haber solicitudes a `googletagmanager.com` ni `clarity.ms` ni cookies analíticas.
- Rechazar debe guardar la elección y mantener ambas integraciones apagadas tras navegar o recargar. Aceptar debe cargar ambas solo en el dominio de producción.
- Comprobar sesiones Clarity en escritorio y móvil; confirmar que las rutas excluidas no se graban.
- Confirmar en GA4 Realtime/DebugView los pageviews sin query strings y los clics de WhatsApp/reserva.
- Probar pagos confirmados, pendientes y fallidos. Solo una reserva pagada y confirmada debe emitir `purchase`; pagos pendientes/fallidos no.
- Retirar el consentimiento desde el pie de página y confirmar que deja de haber medición.
