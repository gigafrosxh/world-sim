// Tests für den Simulationskern ohne Unreal. Bauen & ausführen: Tests/run.sh
#include "Sim/Game.h"

#include <cmath>
#include <cstdio>
#include <functional>
#include <sstream>

using namespace WS;

static int Failed = 0, Passed = 0;
#define CHECK(c) do { if (c) ++Passed; else { ++Failed; std::printf("  FEHLER %s:%d: %s\n", __FILE__, __LINE__, #c); } } while (0)
#define CHECK_THROWS(expr) do { bool T = false; try { expr; } catch (const GameError&) { T = true; } CHECK(T && #expr); } while (0)

static void Test(const char* Name, const std::function<void()>& F)
{
	std::printf("%s\n", Name);
	try { F(); } catch (const std::exception& E) { ++Failed; std::printf("  AUSNAHME: %s\n", E.what()); }
}

static GameState Fresh() { return NewGame("Test", "AUT", "AUT:Linz"); }

int main()
{
	World::Get().Register(
		{{"Vienna", "AUT", 48.2, 16.37, 1900000, true}, {"Linz", "AUT", 48.3, 14.29, 200000, false}, {"Graz", "AUT", 47.07, 15.44, 290000, false}},
		{{"AUT", "Austria", "Österreich", 9000000, 470000}});

	Test("Kalender", [] {
		const CivilDate D = ToCivil(1782885600);
		CHECK(D.Year == 2026 && D.Month == 7 && D.Day == 1 && D.Hour == 6 && D.Weekday == 3);
		CHECK(FormatMoney(15000, "EUR") == "€ 15.000");
		CHECK(FormatMoney(-12.5, "EUR") == "-€ 12,50");
	});

	Test("Spielstart mit Landesbudget", [] {
		GameState S = Fresh();
		CHECK(S.Wallet == 15000);
		CHECK(S.Paused);
	});

	Test("Monatliche Lebenshaltung", [] {
		GameState S = Fresh();
		Advance(S, 35 * Day);
		CHECK(S.Wallet == 15000 - 650);
	});

	Test("GmbH-Gründung mit Kosten und Wartezeit", [] {
		GameState S = Fresh();
		FoundCompany(S, "Stahl & Co", "#c33", "schlosserei", true);
		CHECK(!S.Company->Active);
		Advance(S, 10 * Day);
		CHECK(!S.Company->Active);
		Advance(S, 40 * Day);
		CHECK(S.Company->Active);
		CHECK(S.CompanyAcct > 4000);
		CHECK(S.Company->EquityIn == 5000);
	});

	Test("Werkstatt: realistische Bauzeit, laufende Kosten", [] {
		GameState S = Fresh();
		S.Wallet = 2000000;
		const CityLayout& L = World::Get().Layout("AUT:Linz");
		const Plot* P = nullptr;
		for (const auto& Q : L.Plots)
			if (Q.Zone == Zone::Industrial && Q.ForSale && Q.W >= 24 && Q.D >= 14) { P = &Q; break; }
		CHECK(P != nullptr);
		if (!P) return;
		BuyPlot(S, P->Id, Account::Wallet);
		CHECK(CanBuild(S, P->Id, "werkstatt").has_value());
		Advance(S, 22 * Day);
		CHECK(!CanBuild(S, P->Id, "werkstatt").has_value());
		const int Id = StartProject(S, P->Id, "werkstatt", 6).Id;
		auto Proj = [&]() -> Project& { for (auto& X : S.Projects) if (X.Id == Id) return X; throw std::runtime_error("weg"); };
		const double Before = S.Wallet;
		Advance(S, 30 * Day);
		CHECK(Proj().State == ProjectState::Permit);
		Advance(S, 40 * Day);
		CHECK(Proj().State == ProjectState::Building);
		Advance(S, 30 * Day);
		CHECK(S.Wallet < Before - 30000);
		const double Pr = ProjectProgress(Proj());
		CHECK(Pr > 0.1 && Pr < 0.6);
		Advance(S, 200 * Day);
		CHECK(Proj().State == ProjectState::Done);
		const double Days = (Proj().FinishedAt - Proj().StartedAt) / Day;
		CHECK(Days > 130 && Days < 220);
		CHECK(S.Plots[P->Id].Building == "werkstatt");
	});

	Test("Mietwerkstatt bringt Aufträge und Einnahmen", [] {
		GameState S = Fresh();
		S.Wallet = 100000;
		FoundCompany(S, "X", "#fff", "schlosserei", false);
		Advance(S, 30 * Day);
		TransferMoney(S, Account::Wallet, 30000);
		const CityLayout& L = World::Get().Layout("AUT:Linz");
		for (const auto& Q : L.Plots)
			if (Q.ForRent) { RentPlot(S, Q.Id); break; }
		Advance(S, 15 * Day);
		CHECK(!S.Company->Offers.empty());
		for (int K = 0; K < 20; ++K)
		{
			const auto Offers = S.Company->Offers;
			for (const auto& O : Offers)
				if (S.CompanyAcct > O.Material) AcceptOrder(S, O.Id);
			Advance(S, 5 * Day);
		}
		CHECK(S.Company->CompletedOrders > 3);
	});

	Test("Kredit wird monatlich getilgt", [] {
		GameState S = Fresh();
		TakeLoan(S, Account::Wallet, 10000, 2);
		CHECK(S.Wallet == 25000);
		Advance(S, 400 * Day);
		CHECK(S.Loans.size() == 1 && S.Loans[0].Remaining < 6000);
	});

	Test("Roulette", [] {
		CHECK(PayoutMultiplier({BetKind::Number, 7}, 7) == 36);
		CHECK(PayoutMultiplier({BetKind::Red}, 0) == 0);
		CHECK(PayoutMultiplier({BetKind::Red}, 1) == 2);
		CHECK(PayoutMultiplier({BetKind::Dozen, 3}, 36) == 3);
		double Ev = 0;
		for (int R = 0; R <= 36; ++R) Ev += PayoutMultiplier({BetKind::Black}, R) / 37.0;
		CHECK(std::abs(Ev - 36.0 / 37) < 1e-9);
		GameState S = Fresh();
		CHECK_THROWS(Spin(S, {BetKind::Red}, 10, 0.5));
		S.Player.LocId = "AUT:Vienna";
		CHECK(CasinoHere(S) == "Casino Wien");
		Spin(S, {BetKind::Red}, 10, 0.5);
		CHECK(S.CasinoWagered == 10);
	});

	Test("Speichern und Laden", [] {
		GameState S = Fresh();
		FoundCompany(S, "Säge & Söhne", "#123", "tischlerei", true);
		Advance(S, 3 * Day);
		std::stringstream Buf;
		Save(S, Buf);
		GameState T = Load(Buf);
		CHECK(T.T == S.T);
		CHECK(T.Wallet == S.Wallet);
		CHECK(T.Company && T.Company->Name == "Säge & Söhne");
		CHECK(T.Ledger.size() == S.Ledger.size());
		CHECK(T.Ledger.back().Text == S.Ledger.back().Text);
	});

	Test("Stadt: deterministisch, Zonen, echte Geschäfte und Casino", [] {
		const CityLayout& A = World::Get().Layout("AUT:Graz");
		bool IndSale = false, Casino = false, Chain = false;
		for (const auto& P : A.Plots)
		{
			IndSale |= P.Zone == Zone::Industrial && P.ForSale;
			Casino |= !P.CasinoName.empty();
			Chain |= P.ShopName == "Billa" || P.ShopName == "Spar";
		}
		CHECK(IndSale && Casino && Chain);
		const CityLayout B = GenerateCity(World::Get().Loc("AUT:Graz"), World::Get().Econ("AUT"));
		CHECK(B.Plots.size() == A.Plots.size() && B.Plots[5].Hue == A.Plots[5].Hue);
	});

	std::printf("\n%d bestanden, %d fehlgeschlagen\n", Passed, Failed);
	return Failed ? 1 : 0;
}
