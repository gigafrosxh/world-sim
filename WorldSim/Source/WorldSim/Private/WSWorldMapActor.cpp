#include "WSWorldMapActor.h"

#include "Dom/JsonObject.h"
#include "Kismet/GameplayStatics.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "ProceduralMeshComponent.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Camera/PlayerCameraManager.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	// Gleiche Farben wie der Web-Prototyp, gedeckte Kartentöne.
	const FColor Palette[] = {
		FColor(0x8f, 0x6f, 0x4f), FColor(0x5f, 0x7f, 0x4a), FColor(0xa0, 0x52, 0x5a), FColor(0x4f, 0x6f, 0x8f), FColor(0x9a, 0x8a, 0x4a),
		FColor(0x6f, 0x5a, 0x8a), FColor(0x4f, 0x8a, 0x7a), FColor(0xa0, 0x70, 0x3a), FColor(0x7a, 0x7a, 0x5a), FColor(0x5a, 0x6a, 0x9a),
		FColor(0x8a, 0x4a, 0x6a), FColor(0x6a, 0x8a, 0x5a), FColor(0x9a, 0x6a, 0x4a)};
	constexpr int32 PaletteCount = UE_ARRAY_COUNT(Palette);
	constexpr int32 HighlightSection = PaletteCount;

	bool LoadJson(const FString& File, TSharedPtr<FJsonValue>& Out)
	{
		FString Text;
		if (!FFileHelper::LoadFileToString(Text, *(FPaths::ProjectContentDir() / TEXT("Data") / File))) return false;
		return FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Out) && Out.IsValid();
	}

	/** Liste von Linienzügen [[lon,lat,lon,lat,…], …] einlesen. */
	void ReadPolylines(const TSharedPtr<FJsonValue>& V, TArray<TArray<FVector2D>>& Out)
	{
		for (const TSharedPtr<FJsonValue>& L : V->AsArray())
		{
			const TArray<TSharedPtr<FJsonValue>>& Nums = L->AsArray();
			TArray<FVector2D>& P = Out.AddDefaulted_GetRef();
			for (int32 I = 0; I + 1 < Nums.Num(); I += 2) P.Add(FVector2D(Nums[I]->AsNumber(), Nums[I + 1]->AsNumber()));
		}
	}

	/** Dreiecke in beide Richtungen, damit die Fläche von oben sichtbar ist, egal wie die Quelle sie ordnet. */
	void AddTri(TArray<int32>& T, int32 A, int32 B, int32 C)
	{
		T.Append({A, B, C, A, C, B});
	}
}

