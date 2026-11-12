-- Aplicar manualmente en Supabase ANTES de publicar la rama.
-- No actualiza coordenadas existentes ni modifica rutas o pedidos.
alter table public.clientes
 add column if not exists geo_fuente text,
 add column if not exists geo_verificada boolean not null default false;
alter table public.pedidos
 add column if not exists geo_fuente text,
 add column if not exists geo_verificada boolean not null default false;
alter table public.clientes drop constraint if exists clientes_geo_fuente_check;
alter table public.clientes add constraint clientes_geo_fuente_check
 check (geo_fuente is null or geo_fuente in ('nominatim','manual'));
alter table public.pedidos drop constraint if exists pedidos_geo_fuente_check;
alter table public.pedidos add constraint pedidos_geo_fuente_check
 check (geo_fuente is null or geo_fuente in ('nominatim','manual'));
-- Valores anteriores quedan explícitamente sin verificar.
-- Se mantiene la política RLS existente de cada tabla.
comment on column public.clientes.geo_verificada is 'Confirmación de coordenadas efectuada en la interfaz';
comment on column public.pedidos.geo_verificada is 'Confirmación de coordenadas efectuada en la interfaz';
