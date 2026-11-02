// Blueprint-Typen, die den Simulationskern (namespace WS) für Unreal sichtbar machen.
#pragma once

#include "CoreMinimal.h"
#include "WorldSimTypes.generated.h"

UENUM(BlueprintType)
enum class EWSVisual : uint8
{
	None, Container, Workshop, Factory, Warehouse, House, TinyHouse, Apartment, Office, Shop, Casino, Tower
};

UENUM(BlueprintType)
enum class EWSZone : uint8 { Industrial, Residential, Commercial, Park };

UENUM(BlueprintType)
enum class EWSAccount : uint8 { Wallet, Company };

UENUM(BlueprintType)
enum class EWSNoticeKind : uint8 { Info, Good, Bad };

UENUM(BlueprintType)
enum class EWSBet : uint8 { Number, Red, Black, Even, Odd, Low, High, Dozen };

/** Kopfzeile: Datum, Kontostände, Monatsbilanz. */
USTRUCT(BlueprintType)
struct FWSHudData
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString DateTime;
	UPROPERTY(BlueprintReadOnly) FString Where;
	UPROPERTY(BlueprintReadOnly) FString Wallet;
	UPROPERTY(BlueprintReadOnly) FString CompanyAccount;
	UPROPERTY(BlueprintReadOnly) FString NetWorth;
	UPROPERTY(BlueprintReadOnly) FString Last30Days;
	UPROPERTY(BlueprintReadOnly) bool bLast30Positive = true;
	UPROPERTY(BlueprintReadOnly) bool bPaused = true;
	UPROPERTY(BlueprintReadOnly) float Speed = 1;
	UPROPERTY(BlueprintReadOnly) FString NextStep;
};

/** Ein Grundstück der aktuellen Stadt, wie es dargestellt werden soll. */
USTRUCT(BlueprintType)
struct FWSPlot
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString Id;
	UPROPERTY(BlueprintReadOnly) int32 Index = 0;
	UPROPERTY(BlueprintReadOnly) EWSZone Zone = EWSZone::Residential;
	/** Mittelpunkt in Zentimetern (Unreal-Einheiten), X = Ost, Y = Süd. */
	UPROPERTY(BlueprintReadOnly) FVector2D Center = FVector2D::ZeroVector;
	/** Größe in Zentimetern. */
	UPROPERTY(BlueprintReadOnly) FVector2D Size = FVector2D::ZeroVector;
	UPROPERTY(BlueprintReadOnly) float Yaw = 0;
	UPROPERTY(BlueprintReadOnly) EWSVisual Visual = EWSVisual::None;
	UPROPERTY(BlueprintReadOnly) int32 Floors = 1;
	UPROPERTY(BlueprintReadOnly) float Hue = 0;
	UPROPERTY(BlueprintReadOnly) bool bForSale = false;
	UPROPERTY(BlueprintReadOnly) bool bForRent = false;
	UPROPERTY(BlueprintReadOnly) FString ShopName;
	UPROPERTY(BlueprintReadOnly) FString ShopKind;
	UPROPERTY(BlueprintReadOnly) FString CasinoName;
	UPROPERTY(BlueprintReadOnly) bool bMine = false;
	UPROPERTY(BlueprintReadOnly) bool bCompanyOwned = false;
	UPROPERTY(BlueprintReadOnly) bool bRented = false;
	/** Baustelle: -1 = keine, sonst Projekt-ID. */
	UPROPERTY(BlueprintReadOnly) int32 ProjectId = -1;
	UPROPERTY(BlueprintReadOnly) bool bPermitPending = false;
	UPROPERTY(BlueprintReadOnly) int32 Phase = 0;
	UPROPERTY(BlueprintReadOnly) int32 PhaseCount = 0;
	UPROPERTY(BlueprintReadOnly) FString PhaseName;
	UPROPERTY(BlueprintReadOnly) float PhaseProgress = 0;
	UPROPERTY(BlueprintReadOnly) float Progress = 0;
	UPROPERTY(BlueprintReadOnly) int32 Crew = 0;
	/** Maschinen der aktuellen Bauphase (z. B. "Bagger", "Turmdrehkran"). */
	UPROPERTY(BlueprintReadOnly) TArray<FString> Machines;
	/** Endgültiges Aussehen nach Fertigstellung (für Baustellen). */
	UPROPERTY(BlueprintReadOnly) EWSVisual TargetVisual = EWSVisual::None;
	UPROPERTY(BlueprintReadOnly) FVector2D BuildingSize = FVector2D::ZeroVector;
	UPROPERTY(BlueprintReadOnly) float BuildingHeight = 0;
};

USTRUCT(BlueprintType)
struct FWSRoad
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FVector2D From = FVector2D::ZeroVector;
	UPROPERTY(BlueprintReadOnly) FVector2D To = FVector2D::ZeroVector;
	UPROPERTY(BlueprintReadOnly) float Width = 0;
	UPROPERTY(BlueprintReadOnly) bool bHighway = false;
};

USTRUCT(BlueprintType)
struct FWSCity
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString Id;
	UPROPERTY(BlueprintReadOnly) FString Name;
	UPROPERTY(BlueprintReadOnly) FString Country;
	UPROPERTY(BlueprintReadOnly) double Lat = 0;
	UPROPERTY(BlueprintReadOnly) double Lon = 0;
	UPROPERTY(BlueprintReadOnly) int64 Population = 0;
	UPROPERTY(BlueprintReadOnly) bool bCapital = false;
};

/** Text + Preis für Auswahllisten (Gebäudetypen, Angebote, Gründungsschritte …). */
USTRUCT(BlueprintType)
struct FWSEntry
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString Id;
	UPROPERTY(BlueprintReadOnly) FString Title;
	UPROPERTY(BlueprintReadOnly) FString Detail;
	UPROPERTY(BlueprintReadOnly) FString Price;
	UPROPERTY(BlueprintReadOnly) float Progress = 0;
	UPROPERTY(BlueprintReadOnly) bool bEnabled = true;
};
