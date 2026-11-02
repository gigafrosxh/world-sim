// Kamera im Stil einer Aufbau-/Strategiekarte: nah = schräger Blick auf die Stadt,
// weit weg = Draufsicht auf die Weltkarte. Mit F wechselt man in die eigene Spielfigur.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "WSCameraPawn.generated.h"

class UCameraComponent;
class UStaticMeshComponent;

UCLASS()
class WORLDSIM_API AWSCameraPawn : public APawn
{
	GENERATED_BODY()

public:
	AWSCameraPawn();
	virtual void Tick(float DeltaSeconds) override;

	UFUNCTION(BlueprintCallable, Category = "WorldSim") void FocusOn(FVector Location, float NewDistance = 60000.f);
	UFUNCTION(BlueprintCallable, Category = "WorldSim") void TogglePlayerMode();
	UFUNCTION(BlueprintPure, Category = "WorldSim") bool IsPlayerMode() const { return bPlayerMode; }
	UFUNCTION(BlueprintPure, Category = "WorldSim") float GetDistance() const { return Distance; }

	UPROPERTY(EditAnywhere, Category = "WorldSim") float MinDistance = 2500.f;           // 25 m
	UPROPERTY(EditAnywhere, Category = "WorldSim") float MaxDistance = 2500000000.f;     // 25 000 km
	UPROPERTY(EditAnywhere, Category = "WorldSim") float WalkSpeed = 500.f;              // 5 m/s

private:
	UPROPERTY(VisibleAnywhere) TObjectPtr<UCameraComponent> Camera;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Body;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Head;

	FVector Focus = FVector::ZeroVector;
	float Distance = 60000.f;
	float Yaw = -90.f; // Norden oben
	bool bPlayerMode = false;
	FVector Avatar = FVector::ZeroVector;
	float AvatarYaw = -90.f;
};
