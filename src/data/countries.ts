// Länderdaten (Näherungswerte, Stand 2025/26). Beträge in Landeswährung.
// Quellen sinngemäß: nationale Statistikämter, Kollektivverträge/Mindestlöhne, Grundstücksmarktberichte.
// Alle Werte sind gerundete Spielwerte und keine Finanzberatung.

export interface CountryEconomy {
  a3: string;
  currency: string; // ISO 4217
  perEur: number; // Wechselkurs: 1 EUR = x Landeswährung
  priceLevel: number; // Baukosten-Niveau relativ zu Österreich
  startBudget: number; // Ersparnisse + Starthilfe nach der Matura
  livingCost: number; // Monatliche Lebenshaltung (bei Eltern/WG)
  livingCostOwnHome: number; // Monatliche Lebenshaltung im eigenen Haus (ohne Miete)
  constructionWageHour: number; // Arbeitgeberkosten pro Bauarbeiterstunde
  skilledMonthly: number; // Arbeitgeberkosten pro Fachkraft und Monat (inkl. Lohnnebenkosten, Sonderzahlungen anteilig)
  landIndustrial: number; // Preis pro m² Industriefläche (mittelgroße Stadt)
  landResidential: number; // Preis pro m² Wohnbaufläche (mittelgroße Stadt)
  purchaseFees: number; // Kaufnebenkosten (Grunderwerbsteuer, Notar, Grundbuch) als Anteil
  rentIndustrial: number; // Miete Halle pro m² und Monat
  tradeFee: number; // Gewerbeanmeldung
  notaryFee: number; // Gesellschaftsvertrag (GmbH)
  registryFee: number; // Firmenbuch / Handelsregister
  minCapitalPaid: number; // bei Gründung einzuzahlendes Stammkapital (GmbH)
  legalFormName: string; // Name der Kapitalgesellschaft
  soleName: string; // Name des Einzelunternehmens
  registryName: string;
  regulatedTrades: boolean; // Befähigungsnachweis für Handwerk nötig
  loanRate: number; // Jahreszins Kredit
  permitDaysFactor: number; // Baugenehmigung: Faktor auf Standarddauer
  real: boolean; // ausgearbeitete Werte (true) oder geschätzt (false)
}

const C = (o: Omit<CountryEconomy, 'real'>): CountryEconomy => ({ ...o, real: true });

