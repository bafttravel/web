# BAFT · Administración

## Estructura

Dashboard (`/admin`) es el único centro de indicadores y análisis. Sus vistas internas son Resumen, Ventas, Pasajeros, Rentabilidad y Comercial. `/admin/reportes` conserva compatibilidad redirigiendo a Dashboard; no tiene entrada en el menú ni un segundo encabezado.

Los indicadores del período responden a fecha, criterio temporal, moneda y filtros avanzados. La posición financiera y los pendientes operativos están explícitamente identificados como actuales, sin aplicarles silenciosamente el rango de ventas.

Pagos (`/admin/pagos`) conserva las tareas conocidas: Pagos a proveedores, Pagos a hoteles, Pagos de hoteles a Baftravel, Balance Hotel / Baftravel y Liquidaciones Baftravel. Caja, cierres e historial general no se ofrecen como herramientas; sus registros históricos se conservan sin alteraciones. Cada tarea mantiene su propio historial y muestra el motivo de las anulaciones. `/admin/finanzas` redirige a Pagos. La información resumida se ve en Dashboard, sin duplicar un módulo de análisis.

## Diseño compartido

`app/admin/workspace.css` define la paleta tomada del login: azul noche `#0B163B` / `#0F1F52`, azul claro `#EEF3FF`, superficies blancas y texto secundario `#596783`. Las secciones se separan con espacio y superficies, sin marcos sólidos; las tablas conservan separadores suaves y los controles mantienen foco visible.

Una sola escala Inter mediante tokens: títulos de página 24 px, títulos de sección 18 px, contenido/navegación/controles/tablas 14 px, información secundaria 12 px y cifras principales 28 px. En móvil no se reduce el texto: los indicadores pasan a una columna para no partir los importes.

La jerarquía no se deduce del color: nunca normalizar `[class*='text-']`, porque también coincide con utilidades de color. Usar encabezados semánticos o `.admin-section-title` (18 px), `.admin-caption` / `.admin-eyebrow` (12 px) y `.admin-metric` (28 px). Las etiquetas de campo siempre son 14 px, aunque el componente conserve una utilidad antigua. Los títulos de tarjeta y diálogo son 18 px. Estas reglas se limitan a ADMIN; las clases semánticas del formulario compartido no tienen estilos fuera de este ámbito.

La vista de desarrollo `?screen=reservation-form` renderiza el formulario completo de creación con excursiones, salidas, adicionales y hoteles sintéticos, sin leer el catálogo real ni crear reservas. Las pruebas comprueban tamaños calculados de títulos, las cuatro secciones, etiquetas, ayudas y total, además de ausencia de desborde en escritorio/móvil; también verifican directorios, comisiones y diálogos de Pagos.

## Fechas y horas

Todos los controles de fecha de ADMIN usan `AdminDatePicker`, y Dashboard usa `AdminDateRangePicker`. Comparten el calendario en español, navegación por mes/año, foco accesible y límites de fecha; nacimientos y salidas disponibles usan el mismo control. Las horas se eligen con `AdminTimePicker` (00–23 y 00–59), sin depender de los controles nativos del navegador.

Los valores internos siguen siendo `YYYY-MM-DD` y `HH:mm`. `lib/admin/dates.ts` controla la presentación: `DD/MM/AAAA`, horas de 24 h y zona `America/Argentina/Buenos_Aires` para instantes. Las fechas sin hora no cambian de día por conversión de zona. Los reportes mensuales muestran `MM/AAAA`; las exportaciones Excel/PDF y CSV administrativos conservan los mismos formatos visibles. No se reemplazan fechas ausentes por hoy.

La prueba estática recorre `app/admin` y `components/admin` para impedir el regreso de campos nativos de fecha/hora. Las pruebas de navegador verifican rango de Dashboard, fechas permitidas, campos obligatorios, integración con formularios, horas de 24 h, calendario dentro de diálogos, limpieza, foco y móvil.

## Adjuntos

`AdminFilePicker` usa `react-dropzone` para todos los controles de archivo administrativos: pagos, comprobantes de reservas, creación de reservas, imágenes, adicionales y videos. El input nativo queda oculto; el botón accesible, las instrucciones, formatos, tamaños y estados están en español. Hay selección por teclado, arrastrar y soltar, validación de archivos vacíos/formato/tamaño/cantidad, nombre y tamaño de los archivos seleccionados y eliminación de la selección cuando el flujo lo admite. Las imágenes mantienen sus vistas previas y ordenamiento.

No existe un campo editable de enlace al comprobante. Los pagos admiten PDF/JPG/PNG hasta 5 MB, conservando la validación de contenido y autorización del servidor. La referencia interna de almacenamiento y las acciones de ver/descargar adjuntos ya guardados permanecen intactas. Los cobros/devoluciones de reservas usan los adjuntos de la propia reserva, evitando mostrar un campo cuyo dato no se guardaba. Los lotes con subidas parciales no se reintentan automáticamente completos para evitar adjuntos duplicados.

