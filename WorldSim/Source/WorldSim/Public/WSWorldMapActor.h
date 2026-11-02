// Weltkarte im Stil einer Strategie-Karte: eingefärbte Länder, Grenzen, Autobahnen,
// Bahnstrecken, Fähren und Häfen aus Natural-Earth-Daten (siehe ATTRIBUTION.md).
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "WSGeo.h"
#include "WSWorldMapActor.generated.h"

class UProceduralMeshComponent;
class UMaterialInterface;
class UMaterialInstanceDynamic;

UCLASS()
class WORLDSIM_API AWSWorldMapActor : public AActor
{
	GENERATED_BODY()

public:
	AWSWorldMapActor();
	virtual void Tick(float DeltaSeconds) override;

	/** Baut die Karte um den angegebenen Ort herum (Ursprung = dieser Ort). */
	UFUNCTION(BlueprintCallable, Category = "WorldSim") void Build(double Lat, double Lon, const FString& HighlightCountry);

	/** Basismaterial mit Vektorparameter "Color". Standard: Engine-BasicShapeMaterial. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "WorldSim") TObjectPtr<UMaterialInterface> BaseMaterial;

	const FWSProjection& Projection() const { return Proj; }

protected:
	virtual void BeginPlay() override;

private:
	struct FPolyline { TArray<FVector2D> Points; };
	struct FLineLayer { TArray<FPolyline> Lines; FLinearColor Color; double BaseWidth = 0; double ScreenFactor = 0; int32 Section = 0; };

	void LoadSources();
	void BuildFills();
	void BuildLines(double CameraHeight);
	UMaterialInstanceDynamic* Mat(const FLinearColor& C);

	UPROPERTY() TObjectPtr<UProceduralMeshComponent> Fills;
	UPROPERTY() TObjectPtr<UProceduralMeshComponent> Lines;
	UPROPERTY() TObjectPtr<UProceduralMeshComponent> Ocean;

	FWSProjection Proj;
	FString Highlight;
	bool bSourcesLoaded = false;
	int32 LineBucket = INT32_MIN;

	struct FCountryMesh { FString A3; int32 Color = 0; TArray<FVector2D> LonLat; TArray<int32> Tris; };
	TArray<FCountryMesh> Countries;
	TArray<FLineLayer> Layers; // 0 Grenzen, 1 Autobahnen, 2 Bahn, 3 Fähren, 4 Hervorhebung
	TArray<FVector2D> Ports;
};
