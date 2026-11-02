#include "Sim/SimData.h"

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace WS
{
	namespace
	{
		CountryEconomy C(const char* A3, const char* Cur, double PerEur, double PriceLevel, double Start, double Living, double LivingOwn,
			double Wage, double Skilled, double LandInd, double LandRes, double Fees, double Rent, double Trade, double Notary, double Registry,
			double MinCap, const char* Legal, const char* Sole, const char* RegistryName, bool Regulated, double LoanRate, double PermitFactor)
		{
			CountryEconomy E;
			E.A3 = A3; E.Currency = Cur; E.PerEur = PerEur; E.PriceLevel = PriceLevel; E.StartBudget = Start; E.LivingCost = Living;
			E.LivingCostOwnHome = LivingOwn; E.ConstructionWageHour = Wage; E.SkilledMonthly = Skilled; E.LandIndustrial = LandInd;
			E.LandResidential = LandRes; E.PurchaseFees = Fees; E.RentIndustrial = Rent; E.TradeFee = Trade; E.NotaryFee = Notary;
			E.RegistryFee = Registry; E.MinCapitalPaid = MinCap; E.LegalFormName = Legal; E.SoleName = Sole; E.RegistryName = RegistryName;
			E.RegulatedTrades = Regulated; E.LoanRate = LoanRate; E.PermitDaysFactor = PermitFactor; E.Real = true;
			return E;
		}
	}

	const std::map<std::string, CountryEconomy>& CountryTable()
	{
		static const std::map<std::string, CountryEconomy> T = [] {
			std::map<std::string, CountryEconomy> M;
			auto Add = [&](CountryEconomy E) { M[E.A3] = E; };
			Add(C("AUT", "EUR", 1, 1, 15000, 650, 900, 34, 4600, 110, 420, 0.095, 7, 0, 1400, 350, 5000, "GmbH", "Einzelunternehmen (e.U.)", "Firmenbuch", true, 0.055, 1));
			Add(C("DEU", "EUR", 1, 1.02, 15000, 700, 950, 38, 4800, 100, 380, 0.10, 6.5, 40, 900, 250, 12500, "GmbH", "Einzelunternehmen", "Handelsregister", true, 0.055, 1.2));
			Add(C("CHE", "CHF", 0.94, 1.45, 20000, 1100, 1500, 60, 8200, 420, 1300, 0.04, 13, 0, 1500, 600, 20000, "GmbH", "Einzelfirma", "Handelsregister", false, 0.035, 1));
			Add(C("USA", "USD", 1.08, 1.1, 20000, 900, 1400, 48, 6200, 55, 220, 0.03, 9, 100, 0, 300, 0, "LLC", "Sole Proprietorship", "Secretary of State", false, 0.085, 0.8));
			Add(C("GBR", "GBP", 0.85, 1.05, 12000, 750, 1000, 30, 3600, 140, 480, 0.05, 8, 0, 0, 50, 1, "Ltd", "Sole Trader", "Companies House", false, 0.075, 1.1));
			Add(C("FRA", "EUR", 1, 1, 14000, 650, 900, 36, 4200, 65, 300, 0.08, 6, 0, 0, 250, 1, "SARL", "Entreprise individuelle", "RCS", false, 0.055, 1.2));
			Add(C("ITA", "EUR", 1, 0.92, 12000, 600, 850, 30, 3400, 65, 250, 0.10, 5, 0, 2000, 300, 1, "S.r.l.", "Ditta individuale", "Registro delle imprese", false, 0.06, 1.4));
			Add(C("ESP", "EUR", 1, 0.85, 10000, 550, 800, 26, 3000, 60, 260, 0.10, 5, 0, 600, 200, 1, "S.L.", "Autonomo", "Registro Mercantil", false, 0.055, 1.2));
			Add(C("JPN", "JPY", 162, 1.0, 2000000, 90000, 140000, 4200, 480000, 45000, 160000, 0.06, 1200, 0, 50000, 150000, 1, "Kabushiki Kaisha", "Kojin Jigyo", "Legal Affairs Bureau", false, 0.02, 0.8));
			Add(C("CHN", "CNY", 7.8, 0.45, 80000, 2500, 3500, 70, 11000, 900, 9000, 0.04, 30, 0, 0, 1000, 0, "Co., Ltd.", "Individual business", "SAMR", false, 0.04, 0.7));
			Add(C("IND", "INR", 92, 0.32, 300000, 12000, 18000, 120, 32000, 6000, 25000, 0.07, 40, 2000, 5000, 10000, 0, "Pvt Ltd", "Sole Proprietorship", "Registrar of Companies", false, 0.11, 1.3));
			Add(C("BRA", "BRL", 6.2, 0.6, 30000, 2200, 3000, 40, 6500, 350, 2200, 0.05, 25, 300, 1500, 800, 0, "Ltda.", "MEI / Empresario individual", "Junta Comercial", false, 0.14, 1.3));
			return M;
		}();
		return T;
	}

	CountryEconomy EconomyFor(const std::string& A3, double GdpMusd, double Pop)
	{
		const auto& T = CountryTable();
		if (auto It = T.find(A3); It != T.end()) return It->second;
		CountryEconomy E = T.at("USA");
		const double GdpPc = (GdpMusd > 0 && Pop > 0) ? GdpMusd * 1e6 / Pop : 12000;
		const double F = std::clamp(GdpPc / 82000, 0.06, 1.3);
		auto S = [F](double V) { return std::round(V * F); };
		E.A3 = A3;
		E.Real = false;
		E.PriceLevel = std::clamp(0.3 + 0.8 * F, 0.25, 1.2);
		E.StartBudget = S(E.StartBudget);
		E.LivingCost = S(E.LivingCost);
		E.LivingCostOwnHome = S(E.LivingCostOwnHome);
		E.ConstructionWageHour = std::max(2.0, S(E.ConstructionWageHour));
		E.SkilledMonthly = S(E.SkilledMonthly);
		E.LandIndustrial = std::max(5.0, S(E.LandIndustrial));
		E.LandResidential = std::max(15.0, S(E.LandResidential));
		E.RentIndustrial = std::max(1.0, std::round(E.RentIndustrial * F * 10) / 10);
		E.TradeFee = S(E.TradeFee);
		E.RegistryFee = S(E.RegistryFee);
		E.LegalFormName = "Ltd.";
		E.SoleName = "Einzelunternehmen";
		E.RegistryName = "Handelsregister";
		E.LoanRate = F < 0.3 ? 0.12 : 0.08;
		return E;
	}

	const MachineInfo& MachineData(Machine M)
	{
		static const MachineInfo Data[] = {
			{"Bagger", 380}, {"Turmdrehkran", 650}, {"Mobilkran", 900}, {"Betonmischer", 220}, {"Lkw", 300},
		};
		return Data[static_cast<int>(M)];
	}

	namespace
	{
		using enum Machine;
		const std::vector<Phase> StandardPhases = {
			{"Erdarbeiten", 0.08, 0.04, {Bagger, Lkw}},
			{"Fundament", 0.12, 0.15, {Fahrmischer, Bagger}},
			{"Rohbau", 0.30, 0.38, {Turmkran}},
			{"Dach & Fassade", 0.20, 0.23, {Turmkran}},
			{"Haustechnik", 0.15, 0.12, {}},
			{"Innenausbau", 0.13, 0.08, {}},
			{"Abnahme", 0.02, 0.0, {}},
		};
		const std::vector<Phase> ModulePhases = {
			{"Punktfundamente", 0.3, 0.1, {Bagger}},
			{"Anlieferung & Aufstellen", 0.4, 0.8, {Mobilkran, Lkw}},
			{"Anschlüsse", 0.3, 0.1, {}},
		};
	}

	const std::vector<BuildingType>& BuildingTypes()
	{
		static const std::vector<BuildingType> T = {
			{"container", "Container-Werkstatt (40 m²)", Zone::Industrial, Visual::Container, 40, 12, 5, 3, 16000, 160, 2, 4, 14, ModulePhases, true, "Günstiger Einstieg: zwei Seecontainer mit Strom und Werkbank. Nur kleine Aufträge möglich."},
			{"werkstatt", "Werkstatt (200 m²)", Zone::Industrial, Visual::Workshop, 200, 20, 10, 6, 120000, 3000, 6, 12, 60, StandardPhases, true, "Gemauerte Werkstatt mit Rolltor und kleinem Büro. Platz für bis zu 8 Leute."},
			{"lager", "Lagerhalle (1.000 m²)", Zone::Industrial, Visual::Warehouse, 1000, 40, 25, 9, 520000, 8000, 10, 20, 75, StandardPhases, false, "Stahlhalle mit Laderampen. Für Material und Fertigware."},
			{"halle", "Produktionshalle (800 m²)", Zone::Industrial, Visual::Factory, 800, 40, 20, 9, 450000, 9000, 10, 20, 90, StandardPhases, true, "Halle mit Sheddach, Bürotrakt und Schornstein."},
			{"kranhalle", "Halle mit Hallenkran (2.000 m²)", Zone::Industrial, Visual::Factory, 2000, 50, 40, 14, 1400000, 22000, 14, 30, 120, StandardPhases, true, "Große Industriehalle mit 10-t-Brückenkran."},
			{"tiny", "Fertigteil-Tiny-House (35 m²)", Zone::Residential, Visual::TinyHouse, 35, 9, 4.5, 4, 45000, 500, 3, 5, 21, ModulePhases, false, "Kleines Holz-Fertighaus. Schnell gebaut, günstig."},
			{"efh", "Einfamilienhaus (140 m²)", Zone::Residential, Visual::House, 140, 12, 10, 8, 230000, 5500, 5, 10, 60, StandardPhases, false, "Massivhaus mit Satteldach, zwei Geschoße."},
		};
		return T;
	}

	const BuildingType& FindBuildingType(const std::string& Id)
	{
		for (const auto& B : BuildingTypes())
			if (B.Id == Id) return B;
		throw std::out_of_range("Unbekannter Gebaeudetyp " + Id);
	}

	double CrewEfficiency(int Crew) { return std::pow(std::max(1, Crew), 0.85); }
	double EstimateWorkDays(const BuildingType& B, int Crew) { return B.WorkHours / (CrewEfficiency(Crew) * 8); }

	const std::vector<Industry>& Industries()
	{
		static const std::vector<Industry> T = {
			{"schlosserei", "Schlosserei / Metallbau", "Schlosser:in", true,
				{{"Reparatur Gartentor", 5, 40, 420, 0}, {"Treppengeländer (6 m)", 32, 850, 3600, 0}, {"Schiebetor verzinkt", 40, 1600, 5200, 30},
				 {"Carport Stahl", 70, 2600, 8900, 100}, {"Außentreppe Stahl", 140, 5200, 17500, 150}, {"Stahlbühne für Lagerhalle", 320, 14000, 42000, 400},
				 {"Tragwerk Hallenanbau", 900, 46000, 128000, 1500}},
				{"Firma gründen", "Werkstatt mieten oder Industriegrundstück kaufen", "Baugenehmigung + Bau", "Personal einstellen", "Aufträge annehmen", "Wachsen: größere Halle, Hallenkran"}},
			{"tischlerei", "Tischlerei", "Tischler:in", true,
				{{"Regal nach Maß", 10, 250, 1100, 0}, {"Esstisch Eiche", 28, 900, 3400, 30}, {"Einbauküche", 90, 6500, 16000, 100},
				 {"Innentüren (10 Stück)", 120, 4200, 14500, 150}, {"Ladeneinrichtung", 380, 16000, 52000, 400}},
				{"Firma gründen", "Werkstatt mieten oder bauen", "Maschinen", "Aufträge", "Wachsen"}},
			{"kfz", "Kfz-Werkstatt", "Kfz-Techniker:in", true,
				{{"Ölwechsel + Service", 2, 90, 260, 0}, {"Bremsen erneuern", 4, 280, 720, 30}, {"Pickerl-/TÜV-Prüfung", 1.5, 0, 120, 30},
				 {"Kupplung tauschen", 9, 650, 1700, 100}, {"Flottenservice (12 Lieferwagen)", 40, 1500, 5600, 150}},
				{"Firma gründen", "Halle mieten", "Hebebühnen", "Aufträge", "Zweite Filiale"}},
		};
		return T;
	}

	const Industry& FindIndustry(const std::string& Id)
	{
		for (const auto& I : Industries())
			if (I.Id == Id) return I;
		throw std::out_of_range("Unbekannte Branche " + Id);
	}

	const std::vector<Casino>& Casinos()
	{
		static const std::vector<Casino> T = {
			{"Casino Baden", "Baden bei Wien", "AUT", 48.0075, 16.2345}, {"Casino Wien", "Wien", "AUT", 48.2047, 16.3718},
			{"Casino Salzburg", "Salzburg", "AUT", 47.8064, 13.0083}, {"Casino Graz", "Graz", "AUT", 47.0705, 15.4386},
			{"Casino Innsbruck", "Innsbruck", "AUT", 47.2652, 11.3964}, {"Casino Baden-Baden", "Baden-Baden", "DEU", 48.7616, 8.2399},
			{"Spielbank Berlin", "Berlin", "DEU", 52.5096, 13.3756}, {"Spielbank Hamburg", "Hamburg", "DEU", 53.5539, 9.9688},
			{"Spielbank Bad Wiessee", "Bad Wiessee", "DEU", 47.7166, 11.7303}, {"Grand Casino Baden", "Baden (AG)", "CHE", 47.4746, 8.3076},
			{"Swiss Casinos Zürich", "Zürich", "CHE", 47.3864, 8.5172}, {"Casino de Monte-Carlo", "Monaco", "MCO", 43.7393, 7.4285},
			{"Casino Barriere Deauville", "Deauville", "FRA", 49.3586, 0.0717}, {"Casino di Venezia", "Venedig", "ITA", 45.4442, 12.3302},
			{"Casino Sanremo", "Sanremo", "ITA", 43.8157, 7.7773}, {"Gran Casino Madrid", "Madrid", "ESP", 40.4180, -3.7020},
			{"The Hippodrome Casino", "London", "GBR", 51.5113, -0.1295}, {"Bellagio", "Las Vegas", "USA", 36.1126, -115.1767},
			{"Caesars Palace", "Las Vegas", "USA", 36.1162, -115.1745}, {"Borgata", "Atlantic City", "USA", 39.3777, -74.4290},
			{"Foxwoods Resort Casino", "Ledyard", "USA", 41.4732, -71.9599}, {"Casino de Montreal", "Montreal", "CAN", 45.5052, -73.5257},
			{"The Venetian Macao", "Macau", "MAC", 22.1474, 113.5635}, {"Casino Lisboa", "Macau", "MAC", 22.1898, 113.5442},
			{"Marina Bay Sands", "Singapur", "SGP", 1.2834, 103.8607}, {"Crown Melbourne", "Melbourne", "AUS", -37.8236, 144.9585},
			{"Sun City Resort", "Sun City", "ZAF", -25.3343, 27.0926}, {"Casino Estoril", "Estoril", "PRT", 38.7057, -9.3977},
		};
		return T;
	}

	const std::vector<ShopItem>& ShopItems(ShopKind K)
	{
		static const std::map<ShopKind, std::vector<ShopItem>> T = {
			{ShopKind::Baumarkt, {{"Akku-Bohrschrauber", 180, false}, {"Werkzeugkoffer komplett", 450, false}, {"Gartenmöbel-Set", 600, true}, {"Rasenmäher", 350, true}}},
			{ShopKind::Supermarkt, {{"Wocheneinkauf", 85, true}, {"Party-Einkauf", 220, true}, {"Kaffee für die Firma (Monat)", 60, false}}},
			{ShopKind::Elektronik, {{"Laptop", 1100, true}, {"Smartphone", 900, true}, {"Spielkonsole", 550, true}, {"Büro-PC mit Bildschirm", 1300, false}}},
			{ShopKind::Moebel, {{"Sofa", 1200, true}, {"Küche (Grundausstattung)", 6500, true}, {"Büroeinrichtung", 3500, false}}},
			{ShopKind::Auto, {{"Gebrauchtwagen (Kleinwagen)", 9000, true}, {"Neuwagen (Kompakt)", 28000, true}, {"Kastenwagen (gebraucht)", 18000, false}, {"Pritschenwagen 3,5 t", 42000, false}}},
			{ShopKind::Stahl, {{"Stahlprofile (1 t)", 1250, false}, {"Bleche verzinkt (1 t)", 1400, false}, {"Schweißgerät MIG/MAG", 2600, false}, {"Metallbandsäge", 7800, false}}},
			{ShopKind::Bank, {}},
		};
		return T.at(K);
	}

	const char* ShopLabel(ShopKind K)
	{
		static const char* L[] = {"Supermarkt", "Baumarkt", "Elektronikmarkt", "Möbelhaus", "Autohaus", "Stahlhandel", "Bank"};
		return L[static_cast<int>(K)];
	}

	const std::vector<std::string>& Chains(const std::string& A3, ShopKind K)
	{
		using SK = ShopKind;
		using Row = std::map<SK, std::vector<std::string>>;
		static const std::map<std::string, Row> T = {
			{"AUT", {{SK::Baumarkt, {"OBI", "Hornbach", "Bauhaus"}}, {SK::Supermarkt, {"Billa", "Spar", "Hofer", "Lidl"}}, {SK::Elektronik, {"MediaMarkt", "Hartlauer"}}, {SK::Moebel, {"XXXLutz", "IKEA", "Leiner"}}, {SK::Auto, {"Porsche Inter Auto", "Autohaus"}}, {SK::Stahl, {"voestalpine Stahlhandel", "Würth"}}, {SK::Bank, {"Erste Bank", "Raiffeisen"}}}},
			{"DEU", {{SK::Baumarkt, {"OBI", "Hornbach", "Bauhaus", "toom"}}, {SK::Supermarkt, {"Rewe", "Edeka", "Aldi", "Lidl"}}, {SK::Elektronik, {"MediaMarkt", "Saturn"}}, {SK::Moebel, {"IKEA", "XXXLutz", "Höffner"}}, {SK::Auto, {"Autohaus"}}, {SK::Stahl, {"Klöckner & Co", "thyssenkrupp Materials", "Würth"}}, {SK::Bank, {"Sparkasse", "Volksbank"}}}},
			{"CHE", {{SK::Baumarkt, {"Jumbo", "Hornbach", "Bauhaus"}}, {SK::Supermarkt, {"Migros", "Coop", "Denner", "Aldi Suisse"}}, {SK::Elektronik, {"Interdiscount", "MediaMarkt"}}, {SK::Moebel, {"IKEA", "Pfister", "Conforama"}}, {SK::Auto, {"AMAG"}}, {SK::Stahl, {"Debrunner Acifer", "Würth"}}, {SK::Bank, {"UBS", "Raiffeisen"}}}},
			{"USA", {{SK::Baumarkt, {"The Home Depot", "Lowe's"}}, {SK::Supermarkt, {"Walmart", "Kroger", "Costco", "Target"}}, {SK::Elektronik, {"Best Buy"}}, {SK::Moebel, {"IKEA", "Ashley"}}, {SK::Auto, {"CarMax", "AutoNation"}}, {SK::Stahl, {"Ryerson", "Fastenal"}}, {SK::Bank, {"Chase", "Bank of America"}}}},
			{"GBR", {{SK::Baumarkt, {"B&Q", "Wickes", "Screwfix"}}, {SK::Supermarkt, {"Tesco", "Sainsbury's", "Asda", "Aldi"}}, {SK::Elektronik, {"Currys"}}, {SK::Moebel, {"IKEA", "DFS"}}, {SK::Auto, {"Arnold Clark"}}, {SK::Stahl, {"Klöckner Metals UK"}}, {SK::Bank, {"Barclays", "HSBC"}}}},
			{"FRA", {{SK::Baumarkt, {"Leroy Merlin", "Castorama", "Brico Depot"}}, {SK::Supermarkt, {"Carrefour", "E.Leclerc", "Intermarche", "Auchan"}}, {SK::Elektronik, {"Fnac Darty", "Boulanger"}}, {SK::Moebel, {"IKEA", "Conforama", "But"}}, {SK::Auto, {"Autohaus"}}, {SK::Stahl, {"Descours & Cabaud"}}, {SK::Bank, {"BNP Paribas", "Credit Agricole"}}}},
			{"ITA", {{SK::Baumarkt, {"Leroy Merlin", "Brico io", "OBI"}}, {SK::Supermarkt, {"Esselunga", "Coop", "Conad", "Lidl"}}, {SK::Elektronik, {"MediaWorld", "Unieuro"}}, {SK::Moebel, {"IKEA", "Mondo Convenienza"}}, {SK::Auto, {"Autohaus"}}, {SK::Stahl, {"Marcegaglia"}}, {SK::Bank, {"Intesa Sanpaolo", "UniCredit"}}}},
			{"ESP", {{SK::Baumarkt, {"Leroy Merlin", "Bricomart"}}, {SK::Supermarkt, {"Mercadona", "Carrefour", "Dia", "Lidl"}}, {SK::Elektronik, {"MediaMarkt", "El Corte Ingles"}}, {SK::Moebel, {"IKEA", "Conforama"}}, {SK::Auto, {"Autohaus"}}, {SK::Stahl, {"Würth"}}, {SK::Bank, {"Santander", "BBVA"}}}},
			{"JPN", {{SK::Baumarkt, {"Cainz", "Kohnan"}}, {SK::Supermarkt, {"Aeon", "Ito-Yokado", "7-Eleven", "Lawson"}}, {SK::Elektronik, {"Yodobashi Camera", "Bic Camera"}}, {SK::Moebel, {"Nitori", "IKEA"}}, {SK::Auto, {"Toyota Store"}}, {SK::Stahl, {"Monotaro"}}, {SK::Bank, {"MUFG", "Mizuho"}}}},
			{"CHN", {{SK::Baumarkt, {"B&Q"}}, {SK::Supermarkt, {"Walmart", "Yonghui", "Hema", "RT-Mart"}}, {SK::Elektronik, {"Suning", "Gome"}}, {SK::Moebel, {"IKEA", "Red Star Macalline"}}, {SK::Auto, {"BYD Store"}}, {SK::Stahl, {"Baowu Trading"}}, {SK::Bank, {"ICBC", "Bank of China"}}}},
			{"IND", {{SK::Baumarkt, {"Pepperfry Studio"}}, {SK::Supermarkt, {"Reliance Fresh", "DMart", "More"}}, {SK::Elektronik, {"Croma", "Reliance Digital"}}, {SK::Moebel, {"IKEA", "Home Centre"}}, {SK::Auto, {"Maruti Suzuki Arena"}}, {SK::Stahl, {"Tata Steel Aashiyana"}}, {SK::Bank, {"SBI", "HDFC Bank"}}}},
			{"BRA", {{SK::Baumarkt, {"Leroy Merlin", "Telhanorte"}}, {SK::Supermarkt, {"Carrefour", "Pao de Acucar", "Assai"}}, {SK::Elektronik, {"Magazine Luiza", "Casas Bahia"}}, {SK::Moebel, {"Tok&Stok"}}, {SK::Auto, {"Autohaus"}}, {SK::Stahl, {"Gerdau"}}, {SK::Bank, {"Itau", "Banco do Brasil"}}}},
			{"*", {{SK::Baumarkt, {"Baumarkt"}}, {SK::Supermarkt, {"Carrefour", "Lidl", "Supermarkt"}}, {SK::Elektronik, {"Elektronikmarkt"}}, {SK::Moebel, {"IKEA", "Möbelhaus"}}, {SK::Auto, {"Autohaus"}}, {SK::Stahl, {"Stahlhandel"}}, {SK::Bank, {"Bank"}}}},
		};
		auto It = T.find(A3);
		const Row& R = It != T.end() ? It->second : T.at("*");
		auto K2 = R.find(K);
		return K2 != R.end() ? K2->second : T.at("*").at(K);
	}

	std::string CityNameDe(const std::string& E)
	{
		static const std::map<std::string, std::string> T = {
			{"Vienna", "Wien"}, {"Munich", "München"}, {"Cologne", "Köln"}, {"Nuremberg", "Nürnberg"}, {"Zurich", "Zürich"}, {"Geneva", "Genf"},
			{"Rome", "Rom"}, {"Milan", "Mailand"}, {"Naples", "Neapel"}, {"Venice", "Venedig"}, {"Florence", "Florenz"}, {"Prague", "Prag"},
			{"Warsaw", "Warschau"}, {"Moscow", "Moskau"}, {"Lisbon", "Lissabon"}, {"Brussels", "Brüssel"}, {"Copenhagen", "Kopenhagen"},
			{"Athens", "Athen"}, {"Belgrade", "Belgrad"}, {"Bucharest", "Bukarest"}, {"Hanover", "Hannover"}, {"Kiev", "Kiew"}, {"Kyiv", "Kiew"},
			{"Beijing", "Peking"}, {"The Hague", "Den Haag"}, {"Tokyo", "Tokio"}, {"Cairo", "Kairo"}, {"Singapore", "Singapur"},
		};
		auto It = T.find(E);
		return It != T.end() ? It->second : E;
	}
}
