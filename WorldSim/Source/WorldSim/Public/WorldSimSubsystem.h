// Verbindet den Simulationskern mit Unreal: lädt Weltdaten, lässt die Zeit laufen,
// stellt alle Spielaktionen für Blueprints/UMG bereit und meldet Ereignisse.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Tickable.h"
#include "WorldSimTypes.h"
#include "Sim/Game.h"
#include "WorldSimSubsystem.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FWSNoticeEvent, const FString&, Text, EWSNoticeKind, Kind);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FWSStateChanged);

UCLASS()
class WORLDSIM_API UWorldSimSubsystem : public UGameInstanceSubsystem, public FTickableGameObject
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;

	// FTickableGameObject
	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override { RETURN_QUICK_DECLARE_CYCLE_STAT(UWorldSimSubsystem, STATGROUP_Tickables); }
	virtual bool IsTickable() const override { return !IsTemplate() && bHasGame; }
	virtual ETickableTickType GetTickableTickType() const override { return ETickableTickType::Conditional; }

	/** Meldungen für Spieler:innen (Toasts). Fehler kommen als Kind = Bad. */
	UPROPERTY(BlueprintAssignable) FWSNoticeEvent OnNotice;
	/** Etwas Sichtbares hat sich geändert (Grundstück gekauft, Bauphase, …): Stadt neu zeichnen. */
	UPROPERTY(BlueprintAssignable) FWSStateChanged OnStateChanged;

	// ---------- Spielstart ----------
	UFUNCTION(BlueprintPure, Category = "WorldSim") bool HasGame() const { return bHasGame; }
	UFUNCTION(BlueprintPure, Category = "WorldSim") TArray<FString> GetPlayableCountries() const;
	UFUNCTION(BlueprintPure, Category = "WorldSim") TArray<FWSCity> GetCities(const FString& CountryA3) const;
	UFUNCTION(BlueprintPure, Category = "WorldSim") FString GetCountryName(const FString& CountryA3) const;
	/** Difficulty: 0 = bescheiden, 1 = normal, 2 = Erbe. */
	UFUNCTION(BlueprintCallable, Category = "WorldSim") void NewGame(const FString& Name, const FString& CountryA3, const FString& CityId, int32 Difficulty = 1);

	// ---------- Zeit ----------
	UFUNCTION(BlueprintCallable, Category = "WorldSim|Zeit") void SetSpeed(float Speed);
	UFUNCTION(BlueprintCallable, Category = "WorldSim|Zeit") void TogglePause();
	/** Spult bis zum nächsten Ereignis vor (max. 90 Tage). */
	UFUNCTION(BlueprintCallable, Category = "WorldSim|Zeit") void SkipToNextEvent();
	UFUNCTION(BlueprintPure, Category = "WorldSim|Zeit") TArray<float> GetSpeeds() const;
	/** Ortszeit in Stunden (0–24) für Tag/Nacht. */
	UFUNCTION(BlueprintPure, Category = "WorldSim|Zeit") float GetLocalHour() const;
	UFUNCTION(BlueprintPure, Category = "WorldSim") FWSHud GetHud() const;

	// ---------- Stadt ----------
	UFUNCTION(BlueprintPure, Category = "WorldSim|Stadt") FString GetPlayerCityId() const;
	UFUNCTION(BlueprintPure, Category = "WorldSim|Stadt") TArray<FWSPlot> GetPlots(const FString& CityId) const;
	UFUNCTION(BlueprintPure, Category = "WorldSim|Stadt") TArray<FWSRoad> GetRoads(const FString& CityId) const;
	/** Klartext-Infos zum Grundstück (Preis, Besitz, Miete …) für das Kontextfenster. */
	UFUNCTION(BlueprintPure, Category = "WorldSim|Stadt") TArray<FWSEntry> DescribePlot(const FString& PlotId) const;
	UFUNCTION(BlueprintPure, Category = "WorldSim|Stadt") TArray<FWSEntry> GetBuildOptions(const FString& PlotId) const;

	// ---------- Aktionen (geben false zurück und melden den Grund per OnNotice) ----------
	UFUNCTION(BlueprintCallable, Category = "WorldSim|Firma") bool FoundCompany(const FString& Name, const FString& IndustryId, bool bLtd);
	UFUNCTION(BlueprintCallable, Category = "WorldSim|Firma") bool Transfer(EWSAccount From, float Amount);
	UFUNCTION(BlueprintCallable, Category = "WorldSim|Firma") bool SetEmployees(int32 Count);
	UFUNCTION(BlueprintCallable, Category = "WorldSim|Firma") bool AcceptOrder(int32 OrderId);
	UFUNCTION(BlueprintCallable, Category = "WorldSim|Firma") bool DeclineOrder(int32 OrderId);
	UFUNCTION(BlueprintPure, Category = "WorldSim|Firma") TArray<FWSEntry> GetFoundingSteps() const;
	UFUNCTION(BlueprintPure, Category = "WorldSim|Firma") TArray<FWSEntry> GetOffers() const;
	UFUNCTION(BlueprintPure, Category = "WorldSim|Firma") TArray<FWSEntry> GetOrders() const;
	UFUNCTION(BlueprintCallable, Category = "WorldSim|Grund") bool BuyPlot(const FString& PlotId, EWSAccount Buyer);
	UFUNCTION(BlueprintCallable, Category = "WorldSim|Grund") bool RentPlot(const FString& PlotId);
	UFUNCTION(BlueprintCallable, Category = "WorldSim|Grund") bool SellPlot(const FString& PlotId);
	UFUNCTION(BlueprintCallable, Category = "WorldSim|Grund") bool MoveIn(const FString& PlotId);
	UFUNCTION(BlueprintCallable, Category = "WorldSim|Bau") bool StartProject(const FString& PlotId, const FString& BuildingTypeId, int32 Crew);
	UFUNCTION(BlueprintCallable, Category = "WorldSim|Bau") bool SetCrew(int32 ProjectId, int32 Crew);
	UFUNCTION(BlueprintCallable, Category = "WorldSim|Bau") bool CancelProject(int32 ProjectId);
	UFUNCTION(BlueprintCallable, Category = "WorldSim|Geld") bool TakeLoan(EWSAccount Holder, float Amount, float Years);
	UFUNCTION(BlueprintCallable, Category = "WorldSim|Reisen") bool TravelTo(const FString& CityId);
	UFUNCTION(BlueprintCallable, Category = "WorldSim|Einkaufen") bool BuyItem(const FString& PlotId, int32 ItemIndex, EWSAccount Account);
	UFUNCTION(BlueprintPure, Category = "WorldSim|Einkaufen") TArray<FWSEntry> GetShopItems(const FString& PlotId) const;
	UFUNCTION(BlueprintPure, Category = "WorldSim|Geld") TArray<FWSEntry> GetLedger(int32 MaxEntries = 60) const;

	// ---------- Casino ----------
	UFUNCTION(BlueprintPure, Category = "WorldSim|Casino") FString GetCasinoHere() const;
	/** Gibt die gefallene Zahl zurück (-1 bei Fehler). OutWin = Auszahlung inkl. Einsatz. */
	UFUNCTION(BlueprintCallable, Category = "WorldSim|Casino") int32 SpinRoulette(EWSBet Bet, int32 Number, float Stake, float& OutWin);

	// ---------- Speichern ----------
	UFUNCTION(BlueprintCallable, Category = "WorldSim") bool SaveGame();
	UFUNCTION(BlueprintCallable, Category = "WorldSim") bool LoadGame();
	UFUNCTION(BlueprintPure, Category = "WorldSim") bool HasSaveGame() const;

	/** Direkter Zugriff für C++ (Darstellung). */
	const WS::GameState& State() const { return Game; }

private:
	void LoadWorldData();
	/** Führt eine Spielaktion aus; Regelverstöße werden als Meldung angezeigt. */
	bool Run(TFunctionRef<void()> Action);
	void FlushNotices();
	FString SavePath() const;

	WS::GameState Game;
	bool bHasGame = false;
	bool bWorldLoaded = false;
	double SkipUntil = 0;
	float AutosaveTimer = 0;
	FString LastVisualSignature;
};
