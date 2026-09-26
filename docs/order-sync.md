# Envío y sincronización de LA ISLA

Cada pedido nuevo se guarda primero en IndexedDB (`laisla-order-outbox-v1`). El carrito solo se vacía cuando esa transacción local terminó. La interfaz diferencia guardado local, espera de confirmación, confirmación del servidor y rechazo que requiere revisión. Los pendientes conservan productos, notas, precio, identificador y jornada originales.

La cola se recupera al abrir el POS y se intenta procesar cada cinco segundos, al recuperar conexión y al volver al primer plano. Las pestañas comparten IndexedDB y reclaman cada envío con una concesión temporal. Una pestaña suspendida puede superar ese plazo; la protección definitiva contra duplicados está en el servidor.

`submit_order_once` guarda pedido, productos y comprobante en una sola transacción. Los reintentos usan el mismo identificador y contenido. El comprobante sobrevive al cierre de jornada y a eliminaciones: repetir un envío confirmado devuelve el número original sin escribir de nuevo productos, estado, cobros ni pedido. Un pedido sin confirmar cuya jornada original ya terminó queda bloqueado para revisión, sin trasladarse a la siguiente jornada. No se reparan automáticamente pedidos antiguos incompletos.

La migración `supabase/migrations/20260926201822_durable_order_submission.sql` es aditiva: crea una tabla vacía y una función, con RLS, acceso explícito de lectura/inserción y sin permisos de actualización/eliminación de comprobantes para el POS. Mantiene el modelo de acceso anónimo que ya utiliza el restaurante; no pretende reemplazarlo por autenticación. No actualiza ni elimina ventas existentes. Debe aplicarse antes de publicar el cliente que llama la función. No se debe ejecutar indiscriminadamente `migration up` sobre la base existente: el esquema histórico se encuentra en los scripts de `lib/`.

Cocina consulta un snapshot de pedidos con productos juntos cada cinco segundos. Realtime solicita una consulta nueva; ya no compite con consultas separadas que puedan reemplazar productos por resultados viejos. Un coordinador serializa las consultas, descarta respuestas invalidadas y espera escrituras locales antes de aplicar un snapshot.

## Validación sin operaciones en producción

- `npm test`: IndexedDB simulado, pérdida de respuesta, recarga, múltiples pestañas, almacenamiento fallido y coordinación de consultas.
- `npm run test:sql`: requiere los binarios `initdb` y `pg_ctl`; crea y destruye una base temporal en `/tmp`, usando exclusivamente un socket Unix privado. Verifica transacciones, concurrencia, conservación del estado, eliminación, jornada cerrada y permisos. No utiliza credenciales del entorno ni conexiones TCP.
- `npm run test:browser`: compila con un destino Supabase localhost ficticio e intercepta todas las respuestas de API. Verifica la cola y cocina sin Realtime con datos ficticios aislados. Requiere `npx playwright install chromium`.
- Producción: inspeccionar definición, permisos y estado del despliegue. No invocar la función con pedidos de prueba.

## Uso y límites

Los dispositivos que ya tenían abierta una versión anterior necesitan una recarga, después de terminar o anotar su carrito actual: esa versión anterior no guardaba borradores. No hay recarga automática. Los pendientes nuevos sí sobreviven a una recarga. Los borradores aún sin confirmar siguen en memoria.

Mantener el POS abierto permite los reintentos. El navegador puede suspender temporizadores en segundo plano; al volver al primer plano se vuelve a verificar. Una cola conservada se recupera al reabrir el sitio con conexión, pero no se instala un service worker ni se promete abrir el sitio desde cero sin red.

No borrar los datos del navegador ni usar una sesión privada para pedidos pendientes. El cierre del día se bloquea si este dispositivo tiene envíos sin confirmar. No es posible detectar una cola desconectada en otro dispositivo: revisar los pendientes de todos los dispositivos antes del corte. Si alguien cierra la jornada desde otro equipo, los envíos tardíos quedan en revisión, nunca en la jornada siguiente.

La cola cubre pedidos nuevos. Las ampliaciones de pedidos, cobros y demás operaciones no se convierten en operaciones offline ni se reintentan automáticamente. Los pendientes son locales al navegador, no una copia de respaldo en otro dispositivo.

## Observaciones previas fuera del ajuste

El lint general ya reportaba `react-hooks/set-state-in-effect` en la carga mensual de reportes de `app/configuracion/page.tsx`. El lint de los módulos nuevos y del flujo de envío pasa. No se reescribió la pantalla de reportes durante el servicio.

El asesor de Supabase conserva los dos avisos previos de `search_path` mutable en `charge_order_items` y `assign_order_number`; la función nueva fija un `search_path` vacío y usa permisos del invocador. [Referencia del aviso](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).
