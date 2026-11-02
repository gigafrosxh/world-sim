// Echte Casinos und Handelsketten. Nur Namen als Faktenangabe, keine Logos.

export interface Casino { name: string; lat: number; lon: number; town: string; a3: string }

export const CASINOS: Casino[] = [
  { name: 'Casino Baden', town: 'Baden bei Wien', lat: 48.0075, lon: 16.2345, a3: 'AUT' },
  { name: 'Casino Wien', town: 'Wien', lat: 48.2047, lon: 16.3718, a3: 'AUT' },
  { name: 'Casino Salzburg', town: 'Salzburg', lat: 47.8064, lon: 13.0083, a3: 'AUT' },
  { name: 'Casino Graz', town: 'Graz', lat: 47.0705, lon: 15.4386, a3: 'AUT' },
  { name: 'Casino Innsbruck', town: 'Innsbruck', lat: 47.2652, lon: 11.3964, a3: 'AUT' },
  { name: 'Casino Baden-Baden', town: 'Baden-Baden', lat: 48.7616, lon: 8.2399, a3: 'DEU' },
  { name: 'Spielbank Berlin', town: 'Berlin', lat: 52.5096, lon: 13.3756, a3: 'DEU' },
  { name: 'Spielbank Hamburg', town: 'Hamburg', lat: 53.5539, lon: 9.9688, a3: 'DEU' },
  { name: 'Spielbank Bad Wiessee', town: 'Bad Wiessee', lat: 47.7166, lon: 11.7303, a3: 'DEU' },
  { name: 'Grand Casino Baden', town: 'Baden (AG)', lat: 47.4746, lon: 8.3076, a3: 'CHE' },
  { name: 'Swiss Casinos Zürich', town: 'Zürich', lat: 47.3864, lon: 8.5172, a3: 'CHE' },
  { name: 'Casino de Monte-Carlo', town: 'Monaco', lat: 43.7393, lon: 7.4285, a3: 'MCO' },
  { name: 'Casino Barrière Deauville', town: 'Deauville', lat: 49.3586, lon: 0.0717, a3: 'FRA' },
  { name: 'Casinò di Venezia', town: 'Venedig', lat: 45.4442, lon: 12.3302, a3: 'ITA' },
  { name: 'Casino Sanremo', town: 'Sanremo', lat: 43.8157, lon: 7.7773, a3: 'ITA' },
  { name: 'Gran Casino Madrid', town: 'Madrid', lat: 40.4180, lon: -3.7020, a3: 'ESP' },
  { name: 'The Hippodrome Casino', town: 'London', lat: 51.5113, lon: -0.1295, a3: 'GBR' },
  { name: 'Bellagio', town: 'Las Vegas', lat: 36.1126, lon: -115.1767, a3: 'USA' },
  { name: 'Caesars Palace', town: 'Las Vegas', lat: 36.1162, lon: -115.1745, a3: 'USA' },
  { name: 'Borgata', town: 'Atlantic City', lat: 39.3777, lon: -74.4290, a3: 'USA' },
  { name: 'Foxwoods Resort Casino', town: 'Ledyard', lat: 41.4732, lon: -71.9599, a3: 'USA' },
  { name: 'Casino de Montréal', town: 'Montréal', lat: 45.5052, lon: -73.5257, a3: 'CAN' },
  { name: 'The Venetian Macao', town: 'Macau', lat: 22.1474, lon: 113.5635, a3: 'MAC' },
  { name: 'Casino Lisboa', town: 'Macau', lat: 22.1898, lon: 113.5442, a3: 'MAC' },
  { name: 'Marina Bay Sands', town: 'Singapur', lat: 1.2834, lon: 103.8607, a3: 'SGP' },
  { name: 'Crown Melbourne', town: 'Melbourne', lat: -37.8236, lon: 144.9585, a3: 'AUS' },
  { name: 'Sun City Resort', town: 'Sun City', lat: -25.3343, lon: 27.0926, a3: 'ZAF' },
  { name: 'Casino Estoril', town: 'Estoril', lat: 38.7057, lon: -9.3977, a3: 'PRT' },
];

