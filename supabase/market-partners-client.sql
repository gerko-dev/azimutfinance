-- ============================================================
-- AzimutFinance — Clients sensibles au referentiel des partenaires
-- A executer dans : Supabase Dashboard > SQL Editor. Idempotent.
-- ============================================================
--
-- UN CLIENT SENSIBLE SE NOMME UNE FOIS. Saisi a la main sur chaque bordereau
-- de collecte, son nom divergeait d'une ligne a l'autre — « NSIA Vie »,
-- « NSIA-VIE », « Nsia vie » — et tout regroupement par client devenait faux.
--
-- Il vit dans market_partners plutot que dans une table a lui : c'est le meme
-- objet, une contrepartie qu'on nomme une fois et qu'on retrouve ensuite dans
-- une liste deroulante. Il ne porte ni courtage ni TPS, l'ecran les masque
-- deja hors SGI.
alter table public.market_partners drop constraint if exists market_partners_kind_chk;
alter table public.market_partners
  add constraint market_partners_kind_chk
  check (kind in ('sgi', 'btcc', 'remere', 'client', 'autre'));

-- ------------------------------------------------------------
-- Secteur d'activite du client.
-- ------------------------------------------------------------
--
-- Classification DAMODARAN (Industry Name), deja embarquee cote applicatif —
-- la meme qui sert aux actions non cotees du referentiel. La reprendre evite
-- d'entretenir deux nomenclatures qui divergeraient.
--
-- Il ne concerne QUE les clients sensibles, et il remplace pour eux le numero
-- d'agrement : l'agrement est celui d'un intermediaire habilite par le CREPMF,
-- un souscripteur n'en a pas.
--
-- C'est par le secteur qu'on mesure la concentration du passif sur une
-- branche : un fonds dont la moitie des encours vient de l'assurance n'a pas
-- le meme risque de rachat qu'un fonds diversifie.
alter table public.market_partners
  add column if not exists secteur text not null default '';
