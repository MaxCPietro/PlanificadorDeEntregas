-- Ejecutar en Supabase SQL Editor antes de utilizar el historial de rutas.
create table if not exists public.rutas (
 id uuid primary key default gen_random_uuid(),
 fecha date not null,
 transportista text not null default 'Sin asignar',
 viaje integer not null default 1,
 estado text not null default 'PLANIFICADA' check (estado in ('PLANIFICADA','REALIZADA')),
 distancia_km numeric(12,2), duracion_min numeric(12,1),
 retorno_km numeric(12,2), retorno_min numeric(12,1),
 consumo_l_100km numeric(8,2) not null default 12,
 precio_litro numeric(12,2),
 instrucciones jsonb not null default '[]'::jsonb,
 geometria jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(fecha,transportista,viaje)
);
create table if not exists public.ruta_pedidos (
 ruta_id uuid not null references public.rutas(id) on delete cascade,
 pedido_id uuid not null references public.pedidos(id) on delete cascade,
 incluido boolean not null default true,
 orden integer not null default 0,
 primary key(ruta_id,pedido_id)
);
create index if not exists idx_rutas_fecha on public.rutas(fecha);
create index if not exists idx_rutas_transportista on public.rutas(transportista);
alter table public.rutas enable row level security;
alter table public.ruta_pedidos enable row level security;
drop policy if exists rutas_authenticated_all on public.rutas;
create policy rutas_authenticated_all on public.rutas for all to authenticated using (true) with check (true);
drop policy if exists ruta_pedidos_authenticated_all on public.ruta_pedidos;
create policy ruta_pedidos_authenticated_all on public.ruta_pedidos for all to authenticated using (true) with check (true);
