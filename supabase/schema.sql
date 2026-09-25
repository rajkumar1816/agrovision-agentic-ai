-- AgroVision AI — Agent persistence schema
-- Run this in the Supabase SQL editor (Project > SQL Editor > New query).

create extension if not exists "pgcrypto";

-- Every sensed soil-telemetry reading the agent ingests.
create table if not exists soil_telemetry (
  id uuid primary key default gen_random_uuid(),
  farm_id text not null,
  moisture_percent numeric not null,
  soil_temp_c numeric,
  air_temp_c numeric,
  humidity_percent numeric,
  status text,
  nitrogen_ppm numeric,
  phosphorus_ppm numeric,
  potassium_ppm numeric,
  ec_value numeric,
  recorded_at timestamptz not null default now()
);
create index if not exists soil_telemetry_farm_id_idx on soil_telemetry (farm_id, recorded_at desc);

-- Every decision the agent reaches, with its reasoning and sources —
-- this is what the agent reads back as "memory" on its next run.
create table if not exists agent_decisions (
  id uuid primary key default gen_random_uuid(),
  farm_id text not null,
  action_type text not null,
  decision text not null,
  reasoning text,
  priority text,
  category text,
  sources jsonb,
  created_at timestamptz not null default now()
);
create index if not exists agent_decisions_farm_id_idx on agent_decisions (farm_id, created_at desc);

-- Notifications the automation sends to the farmer without being asked.
create table if not exists agent_notifications (
  id uuid primary key default gen_random_uuid(),
  farm_id text not null,
  title text not null,
  message text not null,
  priority text,
  category text,
  created_at timestamptz not null default now()
);
create index if not exists agent_notifications_farm_id_idx on agent_notifications (farm_id, created_at desc);

-- Row Level Security: the server writes/reads with the service-role key,
-- which bypasses RLS, so these tables are safe to lock down from any
-- public/anon access by default.
alter table soil_telemetry enable row level security;
alter table agent_decisions enable row level security;
alter table agent_notifications enable row level security;