export const COUNTRY_ECON: Record<string, CountryEconomy> = {
  AUT: C({ a3: 'AUT', currency: 'EUR', perEur: 1, priceLevel: 1, startBudget: 15000, livingCost: 650, livingCostOwnHome: 900, constructionWageHour: 34, skilledMonthly: 4600, landIndustrial: 110, landResidential: 420, purchaseFees: 0.095, rentIndustrial: 7, tradeFee: 0, notaryFee: 1400, registryFee: 350, minCapitalPaid: 5000, legalFormName: 'GmbH', soleName: 'Einzelunternehmen (e.U.)', registryName: 'Firmenbuch', regulatedTrades: true, loanRate: 0.055, permitDaysFactor: 1 }),
  DEU: C({ a3: 'DEU', currency: 'EUR', perEur: 1, priceLevel: 1.02, startBudget: 15000, livingCost: 700, livingCostOwnHome: 950, constructionWageHour: 38, skilledMonthly: 4800, landIndustrial: 100, landResidential: 380, purchaseFees: 0.1, rentIndustrial: 6.5, tradeFee: 40, notaryFee: 900, registryFee: 250, minCapitalPaid: 12500, legalFormName: 'GmbH', soleName: 'Einzelunternehmen', registryName: 'Handelsregister', regulatedTrades: true, loanRate: 0.055, permitDaysFactor: 1.2 }),
  CHE: C({ a3: 'CHE', currency: 'CHF', perEur: 0.94, priceLevel: 1.45, startBudget: 20000, livingCost: 1100, livingCostOwnHome: 1500, constructionWageHour: 60, skilledMonthly: 8200, landIndustrial: 420, landResidential: 1300, purchaseFees: 0.04, rentIndustrial: 13, tradeFee: 0, notaryFee: 1500, registryFee: 600, minCapitalPaid: 20000, legalFormName: 'GmbH', soleName: 'Einzelfirma', registryName: 'Handelsregister', regulatedTrades: false, loanRate: 0.035, permitDaysFactor: 1 }),
  USA: C({ a3: 'USA', currency: 'USD', perEur: 1.08, priceLevel: 1.1, startBudget: 20000, livingCost: 900, livingCostOwnHome: 1400, constructionWageHour: 48, skilledMonthly: 6200, landIndustrial: 55, landResidential: 220, purchaseFees: 0.03, rentIndustrial: 9, tradeFee: 100, notaryFee: 0, registryFee: 300, minCapitalPaid: 0, legalFormName: 'LLC', soleName: 'Sole Proprietorship', registryName: 'Secretary of State', regulatedTrades: false, loanRate: 0.085, permitDaysFactor: 0.8 }),
  GBR: C({ a3: 'GBR', currency: 'GBP', perEur: 0.85, priceLevel: 1.05, startBudget: 12000, livingCost: 750, livingCostOwnHome: 1000, constructionWageHour: 30, skilledMonthly: 3600, landIndustrial: 140, landResidential: 480, purchaseFees: 0.05, rentIndustrial: 8, tradeFee: 0, notaryFee: 0, registryFee: 50, minCapitalPaid: 1, legalFormName: 'Ltd', soleName: 'Sole Trader', registryName: 'Companies House', regulatedTrades: false, loanRate: 0.075, permitDaysFactor: 1.1 }),
  FRA: C({ a3: 'FRA', currency: 'EUR', perEur: 1, priceLevel: 1, startBudget: 14000, livingCost: 650, livingCostOwnHome: 900, constructionWageHour: 36, skilledMonthly: 4200, landIndustrial: 65, landResidential: 300, purchaseFees: 0.08, rentIndustrial: 6, tradeFee: 0, notaryFee: 0, registryFee: 250, minCapitalPaid: 1, legalFormName: 'SARL', soleName: 'Entreprise individuelle', registryName: 'RCS', regulatedTrades: false, loanRate: 0.055, permitDaysFactor: 1.2 }),
  ITA: C({ a3: 'ITA', currency: 'EUR', perEur: 1, priceLevel: 0.92, startBudget: 12000, livingCost: 600, livingCostOwnHome: 850, constructionWageHour: 30, skilledMonthly: 3400, landIndustrial: 65, landResidential: 250, purchaseFees: 0.1, rentIndustrial: 5, tradeFee: 0, notaryFee: 2000, registryFee: 300, minCapitalPaid: 1, legalFormName: 'S.r.l.', soleName: 'Ditta individuale', registryName: 'Registro delle imprese', regulatedTrades: false, loanRate: 0.06, permitDaysFactor: 1.4 }),
  ESP: C({ a3: 'ESP', currency: 'EUR', perEur: 1, priceLevel: 0.85, startBudget: 10000, livingCost: 550, livingCostOwnHome: 800, constructionWageHour: 26, skilledMonthly: 3000, landIndustrial: 60, landResidential: 260, purchaseFees: 0.1, rentIndustrial: 5, tradeFee: 0, notaryFee: 600, registryFee: 200, minCapitalPaid: 1, legalFormName: 'S.L.', soleName: 'Autónomo', registryName: 'Registro Mercantil', regulatedTrades: false, loanRate: 0.055, permitDaysFactor: 1.2 }),
  JPN: C({ a3: 'JPN', currency: 'JPY', perEur: 162, priceLevel: 1.0, startBudget: 2000000, livingCost: 90000, livingCostOwnHome: 140000, constructionWageHour: 4200, skilledMonthly: 480000, landIndustrial: 45000, landResidential: 160000, purchaseFees: 0.06, rentIndustrial: 1200, tradeFee: 0, notaryFee: 50000, registryFee: 150000, minCapitalPaid: 1, legalFormName: 'Kabushiki Kaisha', soleName: 'Kojin Jigyō', registryName: 'Legal Affairs Bureau', regulatedTrades: false, loanRate: 0.02, permitDaysFactor: 0.8 }),
  CHN: C({ a3: 'CHN', currency: 'CNY', perEur: 7.8, priceLevel: 0.45, startBudget: 80000, livingCost: 2500, livingCostOwnHome: 3500, constructionWageHour: 70, skilledMonthly: 11000, landIndustrial: 900, landResidential: 9000, purchaseFees: 0.04, rentIndustrial: 30, tradeFee: 0, notaryFee: 0, registryFee: 1000, minCapitalPaid: 0, legalFormName: 'Co., Ltd.', soleName: 'Individual business', registryName: 'SAMR', regulatedTrades: false, loanRate: 0.04, permitDaysFactor: 0.7 }),
  IND: C({ a3: 'IND', currency: 'INR', perEur: 92, priceLevel: 0.32, startBudget: 300000, livingCost: 12000, livingCostOwnHome: 18000, constructionWageHour: 120, skilledMonthly: 32000, landIndustrial: 6000, landResidential: 25000, purchaseFees: 0.07, rentIndustrial: 40, tradeFee: 2000, notaryFee: 5000, registryFee: 10000, minCapitalPaid: 0, legalFormName: 'Pvt Ltd', soleName: 'Sole Proprietorship', registryName: 'Registrar of Companies', regulatedTrades: false, loanRate: 0.11, permitDaysFactor: 1.3 }),
  BRA: C({ a3: 'BRA', currency: 'BRL', perEur: 6.2, priceLevel: 0.6, startBudget: 30000, livingCost: 2200, livingCostOwnHome: 3000, constructionWageHour: 40, skilledMonthly: 6500, landIndustrial: 350, landResidential: 2200, purchaseFees: 0.05, rentIndustrial: 25, tradeFee: 300, notaryFee: 1500, registryFee: 800, minCapitalPaid: 0, legalFormName: 'Ltda.', soleName: 'MEI / Empresário individual', registryName: 'Junta Comercial', regulatedTrades: false, loanRate: 0.14, permitDaysFactor: 1.3 }),
};

