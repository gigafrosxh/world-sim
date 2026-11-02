#include "Sim/Game.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <istream>
#include <ostream>
#include <sstream>

namespace WS
{
	const double Speeds[7] = {1, 2, 5, 10, 100, 1000, 10000};

	namespace
	{
		const double StartTime = 1782885600; // 1. Juli 2026, 06:00 UTC (≈ 08:00 MESZ)
		constexpr double StepSeconds = 600;   // 10 Minuten Spielzeit pro Simulationsschritt

		[[noreturn]] void Fail(const std::string& Msg) { throw GameError(Msg); }
	}

	// ---------- Welt ----------
	World& World::Get()
	{
		static World W;
		return W;
	}

	void World::Register(const std::vector<RawCity>& Cities, const std::vector<CountryInfo>& CountryList)
	{
		LocList.clear();
		LocIndex.clear();
		Countries.clear();
		Layouts.clear();
		for (const auto& C : CountryList) Countries[C.A3] = C;
		auto Add = [&](Location L) {
			if (LocIndex.count(L.Id)) return;
			LocIndex[L.Id] = LocList.size();
			LocList.push_back(std::move(L));
		};
		for (const auto& C : Cities) Add({C.A3 + ":" + C.Name, CityNameDe(C.Name), C.A3, C.Lat, C.Lon, C.Pop, C.Capital});
		// Casino-Orte ohne passende Stadt als kleine Orte ergänzen
		for (const auto& Cs : WS::Casinos())
		{
			bool Near = false;
			for (const auto& L : LocList)
				if (DistanceKm(L.Lat, L.Lon, Cs.Lat, Cs.Lon) < 20) { Near = true; break; }
			if (!Near) Add({Cs.A3 + ":" + Cs.Town, Cs.Town, Cs.A3, Cs.Lat, Cs.Lon, 40000, false});
		}
	}

	const Location& World::Loc(const std::string& Id) const
	{
		auto It = LocIndex.find(Id);
		if (It == LocIndex.end()) throw std::out_of_range("Unbekannter Ort " + Id);
		return LocList[It->second];
	}

	const CountryInfo* World::Country(const std::string& A3) const
	{
		auto It = Countries.find(A3);
		return It != Countries.end() ? &It->second : nullptr;
	}

	std::string World::CountryName(const std::string& A3) const
	{
		const CountryInfo* C = Country(A3);
		return C ? C->NameDe : A3;
	}

	CountryEconomy World::Econ(const std::string& A3) const
	{
		const CountryInfo* C = Country(A3);
		return EconomyFor(A3, C ? C->Gdp : 0, C ? C->Pop : 0);
	}

	const CityLayout& World::Layout(const std::string& LocId)
	{
		auto It = Layouts.find(LocId);
		if (It != Layouts.end()) return It->second;
		const Location& L = Loc(LocId);
		return Layouts.emplace(LocId, GenerateCity(L, Econ(L.A3))).first->second;
	}

	std::string World::LocIdOfPlot(const std::string& PlotId) { return PlotId.substr(0, PlotId.find('#')); }

	const Plot& World::PlotById(const std::string& PlotId)
	{
		const auto Hash = PlotId.find('#');
		const CityLayout& L = Layout(PlotId.substr(0, Hash));
		return L.Plots.at(static_cast<size_t>(std::stoi(PlotId.substr(Hash + 1))));
	}

	// ---------- Kalender ----------
	CivilDate ToCivil(double Epoch)
	{
		const long long Secs = static_cast<long long>(std::floor(Epoch));
		long long Z = static_cast<long long>(std::floor(Secs / 86400.0));
		const long long Rem = Secs - Z * 86400;
		const int Weekday = static_cast<int>(((Z % 7) + 11) % 7); // 1970-01-01 war ein Donnerstag
		Z += 719468;
		const long long Era = (Z >= 0 ? Z : Z - 146096) / 146097;
		const unsigned Doe = static_cast<unsigned>(Z - Era * 146097);
		const unsigned Yoe = (Doe - Doe / 1460 + Doe / 36524 - Doe / 146096) / 365;
		const unsigned Doy = Doe - (365 * Yoe + Yoe / 4 - Yoe / 100);
		const unsigned Mp = (5 * Doy + 2) / 153;
		const unsigned D = Doy - (153 * Mp + 2) / 5 + 1;
		const unsigned M = Mp < 10 ? Mp + 3 : Mp - 9;
		const int Y = static_cast<int>(Yoe) + static_cast<int>(Era) * 400 + (M <= 2);
		return {Y, static_cast<int>(M), static_cast<int>(D), static_cast<int>(Rem / 3600), static_cast<int>((Rem % 3600) / 60), Weekday};
	}

	double LocalTime(const GameState& S)
	{
		const double Lon = World::Get().Loc(S.Player.LocId).Lon;
		return S.T + std::round(Lon / 15) * 3600;
	}

	std::string FormatDate(double Epoch)
	{
		const CivilDate D = ToCivil(Epoch);
		char Buf[32];
		std::snprintf(Buf, sizeof Buf, "%02d.%02d.%04d", D.Day, D.Month, D.Year);
		return Buf;
	}

	std::string FormatMoney(double V, const std::string& Currency)
	{
		const bool Neg = V < 0;
		const double A = std::abs(V);
		const bool Cents = A < 1000;
		long long Whole = static_cast<long long>(Cents ? std::floor(A) : std::llround(A));
		std::string Digits = std::to_string(Whole);
		std::string Grouped;
		for (size_t I = 0; I < Digits.size(); ++I)
		{
			if (I && (Digits.size() - I) % 3 == 0) Grouped += '.';
			Grouped += Digits[I];
		}
		if (Cents)
		{
			char Buf[8];
			std::snprintf(Buf, sizeof Buf, ",%02d", static_cast<int>(std::llround((A - std::floor(A)) * 100)) % 100);
			Grouped += Buf;
		}
		static const std::map<std::string, std::string> Sym = {{"EUR", "€"}, {"USD", "$"}, {"GBP", "£"}, {"JPY", "¥"}, {"CHF", "CHF"}, {"CNY", "CN¥"}, {"INR", "₹"}, {"BRL", "R$"}};
		auto It = Sym.find(Currency);
		return std::string(Neg ? "-" : "") + (It != Sym.end() ? It->second : Currency) + " " + Grouped;
	}

