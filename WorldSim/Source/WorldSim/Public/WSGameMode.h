// Startet ein Spiel, baut Karte und Stadt, steuert Sonne/Tag-Nacht und die Tastenbelegung.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/PlayerController.h"
#include "WSGameMode.generated.h"

class AWSWorldMapActor;
class AWSCityActor;
class ADirectionalLight;
class UWorldSimSubsystem;

UCLASS()
class WORLDSIM_API AWSGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AWSGameMode();
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	/** Startland und -stadt für ein neues Spiel, wenn kein Spielstand existiert. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "WorldSim") FString StartCountry = TEXT("AUT");
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "WorldSim") FString PlayerName = TEXT("Alex");

	UFUNCTION(BlueprintPure, Category = "WorldSim") AWSCityActor* GetCity() const { return City; }
	UFUNCTION(BlueprintPure, Category = "WorldSim") AWSWorldMapActor* GetMap() const { return Map; }

private:
	UWorldSimSubsystem* Sim() const;
	void EnsureLighting();
	void OnCityChanged();

	UPROPERTY() TObjectPtr<AWSWorldMapActor> Map;
	UPROPERTY() TObjectPtr<AWSCityActor> City;
	UPROPERTY() TObjectPtr<ADirectionalLight> Sun;
	FString ShownCity;
};

/** Maus sichtbar, Klick wählt ein Grundstück, Tasten lösen Spielaktionen aus (siehe HUD-Hilfe). */
UCLASS()
class WORLDSIM_API AWSPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	AWSPlayerController();
	virtual void PlayerTick(float DeltaTime) override;

private:
	void SelectUnderCursor();
	UWorldSimSubsystem* Sim() const;
};
