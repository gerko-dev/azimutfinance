// Types de l'historique de valeur liquidative (VL) et d'actif net d'un fonds.

// Un point d'historique (une date).
export type NavPoint = {
  date: string; // ISO YYYY-MM-DD
  vl: number | null;
  parts: number | null;
  actifNet: number | null;
  actifBrut: number | null;
};

// Résultat d'un import (avant persistance) : aperçu + bornes.
export type ParsedNav = {
  label: string;
  points: NavPoint[];
  minDate: string;
  maxDate: string;
};