	// ---------- Grundlagen ----------
	CountryEconomy Econ(const GameState& S) { return World::Get().Econ(S.Player.A3); }
	std::string Money(const GameState& S, double V) { return FormatMoney(V, Econ(S).Currency); }

	namespace
	{
		long long DayKeyOf(double Local) { return static_cast<long long>(std::floor(Local / 86400)); }
		long long MonthKeyOf(double Local)
		{
			const CivilDate D = ToCivil(Local);
			return D.Year * 12L + (D.Month - 1);
		}
		bool IsWorkTime(double Local)
		{
			const CivilDate D = ToCivil(Local);
			const double H = D.Hour + D.Minute / 60.0;
			return D.Weekday >= 1 && D.Weekday <= 5 && H >= 7 && H < 16;
		}
		void Pay(GameState& S, Account A, double Amount, const std::string& Text, Category Cat)
		{
			if (Amount > 0 && Balance(S, A) < Amount)
				Fail(std::string("Nicht genug Geld auf ") + (A == Account::Wallet ? "deinem Geldbörserl" : "dem Firmenkonto") + ". Benötigt: " + Money(S, Amount) + ".");
			Book(S, A, -Amount, Text, Cat);
		}
	}

	void Book(GameState& S, Account A, double Amount, const std::string& Text, Category Cat)
	{
		const double V = std::round(Amount * 100) / 100;
		(A == Account::Wallet ? S.Wallet : S.CompanyAcct) += V;
		S.Ledger.push_back({S.T, A, V, Text, Cat});
		if (S.Ledger.size() > 600) S.Ledger.erase(S.Ledger.begin(), S.Ledger.begin() + static_cast<std::ptrdiff_t>(S.Ledger.size() - 600));
	}

	double Balance(const GameState& S, Account A) { return A == Account::Wallet ? S.Wallet : S.CompanyAcct; }
	void Notify(GameState& S, const std::string& Text, NoticeKind Kind) { S.Notices.push_back({S.T, Text, Kind}); }

	GameState NewGame(const std::string& Name, const std::string& A3, const std::string& HomeId, const std::string& Color, int Difficulty)
	{
		const CountryEconomy E = World::Get().Econ(A3);
		const double Mult = Difficulty == 0 ? 0.5 : Difficulty == 2 ? 10 : 1;
		GameState S;
		S.T = StartTime;
		S.Player.Name = Name;
		S.Player.A3 = A3;
		S.Player.HomeId = HomeId;
		S.Player.LocId = HomeId;
		S.Player.Color = Color;
		const double Local = LocalTime(S);
		S.DayKey = DayKeyOf(Local);
		S.MonthKey = MonthKeyOf(Local);
		Book(S, Account::Wallet, std::round(E.StartBudget * Mult), "Startkapital: Ersparnisse & Starthilfe nach dem Schulabschluss", Category::Transfer);
		Notify(S, "Willkommen, " + Name + "! Du hast die Schule abgeschlossen. Was machst du aus deinem Startkapital?", NoticeKind::Good);
		return S;
	}

	// ---------- Firma ----------
	std::vector<FoundingStep> FoundingSteps(const CountryEconomy& E, bool Ltd, bool Regulated)
	{
		std::vector<FoundingStep> Steps;
		const double Insurance = std::round(650 * E.PerEur * E.PriceLevel);
		if (Ltd)
		{
			Steps.push_back({"notar", "Gesellschaftsvertrag beim Notar", "Gesellschaftsvertrag unterschreiben und beglaubigen lassen.", E.NotaryFee, 0, 7});
			Steps.push_back({"konto", "Firmenkonto eröffnen & Stammkapital einzahlen", "Das Mindest-Stammkapital wird vom Geldbörserl auf das Firmenkonto überwiesen.", 0, E.MinCapitalPaid, 5});
			Steps.push_back({"register", "Eintragung ins " + E.RegistryName, "Das Gericht prüft die Unterlagen und trägt die Firma ein.", E.RegistryFee, 0, 14});
		}
		else
			Steps.push_back({"konto", "Geschäftskonto eröffnen", "Getrenntes Konto für alle Firmenbuchungen.", 0, 0, 5});
		Steps.push_back({"gewerbe", "Gewerbeanmeldung",
			Regulated ? "Reglementiertes Gewerbe: Befähigungsnachweis nötig. Du stellst eine:n gewerberechtliche:n Geschäftsführer:in in Teilzeit an." : "Anmeldung bei der Behörde.",
			E.TradeFee, 0, Regulated ? 10 : 3});
		Steps.push_back({"versicherung", "Betriebshaftpflicht abschließen", "Jahresprämie für Schäden bei Kunden.", Insurance, 0, 2});
		return Steps;
	}

	void FoundCompany(GameState& S, const std::string& Name, const std::string& Color, const std::string& IndustryId, bool Ltd)
	{
		if (S.Company) Fail("Du hast bereits eine Firma.");
		const CountryEconomy E = Econ(S);
		const Industry& Ind = FindIndustry(IndustryId);
		const bool Regulated = Ind.Regulated && E.RegulatedTrades;
		Company C;
		C.Name = Name.empty() ? "Meine Firma" : Name;
		C.Color = Color;
		C.IndustryId = Ind.Id;
		C.Ltd = Ltd;
		C.Steps = FoundingSteps(E, Ltd, Regulated);
		C.ManagerNeeded = Regulated;
		S.Company = C;
		StartNextStep(S);
	}