/** Für alle übrigen Länder: Werte aus den USA, skaliert nach BIP pro Kopf. */
export function economyFor(a3: string, gdpMusd?: number, pop?: number): CountryEconomy {
  const e = COUNTRY_ECON[a3];
  if (e) return e;
  const usa = COUNTRY_ECON.USA;
  const gdpPc = gdpMusd && pop ? (gdpMusd * 1e6) / pop : 12000;
  const f = Math.min(1.3, Math.max(0.06, gdpPc / 82000));
  const s = (v: number) => Math.round(v * f);
  return {
    ...usa, a3, real: false,
    priceLevel: Math.max(0.25, Math.min(1.2, 0.3 + 0.8 * f)),
    startBudget: s(usa.startBudget), livingCost: s(usa.livingCost), livingCostOwnHome: s(usa.livingCostOwnHome),
    constructionWageHour: Math.max(2, s(usa.constructionWageHour)), skilledMonthly: s(usa.skilledMonthly),
    landIndustrial: Math.max(5, s(usa.landIndustrial)), landResidential: Math.max(15, s(usa.landResidential)),
    rentIndustrial: Math.max(1, +(usa.rentIndustrial * f).toFixed(1)), tradeFee: s(usa.tradeFee), registryFee: s(usa.registryFee),
    legalFormName: 'Ltd.', soleName: 'Einzelunternehmen', registryName: 'Handelsregister',
    loanRate: f < 0.3 ? 0.12 : 0.08,
  };
}

/** Deutsche Namen bekannter Städte (Natural Earth liefert englische Namen). */
export const CITY_NAMES_DE: Record<string, string> = {
  Vienna: 'Wien', Munich: 'München', Cologne: 'Köln', Nuremberg: 'Nürnberg', Zurich: 'Zürich', Geneva: 'Genf',
  Rome: 'Rom', Milan: 'Mailand', Naples: 'Neapel', Venice: 'Venedig', Turin: 'Turin', Florence: 'Florenz',
  Prague: 'Prag', Warsaw: 'Warschau', Moscow: 'Moskau', Lisbon: 'Lissabon', Brussels: 'Brüssel', Copenhagen: 'Kopenhagen',
  Athens: 'Athen', Belgrade: 'Belgrad', Bucharest: 'Bukarest', 'Hanover': 'Hannover', Brunswick: 'Braunschweig',
  'Frankfurt': 'Frankfurt am Main', Bern: 'Bern', Basel: 'Basel', Lucerne: 'Luzern', Kiev: 'Kiew', Kyiv: 'Kiew',
  Beijing: 'Peking', 'The Hague': 'Den Haag', Seville: 'Sevilla', Tokyo: 'Tokio', 'Mexico City': 'Mexiko-Stadt',
  Cairo: 'Kairo', Singapore: 'Singapur',
};
