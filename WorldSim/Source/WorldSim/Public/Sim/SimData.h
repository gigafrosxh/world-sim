// Spieltabellen (Länder, Gebäude, Maschinen, Branchen, Casinos, Handelsketten).
// Reines C++17 ohne Engine-Abhängigkeit, damit die Simulation auch außerhalb von Unreal testbar ist.
// Alle Werte sind gerundete Näherungen (Stand 2025/26).
#pragma once

#include <map>
#include <string>
#include <vector>

namespace WS
{
	struct CountryEconomy
	{
		std::string A3;
		std::string Currency;      // ISO 4217
		double PerEur = 1;         // 1 EUR = x Landeswährung
		double PriceLevel = 1;     // Baukostenniveau relativ zu Österreich
		double StartBudget = 0;
		double LivingCost = 0;     // bei Eltern / WG
		double LivingCostOwnHome = 0;
		double ConstructionWageHour = 0;
		double SkilledMonthly = 0; // Arbeitgeberkosten Fachkraft
		double LandIndustrial = 0; // pro m²
		double LandResidential = 0;
		double PurchaseFees = 0;   // Anteil
		double RentIndustrial = 0; // pro m² und Monat
		double TradeFee = 0;
		double NotaryFee = 0;
		double RegistryFee = 0;
		double MinCapitalPaid = 0;
		std::string LegalFormName;
		std::string SoleName;
		std::string RegistryName;
		bool RegulatedTrades = false;
		double LoanRate = 0.06;
		double PermitDaysFactor = 1;
		bool Real = true;
	};

	const std::map<std::string, CountryEconomy>& CountryTable();
	/** Ausgearbeitete Werte oder Schätzung aus BIP pro Kopf (USA als Basis). */
	CountryEconomy EconomyFor(const std::string& A3, double GdpMusd, double Pop);

	enum class Zone { Industrial, Residential, Commercial, Park };
	enum class Visual { None, Container, Workshop, Factory, Warehouse, House, TinyHouse, Apartment, Office, Shop, Casino, Tower };
	enum class Machine { Bagger, Turmkran, Mobilkran, Fahrmischer, Lkw };

	struct MachineInfo { std::string Name; double RentPerDay; };
	const MachineInfo& MachineData(Machine M);

	struct Phase { std::string Name; double Work; double Material; std::vector<Machine> Machines; };

	struct BuildingType
	{
		std::string Id;
		std::string Name;
		WS::Zone Zone;
		WS::Visual Visual;
		double Area, W, D, H;
		double Material;   // EUR (AT)
		double WorkHours;  // Personenstunden
		int DefaultCrew, MaxCrew;
		int PermitDays;
		std::vector<Phase> Phases;
		bool Workshop;
		std::string Description;
	};

	const std::vector<BuildingType>& BuildingTypes();
	const BuildingType& FindBuildingType(const std::string& Id);
	double CrewEfficiency(int Crew);
	double EstimateWorkDays(const BuildingType& B, int Crew);

	struct OrderTemplate { std::string Name; double Hours, Material, Price, MinArea; };
	struct Industry
	{
		std::string Id, Name, Worker;
		bool Regulated;
		std::vector<OrderTemplate> Orders;
		std::vector<std::string> Scenario;
	};
	const std::vector<Industry>& Industries();
	const Industry& FindIndustry(const std::string& Id);

	struct Casino { std::string Name, Town, A3; double Lat, Lon; };
	const std::vector<Casino>& Casinos();

	enum class ShopKind { Supermarkt, Baumarkt, Elektronik, Moebel, Auto, Stahl, Bank };
	struct ShopItem { std::string Name; double Price; bool Private; };
	const std::vector<ShopItem>& ShopItems(ShopKind K);
	const char* ShopLabel(ShopKind K);
	/** Echte Handelsketten je Land (nur Namen). */
	const std::vector<std::string>& Chains(const std::string& A3, ShopKind K);

	/** Deutsche Namen bekannter Städte (Natural Earth liefert englische). */
	std::string CityNameDe(const std::string& English);
}
