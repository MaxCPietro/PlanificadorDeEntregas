-- Planificador de Entregas V6 — Supabase / PostgreSQL
-- Ejecutar completo en Supabase > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  nombre text not null,
  contacto text,
  telefono text,
  email text,
  direccion text,
  direccion_entrega text,
  localidad text,
  provincia text default 'Buenos Aires',
  codigo_postal text,
  latitud double precision,
  longitud double precision,
  observaciones text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.vendedores (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  nombre text not null,
  telefono text,
  email text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  nombre text not null,
  descripcion text,
  precio numeric(12,2) not null default 0 check (precio >= 0),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  cliente_id uuid not null references public.clientes(id) on update cascade on delete restrict,
  vendedor_id uuid references public.vendedores(id) on update cascade on delete set null,
  fecha_pedido date not null default current_date,
  fecha_entrega date,
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE','PROGRAMADO','EN REPARTO','ENTREGADO','NO ENTREGADO')),
  transportista text,
  tipo_pago text not null default 'Contado' check (tipo_pago in ('Contado','Cuenta Corriente','Echeq','Otro')),
  direccion_entrega text,
  localidad_entrega text,
  provincia_entrega text,
  latitud double precision,
  longitud double precision,
  observaciones text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.pedido_productos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on update cascade on delete restrict,
  cantidad numeric(12,3) not null default 1 check (cantidad > 0),
  precio_unitario numeric(12,2) not null default 0 check (precio_unitario >= 0),
  unique (pedido_id, producto_id)
);
alter table public.pedido_productos add column if not exists descuento_pct numeric(5,2) not null default 0 check (descuento_pct >= 0 and descuento_pct <= 100);

create index if not exists idx_pedidos_fecha_entrega on public.pedidos(fecha_entrega);
create index if not exists idx_pedidos_estado on public.pedidos(estado);
create index if not exists idx_pedidos_cliente on public.pedidos(cliente_id);
create index if not exists idx_pedidos_vendedor on public.pedidos(vendedor_id);
create index if not exists idx_pedido_productos_pedido on public.pedido_productos(pedido_id);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_clientes_updated_at on public.clientes;
create trigger trg_clientes_updated_at before update on public.clientes for each row execute function public.touch_updated_at();
drop trigger if exists trg_pedidos_updated_at on public.pedidos;
create trigger trg_pedidos_updated_at before update on public.pedidos for each row execute function public.touch_updated_at();

-- Acceso restringido: solo usuarios autenticados en el proyecto Supabase.
alter table public.clientes enable row level security;
alter table public.vendedores enable row level security;
alter table public.productos enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_productos enable row level security;
do $$ declare t text; begin foreach t in array array['clientes','vendedores','productos','pedidos','pedido_productos'] loop
  execute format('drop policy if exists %I on public.%I', t||'_authenticated_all', t);
  execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', t||'_authenticated_all', t);
end loop; end $$;

-- Datos iniciales de ejemplo: editar/reemplazar por datos reales.
insert into public.clientes(codigo,nombre,contacto,telefono,direccion,localidad,provincia,latitud,longitud) values
('CLI-001','Almacén El Sol','Laura Gómez','11-5555-0101','Av. San Martín 1200','José C. Paz','Buenos Aires',-34.5154,-58.7680),
('CLI-002','Distribuidora Norte','Martín Pérez','11-5555-0102','Ruta 197 850','José C. Paz','Buenos Aires',-34.5087,-58.7594),
('CLI-003','Autoservicio La Plaza','Carolina Díaz','11-5555-0103','Sarmiento 430','San Miguel','Buenos Aires',-34.5431,-58.7117),
('CLI-004','Mercado Centralito','Diego Fernández','11-5555-0104','Av. Balbín 2100','San Miguel','Buenos Aires',-34.5487,-58.7148)
on conflict (codigo) do nothing;
insert into public.vendedores(codigo,nombre,telefono,email) values
('VEN-001','Vendedor 1','',''),('VEN-002','Vendedor 2','',''),('VEN-003','Vendedor 3','','') on conflict (codigo) do nothing;
insert into public.productos(codigo,nombre,descripcion,precio) values
('PRO-001','Patero Cabarceno 750 cc','Botella 750 cc',0),
('PRO-002','Patero Cabarceno 1125 cc','Botellón 1125 cc',0),
('PRO-003','Jugo de uva 750 cc','100% natural',0),
('PRO-004','Patero Clásico 750 cc','Botella 750 cc',0)
on conflict (codigo) do nothing;

-- Pedidos de demostración con sus productos asociados.
insert into public.pedidos(numero,cliente_id,vendedor_id,fecha_pedido,fecha_entrega,estado,transportista,tipo_pago,direccion_entrega,localidad_entrega,provincia_entrega,latitud,longitud,observaciones)
select 'DEMO-1001', c.id, v.id, current_date, current_date + 1, 'PROGRAMADO', 'Juan', 'Contado', coalesce(c.direccion_entrega,c.direccion), c.localidad, c.provincia, c.latitud, c.longitud, 'Pedido de ejemplo'
from public.clientes c cross join public.vendedores v where c.codigo='CLI-001' and v.codigo='VEN-001'
and not exists(select 1 from public.pedidos p where p.numero='DEMO-1001');
insert into public.pedidos(numero,cliente_id,vendedor_id,fecha_pedido,estado,transportista,tipo_pago,direccion_entrega,localidad_entrega,provincia_entrega,latitud,longitud,observaciones)
select 'DEMO-1002', c.id, v.id, current_date, 'PENDIENTE', 'Pedro', 'Contado', coalesce(c.direccion_entrega,c.direccion), c.localidad, c.provincia, c.latitud, c.longitud, 'Pedido de ejemplo sin programar'
from public.clientes c cross join public.vendedores v where c.codigo='CLI-003' and v.codigo='VEN-002'
and not exists(select 1 from public.pedidos p where p.numero='DEMO-1002');
insert into public.pedido_productos(pedido_id,producto_id,cantidad,precio_unitario)
select p.id, pr.id, 4, pr.precio from public.pedidos p cross join public.productos pr
where p.numero='DEMO-1001' and pr.codigo='PRO-001' and not exists(select 1 from public.pedido_productos pp where pp.pedido_id=p.id and pp.producto_id=pr.id);
insert into public.pedido_productos(pedido_id,producto_id,cantidad,precio_unitario)
select p.id, pr.id, 2, pr.precio from public.pedidos p cross join public.productos pr
where p.numero='DEMO-1002' and pr.codigo='PRO-003' and not exists(select 1 from public.pedido_productos pp where pp.pedido_id=p.id and pp.producto_id=pr.id);
