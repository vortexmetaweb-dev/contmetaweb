-- Esquema del módulo Payments: pagos fijos del mes.
-- Pegar completo en Supabase → SQL Editor → Run.
-- Depende de organizaciones, miembros y las funciones creadas en esquema-cfdi.sql.
-- Es idempotente: se puede volver a ejecutar sin perder datos.

-- ---------------------------------------------------------------------------
-- Tabla
-- ---------------------------------------------------------------------------

create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  concepto text not null,
  monto numeric not null check (monto >= 0),
  moneda text not null default 'MXN',
  -- Día del mes en que se realiza el pago (1 a 31).
  dia_pago smallint not null check (dia_pago between 1 and 31),
  recurrencia text not null default 'Monthly'
    check (recurrencia in ('Monthly', 'Bimonthly', 'Quarterly', 'Semiannual', 'Annual', 'One-time')),
  -- Isotipo o logo del pago, almacenado como data URL (base64). Nulo si se
  -- usa el isotipo automático generado a partir del concepto.
  logo text,
  creado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now()
);

-- Añade la columna logo en despliegues donde la tabla pagos ya existía.
alter table public.pagos add column if not exists logo text;

create index if not exists pagos_organizacion_idx
  on public.pagos (organizacion_id, creado_en desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.pagos enable row level security;

-- Pagos: solo dentro de la organización del usuario y creados por él.
drop policy if exists pagos_select on public.pagos;
create policy pagos_select on public.pagos
  for select to authenticated
  using (public.es_miembro(organizacion_id));

drop policy if exists pagos_insert on public.pagos;
create policy pagos_insert on public.pagos
  for insert to authenticated
  with check (public.es_miembro(organizacion_id) and creado_por = auth.uid());

drop policy if exists pagos_update on public.pagos;
create policy pagos_update on public.pagos
  for update to authenticated
  using (public.es_miembro(organizacion_id))
  with check (public.es_miembro(organizacion_id));

drop policy if exists pagos_delete on public.pagos;
create policy pagos_delete on public.pagos
  for delete to authenticated
  using (public.es_miembro(organizacion_id));

-- ---------------------------------------------------------------------------
-- Migración de recurrencia (español → inglés)
-- ---------------------------------------------------------------------------
-- Si la tabla ya existía con los valores en español (Mensual, Bimestral, etc.),
-- este bloque convierte las filas existentes y reemplaza la restricción CHECK
-- para aceptar los valores en inglés.

-- Convierte los valores en español a inglés en las filas existentes.
update public.pagos
set recurrencia = case recurrencia
  when 'Mensual' then 'Monthly'
  when 'Bimestral' then 'Bimonthly'
  when 'Trimestral' then 'Quarterly'
  when 'Semestral' then 'Semiannual'
  when 'Anual' then 'Annual'
  when 'Única' then 'One-time'
  else recurrencia
end
where recurrencia in ('Mensual', 'Bimestral', 'Trimestral', 'Semestral', 'Anual', 'Única');

-- Reemplaza la restricción CHECK por la versión en inglés.
alter table public.pagos drop constraint if exists pagos_recurrencia_check;
alter table public.pagos add constraint pagos_recurrencia_check
  check (recurrencia in ('Monthly', 'Bimonthly', 'Quarterly', 'Semiannual', 'Annual', 'One-time'));
