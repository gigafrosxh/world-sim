#include "Sim/CityGen.h"

#include <algorithm>
#include <functional>

namespace WS
{
	double DistanceKm(double Lat1, double Lon1, double Lat2, double Lon2)
	{
		constexpr double R = 6371, ToR = 3.14159265358979323846 / 180;
		const double DLat = (Lat2 - Lat1) * ToR, DLon = (Lon2 - Lon1) * ToR;
		const double S = std::pow(std::sin(DLat / 2), 2) + std::cos(Lat1 * ToR) * std::cos(Lat2 * ToR) * std::pow(std::sin(DLon / 2), 2);
		return 2 * R * std::asin(std::sqrt(S));
	}

	double CityLayout::LandPrice(WS::Zone Z) const
	{
		switch (Z)
		{
		case Zone::Industrial: return LandIndustrial;
		case Zone::Commercial: return LandCommercial;
		default: return LandResidential;
		}
	}

	double CityPriceFactor(double Pop)
	{
		return std::clamp(0.7 + 0.45 * std::log10(std::max(20000.0, Pop) / 100000), 0.5, 2.0);
	}

	CityLayout GenerateCity(const Location& Loc, const CountryEconomy& Econ)
	{
		Rng R(HashString(Loc.Id));
		CityLayout L;
		L.Id = Loc.Id;
		L.N = std::clamp(static_cast<int>(std::lround(4 + std::log2(std::max(1.0, Loc.Pop / 50000)) * 1.3)), 4, 11);
		const int N = L.N;
		const double C = (N - 1) / 2.0;
		L.Half = N * Pitch / 2;
		L.Factor = CityPriceFactor(Loc.Pop);
		L.LandIndustrial = std::round(Econ.LandIndustrial * L.Factor);
		L.LandResidential = std::round(Econ.LandResidential * L.Factor);
		L.LandCommercial = std::round(Econ.LandResidential * L.Factor * 1.6);
		const int IndCols = std::max(1, static_cast<int>(std::lround(N / 4.0)));
		const int ComR = N >= 7 ? 1 : 0;

		auto Add = [&](Plot P) {
			P.Idx = static_cast<int>(L.Plots.size());
			P.Id = Loc.Id + "#" + std::to_string(P.Idx);
			L.Plots.push_back(std::move(P));
		};

		for (int I = 0; I < N; ++I)
			for (int J = 0; J < N; ++J)
			{
				const double Bx = (I - C) * Pitch, Bz = (J - C) * Pitch;
				const double Ring = std::max(std::abs(I - C), std::abs(J - C));
				Zone Z;
				if (Ring <= ComR + 0.5) Z = Zone::Commercial;
				else if (I >= N - IndCols) Z = Zone::Industrial;
				else Z = R.Chance(0.07) ? Zone::Park : Zone::Residential;

				auto Sub = [&](int Cols, int Rows, const std::function<void(double, double, double, double, int, int)>& Fill) {
					const double Gap = 4;
					const double W = (Block - Gap * (Cols - 1)) / Cols, D = (Block - Gap * (Rows - 1)) / Rows;
					for (int A = 0; A < Cols; ++A)
						for (int B = 0; B < Rows; ++B)
							Fill(Bx - Block / 2 + W / 2 + A * (W + Gap), Bz - Block / 2 + D / 2 + B * (D + Gap), W, D, A, B);
				};
				auto FacingOf = [](int Col, int Row, int Cols, int Rows) { return Rows > 1 ? (Row == 0 ? 0 : 2) : Cols > 1 ? (Col == 0 ? 3 : 1) : 0; };
				auto Make = [&](double X, double Zp, double W, double D, Visual V, int Floors, bool Sale, bool Rent, int Facing) {
					Plot P;
					P.Zone = Z; P.X = X; P.Z = Zp; P.W = W; P.D = D; P.Npc = V; P.Floors = Floors; P.ForSale = Sale; P.ForRent = Rent;
					P.Hue = R.Next(); P.Facing = Facing;
					return P;
				};

				if (Z == Zone::Park)
				{
					Plot P;
					P.Zone = Z; P.X = Bx; P.Z = Bz; P.W = Block; P.D = Block; P.Floors = 0; P.Hue = R.Next();
					Add(P);
				}
				else if (Z == Zone::Commercial)
				{
					Sub(2, 2, [&](double X, double Zp, double W, double D, int A, int B) {
						const bool Tower = Ring < 0.6 || R.Chance(0.35);
						const int Floors = Tower ? R.Int(10, 30) : R.Int(4, 8);
						Add(Make(X, Zp, W, D, Tower ? Visual::Tower : Visual::Office, Floors, false, false, FacingOf(A, B, 2, 2)));
					});
				}
				else if (Z == Zone::Industrial)
				{
					const int Variant = R.Int(0, 2);
					const int Cols = Variant == 0 ? 2 : Variant == 1 ? 2 : 1;
					const int Rows = Variant == 0 ? 2 : Variant == 1 ? 4 : 2;
					Sub(Cols, Rows, [&](double X, double Zp, double W, double D, int A, int B) {
						const bool Occupied = R.Chance(0.6);
						Visual V = Visual::None;
						if (Occupied)
						{
							static const std::vector<Visual> Kinds = {Visual::Factory, Visual::Warehouse, Visual::Workshop, Visual::Warehouse};
							V = R.Pick(Kinds);
						}
						const bool Rent = Occupied && R.Chance(0.2);
						Add(Make(X, Zp, W, D, V, 1, !Occupied, Rent, FacingOf(A, B, Cols, Rows)));
					});
				}
				else
				{
					const bool Inner = Ring <= N / 3.0;
					if (Inner)
						Sub(2, 2, [&](double X, double Zp, double W, double D, int A, int B) {
							const int Floors = R.Int(3, 7);
							Add(Make(X, Zp, W, D, Visual::Apartment, Floors, false, false, FacingOf(A, B, 2, 2)));
						});
					else
						Sub(4, 2, [&](double X, double Zp, double W, double D, int A, int B) {
							const bool Occupied = R.Chance(0.8);
							const int Floors = R.Int(1, 2);
							const bool Sale = !Occupied || R.Chance(0.1);
							Add(Make(X, Zp, W, D, Occupied ? Visual::House : Visual::None, Floors, Sale, false, FacingOf(A, B, 4, 2)));
						});
				}
			}

		// Geschäfte echter Handelsketten
		const ShopKind Kinds[] = {ShopKind::Supermarkt, ShopKind::Baumarkt, ShopKind::Elektronik, ShopKind::Moebel, ShopKind::Auto, ShopKind::Stahl, ShopKind::Bank, ShopKind::Supermarkt};
		for (int K = 0; K < 8; ++K)
		{
			const ShopKind Kind = Kinds[K];
			const auto& Names = Chains(Loc.A3, Kind);
			const bool BigBox = Kind == ShopKind::Baumarkt || Kind == ShopKind::Moebel || Kind == ShopKind::Stahl;
			auto Free = [](const Plot& Q) { return !Q.Shop && Q.CasinoName.empty(); };
			Plot* Target = nullptr;
			for (auto& Q : L.Plots)
			{
				if (!Free(Q)) continue;
				const bool Ok = BigBox ? (Q.Zone == Zone::Industrial && Q.Npc != Visual::None && !Q.ForRent)
					: (K % 2 ? (Q.Zone == Zone::Commercial && Q.Npc != Visual::Tower) : (Q.Zone == Zone::Residential && Q.Npc == Visual::Apartment));
				if (Ok) { Target = &Q; break; }
			}
			if (!Target)
				for (auto& Q : L.Plots)
					if (Free(Q) && Q.Npc != Visual::None && Q.Zone != Zone::Park && !Q.ForSale && !Q.ForRent) { Target = &Q; break; }
			if (!Target) continue;
			Target->Npc = Visual::Shop;
			Target->Floors = 1;
			Target->Shop = Kind;
			Target->ShopName = Names[K % Names.size()];
		}

		// Echte Casinos in der Nähe
		for (const auto& Cs : Casinos())
		{
			if (DistanceKm(Cs.Lat, Cs.Lon, Loc.Lat, Loc.Lon) >= 25) continue;
			for (auto& Q : L.Plots)
				if (Q.Zone == Zone::Commercial && !Q.Shop && Q.CasinoName.empty())
				{
					Q.Npc = Visual::Casino;
					Q.Floors = 2;
					Q.CasinoName = Cs.Name;
					break;
				}
		}

		// Straßenraster, Autobahn im Süden, Bahn im Norden
		for (int K = 0; K <= N; ++K)
		{
			const double O = (K - N / 2.0) * Pitch;
			L.Roads.push_back({O, -L.Half, O, L.Half, Street, false});
			L.Roads.push_back({-L.Half, O, L.Half, O, Street, false});
		}
		L.HighwayZ = L.Half + 60;
		L.Roads.push_back({-L.Half - 400, L.HighwayZ, L.Half + 400, L.HighwayZ, 26, true});
		const double Feeder = L.Half - Pitch * IndCols;
		L.Roads.push_back({Feeder, L.Half, Feeder, L.HighwayZ, Street, false});
		L.RailZ = -L.Half - 40;
		L.RailX1 = -L.Half - 400;
		L.RailX2 = L.Half + 400;
		return L;
	}
}
