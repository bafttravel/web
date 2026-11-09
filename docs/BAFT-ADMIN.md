# Administración BAFT: operaciones y reportes

## Accesos

- `/admin/hoteles`: catálogo, estado activo, contacto y comisiones por efectivo, depósito/transferencia y tarjeta.
- `/admin/proveedores`: catálogo de proveedores. `/admin/prestadores` conserva compatibilidad mediante redirección.
- Editor de excursiones: condiciones hoteleras heredadas o particulares; costos por pasajero, reserva o porcentaje; declaración explícita de costos completos.
- Alta manual de reservas: hotel vendedor independiente del retiro, dirección del catálogo, horario y nacionalidades. Sin sección de cobro ni pago inicial; los cobros se registran después desde los movimientos financieros.
- Detalle de reservas: edición operativa/demográfica, PDF del voucher, compartir por WhatsApp.
- `/admin/pagos`: Pagos a proveedores, Pagos a hoteles, Pagos de hoteles a Baftravel, Balance Hotel / Baftravel y Liquidaciones Baftravel. Cada tarea tiene su concepto y formulario específicos, con reservas y hoteles/proveedores compatibles. Pagos parciales, compensación entre reservas del mismo hotel y moneda, historial por tarea, anulaciones con motivo y comprobantes conservan el motor existente. Caja, cierres e historial general no se ofrecen; sus registros históricos se conservan sin alteraciones. `/admin/finanzas` redirige a `/admin/pagos`.
- `/admin` (Dashboard): análisis integrado con fechas de venta/salida/cobro, excursión, nacionalidad, edad, vendedor, hotel, proveedor, canal, medio, estado y moneda. Exporta todos los resultados a `.xlsx` con criterios de cálculo. La ruta anterior `/admin/reportes` redirige al Dashboard.

No hay importación ni migración del sistema antiguo.

## Reglas monetarias

Los importes operativos se almacenan en centavos enteros. Los valores de tarifas fijas en formularios se expresan en unidades de moneda y se convierten al calcular. Nunca se suman ARS, USD, BRL y EUR. Una tarifa fija en otra moneda impide afirmar un margen hasta resolver la condición; no se aplica un tipo de cambio implícito.

La comisión hotelera se calcula sobre la base de la excursión de la reserva —sin adicionales—, sin depender de cuánto haya pagado el pasajero. Las reservas canceladas no generan comisión; sus cobros y entregas previos siguen pudiendo liquidarse. Descuentos y devoluciones ajustan la base. El medio indicado en la reserva selecciona la regla: efectivo/pesos, depósito/transferencia o tarjeta. Las tarifas fijas deben estar en la moneda de la reserva. Las condiciones antiguas con una única regla bancaria se conservan como respaldo para depósito y tarjeta.

Las reglas aplicadas se conservan en la reserva. Cambiar el catálogo no recalcula su historia. El retiro no genera comisión. No puede reasignarse el hotel vendedor si hay movimientos financieros registrados.

La reserva completada habilita automáticamente los pagos a proveedores; no hay un control separado de `Servicio realizado`. Cancelar una reserva completada no elimina la deuda con su proveedor.

El cobrador se asigna automáticamente: venta directa de Baftravel siempre cobra Baftravel; venta de hotel cobra el hotel en efectivo y Baftravel por transferencia o tarjeta. El hotel entrega a Baftravel en efectivo lo que recibió, descontando la comisión en efectivo que retiene. Baftravel puede pagar la comisión hotelera completa sobre la venta aunque el pasajero aún no haya pagado. Los pagos y recepciones de hoteles no dependen del estado de la reserva ni de `Servicio realizado`. Las confirmaciones y vouchers se gestionan automáticamente. Las compensaciones no mueven caja y pueden vincular dos reservas del mismo hotel y moneda. Los costos se reconocen una vez; pagar al proveedor no vuelve a descontarlos del margen. Los gastos vinculados a una reserva sí reducen su margen; gastos generales no se distribuyen automáticamente.

Los registros antiguos pueden tener monedas o comisiones incompletas. Una comisión de vendedor sin moneda no bloquea Dashboard: su comisión y margen quedan sin calcular. No se asigna ARS por defecto ni se modifican datos guardados. Reservas, cobros y movimientos sin moneda válida se excluyen de importes por moneda con una advertencia visible en Dashboard, Pagos y sus exportaciones. Los movimientos de moneda desconocida bloquean solo los saldos que podrían modificar: un cobro de pasajero incompleto no impide liquidar la comisión hotelera, calculada sobre la venta.

