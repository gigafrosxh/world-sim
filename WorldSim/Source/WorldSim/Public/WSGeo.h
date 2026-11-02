// Projektion Längen-/Breitengrad -> Unreal-Zentimeter. Mercator, um den aktuellen Ort herum
// maßstabsgetreu (1 m im Spiel = 1 m in echt), damit Stadt und Weltkarte zusammenpassen.
#pragma once

#include "CoreMinimal.h"

struct FWSProjection
{
	static constexpr double EarthRadiusCm = 6371.0088 * 1000.0 * 100.0;

	double Lat0 = 0;
	double Lon0 = 0;

	static double Merc(double LatDeg)
	{
		const double Lat = FMath::Clamp(LatDeg, -85.0, 85.0) * UE_DOUBLE_PI / 180.0;
		return FMath::Loge(FMath::Tan(UE_DOUBLE_PI / 4 + Lat / 2));
	}

	/** X = Osten, Y = Süden (wie die Grundstücke der Stadt). */
	FVector2D ToWorld(double Lat, double Lon) const
	{
		const double K = EarthRadiusCm * FMath::Cos(Lat0 * UE_DOUBLE_PI / 180.0);
		const double DLon = Lon - Lon0; // bewusst ohne Umbruch bei ±180°, Länderflächen bleiben zusammenhängend
		return FVector2D(K * DLon * UE_DOUBLE_PI / 180.0, -K * (Merc(Lat) - Merc(Lat0)));
	}
};
