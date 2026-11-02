// Kern der Simulation: Spielstand, Zeit, Geld, Firma, Bauen, Aufträge, Kredite, Reisen.
// Reines C++20 ohne Engine-Abhängigkeit. Die Unreal-Anbindung liegt in UWorldSimSubsystem.
#pragma once

#include "Sim/CityGen.h"

#include <iosfwd>
#include <map>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

namespace WS
{
	// ---------- Welt-Registry ----------
	struct CountryInfo { std::string A3, Name, NameDe; double Pop = 0, Gdp = 0; };

	struct RawCity { std::string Name, A3; double Lat, Lon, Pop; bool Capital; };

	class World
	{
	public:
		static World& Get();
		void Register(const std::vector<RawCity>& Cities, const std::vector<CountryInfo>& Countries);
		const Location& Loc(const std::string& Id) const;
		const std::vector<Location>& Locations() const { return LocList; }
		const CountryInfo* Country(const std::string& A3) const;
		std::string CountryName(const std::string& A3) const;
		CountryEconomy Econ(const std::string& A3) const;
		const CityLayout& Layout(const std::string& LocId);
		const Plot& PlotById(const std::string& PlotId);
		static std::string LocIdOfPlot(const std::string& PlotId);

	private:
		std::vector<Location> LocList;
		std::map<std::string, size_t> LocIndex;
		std::map<std::string, CountryInfo> Countries;
		std::map<std::string, CityLayout> Layouts;
	};

	// ---------- Spielstand ----------
	enum class Account { Wallet, Company };
	enum class Category { Living, Construction, Wages, Purchase, Income, Casino, Loan, Transfer, Fees, Shopping, Rent, Material, Travel, Sale };
	enum class NoticeKind { Info, Good, Bad };

	struct LedgerEntry { double T; Account Acct; double Amount; std::string Text; Category Cat; };
	struct Notice { double T; std::string Text; NoticeKind Kind; };

	struct Ownership
	{
		Account Owner = Account::Wallet;
		bool Rented = false;
		double Since = 0, UsableAt = 0;
		double Rent = 0;
		std::string Building; // "" = keins, "npc" = Bestand, sonst Gebäudetyp-ID
		double Paid = 0;
	};

	enum class ProjectState { Permit, Building, Done };

	struct Project
	{
		int Id = 0;
		std::string PlotId, TypeId;
		Account Payer = Account::Wallet;
		int Crew = 1;
		ProjectState State = ProjectState::Permit;
		double PermitEndsAt = 0;
		int Phase = 0;
		double PhaseWork = 0;
		double StartedAt = 0, FinishedAt = 0;
		double Spent = 0, PendingWages = 0;
		bool WorkedToday = false;
	};

	struct FoundingStep { std::string Id, Label, Info; double Fee = 0, Capital = 0; int Days = 0; double StartedAt = 0, DoneAt = 0; };

	struct Order { int Id = 0; std::string Name; double Hours = 0, Done = 0, Material = 0, Price = 0, Deadline = 0, OfferedUntil = 0; };

	struct Company
	{
		std::string Name, Color, IndustryId;
		bool Ltd = false;
		std::vector<FoundingStep> Steps;
		bool Active = false;
		int Employees = 0;
		bool ManagerNeeded = false;
		std::vector<Order> Offers, Orders;
		double NextOfferAt = 0, EquityIn = 0;
		int CompletedOrders = 0;
	};

	struct Loan { int Id = 0; Account Holder = Account::Wallet; double Principal = 0, Remaining = 0, Rate = 0, Monthly = 0; int Months = 0; };

	struct Travel { std::string To, From; double DepartedAt = 0, ArriveAt = 0; };

	struct Player
	{
		std::string Name, A3, HomeId, LocId, Color = "#e0b030";
		int BirthYear = 2007;
		std::optional<Travel> Trip;
		std::string Home; // eigenes Haus (Plot-ID) oder leer = Eltern / WG
	};

	struct InventoryItem { std::string Name; double Price, T; Account Owner; };
	struct HistoryPoint { double T, Wallet, Company, Worth; };

	struct GameState
	{
		int Version = 1;
		double T = 0; // Spielzeit in Sekunden seit 1970 (UTC)
		double Speed = 1;
		bool Paused = true;
		WS::Player Player;
		double Wallet = 0, CompanyAcct = 0;
		std::optional<WS::Company> Company;
		std::vector<LedgerEntry> Ledger;
		std::vector<Notice> Notices;
		std::map<std::string, Ownership> Plots;
		std::vector<Project> Projects;
		std::vector<Loan> Loans;
		std::vector<InventoryItem> Inventory;
		double CasinoWagered = 0, CasinoWon = 0, CasinoBlockedUntil = 0;
		std::vector<HistoryPoint> History;
		int NextId = 1;
		long long DayKey = 0, MonthKey = 0;
	};

