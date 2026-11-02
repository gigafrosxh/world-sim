// Spielstand als einfaches Textformat (Versionskennung + Tokens). Unabhängig von der Engine.
#include "Sim/Game.h"

#include <iomanip>
#include <istream>
#include <limits>
#include <ostream>

namespace WS
{
	namespace
	{
		struct Writer
		{
			std::ostream& O;
			void operator()(double V) { O << std::setprecision(17) << V << ' '; }
			void operator()(int V) { O << V << ' '; }
			void operator()(long long V) { O << V << ' '; }
			void operator()(bool V) { O << (V ? 1 : 0) << ' '; }
			void operator()(const std::string& V) { O << V.size() << ':' << V << ' '; }
			template <class E> requires std::is_enum_v<E> void operator()(E V) { (*this)(static_cast<int>(V)); }
		};

		struct Reader
		{
			std::istream& I;
			void Check() { if (!I) throw GameError("Spielstand ist beschädigt."); }
			void operator()(double& V) { I >> V; Check(); }
			void operator()(int& V) { I >> V; Check(); }
			void operator()(long long& V) { I >> V; Check(); }
			void operator()(bool& V) { int X; I >> X; Check(); V = X != 0; }
			void operator()(std::string& V)
			{
				size_t N;
				char Colon;
				I >> N >> std::noskipws >> Colon;
				if (Colon != ':') throw GameError("Spielstand ist beschädigt.");
				V.resize(N);
				I.read(V.data(), static_cast<std::streamsize>(N));
				I >> std::skipws;
				Check();
			}
			template <class E> requires std::is_enum_v<E> void operator()(E& V) { int X; (*this)(X); V = static_cast<E>(X); }
		};

		// Eine Funktion für beide Richtungen: Writer bekommt const-Referenzen über const_cast-freie Templates.
		template <class Ar, class Vec, class F> void List(Ar& A, Vec& V, F Each)
		{
			int N = static_cast<int>(V.size());
			A(N);
			V.resize(static_cast<size_t>(N));
			for (auto& X : V) Each(X);
		}

		template <class Ar, class S> void Visit(Ar& A, S& St)
		{
			A(St.Version); A(St.T); A(St.Speed); A(St.Paused);
			auto& P = St.Player;
			A(P.Name); A(P.A3); A(P.HomeId); A(P.LocId); A(P.Color); A(P.BirthYear); A(P.Home);
			bool HasTrip = P.Trip.has_value();
			A(HasTrip);
			if (HasTrip)
			{
				if (!P.Trip) P.Trip.emplace();
				A(P.Trip->To); A(P.Trip->From); A(P.Trip->DepartedAt); A(P.Trip->ArriveAt);
			}
			A(St.Wallet); A(St.CompanyAcct);
			bool HasCompany = St.Company.has_value();
			A(HasCompany);
			if (HasCompany)
			{
				if (!St.Company) St.Company.emplace();
				auto& C = *St.Company;
				A(C.Name); A(C.Color); A(C.IndustryId); A(C.Ltd); A(C.Active); A(C.Employees); A(C.ManagerNeeded);
				A(C.NextOfferAt); A(C.EquityIn); A(C.CompletedOrders);
				List(A, C.Steps, [&](FoundingStep& F) { A(F.Id); A(F.Label); A(F.Info); A(F.Fee); A(F.Capital); A(F.Days); A(F.StartedAt); A(F.DoneAt); });
				auto Ord = [&](Order& O) { A(O.Id); A(O.Name); A(O.Hours); A(O.Done); A(O.Material); A(O.Price); A(O.Deadline); A(O.OfferedUntil); };
				List(A, C.Offers, Ord);
				List(A, C.Orders, Ord);
			}
			List(A, St.Ledger, [&](LedgerEntry& L) { A(L.T); A(L.Acct); A(L.Amount); A(L.Text); A(L.Cat); });
			// Map als Liste von Paaren
			std::vector<std::pair<std::string, Ownership>> Plots(St.Plots.begin(), St.Plots.end());
			List(A, Plots, [&](std::pair<std::string, Ownership>& E) {
				A(E.first); A(E.second.Owner); A(E.second.Rented); A(E.second.Since); A(E.second.UsableAt); A(E.second.Rent); A(E.second.Building); A(E.second.Paid);
			});
			St.Plots = std::map<std::string, Ownership>(Plots.begin(), Plots.end());
			List(A, St.Projects, [&](Project& X) {
				A(X.Id); A(X.PlotId); A(X.TypeId); A(X.Payer); A(X.Crew); A(X.State); A(X.PermitEndsAt); A(X.Phase); A(X.PhaseWork);
				A(X.StartedAt); A(X.FinishedAt); A(X.Spent); A(X.PendingWages); A(X.WorkedToday);
			});
			List(A, St.Loans, [&](Loan& L) { A(L.Id); A(L.Holder); A(L.Principal); A(L.Remaining); A(L.Rate); A(L.Monthly); A(L.Months); });
			List(A, St.Inventory, [&](InventoryItem& I) { A(I.Name); A(I.Price); A(I.T); A(I.Owner); });
			A(St.CasinoWagered); A(St.CasinoWon); A(St.CasinoBlockedUntil);
			List(A, St.History, [&](HistoryPoint& H) { A(H.T); A(H.Wallet); A(H.Company); A(H.Worth); });
			A(St.NextId); A(St.DayKey); A(St.MonthKey);
		}
	}

	void Save(const GameState& S, std::ostream& Out)
	{
		Out << "WORLDSIM 1\n";
		Writer W{Out};
		GameState Copy = S; // Visit arbeitet auf veränderbaren Referenzen
		Copy.Notices.clear();
		Visit(W, Copy);
	}

	GameState Load(std::istream& In)
	{
		std::string Magic;
		int Version = 0;
		In >> Magic >> Version;
		if (Magic != "WORLDSIM" || Version != 1) throw GameError("Unbekanntes Spielstand-Format.");
		Reader R{In};
		GameState S;
		Visit(R, S);
		return S;
	}
}
