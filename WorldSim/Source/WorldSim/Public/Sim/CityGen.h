// Prozedurale Stadt um ein echtes Stadtzentrum. Deterministisch: gleiche Stadt ergibt gleiche Stadt.
#pragma once

#include "Sim/SimData.h"

#include <cmath>
#include <cstdint>
#include <map>
#include <optional>
#include <string>
#include <vector>

namespace WS
{
	inline uint32_t HashString(const std::string& S)
	{
		uint32_t H = 2166136261u;
		for (unsigned char C : S)
		{
			H ^= C;
			H *= 16777619u;
		}
		return H;
	}

	/** Deterministischer Zufallsgenerator (mulberry32). */
	struct Rng
	{
		uint32_t A;
		explicit Rng(uint32_t Seed) : A(Seed) {}
		double Next()
		{
			A += 0x6d2b79f5u;
			uint32_t T = A;
			T = (T ^ (T >> 15)) * (T | 1u);
			T ^= T + (T ^ (T >> 7)) * (T | 61u);
			return static_cast<double>(T ^ (T >> 14)) / 4294967296.0;
		}
		double Range(double Lo, double Hi) { return Lo + (Hi - Lo) * Next(); }
		int Int(int Lo, int Hi) { return static_cast<int>(std::floor(Lo + (Hi - Lo + 1) * Next())); }
		bool Chance(double P) { return Next() < P; }
		template <class T> const T& Pick(const std::vector<T>& V) { return V[static_cast<size_t>(Next() * V.size())]; }
	};

	struct Location
	{
		std::string Id, Name, A3;
		double Lat = 0, Lon = 0, Pop = 0;
		bool Capital = false;
	};

	double DistanceKm(double Lat1, double Lon1, double Lat2, double Lon2);
	inline double DistanceKm(const Location& A, const Location& B) { return DistanceKm(A.Lat, A.Lon, B.Lat, B.Lon); }

	struct Plot
	{
		int Idx = 0;
		std::string Id;
		WS::Zone Zone = WS::Zone::Residential;
		double X = 0, Z = 0, W = 0, D = 0; // Mittelpunkt und Größe in Metern
		WS::Visual Npc = WS::Visual::None;
		int Floors = 1;
		bool ForSale = false, ForRent = false;
		std::optional<ShopKind> Shop;
		std::string ShopName;
		std::string CasinoName;
		double Hue = 0;
		int Facing = 0; // 0=-Z, 1=+X, 2=+Z, 3=-X (Straßenseite)
	};

	struct Road { double X1, Z1, X2, Z2, W; bool Highway; };

	struct CityLayout
	{
		std::string Id;
		int N = 0;
		double Half = 0;
		std::vector<Plot> Plots;
		std::vector<Road> Roads;
		double RailZ = 0, RailX1 = 0, RailX2 = 0;
		double HighwayZ = 0;
		double LandIndustrial = 0, LandResidential = 0, LandCommercial = 0;
		double Factor = 1;
		double LandPrice(WS::Zone Z) const;
	};

	constexpr double Block = 110;
	constexpr double Street = 14;
	constexpr double Pitch = Block + Street;

	double CityPriceFactor(double Pop);
	CityLayout GenerateCity(const Location& Loc, const CountryEconomy& Econ);
}