	bool StartNextStep(GameState& S)
	{
		if (!S.Company || S.Company->Active) return false;
		Company& C = *S.Company;
		auto It = std::find_if(C.Steps.begin(), C.Steps.end(), [](const FoundingStep& St) { return St.DoneAt == 0; });
		if (It == C.Steps.end()) return false;
		if (It->StartedAt != 0) return true;
		const double Need = It->Fee + It->Capital;
		if (S.Wallet < Need)
		{
			Notify(S, "Gründung pausiert: Für „" + It->Label + "\" brauchst du " + Money(S, Need) + " im Geldbörserl.", NoticeKind::Bad);
			return false;
		}
		if (It->Fee > 0) Book(S, Account::Wallet, -It->Fee, "Gründung: " + It->Label, Category::Fees);
		if (It->Capital > 0)
		{
			Book(S, Account::Wallet, -It->Capital, "Stammkapital an Firma", Category::Transfer);
			Book(S, Account::Company, It->Capital, "Stammkapital vom Gesellschafter", Category::Transfer);
			C.EquityIn += It->Capital;
		}
		It->StartedAt = S.T;
		return true;
	}

	void TransferMoney(GameState& S, Account From, double Amount)
	{
		if (!S.Company) Fail("Du hast noch keine Firma.");
		if (!(Amount > 0)) Fail("Betrag muss größer als 0 sein.");
		if (From == Account::Wallet)
		{
			Pay(S, Account::Wallet, Amount, "Einlage in die Firma", Category::Transfer);
			Book(S, Account::Company, Amount, "Einlage vom Gesellschafter", Category::Transfer);
			S.Company->EquityIn += Amount;
		}
		else
		{
			Pay(S, Account::Company, Amount, "Entnahme / Gehalt an Inhaber:in", Category::Transfer);
			const double Tax = S.Company->Ltd ? 0.275 : 0.25; // vereinfacht
			Book(S, Account::Wallet, Amount, "Entnahme aus der Firma", Category::Transfer);
			Book(S, Account::Wallet, -Amount * Tax, "Steuer auf Entnahme (" + std::to_string(static_cast<int>(std::round(Tax * 100))) + " %)", Category::Fees);
		}
	}

	double RentedArea(const Plot& P)
	{
		return P.ForRent ? std::round((120 + P.Hue * 480) / 10) * 10 : std::round(P.W * P.D * 0.45);
	}

	double WorkshopArea(const GameState& S)
	{
		double Area = 0;
		for (const auto& [PlotId, O] : S.Plots)
		{
			if (O.Owner != Account::Company || S.T < O.UsableAt) continue;
			if (O.Rented || O.Building == "npc") Area = std::max(Area, RentedArea(World::Get().PlotById(PlotId)));
			else if (!O.Building.empty() && FindBuildingType(O.Building).Workshop) Area = std::max(Area, FindBuildingType(O.Building).Area);
		}
		return Area;
	}

	void SetEmployees(GameState& S, int N)
	{
		if (!S.Company || !S.Company->Active) Fail("Erst muss die Firma gegründet sein.");
		const int Max = static_cast<int>(std::floor(WorkshopArea(S) / 25));
		if (N > Max) Fail("Zu wenig Platz: In deiner Werkstatt haben maximal " + std::to_string(Max) + " Mitarbeiter:innen Platz (25 m² pro Person).");
		S.Company->Employees = std::max(0, N);
	}

	// ---------- Grundstücke ----------
	namespace
	{
		double NpcBuildingValue(const GameState& S, const Plot& P)
		{
			if (P.Npc == Visual::None) return 0;
			const CountryEconomy E = Econ(S);
			if (P.Npc == Visual::House) return std::round(BuildCost(E, FindBuildingType("efh")) * 0.75);
			return std::round(RentedArea(P) * 600 * MatScale(E));
		}
	}

	PlotPrice GetPlotPrice(const GameState& S, const std::string& PlotId)
	{
		World& W = World::Get();
		const Plot& P = W.PlotById(PlotId);
		const CityLayout& L = W.Layout(World::LocIdOfPlot(PlotId));
		const double Land = std::round(P.W * P.D * L.LandPrice(P.Zone));
		const double Building = NpcBuildingValue(S, P);
		const CountryEconomy E = W.Econ(W.Loc(L.Id).A3);
		const double Fees = std::round((Land + Building) * E.PurchaseFees);
		return {Land, Building, Fees, Land + Building + Fees, std::round(P.W * P.D)};
	}

	double MonthlyRent(const GameState& S, const std::string& PlotId)
	{
		(void)S;
		World& W = World::Get();
		const Plot& P = W.PlotById(PlotId);
		const CityLayout& L = W.Layout(World::LocIdOfPlot(PlotId));
		return std::round(RentedArea(P) * W.Econ(W.Loc(L.Id).A3).RentIndustrial * L.Factor);
	}

	void BuyPlot(GameState& S, const std::string& PlotId, Account Buyer)
	{
		const Plot& P = World::Get().PlotById(PlotId);
		if (S.Plots.count(PlotId)) Fail("Dieses Grundstück gehört bereits dir.");
		if (!P.ForSale) Fail("Dieses Grundstück steht nicht zum Verkauf.");
		if (Buyer == Account::Company && !(S.Company && S.Company->Active)) Fail("Deine Firma ist noch nicht fertig gegründet.");
		const PlotPrice Pr = GetPlotPrice(S, PlotId);
		if (Balance(S, Buyer) < Pr.Total) Fail("Nicht genug Geld. Benötigt: " + Money(S, Pr.Total) + ".");
		Book(S, Buyer, -(Pr.Land + Pr.Building), "Kauf Grundstück " + std::to_string(static_cast<int>(Pr.Area)) + " m² (" + World::Get().Loc(World::LocIdOfPlot(PlotId)).Name + ")", Category::Purchase);
		Book(S, Buyer, -Pr.Fees, "Kaufnebenkosten (Grunderwerbsteuer, Notar, Grundbuch)", Category::Fees);
		Ownership O;
		O.Owner = Buyer;
		O.Since = S.T;
		O.UsableAt = S.T + 21 * Day;
		O.Building = P.Npc != Visual::None ? "npc" : "";
		O.Paid = Pr.Total;
		S.Plots[PlotId] = O;
		Notify(S, "Kaufvertrag unterschrieben. Die Grundbuch-Eintragung dauert etwa 3 Wochen.", NoticeKind::Good);
	}