export type ShopKind = 'baumarkt' | 'supermarkt' | 'elektronik' | 'moebel' | 'auto' | 'stahl' | 'bank';

export interface ShopItem { name: string; price: number; kind: 'private' | 'company' }

export const SHOP_ITEMS: Record<ShopKind, ShopItem[]> = {
  baumarkt: [
    { name: 'Akku-Bohrschrauber', price: 180, kind: 'company' },
    { name: 'Werkzeugkoffer komplett', price: 450, kind: 'company' },
    { name: 'Gartenmöbel-Set', price: 600, kind: 'private' },
    { name: 'Rasenmäher', price: 350, kind: 'private' },
  ],
  supermarkt: [
    { name: 'Wocheneinkauf', price: 85, kind: 'private' },
    { name: 'Party-Einkauf', price: 220, kind: 'private' },
    { name: 'Kaffee für die Firma (Monat)', price: 60, kind: 'company' },
  ],
  elektronik: [
    { name: 'Laptop', price: 1100, kind: 'private' },
    { name: 'Smartphone', price: 900, kind: 'private' },
    { name: 'Spielkonsole', price: 550, kind: 'private' },
    { name: 'Büro-PC mit Bildschirm', price: 1300, kind: 'company' },
  ],
  moebel: [
    { name: 'Sofa', price: 1200, kind: 'private' },
    { name: 'Küche (Grundausstattung)', price: 6500, kind: 'private' },
    { name: 'Büroeinrichtung', price: 3500, kind: 'company' },
  ],
  auto: [
    { name: 'Gebrauchtwagen (Kleinwagen)', price: 9000, kind: 'private' },
    { name: 'Neuwagen (Kompakt)', price: 28000, kind: 'private' },
    { name: 'Kastenwagen (gebraucht)', price: 18000, kind: 'company' },
    { name: 'Pritschenwagen 3,5 t', price: 42000, kind: 'company' },
  ],
  stahl: [
    { name: 'Stahlprofile (1 t)', price: 1250, kind: 'company' },
    { name: 'Bleche verzinkt (1 t)', price: 1400, kind: 'company' },
    { name: 'Schweißgerät MIG/MAG', price: 2600, kind: 'company' },
    { name: 'Metallbandsäge', price: 7800, kind: 'company' },
  ],
  bank: [],
};

export const SHOP_LABEL: Record<ShopKind, string> = {
  baumarkt: 'Baumarkt', supermarkt: 'Supermarkt', elektronik: 'Elektronikmarkt', moebel: 'Möbelhaus',
  auto: 'Autohaus', stahl: 'Stahlhandel', bank: 'Bank',
};

