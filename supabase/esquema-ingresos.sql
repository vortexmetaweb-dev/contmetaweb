-- Esquema del módulo Income: ingresos registrados (con o sin factura).
-- Pegar completo en Supabase → SQL Editor → Run.
-- Depende de organizaciones, miembros y las funciones creadas en esquema-cfdi.sql.
-- Es idempotente: se puede volver a ejecutar sin perder datos.

-- ---------------------------------------------------------------------------
-- Tabla
-- ---------------------------------------------------------------------------

create table if not exists public.ingresos (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  concepto text not null,
  monto numeric not null check (monto >= 0),
  moneda text not null default 'MXN',
  -- Fecha en que se registra/cobra el ingreso.
  fecha_ingreso date not null default current_date,
  -- Origen: 'Invoice' (CFDI tipo I) o 'Manual' (sin factura).
  origen text not null default 'Manual'
    check (origen in ('Invoice', 'Manual')),
  -- Cliente o fuente del ingreso (opcional).
  cliente text,
  -- Recurrencia del ingreso, igual que en pagos.
  recurrencia text not null default 'One-time'
    check (recurrencia in ('Monthly', 'Bimonthly', 'Quarterly', 'Semiannual', 'Annual', 'One-time')),
  -- Isotipo o logo del ingreso, data URL (base64). Nulo si se usa el isotipo automático.
  logo text,
  -- CFDI relacionado (solo si origen = 'Invoice').
  cfdi_id uuid references public.cfdi(id) on delete set null,
  creado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now()
);

-- Añade columnas en despliegues donde la tabla ingresos ya existía.
alter table public.ingresos add column if not exists origen text not null default 'Manual'
  check (origen in ('Invoice', 'Manual'));
alter table public.ingresos add column if not exists cliente text;
alter table public.ingresos add column if not exists recurrencia text not null default 'One-time'
  check (recurrencia in ('Monthly', 'Bimonthly', 'Quarterly', 'Semiannual', 'Annual', 'One-time'));
alter table public.ingresos add column if not exists logo text;
alter table public.ingresos add column if not exists cfdi_id uuid references public.cfdi(id) on delete set null;

create index if not exists ingresos_organizacion_idx
  on public.ingresos (organizacion_id, fecha_ingreso desc);

create index if not exists ingresos_fecha_idx
  on public.ingresos (organizacion_id, fecha_ingreso desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.ingresos enable row level security;

drop policy if exists ingresos_select on public.ingresos;
create policy ingresos_select on public.ingresos
  for select to authenticated
  using (public.es_miembro(organizacion_id));

drop policy if exists ingresos_insert on public.ingresos;
create policy ingresos_insert on public.ingresos
  for insert to authenticated
  with check (public.es_miembro(organizacion_id) and creado_por = auth.uid());

drop policy if exists ingresos_update on public.ingresos;
create policy ingresos_update on public.ingresos
  for update to authenticated
  using (public.es_miembro(organizacion_id))
  with check (public.es_miembro(organizacion_id));

drop policy if exists ingresos_delete on public.ingresos;
create policy ingresos_delete on public.ingresos
  for delete to authenticated
  using (public.es_miembro(organizacion_id));