	void RentPlot(GameState& S, const std::string& PlotId)
	{
		const Plot& P = World::Get().PlotById(PlotId);
		if (!P.ForRent) Fail("Diese Halle ist nicht zu vermieten.");
		if (!(S.Company && S.Company->Active)) Fail("Mieten kann nur eine fertig gegründete Firma.");
		if (S.Plots.count(PlotId)) Fail("Bereits gemietet.");
		const double Rent = MonthlyRent(S, PlotId);
		Pay(S, Account::Company, Rent * 3, "Kaution Hallenmiete (3 Monatsmieten)", Category::Rent);
		Ownership O;
		O.Owner = Account::Company;
		O.Rented = true;
		O.Since = S.T;
		O.UsableAt = S.T + 7 * Day;
		O.Rent = Rent;
		O.Building = "npc";
		S.Plots[PlotId] = O;
		Notify(S, "Mietvertrag unterschrieben. Schlüsselübergabe in 7 Tagen. Miete: " + Money(S, Rent) + " pro Monat.", NoticeKind::Good);
	}

	double AssetValue(const GameState& S, const std::string& PlotId)
	{
		auto It = S.Plots.find(PlotId);
		if (It == S.Plots.end() || It->second.Rented) return 0;
		const PlotPrice Pr = GetPlotPrice(S, PlotId);
		double V = Pr.Land;
		if (It->second.Building == "npc") V += Pr.Building;
		else if (!It->second.Building.empty()) V += BuildCost(Econ(S), FindBuildingType(It->second.Building)) * 0.9;
		return std::round(V);
	}

	void SellPlot(GameState& S, const std::string& PlotId)
	{
		auto It = S.Plots.find(PlotId);
		if (It == S.Plots.end()) Fail("Gehört dir nicht.");
		for (const auto& P : S.Projects)
			if (P.PlotId == PlotId && P.State != ProjectState::Done) Fail("Auf dem Grundstück wird noch gebaut.");
		if (It->second.Rented)
		{
			Book(S, Account::Company, It->second.Rent * 3, "Kaution zurück (Mietende)", Category::Rent);
			S.Plots.erase(It);
			return;
		}
		const double Value = AssetValue(S, PlotId);
		Book(S, It->second.Owner, std::round(Value * 0.96), "Verkauf Grundstück (abzüglich Makler 4 %)", Category::Sale);
		S.Plots.erase(It);
		if (S.Player.Home == PlotId) S.Player.Home.clear();
	}

	PlotView GetPlotView(const GameState& S, const Plot& P)
	{
		const Project* Proj = nullptr;
		for (const auto& X : S.Projects)
			if (X.PlotId == P.Id && X.State != ProjectState::Done) Proj = &X;
		auto It = S.Plots.find(P.Id);
		if (It == S.Plots.end()) return {P.Npc, Proj, std::nullopt, false};
		Visual V = P.Npc;
		if (!It->second.Building.empty() && It->second.Building != "npc") V = FindBuildingType(It->second.Building).Visual;
		return {V, Proj, It->second.Owner, It->second.Rented};
	}

	void MoveIn(GameState& S, const std::string& PlotId)
	{
		if (!PlotId.empty())
		{
			auto It = S.Plots.find(PlotId);
			const Visual V = It != S.Plots.end() ? GetPlotView(S, World::Get().PlotById(PlotId)).Visual : Visual::None;
			if (It == S.Plots.end() || It->second.Owner != Account::Wallet || S.T < It->second.UsableAt || !(V == Visual::House || V == Visual::TinyHouse))
				Fail("Du kannst nur in ein fertiges eigenes Haus einziehen.");
		}
		S.Player.Home = PlotId;
		Notify(S, PlotId.empty() ? "Du wohnst wieder bei den Eltern / in der WG." : "Du bist in dein eigenes Haus eingezogen.");
	}

	// ---------- Bauen ----------
	double BuildCost(const CountryEconomy& E, const BuildingType& B, int Crew)
	{
		if (Crew < 1) Crew = B.DefaultCrew;
		const double Material = B.Material * MatScale(E);
		const double Labour = B.WorkHours * E.ConstructionWageHour;
		const double Days = B.WorkHours / (CrewEfficiency(Crew) * 8);
		double Machines = 0;
		for (const auto& Ph : B.Phases)
		{
			double PerDay = 0;
			for (Machine M : Ph.Machines) PerDay += MachineData(M).RentPerDay;
			Machines += PerDay * Days * Ph.Work;
		}
		return std::round(Material + Labour * std::pow(Crew, 0.15) + Machines * MatScale(E));
	}

	double PermitFee(const CountryEconomy& E, const BuildingType& B) { return std::round(std::max(250.0, B.Material * 0.006) * MatScale(E)); }
	int PermitDays(const CountryEconomy& E, const BuildingType& B) { return static_cast<int>(std::lround(B.PermitDays * E.PermitDaysFactor)); }

	std::optional<std::string> CanBuild(const GameState& S, const std::string& PlotId, const std::string& TypeId)
	{
		auto It = S.Plots.find(PlotId);
		const Plot& P = World::Get().PlotById(PlotId);
		const BuildingType& B = FindBuildingType(TypeId);
		if (It == S.Plots.end() || It->second.Rented) return "Das Grundstück gehört dir nicht.";
		if (S.T < It->second.UsableAt) return "Die Grundbuch-Eintragung ist noch nicht abgeschlossen.";
		if (!It->second.Building.empty()) return "Auf dem Grundstück steht bereits ein Gebäude.";
		for (const auto& X : S.Projects)
			if (X.PlotId == PlotId && X.State != ProjectState::Done) return "Hier läuft bereits ein Bauprojekt.";
		if (P.Zone != B.Zone) return std::string("Falsche Flächenwidmung: ") + B.Name + " braucht " + (B.Zone == Zone::Industrial ? "Industrie/Gewerbe." : "Wohnbau.");
		const bool Fits = (B.W <= P.W - 4 && B.D <= P.D - 4) || (B.D <= P.W - 4 && B.W <= P.D - 4);
		if (!Fits) return "Das Gebäude ist zu groß für dieses Grundstück.";
		if (It->second.Owner == Account::Company && !(S.Company && S.Company->Active)) return "Die Firma ist noch nicht fertig gegründet.";
		return std::nullopt;
	}

