# Seguimiento del checkout WeTravel

## Webhook Svix: configuración y recuperación de entregas 401

WeTravel envía `svix-id`, `svix-timestamp` y `svix-signature`. Se valida el cuerpo original con la librería oficial Svix y su tolerancia temporal; no se aceptan eventos sin firma. `WETRAVEL_WEBHOOK_SECRET` debe ser el Signing Secret del endpoint (`whsec_...`), no la Partner API Key. Debe configurarse en el entorno que recibe la URL registrada, no únicamente en `.env.local`.

Para un endpoint en `https://www.baftravel.com/api/wetravel/webhook`, desplegar esta corrección y configurar el secret de ese endpoint en Vercel. Después usar Replay desde Manage Webhooks y comprobar su respuesta y el procesamiento local. No copiar headers de una entrega vieja: la verificación rechaza timestamps vencidos. Para probar contra localhost, registrar un endpoint HTTPS público que dirija a ese servidor; ese endpoint tiene su propio Signing Secret.

Los eventos de reserva usan `trip_id` como referencia local, `trip_uuid` como Payment Link y `order_id` como booking. Un evento sin estado explícito solo se considera totalmente pagado cuando `total_paid_amount` coincide con `total_price_amount`, ambos son positivos y `total_due_amount` es cero; se exige además coincidencia de importe y moneda con el checkout. El ID Svix identifica entregas duplicadas. La reserva nueva tiene identidad estable por intent, compartida entre eventos booking/payment.

El flujo actual no usa holds ni cupos por fecha. Una discrepancia de importe/moneda o una identidad de checkout inválida sí puede impedir finalizar. Un webhook sandbox puede generar reservas y jobs de emails en la base configurada: aislar el entorno de prueba si no deben afectar datos operativos.

## Comportamiento

BAFT crea el Payment Link y permanece en el checkout. El usuario pulsa **Abrir pago seguro en WeTravel** para abrirlo en otra pestaña. Al terminar debe volver a la pestaña de BAFT: no se puede cerrar, redirigir ni enfocar automáticamente la pestaña externa.

El frontend consulta `/api/wetravel/status` cada tres segundos mientras la página está visible, y al volver a ella. Tras diez minutos ofrece consultar nuevamente sin tratar el tiempo agotado como rechazo. Los errores de conexión se reintentan; no confirman ni rechazan pagos.

Solo se navega a `/{locale}/checkout/success` cuando el backend informa `paid`, una reserva `reserved`, su ID y su código. Un pago recibido sin reserva sigue en procesamiento y no ofrece pagar de nuevo. Reembolsos, disputas o incidencias de procesamiento requieren revisión.

El intento y su enlace se conservan en `sessionStorage`, asociados a excursión, fecha, personas, desglose de pasajeros y extras. Recargar o reabrir el enlace no crea otro intento. El almacenamiento dura la sesión de la pestaña; si el navegador lo bloquea, el seguimiento continúa en memoria pero no se garantiza recuperar tras recargar. No se guardan nuevas credenciales ni datos personales.

No cambia la navegación de Mercado Pago. Visitar success nunca confirma un pago. Los holds históricos se mantienen solo para la limpieza de checkouts legacy.

## Verificación automatizada

`npm test` incluye clasificación de estados y validación de sesiones/enlaces. `npx playwright test e2e/wetravel-tracking.spec.ts` cubre el checkout con respuestas de proveedor simuladas, nueva pestaña mobile, recuperación, estados finales, pausa, errores, timeout y navegación de Mercado Pago. La página de pruebas `/checkout/testing` solo está disponible en desarrollo; devuelve 404 en producción.

## Prueba real pendiente antes de dar el flujo por aprobado

1. Usar credenciales y endpoints sandbox en un entorno de prueba separado; no sustituir las credenciales productivas del despliegue activo.
2. Configurar el webhook sandbox hacia una URL pública que ejecute ese entorno y use la misma base de datos que el checkout. Un webhook productivo no actualizará una base local diferente.
3. Crear un checkout, abrir WeTravel y pagar con una tarjeta sandbox confirmada por soporte.
4. Regresar a BAFT y comprobar pago, reserva y código; verificar una sola reserva y los jobs esperados. La entrega real de emails depende además de su procesador y proveedor.
5. Repetir rechazo, webhook demorado y recarga. Si el webhook falla o no llega, BAFT debe permanecer pendiente o en revisión: no aprobar desde el navegador.

Las pruebas simuladas no certifican la firma del webhook ni la entrega real de emails. No realizar cargos reales sin autorización expresa.
