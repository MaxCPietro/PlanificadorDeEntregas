-- Ejecutar en Supabase SQL Editor al desplegar esta rama.
-- Conserva los pedidos existentes y habilita los dos estados de pendiente.
BEGIN;

ALTER TABLE public.pedidos
    DROP CONSTRAINT IF EXISTS pedidos_estado_check;

ALTER TABLE public.pedidos
    ADD CONSTRAINT pedidos_estado_check
    CHECK (estado IN (
        'PENDIENTE',
        'PENDIENTE - LIBERADO',
        'PENDIENTE - SIN LIBERAR',
        'PROGRAMADO',
        'EN REPARTO',
        'ENTREGADO',
        'NO ENTREGADO'
    ));

UPDATE public.pedidos
SET estado = 'PENDIENTE - LIBERADO'
WHERE estado = 'PENDIENTE';

ALTER TABLE public.pedidos
    ALTER COLUMN estado SET DEFAULT 'PENDIENTE - LIBERADO';

COMMIT;