	Project& StartProject(GameState& S, const std::string& PlotId, const std::string& TypeId, int Crew)
	{
		if (auto Err = CanBuild(S, PlotId, TypeId)) Fail(*Err);
		const BuildingType& B = FindBuildingType(TypeId);
		const CountryEconomy E = Econ(S);
		const Account Owner = S.Plots.at(PlotId).Owner;
		Crew = std::clamp(Crew, 1, B.MaxCrew);
		const double Fee = PermitFee(E, B);
		Pay(S, Owner, Fee, "Baugenehmigung: " + B.Name, Category::Fees);
		Project P;
		P.Id = S.NextId++;
		P.PlotId = PlotId;
		P.TypeId = TypeId;
		P.Payer = Owner;
		P.Crew = Crew;
		P.PermitEndsAt = S.T + PermitDays(E, B) * Day;
		P.StartedAt = S.T;
		P.Spent = Fee;
		S.Projects.push_back(P);
		Notify(S, "Bauansuchen für " + B.Name + " eingereicht. Die Behörde braucht etwa " + std::to_string(PermitDays(E, B)) + " Tage.");
		return S.Projects.back();
	}

	void SetCrew(GameState& S, int ProjectId, int Crew)
	{
		for (auto& P : S.Projects)
			if (P.Id == ProjectId) P.Crew = std::clamp(Crew, 1, FindBuildingType(P.TypeId).MaxCrew);
	}

	namespace
	{
		void ChargePhaseMaterial(GameState& S, Project& P)
		{
			const BuildingType& B = FindBuildingType(P.TypeId);
			const Phase& Ph = B.Phases[static_cast<size_t>(P.Phase)];
			const double Cost = std::round(B.Material * Ph.Material * MatScale(Econ(S)));
			if (Cost > 0)
			{
				Book(S, P.Payer, -Cost, "Material " + Ph.Name + ": " + B.Name, Category::Material);
				P.Spent += Cost;
			}
		}

		void SettleProjectDay(GameState& S, Project& P)
		{
			const BuildingType& B = FindBuildingType(P.TypeId);
			if (P.PendingWages > 0)
			{
				const double W = std::round(P.PendingWages);
				Book(S, P.Payer, -W, "Löhne Baustelle (" + std::to_string(P.Crew) + " Arbeiter): " + B.Name, Category::Wages);
				P.Spent += W;
				P.PendingWages = 0;
			}
			if (P.WorkedToday)
			{
				const Phase& Ph = B.Phases[static_cast<size_t>(std::min(P.Phase, static_cast<int>(B.Phases.size()) - 1))];
				double Rent = 0;
				std::string Names;
				for (Machine M : Ph.Machines)
				{
					Rent += MachineData(M).RentPerDay;
					Names += (Names.empty() ? "" : ", ") + MachineData(M).Name;
				}
				Rent = std::round(Rent * MatScale(Econ(S)));
				if (Rent > 0)
				{
					Book(S, P.Payer, -Rent, "Maschinenmiete (" + Names + ")", Category::Construction);
					P.Spent += Rent;
				}
				P.WorkedToday = false;
			}
		}
	}

	void CancelProject(GameState& S, int ProjectId)
	{
		auto It = std::find_if(S.Projects.begin(), S.Projects.end(), [&](const Project& P) { return P.Id == ProjectId && P.State != ProjectState::Done; });
		if (It == S.Projects.end()) return;
		SettleProjectDay(S, *It);
		S.Projects.erase(It);
		Notify(S, "Baustelle eingestellt. Bereits ausgegebenes Geld ist verloren.", NoticeKind::Bad);
	}

	double ProjectProgress(const Project& P)
	{
		if (P.State == ProjectState::Done) return 1;
		if (P.State == ProjectState::Permit) return 0;
		const BuildingType& B = FindBuildingType(P.TypeId);
		double Done = 0;
		for (int I = 0; I < P.Phase; ++I) Done += B.Phases[static_cast<size_t>(I)].Work;
		return std::min(1.0, Done + P.PhaseWork / B.WorkHours);
	}

	double ProjectEta(const GameState& S, const Project& P)
	{
		const BuildingType& B = FindBuildingType(P.TypeId);
		const double Remaining = B.WorkHours * (1 - ProjectProgress(P));
		const double Calendar = Remaining / (CrewEfficiency(P.Crew) * 8) * 7 / 5;
		return (P.State == ProjectState::Permit ? P.PermitEndsAt : S.T) + Calendar * Day;
	}

	// ---------- Aufträge ----------
	namespace
	{
		std::optional<Order> MakeOffer(GameState& S)
		{
			Company& C = *S.Company;
			const double Area = WorkshopArea(S);
			const CountryEconomy E = Econ(S);
			Rng R(HashString(std::to_string(static_cast<long long>(S.T)) + "|" + std::to_string(C.CompletedOrders)));
			std::vector<OrderTemplate> Pool;
			for (const auto& O : FindIndustry(C.IndustryId).Orders)
				if (O.MinArea <= Area) Pool.push_back(O);
			if (Pool.empty()) return std::nullopt;
			const OrderTemplate& Tpl = R.Pick(Pool);
			const double V = R.Range(0.85, 1.2);
			Order O;
			O.Id = S.NextId++;
			O.Name = Tpl.Name;
			O.Hours = Tpl.Hours;
			O.Material = std::round(Tpl.Material * MatScale(E) * V);
			O.Price = std::round(((Tpl.Price - Tpl.Material) * WageScale(E) + Tpl.Material * MatScale(E)) * V);
			const double Capacity = 1 + C.Employees;
			O.Deadline = std::ceil(Tpl.Hours / (8 * Capacity) * 1.6 * 7 / 5) + 7; // Tage bis zur Annahme
			O.OfferedUntil = S.T + 5 * Day;
			return O;
		}
	}