	/** Spielregel verletzt (z. B. zu wenig Geld). Text ist für Spieler:innen gedacht. */
	struct GameError : std::runtime_error { using std::runtime_error::runtime_error; };

	constexpr double Day = 86400;
	extern const double Speeds[7];

	// ---------- Kalender ----------
	struct CivilDate { int Year, Month, Day, Hour, Minute, Weekday; }; // Weekday: 0=So
	CivilDate ToCivil(double EpochSeconds);
	double LocalTime(const GameState& S); // Ortszeit (Sekunden) grob über Längengrad
	std::string FormatDate(double EpochSeconds);
	std::string FormatMoney(double V, const std::string& Currency);

	// ---------- API ----------
	CountryEconomy Econ(const GameState& S);
	inline double MatScale(const CountryEconomy& E) { return E.PerEur * E.PriceLevel; }
	inline double WageScale(const CountryEconomy& E) { return E.SkilledMonthly / 4600; }
	std::string Money(const GameState& S, double V);

	GameState NewGame(const std::string& Name, const std::string& A3, const std::string& HomeId, const std::string& Color = "#e0b030", int Difficulty = 1);
	void Book(GameState& S, Account A, double Amount, const std::string& Text, Category Cat);
	double Balance(const GameState& S, Account A);
	void Notify(GameState& S, const std::string& Text, NoticeKind Kind = NoticeKind::Info);

	std::vector<FoundingStep> FoundingSteps(const CountryEconomy& E, bool Ltd, bool Regulated);
	void FoundCompany(GameState& S, const std::string& Name, const std::string& Color, const std::string& IndustryId, bool Ltd);
	bool StartNextStep(GameState& S);
	void TransferMoney(GameState& S, Account From, double Amount);
	void SetEmployees(GameState& S, int N);
	double WorkshopArea(const GameState& S);

	double RentedArea(const Plot& P);
	struct PlotPrice { double Land, Building, Fees, Total, Area; };
	PlotPrice GetPlotPrice(const GameState& S, const std::string& PlotId);
	double MonthlyRent(const GameState& S, const std::string& PlotId);
	void BuyPlot(GameState& S, const std::string& PlotId, Account Buyer);
	void RentPlot(GameState& S, const std::string& PlotId);
	void SellPlot(GameState& S, const std::string& PlotId);
	double AssetValue(const GameState& S, const std::string& PlotId);
	void MoveIn(GameState& S, const std::string& PlotId);

	double BuildCost(const CountryEconomy& E, const BuildingType& B, int Crew = -1);
	double PermitFee(const CountryEconomy& E, const BuildingType& B);
	int PermitDays(const CountryEconomy& E, const BuildingType& B);
	std::optional<std::string> CanBuild(const GameState& S, const std::string& PlotId, const std::string& TypeId);
	Project& StartProject(GameState& S, const std::string& PlotId, const std::string& TypeId, int Crew);
	void SetCrew(GameState& S, int ProjectId, int Crew);
	void CancelProject(GameState& S, int ProjectId);
	double ProjectProgress(const Project& P);
	double ProjectEta(const GameState& S, const Project& P);

	void AcceptOrder(GameState& S, int OrderId);
	void DeclineOrder(GameState& S, int OrderId);

	double LoanLimit(const GameState& S, Account Holder);
	void TakeLoan(GameState& S, Account Holder, double Amount, double Years);
	void RepayLoan(GameState& S, int LoanId);

	struct TravelQuote { double Km, Cost, Hours; bool Flight; };
	TravelQuote GetTravelQuote(const GameState& S, const std::string& ToId);
	void TravelTo(GameState& S, const std::string& ToId);
	void BuyItem(GameState& S, const std::string& Name, double PriceEur, Account Acct, const std::string& ShopName);

	double NetWorth(const GameState& S);
	struct Summary30 { double Income, Expense, Net; };
	Summary30 Last30Days(const GameState& S);

	void Advance(GameState& S, double Seconds);

	/** Sichtbarer Zustand eines Grundstücks für die Darstellung. */
	struct PlotView { WS::Visual Visual; const WS::Project* Project; std::optional<Account> Mine; bool Rented; };
	PlotView GetPlotView(const GameState& S, const Plot& P);

	// ---------- Roulette ----------
	enum class BetKind { Number, Red, Black, Even, Odd, Low, High, Dozen };
	struct Bet { BetKind Kind; int N = 0; };
	bool IsRed(int N);
	int PayoutMultiplier(const Bet& B, int Result);
	std::string CasinoHere(const GameState& S);
	struct SpinResult { int Result; double Win; };
	SpinResult Spin(GameState& S, const Bet& B, double Stake, double Random01);

	// ---------- Speichern ----------
	void Save(const GameState& S, std::ostream& Out);
	GameState Load(std::istream& In);
}
