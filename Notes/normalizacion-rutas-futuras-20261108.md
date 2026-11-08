# Normalización de rutas futuras — 2026-11-08

## Modelo vigente

- `public.rutas`: una fila por fecha + transportista, con `id` como PK.
- `public.viajes`: viajes de una ruta (`ruta_id`, `numero`, distancia, duración, geometría).
- `public.viaje_pedidos`: pedidos de cada viaje, orden e inclusión.
- `public.ruta_pedidos`: relación agregada mantenida por compatibilidad con módulos existentes e historial.

El frontend carga viajes y asociaciones desde las tablas normalizadas. Los registros anteriores al 09/11/2026 siguen leyéndose mediante el esquema histórico.

## Migraciones aplicadas en Supabase

1. `normalize_future_route_journeys_stage1`: tablas, RLS, índices, migración de viajes y pedidos futuros.
2. `normalize_future_route_rpc`: reescritura transaccional de `waipara_guardar_viajes_futuros`, con validaciones y persistencia normalizada.
3. `consolidate_future_route_parents_with_backup`: unificación de las rutas futuras en una fila por fecha y transportista.

## Respaldo y recuperación

Antes de consolidar se crearon las tablas de respaldo en el esquema no expuesto `waipara_backup`:

- `rutas_pre_normalizacion_20261108`
- `ruta_pedidos_pre_normalizacion_20261108`

**No restaurar directamente en producción**: primero revisar conflictos con pedidos o rutas modificados después de la migración.

## Restricciones

- Escritura únicamente de fechas futuras, desde el 09/11/2026.
- Máximo 310 bultos por viaje.
- No se escriben pedidos entregados ni pendientes sin liberar.
- Las optimizaciones simuladas no se persisten.
- La función RPC guarda los viajes en una transacción única.
- Las métricas de la ruta diaria se agregan desde `viajes` en la interfaz; no se duplican en `rutas`.

## Verificación realizada

- 10/11: 1 ruta, 2 viajes, 2 pedidos.
- 12/11: 1 ruta, 2 viajes, 2 pedidos.
- 13/11 Daniel Aguilar: 1 ruta, 2 viajes, 3 pedidos.
- 13/11 Retira por Deposito: 1 ruta, 1 viaje, 1 pedido.
- 16/11: 1 ruta, 1 viaje, 1 pedido.

Pendiente: prueba de integración autenticada en navegador del guardado RPC y de la interfaz, incluyendo la recarga después del guardado.