	void AcceptOrder(GameState& S, int OrderId)
	{
		if (!S.Company) return;
		auto& Offers = S.Company->Offers;
		auto It = std::find_if(Offers.begin(), Offers.end(), [&](const Order& O) { return O.Id == OrderId; });
		if (It == Offers.end()) return;
		Pay(S, Account::Company, It->Material, "Materialeinkauf für Auftrag „" + It->Name + "\"", Category::Material);
		Order O = *It;
		Offers.erase(It);
		O.Deadline = S.T + O.Deadline * Day;
		S.Company->Orders.push_back(O);
	}

	void DeclineOrder(GameState& S, int OrderId)
	{
		if (!S.Company) return;
		auto& Offers = S.Company->Offers;
		Offers.erase(std::remove_if(Offers.begin(), Offers.end(), [&](const Order& O) { return O.Id == OrderId; }), Offers.end());
	}

	// ---------- Kredite ----------
	double LoanLimit(const GameState& S, Account Holder)
	{
		const CountryEconomy E = Econ(S);
		double Property = 0, Open = 0;
		for (const auto& [Id, O] : S.Plots)
			if (O.Owner == Holder) Property += AssetValue(S, Id);
		for (const auto& L : S.Loans)
			if (L.Holder == Holder) Open += L.Remaining;
		const double Base = Holder == Account::Company ? (S.Company && S.Company->Active ? S.Company->EquityIn * 4 + E.StartBudget * 2 : 0) : E.StartBudget * 1.5;
		return std::max(0.0, std::round(Base + Property * 0.7 - Open));
	}

	void TakeLoan(GameState& S, Account Holder, double Amount, double Years)
	{
		if (Holder == Account::Company && !(S.Company && S.Company->Active)) Fail("Firmenkredite gibt es erst nach der Gründung.");
		if (!(Amount > 0)) Fail("Betrag ungültig.");
		if (Amount > LoanLimit(S, Holder)) Fail("Die Bank gibt dir höchstens " + Money(S, LoanLimit(S, Holder)) + ".");
		const double Rate = Econ(S).LoanRate + (Holder == Account::Wallet ? 0.02 : 0);
		const int N = static_cast<int>(std::lround(Years * 12));
		const double I = Rate / 12;
		Loan L;
		L.Id = S.NextId++;
		L.Holder = Holder;
		L.Principal = L.Remaining = Amount;
		L.Rate = Rate;
		L.Monthly = std::round(Amount * I / (1 - std::pow(1 + I, -N)));
		L.Months = N;
		S.Loans.push_back(L);
		char Buf[64];
		std::snprintf(Buf, sizeof Buf, "Kredit ausbezahlt (%.1f %% p.a., %g Jahre)", Rate * 100, Years);
		Book(S, Holder, Amount, Buf, Category::Loan);
	}

	void RepayLoan(GameState& S, int LoanId)
	{
		auto It = std::find_if(S.Loans.begin(), S.Loans.end(), [&](const Loan& L) { return L.Id == LoanId; });
		if (It == S.Loans.end()) return;
		Pay(S, It->Holder, It->Remaining, "Kredit vorzeitig getilgt", Category::Loan);
		S.Loans.erase(It);
	}

	// ---------- Reisen & Einkaufen ----------
	TravelQuote GetTravelQuote(const GameState& S, const std::string& ToId)
	{
		const Location& From = World::Get().Loc(S.Player.LocId);
		const Location& To = World::Get().Loc(ToId);
		const double Km = DistanceKm(From, To);
		const CountryEconomy E = Econ(S);
		const bool Flight = Km > 700;
		const double CostEur = Flight ? 90 + Km * 0.07 : std::max(9.0, Km * 0.13);
		const double Hours = Flight ? 3.5 + Km / 750 : 0.5 + Km / 95;
		return {std::round(Km), std::round(CostEur * E.PerEur * std::max(0.5, E.PriceLevel)), Hours, Flight};
	}

	void TravelTo(GameState& S, const std::string& ToId)
	{
		if (S.Player.Trip) Fail("Du bist bereits unterwegs.");
		if (ToId == S.Player.LocId) return;
		const TravelQuote Q = GetTravelQuote(S, ToId);
		const std::string Name = World::Get().Loc(ToId).Name;
		Pay(S, Account::Wallet, Q.Cost, std::string(Q.Flight ? "Flug" : "Bahn") + "ticket nach " + Name, Category::Travel);
		S.Player.Trip = Travel{ToId, S.Player.LocId, S.T, S.T + Q.Hours * 3600};
		Notify(S, std::string("Du reist per ") + (Q.Flight ? "Flug" : "Bahn") + " nach " + Name + ".");
	}

	void BuyItem(GameState& S, const std::string& Name, double PriceEur, Account Acct, const std::string& ShopName)
	{
		const double Price = std::round(PriceEur * MatScale(Econ(S)));
		if (Acct == Account::Company && !(S.Company && S.Company->Active)) Fail("Du hast noch keine aktive Firma.");
		Pay(S, Acct, Price, Name + " bei " + ShopName, Category::Shopping);
		S.Inventory.push_back({Name, Price, S.T, Acct});
	}

	// ---------- Vermögen ----------
	double NetWorth(const GameState& S)
	{
		double Assets = S.Wallet + S.CompanyAcct;
		for (const auto& [Id, O] : S.Plots) Assets += AssetValue(S, Id);
		for (const auto& P : S.Projects)
			if (P.State != ProjectState::Done) Assets += P.Spent * 0.6;
		double Debt = 0;
		for (const auto& L : S.Loans) Debt += L.Remaining;
		return std::round(Assets - Debt);
	}

