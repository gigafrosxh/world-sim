// Baubare Gebäude. Kosten in EUR auf österreichischem Niveau; werden pro Land mit
// Wechselkurs × Baukostenniveau umgerechnet. Arbeitsaufwand in Personenstunden.

export type Zone = 'industrial' | 'residential' | 'commercial';
export type Visual = 'container' | 'workshop' | 'factory' | 'warehouse' | 'house' | 'tinyhouse' | 'apartment' | 'office' | 'shop' | 'casino' | 'tower';
export type MachineId = 'bagger' | 'turmkran' | 'mobilkran' | 'fahrmischer' | 'lkw';

export const MACHINES: Record<MachineId, { name: string; rentPerDay: number }> = {
  bagger: { name: 'Bagger', rentPerDay: 380 },
  turmkran: { name: 'Turmdrehkran', rentPerDay: 650 },
  mobilkran: { name: 'Mobilkran', rentPerDay: 900 },
  fahrmischer: { name: 'Betonmischer', rentPerDay: 220 },
  lkw: { name: 'Lkw', rentPerDay: 300 },
};

export interface Phase { name: string; work: number; material: number; machines: MachineId[] }

const STANDARD_PHASES: Phase[] = [
  { name: 'Erdarbeiten', work: 0.08, material: 0.04, machines: ['bagger', 'lkw'] },
  { name: 'Fundament', work: 0.12, material: 0.15, machines: ['fahrmischer', 'bagger'] },
  { name: 'Rohbau', work: 0.3, material: 0.38, machines: ['turmkran'] },
  { name: 'Dach & Fassade', work: 0.2, material: 0.23, machines: ['turmkran'] },
  { name: 'Haustechnik', work: 0.15, material: 0.12, machines: [] },
  { name: 'Innenausbau', work: 0.13, material: 0.08, machines: [] },
  { name: 'Abnahme', work: 0.02, material: 0, machines: [] },
];

const MODULE_PHASES: Phase[] = [
  { name: 'Punktfundamente', work: 0.3, material: 0.1, machines: ['bagger'] },
  { name: 'Anlieferung & Aufstellen', work: 0.4, material: 0.8, machines: ['mobilkran', 'lkw'] },
  { name: 'Anschlüsse', work: 0.3, material: 0.1, machines: [] },
];

export interface BuildingType {
  id: string;
  name: string;
  zone: Zone;
  visual: Visual;
  area: number; // Nutzfläche m²
  w: number; d: number; h: number; // Abmessungen in m
  material: number; // EUR
  workHours: number; // Personenstunden
  defaultCrew: number;
  maxCrew: number;
  permitDays: number;
  phases: Phase[];
  workshop: boolean; // als Betriebsstätte nutzbar
  description: string;
}

export const BUILDING_TYPES: BuildingType[] = [
  { id: 'container', name: 'Container-Werkstatt (40 m²)', zone: 'industrial', visual: 'container', area: 40, w: 12, d: 5, h: 3, material: 16000, workHours: 160, defaultCrew: 2, maxCrew: 4, permitDays: 14, phases: MODULE_PHASES, workshop: true, description: 'Günstiger Einstieg: zwei Seecontainer mit Strom und Werkbank. Nur kleine Aufträge möglich.' },
  { id: 'werkstatt', name: 'Werkstatt (200 m²)', zone: 'industrial', visual: 'workshop', area: 200, w: 20, d: 10, h: 6, material: 120000, workHours: 3000, defaultCrew: 6, maxCrew: 12, permitDays: 60, phases: STANDARD_PHASES, workshop: true, description: 'Gemauerte Werkstatt mit Rolltor und kleinem Büro. Platz für bis zu 8 Leute.' },
  { id: 'lager', name: 'Lagerhalle (1.000 m²)', zone: 'industrial', visual: 'warehouse', area: 1000, w: 40, d: 25, h: 9, material: 520000, workHours: 8000, defaultCrew: 10, maxCrew: 20, permitDays: 75, phases: STANDARD_PHASES, workshop: false, description: 'Stahlhalle mit Laderampen. Für Material und Fertigware.' },
  { id: 'halle', name: 'Produktionshalle (800 m²)', zone: 'industrial', visual: 'factory', area: 800, w: 40, d: 20, h: 9, material: 450000, workHours: 9000, defaultCrew: 10, maxCrew: 20, permitDays: 90, phases: STANDARD_PHASES, workshop: true, description: 'Halle mit Sheddach, Büroteil und Schornstein. Für Serienfertigung und größere Aufträge.' },
  { id: 'kranhalle', name: 'Halle mit Hallenkran (2.000 m²)', zone: 'industrial', visual: 'factory', area: 2000, w: 50, d: 40, h: 14, material: 1400000, workHours: 22000, defaultCrew: 14, maxCrew: 30, permitDays: 120, phases: STANDARD_PHASES, workshop: true, description: 'Große Industriehalle mit 10-t-Brückenkran. Für Stahlbau und Großserien.' },
  { id: 'tiny', name: 'Fertigteil-Tiny-House (35 m²)', zone: 'residential', visual: 'tinyhouse', area: 35, w: 9, d: 4.5, h: 4, material: 45000, workHours: 500, defaultCrew: 3, maxCrew: 5, permitDays: 21, phases: MODULE_PHASES, workshop: false, description: 'Kleines Holz-Fertighaus. Schnell gebaut, günstig.' },
  { id: 'efh', name: 'Einfamilienhaus (140 m²)', zone: 'residential', visual: 'house', area: 140, w: 12, d: 10, h: 8, material: 230000, workHours: 5500, defaultCrew: 5, maxCrew: 10, permitDays: 60, phases: STANDARD_PHASES, workshop: false, description: 'Massivhaus mit Satteldach, zwei Geschoße.' },
];

export const buildingType = (id: string) => BUILDING_TYPES.find((b) => b.id === id)!;

/** Effektive Arbeitsleistung einer Kolonne: mehr Leute → schneller, aber mit abnehmendem Nutzen. */
export const crewEfficiency = (crew: number) => Math.pow(Math.max(1, crew), 0.85);

/** Geschätzte Bauzeit in Arbeitstagen (8 h) ohne Genehmigung. */
export const estimateWorkDays = (b: BuildingType, crew: number) => b.workHours / (crewEfficiency(crew) * 8);