`/e2e/admin-design?screen=uploads` permite probar estos estados sin subir archivos reales. Las pruebas verifican también el selector real dentro de Pagos, que no haya enlaces editables, selección por teclado, errores y reintento, widgets de imagen independientes y móvil.

## Reserva manual: venta, comisión y retiro

### Voucher y recordatorio al cliente

El PDF de `/admin/ventas/[id]` y el adjunto del recordatorio usan `lib/vouchers/` como única plantilla. Se reproduce el modelo facilitado `Voucher-5806-06112026031746.pdf` (Letter vertical): logo negro actual en fondo blanco, habilitación y contacto del modelo, cuadro de titular/retiro/servicio/fecha/hora/mayores/menores/confirmó/reservó, aviso de que no es factura y cinco condiciones completas bilingües. El código de reserva y su estado se conservan. Butacas e indicaciones, si existen, se agregan sin recortar; los textos extensos continúan en páginas adicionales. No se exportan costos, comisiones ni IDs internos. Datos ausentes se muestran como sin informar/a confirmar; si no hay nombre de operador, se muestra únicamente el rol registrado en la auditoría, sin atribuirle una identidad inventada. El desglose de edades desconocido no se presume como todos adultos.

Las condiciones de pago/cancelación son el texto solicitado por el negocio, no un cambio en los procesos automáticos de cancelación o cobro. El PDF mantiene la información de contacto y habilitación del documento facilitado.

El recordatorio tiene cuerpo blanco y breve, sin banners ni paneles, y un PDF real adjunto. El envío manual, el cron y los reintentos desde Emails reconstruyen contenido y adjunto con la reserva vigente; canceladas o eliminadas no se envían, y la preferencia de emails automáticos sigue vigente. Si falta la reserva o falla la generación, no se envía un mensaje que prometa un PDF inexistente: queda el error para reintento. El PDF se genera en memoria, no se guarda en Firestore ni se envían emails reales en las pruebas. La descarga usa un endpoint autenticado ADMIN, sin caché pública. El logo local se incluye explícitamente en el trazado de archivos del despliegue.

`?screen=voucher` y `/e2e/admin-design/voucher` son vistas exclusivamente de desarrollo con datos sintéticos; están deshabilitadas en producción. La prueba de navegador descarga el documento por el botón real y muestra el cuerpo de email generado por el mismo constructor de entrega.

`ManualReservationFlow` resuelve la venta, su medio de comisión y el retiro en la creación manual de ADMIN, sin modificar el flujo del portal de vendedores. “¿Quién realizó la venta?” permite elegir Baftravel o un hotel existente; para una venta de hotel también se elige efectivo, depósito/transferencia o tarjeta. El vendedor y el retiro son decisiones independientes. El selector de hotel vendedor no admite texto libre: lista todos los hoteles activos por nombre, sin límite de ocho resultados; conserva un hotel inactivo ya asignado identificándolo como tal. Mantiene validación obligatoria y estados de carga, error y catálogo vacío. Elegir o cambiar el vendedor nunca asigna, limpia ni reemplaza el hotel, dirección u horario de retiro. Para un retiro en Hotel se selecciona explícitamente un hotel existente, que puede coincidir o no con el vendedor; no se permite guardar esa opción sin seleccionar el hotel. Otro permite ingresar un punto de encuentro. Se eliminó el atajo “En ese mismo hotel”; las reservas anteriores conservan sus datos de retiro y se muestran como Hotel, sin reinterpretarlos. El canal es independiente del vendedor: Front, Web, WhatsApp, Amigo y Liberado. Los registros históricos mantienen sus canales originales, visibles como anteriores al editar o filtrar.

Se retiró el panel de Cobro y su enlace de navegación de los formularios manuales de ADMIN. `manualReservationPaymentFields` envía explícitamente `initialPayment: { method: 'pending' }` al crear para impedir el fallback histórico del API que podría interpretar la ausencia del dato como pago. Al editar no se envía ese campo: no se reinician pagos ni se inventan saldos. Los cobros y movimientos existentes siguen visibles y administrables en el detalle financiero y Pagos; el cobrador se deriva del hotel vendedor y del medio real del movimiento. No se presume cobro por elegir un hotel ni gratuidad por elegir Liberado. El editor muestra “¿Quién realizó la venta?” y, para venta de hotel, el medio que define la comisión. El único resumen muestra excursión, salida, pasajeros, venta, retiro, horario y total, con un único botón de creación asociado al formulario. En escritorio es lateral; en móvil queda al final para revisar antes de crear. La vista aislada del flujo conserva su resumen solo como fixture de componentes. Completar la reserva habilita los pagos a proveedores; no hay control editable de seguimiento o ejecución. Los endpoints y cálculos financieros permanecen existentes.