	Summary30 Last30Days(const GameState& S)
	{
		const double Since = S.T - 30 * Day;
		Summary30 R{0, 0, 0};
		for (const auto& L : S.Ledger)
		{
			if (L.T < Since || L.Cat == Category::Transfer || L.Cat == Category::Loan || L.Cat == Category::Purchase || L.Cat == Category::Sale) continue;
			(L.Amount > 0 ? R.Income : R.Expense) += std::abs(L.Amount);
		}
		R.Net = R.Income - R.Expense;
		return R;
	}

	// ---------- Zeit ----------
	namespace
	{
		void Monthly(GameState& S)
		{
			const CountryEconomy E = Econ(S);
			const bool Own = !S.Player.Home.empty();
			Book(S, Account::Wallet, -(Own ? E.LivingCostOwnHome : E.LivingCost),
				Own ? "Lebenshaltung (eigenes Haus: Essen, Strom, Betriebskosten, Versicherung)" : "Lebenshaltung (Kostgeld, Essen, Handy, Versicherung)", Category::Living);
			if (S.Company && S.Company->Active)
			{
				Company& C = *S.Company;
				if (C.Employees > 0) Book(S, Account::Company, -C.Employees * E.SkilledMonthly, "Löhne: " + std::to_string(C.Employees) + " × " + FindIndustry(C.IndustryId).Worker, Category::Wages);
				if (C.ManagerNeeded) Book(S, Account::Company, -std::round(E.SkilledMonthly * 0.3), "Gewerberechtliche:r Geschäftsführer:in (Teilzeit)", Category::Wages);
				Book(S, Account::Company, -std::round(45 * E.PerEur * E.PriceLevel), "Kontoführung & Buchhaltungssoftware", Category::Fees);
			}
			for (const auto& [Id, O] : S.Plots)
			{
				if (O.Rented && O.Rent > 0) Book(S, O.Owner, -O.Rent, "Hallenmiete", Category::Rent);
				else if (!O.Rented)
				{
					const double Tax = std::round(O.Paid * 0.002 / 12 * 10) / 10;
					if (Tax > 0) Book(S, O.Owner, -Tax, "Grundsteuer", Category::Fees);
				}
			}
			for (auto& L : S.Loans)
			{
				const double Interest = L.Remaining * L.Rate / 12;
				const double P = std::min(L.Monthly, L.Remaining + Interest);
				L.Remaining = std::max(0.0, L.Remaining + Interest - P);
				Book(S, L.Holder, -P, "Kreditrate (davon Zinsen " + Money(S, Interest) + ")", Category::Loan);
			}
			S.Loans.erase(std::remove_if(S.Loans.begin(), S.Loans.end(), [](const Loan& L) { return L.Remaining <= 0.5; }), S.Loans.end());
			for (Account A : {Account::Wallet, Account::Company})
			{
				const double Bal = Balance(S, A);
				if (Bal < 0)
				{
					Book(S, A, Bal * 0.12 / 12, "Überziehungszinsen (12 % p.a.)", Category::Fees);
					Notify(S, std::string(A == Account::Wallet ? "Dein Geldbörserl" : "Das Firmenkonto") + " ist im Minus! Bring Geld rein, sonst wird es teuer.", NoticeKind::Bad);
				}
			}
		}

