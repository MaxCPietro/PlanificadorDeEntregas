-- Migración V6.1: dirección específica de entrega en clientes y tipo de pago en pedidos.
-- Ejecutar una sola vez en Supabase > SQL Editor. No borra datos existentes.
alter table public.clientes add column if not exists direccion_entrega text;
alter table public.pedidos add column if not exists tipo_pago text not null default 'Contado';
do $$ begin
  if not exists (select 1 from pg_constraint where conname='pedidos_tipo_pago_check') then
    alter table public.pedidos add constraint pedidos_tipo_pago_check check (tipo_pago in ('Contado','Cuenta Corriente','Echeq','Otro'));
  end if;
end $$;
-- Para clientes existentes, se copia la dirección comercial como valor inicial solo si aún no tienen dirección de entrega.
update public.clientes set direccion_entrega=direccion where direccion_entrega is null and direccion is not null;