AWSWorldMapActor::AWSWorldMapActor()
{
	PrimaryActorTick.bCanEverTick = true;
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	Ocean = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Ocean"));
	Fills = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Countries"));
	Lines = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Lines"));
	for (UProceduralMeshComponent* C : {Ocean.Get(), Fills.Get(), Lines.Get()})
	{
		C->SetupAttachment(RootComponent);
		C->SetCastShadow(false);
		C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		C->bUseAsyncCooking = true;
	}
	static ConstructorHelpers::FObjectFinder<UMaterialInterface> Basic(TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
	if (Basic.Succeeded()) BaseMaterial = Basic.Object;
}

void AWSWorldMapActor::BeginPlay()
{
	Super::BeginPlay();
	LoadSources();
}

UMaterialInstanceDynamic* AWSWorldMapActor::Mat(const FLinearColor& C)
{
	UMaterialInstanceDynamic* M = UMaterialInstanceDynamic::Create(BaseMaterial, this);
	M->SetVectorParameterValue(TEXT("Color"), C);
	return M;
}

void AWSWorldMapActor::LoadSources()
{
	if (bSourcesLoaded) return;
	bSourcesLoaded = true;

	TSharedPtr<FJsonValue> Map;
	if (!LoadJson(TEXT("map_mesh.json"), Map))
	{
		UE_LOG(LogTemp, Error, TEXT("WorldSim: map_mesh.json fehlt (prototype-web/scripts/export-unreal-mesh.mjs ausführen)."));
		return;
	}
	FLineLayer Borders;
	Borders.Color = FLinearColor(FColor(0x1a, 0x14, 0x10));
	Borders.BaseWidth = 800 * 100;   // 800 m
	Borders.ScreenFactor = 0.0025;   // bleibt beim Herauszoomen sichtbar
	for (const TSharedPtr<FJsonValue>& V : Map->AsObject()->GetArrayField(TEXT("countries")))
	{
		const TSharedPtr<FJsonObject> O = V->AsObject();
		FCountryMesh& C = Countries.AddDefaulted_GetRef();
		C.A3 = O->GetStringField(TEXT("a3"));
		C.Color = (int32)O->GetNumberField(TEXT("color"));
		const TArray<TSharedPtr<FJsonValue>>& Verts = O->GetArrayField(TEXT("verts"));
		for (int32 I = 0; I + 1 < Verts.Num(); I += 2) C.LonLat.Add(FVector2D(Verts[I]->AsNumber(), Verts[I + 1]->AsNumber()));
		for (const TSharedPtr<FJsonValue>& T : O->GetArrayField(TEXT("tris"))) C.Tris.Add((int32)T->AsNumber());
		const TArray<TSharedPtr<FJsonValue>>& B = O->GetArrayField(TEXT("border"));
		for (int32 I = 0; I + 3 < B.Num(); I += 4)
			Borders.Lines.Add({{FVector2D(B[I]->AsNumber(), B[I + 1]->AsNumber()), FVector2D(B[I + 2]->AsNumber(), B[I + 3]->AsNumber())}});
	}
	Layers.Add(MoveTemp(Borders));

	auto AddLayer = [&](const TCHAR* File, FColor Color, double WidthM, double ScreenFactor) {
		FLineLayer L;
		L.Color = FLinearColor(Color);
		L.BaseWidth = WidthM * 100;
		L.ScreenFactor = ScreenFactor;
		TSharedPtr<FJsonValue> V;
		if (LoadJson(File, V))
		{
			TArray<TArray<FVector2D>> Polys;
			ReadPolylines(V, Polys);
			for (TArray<FVector2D>& P : Polys) L.Lines.Add({MoveTemp(P)});
		}
		Layers.Add(MoveTemp(L));
	};
	AddLayer(TEXT("highways.json"), FColor(0xe8, 0xa2, 0x3a), 60, 0.0018);
	AddLayer(TEXT("railways.json"), FColor(0x2a, 0x2a, 0x2a), 40, 0.0014);
	AddLayer(TEXT("ferries.json"), FColor(0x9f, 0xd0, 0xff), 60, 0.0012);

	TSharedPtr<FJsonValue> PortsJson;
	if (LoadJson(TEXT("ports.json"), PortsJson))
		for (const TSharedPtr<FJsonValue>& P : PortsJson->AsArray())
		{
			const TArray<TSharedPtr<FJsonValue>>& A = P->AsArray();
			if (A.Num() >= 3) Ports.Add(FVector2D(A[1]->AsNumber(), A[2]->AsNumber()));
		}
}

void AWSWorldMapActor::Build(double Lat, double Lon, const FString& HighlightCountry)
{
	LoadSources();
	Proj.Lat0 = Lat;
	Proj.Lon0 = Lon;
	Highlight = HighlightCountry;
	BuildFills();
	LineBucket = INT32_MIN; // Linien beim nächsten Tick passend zur Zoomstufe neu bauen
}

void AWSWorldMapActor::BuildFills()
{
	// Meer: eine große Fläche
	{
		const FVector2D A = Proj.ToWorld(84, -179.9), B = Proj.ToWorld(-84, 179.9);
		TArray<FVector> V = {FVector(A.X, A.Y, 0), FVector(B.X, A.Y, 0), FVector(B.X, B.Y, 0), FVector(A.X, B.Y, 0)};
		TArray<int32> T;
		AddTri(T, 0, 1, 2);
		AddTri(T, 0, 2, 3);
		Ocean->CreateMeshSection_LinearColor(0, V, T, {FVector::UpVector, FVector::UpVector, FVector::UpVector, FVector::UpVector}, {}, {}, {}, false);
		Ocean->SetMaterial(0, Mat(FLinearColor(FColor(0x2d, 0x4d, 0x68))));
	}

	TArray<TArray<FVector>> SecV;
	TArray<TArray<int32>> SecT;
	SecV.SetNum(PaletteCount + 1);
	SecT.SetNum(PaletteCount + 1);
	for (const FCountryMesh& C : Countries)
	{
		const int32 S = C.A3 == Highlight ? HighlightSection : (C.Color * 3 + (C.A3.Len() ? (int32)C.A3[0] : 0)) % PaletteCount;
		const int32 Base = SecV[S].Num();
		for (const FVector2D& P : C.LonLat)
		{
			const FVector2D W = Proj.ToWorld(P.Y, P.X);
			SecV[S].Add(FVector(W.X, W.Y, 0));
		}
		for (int32 I = 0; I + 2 < C.Tris.Num(); I += 3) AddTri(SecT[S], Base + C.Tris[I], Base + C.Tris[I + 1], Base + C.Tris[I + 2]);
	}
	Fills->ClearAllMeshSections();
	for (int32 S = 0; S <= PaletteCount; ++S)
	{
		if (SecT[S].IsEmpty()) continue;
		TArray<FVector> N;
		N.Init(FVector::UpVector, SecV[S].Num());
		Fills->CreateMeshSection_LinearColor(S, SecV[S], SecT[S], N, {}, {}, {}, false);
		Fills->SetMaterial(S, Mat(S == HighlightSection ? FLinearColor(FColor(0xc9, 0xa2, 0x4a)) : FLinearColor(Palette[S])));
	}
}

void AWSWorldMapActor::BuildLines(double CameraHeight)
{
	Lines->ClearAllMeshSections();
	TArray<FVector> V;
	TArray<int32> T;
	TArray<FVector> N;
	for (int32 L = 0; L < Layers.Num(); ++L)
	{
		const FLineLayer& Layer = Layers[L];
		V.Reset();
		T.Reset();
		const double Half = 0.5 * FMath::Max(Layer.BaseWidth, CameraHeight * Layer.ScreenFactor);
		const float Z = L * 0.3f; // Grenzen ganz unten, Fähren oben; echte Höhe kommt über die Komponente
		for (const FPolyline& P : Layer.Lines)
			for (int32 I = 0; I + 1 < P.Points.Num(); ++I)
			{
				const FVector2D A = Proj.ToWorld(P.Points[I].Y, P.Points[I].X);
				const FVector2D B = Proj.ToWorld(P.Points[I + 1].Y, P.Points[I + 1].X);
				FVector2D D = B - A;
				if (D.SizeSquared() < 1) continue;
				D.Normalize();
				const FVector2D Side(-D.Y * Half, D.X * Half);
				const int32 Base = V.Num();
				V.Add(FVector(A + Side, Z));
				V.Add(FVector(A - Side, Z));
				V.Add(FVector(B - Side, Z));
				V.Add(FVector(B + Side, Z));
				AddTri(T, Base, Base + 1, Base + 2);
				AddTri(T, Base, Base + 2, Base + 3);
			}
		if (T.IsEmpty()) continue;
		N.Init(FVector::UpVector, V.Num());
		Lines->CreateMeshSection_LinearColor(L, V, T, N, {}, {}, {}, false);
		Lines->SetMaterial(L, Mat(Layer.Color));
	}

	// Häfen als kleine blaue Quadrate
	V.Reset();
	T.Reset();
	const double PortHalf = FMath::Max(400.0 * 100, CameraHeight * 0.004);
	for (const FVector2D& P : Ports)
	{
		const FVector2D W = Proj.ToWorld(P.Y, P.X);
		const int32 Base = V.Num();
		V.Add(FVector(W.X - PortHalf, W.Y - PortHalf, 1.5f));
		V.Add(FVector(W.X + PortHalf, W.Y - PortHalf, 1.5f));
		V.Add(FVector(W.X + PortHalf, W.Y + PortHalf, 1.5f));
		V.Add(FVector(W.X - PortHalf, W.Y + PortHalf, 1.5f));
		AddTri(T, Base, Base + 1, Base + 2);
		AddTri(T, Base, Base + 2, Base + 3);
	}
	if (!T.IsEmpty())
	{
		N.Init(FVector::UpVector, V.Num());
		Lines->CreateMeshSection_LinearColor(Layers.Num(), V, T, N, {}, {}, {}, false);
		Lines->SetMaterial(Layers.Num(), Mat(FLinearColor(FColor(0x3f, 0xa7, 0xff))));
	}
}

void AWSWorldMapActor::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	const APlayerCameraManager* Cam = UGameplayStatics::GetPlayerCameraManager(this, 0);
	if (!Cam) return;
	const double Height = FMath::Max(1000.0, Cam->GetCameraLocation().Z);

	// Ebenen-Abstand wächst mit der Kamerahöhe, sonst flimmern Flächen aus großer Entfernung.
	// Die Stadt liegt auf Z = 0 und damit immer über der Karte.
	const double K = FMath::Max(5.0, Height * 2e-4);
	Ocean->SetRelativeLocation(FVector(0, 0, -4 * K));
	Fills->SetRelativeLocation(FVector(0, 0, -3 * K));
	Lines->SetRelativeLocation(FVector(0, 0, -2 * K));
	Lines->SetRelativeScale3D(FVector(1, 1, K / 2)); // trennt die Linienebenen untereinander

	// Linienbreite in Stufen (Faktor 2) an die Zoomstufe anpassen
	const int32 Bucket = FMath::FloorToInt32(FMath::Log2(Height));
	if (Bucket != LineBucket)
	{
		LineBucket = Bucket;
		BuildLines(FMath::Pow(2.0, Bucket + 0.5));
	}
}