		void Step(GameState& S, double Dt)
		{
			S.T += Dt;
			const double Local = LocalTime(S);
			const bool Work = IsWorkTime(Local);
			const long long Dk = DayKeyOf(Local);
			const long long Mk = MonthKeyOf(Local);
			const CountryEconomy E = Econ(S);
			const double Hours = Dt / 3600;
			World& W = World::Get();

			if (S.Player.Trip && S.T >= S.Player.Trip->ArriveAt)
			{
				S.Player.LocId = S.Player.Trip->To;
				Notify(S, "Angekommen in " + W.Loc(S.Player.LocId).Name + ".", NoticeKind::Good);
				S.Player.Trip.reset();
			}

			// Firmengründung
			if (S.Company && !S.Company->Active)
			{
				Company& C = *S.Company;
				auto It = std::find_if(C.Steps.begin(), C.Steps.end(), [](const FoundingStep& St) { return St.DoneAt == 0; });
				if (It != C.Steps.end() && It->StartedAt != 0 && S.T >= It->StartedAt + It->Days * Day)
				{
					It->DoneAt = S.T;
					Notify(S, "Erledigt: " + It->Label, NoticeKind::Good);
					if (std::all_of(C.Steps.begin(), C.Steps.end(), [](const FoundingStep& St) { return St.DoneAt != 0; }))
					{
						C.Active = true;
						C.NextOfferAt = S.T + 2 * Day;
						Notify(S, C.Name + " ist offiziell gegründet! Nächster Schritt: Werkstatt mieten oder Industriegrundstück kaufen.", NoticeKind::Good);
					}
					else
						StartNextStep(S);
				}
			}

			// Übergaben
			for (const auto& [Id, O] : S.Plots)
				if (O.UsableAt > S.T - Dt && O.UsableAt <= S.T)
					Notify(S, O.Rented ? "Schlüsselübergabe: Die gemietete Halle ist bezugsbereit." : "Grundbuch-Eintragung abgeschlossen. Du kannst jetzt bauen.", NoticeKind::Good);

			// Baustellen
			for (auto& P : S.Projects)
			{
				if (P.State == ProjectState::Done) continue;
				const BuildingType& B = FindBuildingType(P.TypeId);
				if (P.State == ProjectState::Permit)
				{
					if (S.T >= P.PermitEndsAt)
					{
						P.State = ProjectState::Building;
						P.Phase = 0;
						ChargePhaseMaterial(S, P);
						Notify(S, "Baugenehmigung erteilt: " + B.Name + ". Die Bagger rollen an!", NoticeKind::Good);
					}
					continue;
				}
				if (!Work) continue;
				P.PhaseWork += CrewEfficiency(P.Crew) * Hours;
				P.PendingWages += P.Crew * Hours * E.ConstructionWageHour;
				P.WorkedToday = true;
				while (P.State == ProjectState::Building && P.PhaseWork >= B.Phases[static_cast<size_t>(P.Phase)].Work * B.WorkHours)
				{
					P.PhaseWork -= B.Phases[static_cast<size_t>(P.Phase)].Work * B.WorkHours;
					P.Phase++;
					if (P.Phase >= static_cast<int>(B.Phases.size()))
					{
						P.State = ProjectState::Done;
						P.FinishedAt = S.T;
						SettleProjectDay(S, P);
						if (auto It = S.Plots.find(P.PlotId); It != S.Plots.end()) It->second.Building = P.TypeId;
						Notify(S, "Fertig gebaut: " + B.Name + "! Gesamtkosten " + Money(S, P.Spent) + ".", NoticeKind::Good);
					}
					else
					{
						ChargePhaseMaterial(S, P);
						Notify(S, "Bauphase „" + B.Phases[static_cast<size_t>(P.Phase)].Name + "\" beginnt: " + B.Name);
					}
				}
			}

			// Aufträge
			if (S.Company && S.Company->Active && WorkshopArea(S) > 0)
			{
				Company& C = *S.Company;
				if (S.T >= C.NextOfferAt && C.Offers.size() < 4)
				{
					if (auto O = MakeOffer(S))
					{
						C.Offers.push_back(*O);
						Notify(S, "Neue Anfrage: " + O->Name + " (" + Money(S, O->Price) + ")");
					}
					Rng R(HashString("o" + std::to_string(static_cast<long long>(S.T))));
					C.NextOfferAt = S.T + (1 + R.Next() * 3) * Day / std::max(1.0, std::sqrt(1.0 + C.Employees));
				}
				C.Offers.erase(std::remove_if(C.Offers.begin(), C.Offers.end(), [&](const Order& O) { return O.OfferedUntil <= S.T; }), C.Offers.end());
				if (Work)
				{
					double Cap = (1 + C.Employees) * Hours;
					for (auto& O : C.Orders)
					{
						if (Cap <= 0) break;
						const double Use = std::min(Cap, O.Hours - O.Done);
						O.Done += Use;
						Cap -= Use;
					}
					std::vector<Order> Still;
					for (const auto& O : C.Orders)
					{
						if (O.Done < O.Hours - 1e-6) { Still.push_back(O); continue; }
						const bool Late = S.T > O.Deadline;
						const double Amount = Late ? std::round(O.Price * 0.9) : O.Price;
						Book(S, Account::Company, Amount, "Rechnung bezahlt: " + O.Name + (Late ? " (10 % Abzug wegen Verspätung)" : ""), Category::Income);
						C.CompletedOrders++;
						Notify(S, "Auftrag erledigt: " + O.Name + " → +" + Money(S, Amount), NoticeKind::Good);
					}
					C.Orders = Still;
				}
			}

			if (Dk != S.DayKey)
			{
				S.DayKey = Dk;
				for (auto& P : S.Projects)
					if (P.State == ProjectState::Building) SettleProjectDay(S, P);
				S.History.push_back({S.T, std::round(S.Wallet), std::round(S.CompanyAcct), NetWorth(S)});
				if (S.History.size() > 800) S.History.erase(S.History.begin());
			}
			if (Mk != S.MonthKey)
			{
				S.MonthKey = Mk;
				Monthly(S);
			}
		}
	}

	void Advance(GameState& S, double Seconds)
	{
		while (Seconds > 0)
		{
			const double Dt = std::min(StepSeconds, Seconds);
			Seconds -= Dt;
			Step(S, Dt);
		}
	}

	// ---------- Roulette (europäisch, eine Null) ----------
	bool IsRed(int N)
	{
		static const int Red[] = {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36};
		return std::find(std::begin(Red), std::end(Red), N) != std::end(Red);
	}

	int PayoutMultiplier(const Bet& B, int R)
	{
		if (B.Kind == BetKind::Number) return B.N == R ? 36 : 0;
		if (R == 0) return 0;
		switch (B.Kind)
		{
		case BetKind::Red: return IsRed(R) ? 2 : 0;
		case BetKind::Black: return !IsRed(R) ? 2 : 0;
		case BetKind::Even: return R % 2 == 0 ? 2 : 0;
		case BetKind::Odd: return R % 2 == 1 ? 2 : 0;
		case BetKind::Low: return R <= 18 ? 2 : 0;
		case BetKind::High: return R >= 19 ? 2 : 0;
		case BetKind::Dozen: return (R + 11) / 12 == B.N ? 3 : 0;
		default: return 0;
		}
	}

	std::string CasinoHere(const GameState& S)
	{
		if (S.Player.Trip) return {};
		const Location& L = World::Get().Loc(S.Player.LocId);
		std::string Best;
		double BestD = 25;
		for (const auto& C : WS::Casinos())
		{
			const double D = DistanceKm(C.Lat, C.Lon, L.Lat, L.Lon);
			if (D < BestD) { BestD = D; Best = C.Name; }
		}
		return Best;
	}

	SpinResult Spin(GameState& S, const Bet& B, double Stake, double Random01)
	{
		if (CasinoHere(S).empty()) Fail("Hier gibt es kein Casino. Reise in eine Casino-Stadt.");
		if (S.T < S.CasinoBlockedUntil) Fail("Du hast dich selbst gesperrt.");
		if (!(Stake > 0) || Stake > S.Wallet) Fail("Einsatz ungültig oder nicht genug Geld im Geldbörserl.");
		const int Result = std::min(36, static_cast<int>(std::floor(Random01 * 37)));
		const double Win = Stake * PayoutMultiplier(B, Result);
		Book(S, Account::Wallet, -Stake, "Roulette-Einsatz", Category::Casino);
		if (Win > 0) Book(S, Account::Wallet, Win, "Roulette-Gewinn (Zahl " + std::to_string(Result) + ")", Category::Casino);
		S.CasinoWagered += Stake;
		S.CasinoWon += Win;
		const double Lost = S.CasinoWagered - S.CasinoWon;
		if (Lost > S.Wallet && Lost > 1000) Notify(S, "Achtung: Du hast im Casino schon " + Money(S, Lost) + " verloren. Das Haus gewinnt auf Dauer immer.", NoticeKind::Bad);
		return {Result, Win};
	}
}
