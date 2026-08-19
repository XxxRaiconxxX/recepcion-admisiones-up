create extension if not exists pgcrypto;

create table if not exists public.promesas (
  id uuid primary key default gen_random_uuid(),
  sheet_row_key text unique not null,
  ci text,
  ci_valido boolean not null default true,
  sync_warning text,
  nombres_apellidos text not null,
  carrera text not null,
  asesor text not null,
  numero text,
  becado boolean,
  visita boolean,
  asistio boolean,
  inscripto boolean,
  observaciones text,
  fecha_carga timestamptz,
  source_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.asesores (
  id uuid primary key default gen_random_uuid(),
  nombre text unique not null,
  carreras text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_promesas_carrera on public.promesas (carrera);
create index if not exists idx_promesas_asesor on public.promesas (asesor);
create index if not exists idx_promesas_fecha_carga on public.promesas (fecha_carga desc);
create index if not exists idx_promesas_estados on public.promesas (visita, asistio, inscripto);
create index if not exists idx_promesas_ci_invalido on public.promesas (ci_valido) where ci_valido = false;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_promesas_updated_at on public.promesas;
create trigger set_promesas_updated_at
before update on public.promesas
for each row execute function public.set_updated_at();

drop trigger if exists set_asesores_updated_at on public.asesores;
create trigger set_asesores_updated_at
before update on public.asesores
for each row execute function public.set_updated_at();

alter table public.promesas enable row level security;
alter table public.asesores enable row level security;

drop policy if exists "promesas_select_public" on public.promesas;
create policy "promesas_select_public"
on public.promesas for select
to anon, authenticated
using (true);

drop policy if exists "asesores_select_public" on public.asesores;
create policy "asesores_select_public"
on public.asesores for select
to anon, authenticated
using (true);

do $$
begin
  alter publication supabase_realtime add table public.promesas;
exception
  when duplicate_object then null;
end $$;
