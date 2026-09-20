-- ============================================================
-- AzimutFinance — Prix d'execution
-- A executer dans : Supabase Dashboard > SQL Editor.
-- Idempotent. Prerequis : fund-operations-executions.sql.
-- ============================================================
--
-- LE PRIX SERVI N'EST PAS LE PRIX ORDONNE. Un ordre a cours limite est
-- rarement execute au centime pres a sa limite, et un ordre servi en plusieurs
-- fois l'est souvent a plusieurs prix. Reprendre le prix de l'ordre pour
-- valoriser ce qui a ete servi faussait donc le montant reellement regle.
--
-- Zero signifie « prix de l'ordre » : c'est ce que valent les executions deja
-- enregistrees, qui n'avaient pas de prix propre. Les mettre a NULL aurait
-- oblige chaque lecteur a decider ce qu'un NULL veut dire.
alter table public.fund_market_executions
  add column if not exists prix numeric not null default 0;
