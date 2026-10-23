# WeeTravel: configuración y puesta en producción

## Variables de entorno

En Vercel configurá estas variables para **Production**:

```env
WETRAVEL_API_KEY=<Partner API key de producción>
WETRAVEL_API_URL=https://api.wetravel.com/v3
WETRAVEL_AUTH_URL=https://api.wetravel.com/v2/auth/tokens/access
WETRAVEL_PARTICIPANT_FEES=service
```

La Partner API key es una credencial de servidor. No debe comenzar con `NEXT_PUBLIC_`, incluirse en el navegador ni commitearse.

La key sandbox se usa únicamente con:

```env
WETRAVEL_API_URL=https://api.demo.wetravel.to/v3
WETRAVEL_AUTH_URL=https://api.demo.wetravel.to/v2/auth/tokens/access
```

## Webhook

En el panel de la cuenta correspondiente habilitá Webhooks y agregá:

```text
https://TU_DOMINIO.com/api/wetravel/webhook
```

Suscribite a `payment.created`, `payment.updated`, `booking.created` y `booking.updated`.

La ruta guarda el evento en `wetravelEvents`, correlaciona el checkout mediante `external_id` o Payment Link ID y procesa los estados de forma idempotente.

## Jobs de GitHub Actions

En GitHub → Settings → Secrets and variables → Actions agregá:

```text
APP_URL=https://TU_DOMINIO.com
CRON_SECRET=<mismo valor configurado en Vercel>
```

Los workflows son:

- `cron-emails.yml`: cada cinco minutos.
- `cron-cleanup-holds.yml`: cada hora.
- `cron-wetravel-reconcile.yml`: cada diez minutos.

No agregar cron jobs en `vercel.json`.

## Flujo exitoso

1. La aplicación crea un Payment Link V3 y un `checkoutIntent`.
2. El cliente paga en WeeTravel.
3. WeeTravel envía `payment.updated` o `booking.updated`.
4. El webhook valida importe, moneda y correlación.
5. Una transacción crea una única reserva y genera el código; las ventas no consumen cupos ni stock.
6. Se crean los jobs `wt_<intentId>_cliente_confirm`, `wt_<intentId>_cliente_voucher` y `wt_<intentId>_admin`.
7. GitHub Actions procesa los emails con reintentos.

La llegada del usuario a `/checkout/success` no confirma el pago. La consulta de estado local está disponible en:

```text
GET /api/wetravel/status?intentId=<id>
```

## Pruebas requeridas

- Pago sandbox exitoso.
- Pago rechazado.
- Pago pendiente.
- Reenvío del mismo webhook.
- Eventos fuera de orden.
- Pago aprobado aunque el cliente haya tardado en volver desde el proveedor.
- Email fallido y reintentado.
- Reembolso o disputa.

Antes de pasar a producción hay que revisar al menos un payload real del sandbox en `wetravelEvents`, porque los nombres exactos pueden variar según los eventos habilitados en la cuenta.
