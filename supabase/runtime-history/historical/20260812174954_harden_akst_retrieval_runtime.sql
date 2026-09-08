-- HISTORICAL RUNTIME EVIDENCE — DO NOT AUTO-APPLY
-- Recovered from app-forge-studio-78/agent/oracle-nervous-system.
-- Stage 2.0 verification: akst_touch_updated_at matches live; akst_publishable_chunks remains security_invoker=true.

alter view public.akst_publishable_chunks set (security_invoker = true);

create or replace function public.akst_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