-- ---------------------------------------------------------------------------
-- AgroVision domain data. The service role used by the backend bypasses these
-- policies; authenticated clients are restricted to their own profile/farms.
-- ---------------------------------------------------------------------------

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  role text not null default 'farmer' check (role in ('farmer', 'buyer', 'admin', 'expert')),
  language text not null default 'en' check (language in ('en', 'te', 'hi')),
  location jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role, language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    case when new.raw_user_meta_data ->> 'role' = 'buyer' then 'buyer' else 'farmer' end,
    coalesce(new.raw_user_meta_data ->> 'language', 'en')
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table if not exists farmers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id) on delete cascade,
  farm_name text,
  village text,
  district text,
  state text,
  latitude numeric,
  longitude numeric,
  land_area numeric,
  land_unit text default 'acre',
  preferred_language text not null default 'en' check (preferred_language in ('en', 'te', 'hi')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists farms (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  farm_name text not null,
  location jsonb,
  latitude numeric,
  longitude numeric,
  area numeric,
  soil_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists crops (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references farms(id) on delete cascade,
  crop_name text not null,
  variety text,
  season text,
  sowing_date date,
  expected_harvest_date date,
  growth_stage text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists soil_readings (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references farms(id) on delete cascade,
  soil_moisture numeric check (soil_moisture between 0 and 100),
  temperature numeric,
  ph numeric check (ph between 0 and 14),
  nitrogen numeric,
  phosphorus numeric,
  potassium numeric,
  recorded_at timestamptz not null default now(),
  source text not null default 'sensor',
  created_at timestamptz not null default now()
);

create table if not exists disease_records (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  farm_id uuid references farms(id) on delete set null,
  crop_id uuid references crops(id) on delete set null,
  image_url text,
  crop_name text not null,
  disease_name text not null,
  confidence numeric check (confidence between 0 and 100),
  symptoms jsonb not null default '[]'::jsonb,
  recommendation text,
  detected_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists recommendations (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  farm_id uuid references farms(id) on delete set null,
  crop_id uuid references crops(id) on delete set null,
  type text not null check (type in ('irrigation', 'fertilizer', 'disease', 'weather', 'crop', 'general')),
  title text not null,
  description text not null,
  confidence numeric check (confidence between 0 and 100),
  source text,
  created_at timestamptz not null default now()
);

create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  title text,
  language text not null default 'en' check (language in ('en', 'te', 'hi')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  farmer_id uuid not null references farmers(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  message text not null,
  language text not null default 'en' check (language in ('en', 'te', 'hi')),
  intent text,
  tools_used jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists marketplace_products (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references farmers(id) on delete cascade,
  name text not null,
  description text,
  category text,
  crop text,
  quantity numeric not null check (quantity >= 0),
  unit text not null,
  price numeric not null check (price >= 0),
  location text,
  image_url text,
  availability text not null default 'available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references profiles(id) on delete restrict,
  product_id uuid not null references marketplace_products(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  total_price numeric not null check (total_price >= 0),
  status text not null default 'placed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists government_schemes (
  id uuid primary key default gen_random_uuid(),
  scheme_name text not null,
  description text,
  eligibility jsonb not null default '[]'::jsonb,
  benefits jsonb not null default '[]'::jsonb,
  required_documents jsonb not null default '[]'::jsonb,
  application_process jsonb not null default '[]'::jsonb,
  official_source text not null,
  last_updated timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  message text not null,
  type text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists farms_farmer_id_idx on farms (farmer_id);
create index if not exists crops_farm_id_idx on crops (farm_id);
create index if not exists soil_readings_farm_recorded_idx on soil_readings (farm_id, recorded_at desc);
create index if not exists disease_records_farmer_created_idx on disease_records (farmer_id, created_at desc);
create index if not exists recommendations_farmer_created_idx on recommendations (farmer_id, created_at desc);
create index if not exists chat_messages_session_created_idx on chat_messages (session_id, created_at);
create index if not exists marketplace_products_availability_idx on marketplace_products (availability, created_at desc);
create index if not exists marketplace_orders_buyer_created_idx on marketplace_orders (buyer_id, created_at desc);
create index if not exists notifications_user_created_idx on notifications (user_id, created_at desc);

alter table profiles enable row level security;
alter table farmers enable row level security;
alter table farms enable row level security;
alter table crops enable row level security;
alter table soil_readings enable row level security;
alter table disease_records enable row level security;
alter table recommendations enable row level security;
alter table chat_sessions enable row level security;
alter table chat_messages enable row level security;
alter table marketplace_products enable row level security;
alter table marketplace_orders enable row level security;
alter table government_schemes enable row level security;
alter table notifications enable row level security;

drop policy if exists profiles_self_access on profiles;
create policy profiles_self_access on profiles for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists farmers_self_access on farmers;
create policy farmers_self_access on farmers for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists farms_owner_access on farms;
create policy farms_owner_access on farms for all using (
  exists (select 1 from farmers where farmers.id = farms.farmer_id and farmers.profile_id = auth.uid())
) with check (
  exists (select 1 from farmers where farmers.id = farms.farmer_id and farmers.profile_id = auth.uid())
);

drop policy if exists crops_owner_access on crops;
create policy crops_owner_access on crops for all using (
  exists (
    select 1 from farms join farmers on farmers.id = farms.farmer_id
    where farms.id = crops.farm_id and farmers.profile_id = auth.uid()
  )
) with check (
  exists (
    select 1 from farms join farmers on farmers.id = farms.farmer_id
    where farms.id = crops.farm_id and farmers.profile_id = auth.uid()
  )
);

drop policy if exists soil_readings_owner_access on soil_readings;
create policy soil_readings_owner_access on soil_readings for all using (
  exists (
    select 1 from farms join farmers on farmers.id = farms.farmer_id
    where farms.id = soil_readings.farm_id and farmers.profile_id = auth.uid()
  )
) with check (
  exists (
    select 1 from farms join farmers on farmers.id = farms.farmer_id
    where farms.id = soil_readings.farm_id and farmers.profile_id = auth.uid()
  )
);

drop policy if exists marketplace_products_public_read on marketplace_products;
create policy marketplace_products_public_read on marketplace_products for select using (availability = 'available');

drop policy if exists schemes_public_read on government_schemes;
create policy schemes_public_read on government_schemes for select using (true);

create table if not exists agricultural_pest_knowledge (
  id uuid primary key default gen_random_uuid(),
  crop_name text not null,
  pest_name text,
  disease_name text,
  scientific_name text,
  problem_type text not null check (problem_type in ('Pest', 'Disease', 'Unknown')),
  symptoms text,
  causes text,
  affected_stage text,
  prevention text,
  cultural_control text,
  biological_control text,
  active_ingredient text,
  product_name text,
  formulation text,
  approved_use text,
  dosage text,
  application_method text,
  waiting_period text,
  safety_precautions text,
  source_name text,
  source_url text,
  region text,
  language text not null default 'en' check (language in ('en', 'te', 'hi')),
  verified boolean not null default false,
  verified_at timestamptz,
  status text not null default 'active' check (status in ('active', 'outdated', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists crop_diagnosis_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  farmer_id uuid references farmers(id) on delete set null,
  farm_id uuid references farms(id) on delete set null,
  crop_name text not null,
  image_url text,
  detected_problem text not null,
  problem_type text not null,
  confidence numeric not null check (confidence between 0 and 1),
  severity text,
  symptoms jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '{}'::jsonb,
  language text not null default 'en' check (language in ('en', 'te', 'hi')),
  created_at timestamptz not null default now()
);

create index if not exists agricultural_knowledge_crop_idx
  on agricultural_pest_knowledge (crop_name, language, verified, status);
create index if not exists crop_diagnosis_history_user_idx
  on crop_diagnosis_history (user_id, created_at desc);

alter table agricultural_pest_knowledge enable row level security;
alter table crop_diagnosis_history enable row level security;

drop policy if exists verified_knowledge_public_read on agricultural_pest_knowledge;
create policy verified_knowledge_public_read on agricultural_pest_knowledge
  for select using (verified = true and status = 'active');

drop policy if exists diagnosis_history_owner_read on crop_diagnosis_history;
create policy diagnosis_history_owner_read on crop_diagnosis_history
  for select using (user_id = auth.uid());

drop policy if exists diagnosis_history_owner_insert on crop_diagnosis_history;
create policy diagnosis_history_owner_insert on crop_diagnosis_history
  for insert with check (user_id = auth.uid());
