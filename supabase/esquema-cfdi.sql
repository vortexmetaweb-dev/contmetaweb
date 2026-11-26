-- Esquema del módulo CFDI. Pegar completo en Supabase → SQL Editor → Run.
-- Crea organizaciones, miembros y cfdi con RLS activado (ESPECIFICACIONES.md §3.4).
-- Es idempotente: se puede volver a ejecutar sin perder datos.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table if not exists public.organizaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  creada_en timestamptz not null default now()
);

create table if not exists public.miembros (
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  rol text not null default 'propietario',
  creado_en timestamptz not null default now(),
  primary key (organizacion_id, usuario_id)
);

create table if not exists public.cfdi (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  uuid_fiscal text,
  version text,
  serie text,
  folio text,
  fecha text,
  tipo_comprobante text,
  metodo_pago text,
  forma_pago text,
  moneda text,
  tipo_cambio numeric,
  lugar_expedicion text,
  subtotal numeric,
  descuento numeric,
  total numeric,
  emisor_rfc text,
  emisor_nombre text,
  receptor_rfc text,
  receptor_nombre text,
  uso_cfdi text,
  datos jsonb not null,
  xml text not null,
  pdf text,
  creado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now()
);

-- Añade la columna pdf en despliegues donde la tabla cfdi ya existía.
alter table public.cfdi add column if not exists pdf text;

-- Liga un complemento de pago (tipo P) con la factura que paga. Nulo en el resto
-- de comprobantes.
alter table public.cfdi add column if not exists relacionado_id uuid
  references public.cfdi(id) on delete set null;

create index if not exists cfdi_relacionado_idx
  on public.cfdi (relacionado_id)
  where relacionado_id is not null;

create index if not exists cfdi_organizacion_idx
  on public.cfdi (organizacion_id, creado_en desc);

create unique index if not exists cfdi_uuid_organizacion_idx
  on public.cfdi (organizacion_id, uuid_fiscal)
  where uuid_fiscal is not null;

-- ---------------------------------------------------------------------------
-- Funciones auxiliares
-- ---------------------------------------------------------------------------

-- Indica si el usuario en sesión pertenece a la organización. Sin efectos
-- secundarios: se puede usar dentro de las políticas RLS.
create or replace function public.es_miembro(p_organizacion uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.miembros
    where organizacion_id = p_organizacion
      and usuario_id = auth.uid()
  );
$$;

-- Devuelve la organización del usuario y, si todavía no tiene ninguna, la crea
-- y lo agrega como propietario. Se llama desde el servidor al guardar un CFDI.
create or replace function public.mi_organizacion()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario uuid := auth.uid();
  v_organizacion uuid;
  v_nombre text;
begin
  if v_usuario is null then
    raise exception 'Sin sesión';
  end if;

  select organizacion_id
    into v_organizacion
  from public.miembros
  where usuario_id = v_usuario
  order by creado_en
  limit 1;

  if v_organizacion is not null then
    return v_organizacion;
  end if;

  select coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), u.email, 'Mi organización')
    into v_nombre
  from auth.users u
  where u.id = v_usuario;

  insert into public.organizaciones (nombre)
  values (coalesce(v_nombre, 'Mi organización'))
  returning id into v_organizacion;

  insert into public.miembros (organizacion_id, usuario_id, rol)
  values (v_organizacion, v_usuario, 'propietario');

  return v_organizacion;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.organizaciones enable row level security;
alter table public.miembros enable row level security;
alter table public.cfdi enable row level security;

-- Organizaciones: solo se ven las propias. La creación ocurre dentro de
-- mi_organizacion(), así que no se conceden permisos de insert desde el cliente.
drop policy if exists organizaciones_select on public.organizaciones;
create policy organizaciones_select on public.organizaciones
  for select to authenticated
  using (public.es_miembro(id));

-- Miembros: cada usuario solo ve sus propias membresías.
drop policy if exists miembros_select on public.miembros;
create policy miembros_select on public.miembros
  for select to authenticated
  using (usuario_id = auth.uid());

-- CFDI: acceso solo dentro de la organización y por el usuario que lo subió.
drop policy if exists cfdi_select on public.cfdi;
create policy cfdi_select on public.cfdi
  for select to authenticated
  using (public.es_miembro(organizacion_id));

drop policy if exists cfdi_insert on public.cfdi;
create policy cfdi_insert on public.cfdi
  for insert to authenticated
  with check (public.es_miembro(organizacion_id) and creado_por = auth.uid());

drop policy if exists cfdi_update on public.cfdi;
create policy cfdi_update on public.cfdi
  for update to authenticated
  using (public.es_miembro(organizacion_id))
  with check (public.es_miembro(organizacion_id));

drop policy if exists cfdi_delete on public.cfdi;
create policy cfdi_delete on public.cfdi
  for delete to authenticated
  using (public.es_miembro(organizacion_id));