/** Handelsketten je Land (echte Namen). '*' = Standard für alle übrigen Länder. */
export const CHAINS: Record<string, Partial<Record<ShopKind, string[]>>> = {
  AUT: { baumarkt: ['OBI', 'Hornbach', 'Bauhaus'], supermarkt: ['Billa', 'Spar', 'Hofer', 'Lidl'], elektronik: ['MediaMarkt', 'Hartlauer'], moebel: ['XXXLutz', 'IKEA', 'Leiner'], auto: ['Porsche Inter Auto', 'Autohaus'], stahl: ['voestalpine Stahlhandel', 'Würth'], bank: ['Erste Bank', 'Raiffeisen'] },
  DEU: { baumarkt: ['OBI', 'Hornbach', 'Bauhaus', 'toom'], supermarkt: ['Rewe', 'Edeka', 'Aldi', 'Lidl'], elektronik: ['MediaMarkt', 'Saturn'], moebel: ['IKEA', 'XXXLutz', 'Höffner'], auto: ['Autohaus'], stahl: ['Klöckner & Co', 'thyssenkrupp Materials', 'Würth'], bank: ['Sparkasse', 'Volksbank'] },
  CHE: { baumarkt: ['Jumbo', 'Hornbach', 'Bauhaus'], supermarkt: ['Migros', 'Coop', 'Denner', 'Aldi Suisse'], elektronik: ['Interdiscount', 'MediaMarkt'], moebel: ['IKEA', 'Pfister', 'Conforama'], auto: ['AMAG'], stahl: ['Debrunner Acifer', 'Würth'], bank: ['UBS', 'Raiffeisen'] },
  USA: { baumarkt: ['The Home Depot', "Lowe's"], supermarkt: ['Walmart', 'Kroger', 'Costco', 'Target'], elektronik: ['Best Buy'], moebel: ['IKEA', 'Ashley'], auto: ['CarMax', 'AutoNation'], stahl: ['Ryerson', 'Fastenal'], bank: ['Chase', 'Bank of America'] },
  GBR: { baumarkt: ['B&Q', 'Wickes', 'Screwfix'], supermarkt: ['Tesco', "Sainsbury's", 'Asda', 'Aldi'], elektronik: ['Currys'], moebel: ['IKEA', 'DFS'], auto: ['Arnold Clark'], stahl: ['Kloeckner Metals UK'], bank: ['Barclays', 'HSBC'] },
  FRA: { baumarkt: ['Leroy Merlin', 'Castorama', 'Brico Dépôt'], supermarkt: ['Carrefour', 'E.Leclerc', 'Intermarché', 'Auchan'], elektronik: ['Fnac Darty', 'Boulanger'], moebel: ['IKEA', 'Conforama', 'But'], auto: ['Autohaus'], stahl: ['Descours & Cabaud'], bank: ['BNP Paribas', 'Crédit Agricole'] },
  ITA: { baumarkt: ['Leroy Merlin', 'Brico io', 'OBI'], supermarkt: ['Esselunga', 'Coop', 'Conad', 'Lidl'], elektronik: ['MediaWorld', 'Unieuro'], moebel: ['IKEA', 'Mondo Convenienza'], auto: ['Autohaus'], stahl: ['Marcegaglia'], bank: ['Intesa Sanpaolo', 'UniCredit'] },
  ESP: { baumarkt: ['Leroy Merlin', 'Bricomart'], supermarkt: ['Mercadona', 'Carrefour', 'Dia', 'Lidl'], elektronik: ['MediaMarkt', 'El Corte Inglés'], moebel: ['IKEA', 'Conforama'], auto: ['Autohaus'], stahl: ['Würth'], bank: ['Santander', 'BBVA'] },
  JPN: { baumarkt: ['Cainz', 'Kohnan'], supermarkt: ['Aeon', 'Ito-Yokado', '7-Eleven', 'Lawson'], elektronik: ['Yodobashi Camera', 'Bic Camera'], moebel: ['Nitori', 'IKEA'], auto: ['Toyota Store'], stahl: ['Monotaro'], bank: ['MUFG', 'Mizuho'] },
  CHN: { baumarkt: ['B&Q'], supermarkt: ['Walmart', 'Yonghui', 'Hema', 'RT-Mart'], elektronik: ['Suning', 'Gome'], moebel: ['IKEA', 'Red Star Macalline'], auto: ['BYD Store'], stahl: ['Baowu Trading'], bank: ['ICBC', 'Bank of China'] },
  IND: { baumarkt: ['Pepperfry Studio'], supermarkt: ['Reliance Fresh', 'DMart', 'More'], elektronik: ['Croma', 'Reliance Digital'], moebel: ['IKEA', 'Home Centre'], auto: ['Maruti Suzuki Arena'], stahl: ['Tata Steel Aashiyana'], bank: ['SBI', 'HDFC Bank'] },
  BRA: { baumarkt: ['Leroy Merlin', 'Telhanorte'], supermarkt: ['Carrefour', 'Pão de Açúcar', 'Assaí'], elektronik: ['Magazine Luiza', 'Casas Bahia'], moebel: ['Tok&Stok'], auto: ['Autohaus'], stahl: ['Gerdau'], bank: ['Itaú', 'Banco do Brasil'] },
  '*': { baumarkt: ['Baumarkt'], supermarkt: ['Carrefour', 'Lidl', 'Supermarkt'], elektronik: ['Elektronikmarkt'], moebel: ['IKEA', 'Möbelhaus'], auto: ['Autohaus'], stahl: ['Stahlhandel'], bank: ['Bank'] },
};
