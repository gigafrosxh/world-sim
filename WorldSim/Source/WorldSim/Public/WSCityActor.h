// Zeichnet die aktuelle Stadt: Grundstücke, Straßen, erkennbare Gebäude (Werkstatt mit Rolltor,
// Halle mit Sheddach, Haus mit Satteldach …) und Baustellen mit Maschinen und Arbeitern.
// Alles aus Engine-Grundformen, damit es ohne eigene Assets läuft. Eigene Modelle lassen sich
// pro Gebäudeart über VisualOverrides einhängen.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "WorldSimTypes.h"
#include "WSCityActor.generated.h"

class UInstancedStaticMeshComponent;
class UMaterialInterface;
class UStaticMesh;
class UWorldSimSubsystem;

UCLASS()
class WORLDSIM_API AWSCityActor : public AActor
{
	GENERATED_BODY()

public:
	AWSCityActor();
	virtual void Tick(float DeltaSeconds) override;

	/** Eigene Gebäude-Actors je Gebäudeart (optional). Sie werden in der Grundstücksmitte gespawnt, Front zeigt nach +X. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "WorldSim") TMap<EWSVisual, TSubclassOf<AActor>> VisualOverrides;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "WorldSim") TObjectPtr<UMaterialInterface> BaseMaterial;

	UFUNCTION(BlueprintCallable, Category = "WorldSim") void Rebuild();
	/** Grundstück unter einem Weltpunkt, leer wenn keines. */
	UFUNCTION(BlueprintPure, Category = "WorldSim") FString PlotAt(FVector WorldLocation) const;
	UFUNCTION(BlueprintCallable, Category = "WorldSim") void SetSelectedPlot(const FString& PlotId);
	UFUNCTION(BlueprintPure, Category = "WorldSim") FString GetSelectedPlot() const { return Selected; }
	UFUNCTION(BlueprintPure, Category = "WorldSim") FString GetCityId() const { return CityId; }
	/** Mittelpunkt eines Grundstücks in Weltkoordinaten. */
	UFUNCTION(BlueprintPure, Category = "WorldSim") FVector PlotCenter(const FString& PlotId) const;

protected:
	virtual void BeginPlay() override;

private:
	enum class EShape : uint8 { Cube, Cylinder, Sphere, Cone };

	/** Ein Bauteil im lokalen Gebäuderaum: X = nach vorne (Straße), Y = rechts, Z = oben, Maße in Metern. */
	struct FFrame
	{
		FVector2D Center; // cm, Welt
		float Yaw = 0;
		FVector World(const FVector& LocalM) const;
	};

	void Add(EShape Shape, const FFrame& F, const FVector& CenterM, const FVector& SizeM, const FLinearColor& Color, const FRotator& LocalRot = FRotator::ZeroRotator);
	void Box(const FFrame& F, const FVector& CenterM, const FVector& SizeM, const FLinearColor& Color, const FRotator& Rot = FRotator::ZeroRotator)
	{
		Add(EShape::Cube, F, CenterM, SizeM, Color, Rot);
	}
	void GableRoof(const FFrame& F, float W, float D, float Z, float Pitch, const FLinearColor& Color);
	void WindowBands(const FFrame& F, float W, float D, int32 Floors, float FloorH, const FLinearColor& Color);

	void DrawBuilding(const FWSPlot& P, EWSVisual Visual, FVector2D SizeM, float Height, float Grow);
	void DrawSite(const FWSPlot& P);
	void DrawPlotGround(const FWSPlot& P);
	void DrawRoad(const FWSRoad& R);

	UInstancedStaticMeshComponent* Ism(EShape Shape, const FLinearColor& Color);
	UWorldSimSubsystem* Sim() const;

	UPROPERTY() TArray<TObjectPtr<UStaticMesh>> Meshes;
	UPROPERTY() TMap<uint32, TObjectPtr<UInstancedStaticMeshComponent>> Components;
	UPROPERTY() TArray<TObjectPtr<AActor>> Spawned;
	TMap<uint32, TArray<FTransform>> Pending;

	TArray<FWSPlot> Plots;
	FString CityId;
	FString Selected;
	float RefreshTimer = 0;
	float LocalHour = 12;
};
