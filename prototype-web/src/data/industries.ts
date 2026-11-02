// Branchen und typische Aufträge. Beträge in EUR (österreichisches Niveau).

export interface OrderTemplate {
  name: string;
  hours: number; // Arbeitsstunden
  material: number; // Materialeinkauf
  price: number; // Netto-Erlös
  minArea: number; // nötige Werkstattfläche m²
}

export interface Industry {
  id: string;
  name: string;
  regulated: boolean; // Befähigungsnachweis (Meister) in Ländern mit reglementierten Gewerben
  worker: string; // Berufsbezeichnung
  orders: OrderTemplate[];
  scenario: string[]; // Szenario-Pfad (Kurzfassung)
}

export const INDUSTRIES: Industry[] = [
  {
    id: 'schlosserei', name: 'Schlosserei / Metallbau', regulated: true, worker: 'Schlosser:in',
    orders: [
      { name: 'Reparatur Gartentor', hours: 5, material: 40, price: 420, minArea: 0 },
      { name: 'Treppengeländer (6 m)', hours: 32, material: 850, price: 3600, minArea: 0 },
      { name: 'Schiebetor verzinkt', hours: 40, material: 1600, price: 5200, minArea: 30 },
      { name: 'Carport Stahl', hours: 70, material: 2600, price: 8900, minArea: 100 },
      { name: 'Außentreppe Stahl', hours: 140, material: 5200, price: 17500, minArea: 150 },
      { name: 'Stahlbühne für Lagerhalle', hours: 320, material: 14000, price: 42000, minArea: 400 },
      { name: 'Tragwerk Hallenanbau', hours: 900, material: 46000, price: 128000, minArea: 1500 },
    ],
    scenario: ['Firma gründen', 'Werkstatt mieten oder Industriegrundstück kaufen', 'Baugenehmigung + Bau', 'Personal einstellen', 'Aufträge annehmen', 'Wachsen: größere Halle, Hallenkran'],
  },
  {
    id: 'tischlerei', name: 'Tischlerei', regulated: true, worker: 'Tischler:in',
    orders: [
      { name: 'Regal nach Maß', hours: 10, material: 250, price: 1100, minArea: 0 },
      { name: 'Esstisch Eiche', hours: 28, material: 900, price: 3400, minArea: 30 },
      { name: 'Einbauküche', hours: 90, material: 6500, price: 16000, minArea: 100 },
      { name: 'Innentüren (10 Stück)', hours: 120, material: 4200, price: 14500, minArea: 150 },
      { name: 'Ladeneinrichtung', hours: 380, material: 16000, price: 52000, minArea: 400 },
    ],
    scenario: ['Firma gründen', 'Werkstatt mieten oder bauen', 'Maschinen (Formatkreissäge, CNC)', 'Aufträge', 'Wachsen'],
  },
  {
    id: 'kfz', name: 'Kfz-Werkstatt', regulated: true, worker: 'Kfz-Techniker:in',
    orders: [
      { name: 'Ölwechsel + Service', hours: 2, material: 90, price: 260, minArea: 0 },
      { name: 'Bremsen erneuern', hours: 4, material: 280, price: 720, minArea: 30 },
      { name: 'Pickerl-/TÜV-Prüfung', hours: 1.5, material: 0, price: 120, minArea: 30 },
      { name: 'Kupplung tauschen', hours: 9, material: 650, price: 1700, minArea: 100 },
      { name: 'Flottenservice (12 Lieferwagen)', hours: 40, material: 1500, price: 5600, minArea: 150 },
    ],
    scenario: ['Firma gründen', 'Halle mieten', 'Hebebühnen', 'Aufträge', 'Zweite Filiale'],
  },
];

export const industry = (id: string) => INDUSTRIES.find((i) => i.id === id)!;