Margen operativo no es ganancia contable neta. Se muestra sin calcular cuando faltan costos, clasificación de cobros o coherencia monetaria. Los filtros demográficos seleccionan reservas con al menos un pasajero coincidente: sus ventas corresponden a la reserva completa, pero los conteos demográficos incluyen solo pasajeros coincidentes. Nacionalidades y edades ausentes no se infieren.

## Datos y permisos

Colecciones nuevas: `counterparties`, `packageOperations`, `operationsLedger` y `cashClosures` (esta última puede conservar cierres históricos, pero ya no se consulta ni modifica desde Pagos). Las condiciones comerciales no se guardan en el catálogo público `paquetes`. Las APIs nuevas verifican al administrador y usan Firebase Admin.

Antes de publicar, revisar las reglas desplegadas de Firestore: estas cuatro colecciones deben quedar fuera de cualquier regla pública o comodín permisivo, y accederse por las APIs administrativas. No hay archivo de reglas ni configuración Firebase CLI en este repositorio; no se desplegaron reglas. Las reglas permisivas existentes, si las hubiera, pueden invalidar la protección que ofrece la API. Revisar también la lectura directa de reservas, que contienen datos personales y las condiciones aplicadas.

Requiere las credenciales Firebase Admin existentes (`FIREBASE_SERVICE_ACCOUNT` o variables equivalentes). No se agregan secretos al repositorio.

Comprobantes: PDF/JPG/PNG hasta 5 MB, validación básica de firma, claves aleatorias y protección contra sobrescritura/eliminación desde los endpoints genéricos del proyecto. Se usa la infraestructura R2 existente. **El almacenamiento actual sirve URLs públicas a quien conozca el enlace**; para documentación contable sensible, configurar almacenamiento privado y descarga autenticada antes de uso productivo. No enviar comprobantes con secretos ni publicar sus enlaces.

## Emails

Se mantiene confirmación y recordatorio/voucher 48 h antes. Altas manuales usan la cola existente; sin fecha no se programa un recordatorio. Reservas de último momento quedan listas para enviar en la próxima ejecución de la cola. La confirmación y el voucher se procesan automáticamente; se conserva el reenvío manual. El contenido operativo se vuelve a leer al enviar para no usar direcciones antiguas.

El aviso de venta al vendedor usa un ID de trabajo estable por reserva. Los envíos incorporan clave de idempotencia de Resend. Los callbacks de MP/WeTravel y la cola preparan los avisos sin reemplazar los avisos existentes a cliente/administrador. Requiere Resend y el cron existente funcionando; poner un trabajo en cola no acredita entrega.

## Registros históricos de caja

Los cierres y movimientos históricos no se borran ni se alteran. Pagos ya no permite consultar ni crear cierres, y las fechas que tengan un cierre antiguo no bloquean el registro de nuevos movimientos.

## Verificación

Las comprobaciones automatizadas existentes cubren edad al viajar, pagos mixtos, comisiones fijas/porcentuales, señas, descuentos/devoluciones, deuda hotelera, compensaciones, filtros, más de 200 reservas y lectura del Excel generado.

`npm run test:e2e:admin` verifica que las APIs no expongan datos ni acepten escrituras sin autenticación. No crea registros reales y guarda sus artefactos en una carpeta independiente.

Antes de usar en producción, verificar con una cuenta autorizada: alta de hotel/proveedor, configuración de excursión, reserva con retiro distinto del vendedor, cobros mixtos/parciales, rendición, pago, compensación cruzada, anulación y descarga de reportes. Probar entrega real de correos únicamente a direcciones de prueba.

Pendientes de alcance: pagos masivos, tarifas planas compartidas por salida (distintas del costo fijo por reserva) y conciliación explícita de movimientos bancarios no están incluidos. El reporte lee todos los registros paginados sin truncar totales; con grandes volúmenes conviene evolucionar a agregados materializados para reducir lecturas y latencia.

La auditoría npm detecta vulnerabilidades en dependencias existentes, incluidas críticas. No se aplicaron actualizaciones mayores ni `npm audit fix --force`; esa remediación debe probarse por separado antes de publicar.