El formulario se organiza en cuatro paneles blancos uniformes: Excursión y salida; Titular y pasajeros; Venta y retiro; Notas y comprobantes. Referidos es un desplegable secundario dentro de pasajeros. La fecha se obtiene de las salidas de la excursión: si hay una, se asigna y muestra sin edición; si hay varias, el calendario solo permite esas salidas; si no hay ninguna, se informa “A coordinar”, sin habilitar fechas arbitrarias. El horario de retiro se ingresa en esa reserva y está siempre visible junto al punto de retiro, con un control conjunto de 24 horas (`AdminTimePicker` apariencia `field`). No se infiere un horario de salida como si fuera horario de retiro.

Se eliminó el bloque “Detalles opcionales: horario e indicaciones”: no hay campos de dieta ni indicaciones duplicadas ni casilla de envío en creación manual. Los comentarios quedan una sola vez en Notas y comprobantes. Las confirmaciones y vouchers se procesan automáticamente; los valores históricos de `automaticEmails` ya no permiten desactivar el envío. Los datos operativos existentes se conservan; no se realiza una migración destructiva. Los estilos del rediseño quedan dentro de `.admin-reservation-page` y `.admin-manual-flow`, sin redefinir tamaños globales ni el aspecto por defecto del selector horario usado en otras pantallas.

El dato de habitación se retiró de todos los formularios, detalles, WhatsApp, emails y vouchers. El esquema de entrada descarta ese campo; los registros históricos lo conservan solo internamente al editar otros datos, sin borrados ni migraciones masivas. El detalle tiene un solo bloque de adicionales y un solo formulario, incluso cuando hay subtotal base pero no adicionales. El control compartido muestra `+` al estar cerrado y `×` con “Cerrar” al abrirse, con `aria-expanded` y `aria-controls`; se usa también en el catálogo de creación manual.

Los estilos están limitados a `.admin-workspace` y a los portales abiertos mientras el administrador está montado. No se reemplaza la paleta de componentes públicos ni la del portal de vendedores. El login conserva su presentación.

Todas las pantallas que usan AdminLayout comparten tablas compactas, formularios, botones, estados, tipografía Inter, modales, paginación y foco accesible. Los colores funcionales de error y advertencia no se usan como decoración.

El sidebar usa Phosphor, guarda su estado plegado localmente y tiene búsqueda de secciones con Ctrl/⌘ K. Los alias antiguos de stock, butacas y plantillas siguen existiendo, pero no se presentan como módulos distintos porque ya redirigían a Excursiones. Las comisiones de vendedores permanecen accesibles.

Los editores largos tienen navegación por bloques y las acciones de guardar excursiones permanecen visibles. Hoteles y proveedores se editan en un diálogo enfocado, sin desplazar el listado. Pagos abre un diálogo específico por tarea, sin elegir de una lista general de conceptos. Las tres tareas de pago separan pendientes de historial; el balance permite abrir la liquidación del mismo hotel. La edición de reservas reutiliza el diseño de creación para “¿Quién realizó la venta?” y sus medios de comisión. El sistema determina quién cobra según el vendedor y el medio real; no hay selector manual de cobrador ni controles de seguimiento. Vendedor referido es una asignación distinta. Los filtros y formularios impiden mezclar hoteles y proveedores, y cada apertura limpia los datos de la tarea anterior. El detalle/referencia puede quedar vacío; el motivo de anulación sigue siendo obligatorio. Fechas y monedas siguen usando los modelos existentes.

Proveedores usa `/admin/proveedores`; `/admin/prestadores` redirige allí sin modificar datos. Blog se conserva, pero no aparece en el sidebar ni en la búsqueda de secciones. Los textos visibles evitan términos internos y las reservas muestran su código real o “Sin código”, nunca un identificador interno presentado como código.

## Verificación visual

- `npm run test:admin-design`: identidad de navegación, rutas y unificación de Dashboard.
- `npm run test:e2e:admin-design`: escritorio/móvil, navegación plegable, Ctrl K, filtros, vistas analíticas, búsqueda y edición de hoteles, pestañas y diálogo de finanzas.
- Capturas: `.playwright-admin-design-results/` (datos sintéticos, identificados como vista de prueba).

La fixture `/e2e/admin-design` monta los componentes reales con datos de prueba y cálculos del motor real. Solo existe en desarrollo cuando `ADMIN_DESIGN_PREVIEW=1`; en producción responde 404 incluso con esa variable activada. No inicia sesión, no accede a Firebase y no permite guardar, subir archivos ni registrar movimientos. Las pruebas usan puerto y directorio `.next-admin-design` independientes del servidor habitual.

La validación visual no reemplaza una prueba autenticada contra una base de pruebas. Las limitaciones operativas y revisiones previas a publicación documentadas en `BAFT-ADMIN.md` siguen vigentes.
