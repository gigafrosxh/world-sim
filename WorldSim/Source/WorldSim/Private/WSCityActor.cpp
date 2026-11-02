#include "WSCityActor.h"

#include "Components/InstancedStaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"
#include "WorldSimSubsystem.h"

namespace
{
	FLinearColor Hex(uint32 RGB) { return FLinearColor(FColor((RGB >> 16) & 255, (RGB >> 8) & 255, RGB & 255)); }
	FLinearColor Hsv(float Hue, float Sat, float Val) { return FLinearColor::MakeFromHSV8((uint8)(FMath::Frac(Hue) * 255), (uint8)(Sat * 255), (uint8)(Val * 255)); }

	const FLinearColor Asphalt = Hex(0x3a3d42), Concrete = Hex(0xb9b6ad), Glass = Hex(0x5d7c99), Dark = Hex(0x2b2b2b);
	const FLinearColor RoofRed = Hex(0x9c4a32), Metal = Hex(0x8e9aa3), Yellow = Hex(0xf2b705), Orange = Hex(0xf07c1a);

	/** Kleiner deterministischer Zufall pro Grundstück (Arbeiterpositionen …). */
	float Hash01(int32 A, int32 B)
	{
		uint32 H = (uint32)A * 374761393u + (uint32)B * 668265263u;
		H = (H ^ (H >> 13)) * 1274126177u;
		return (H ^ (H >> 16)) / 4294967295.f;
	}

	bool Has(const TArray<FString>& Machines, const TCHAR* Word)
	{
		for (const FString& M : Machines)
			if (M.Contains(Word, ESearchCase::IgnoreCase)) return true;
		return false;
	}
}

AWSCityActor::AWSCityActor()
{
	PrimaryActorTick.bCanEverTick = true;
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(TEXT("/Engine/BasicShapes/Cube.Cube"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cylinder(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Sphere(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cone(TEXT("/Engine/BasicShapes/Cone.Cone"));
	static ConstructorHelpers::FObjectFinder<UMaterialInterface> Basic(TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
	Meshes = {Cube.Object, Cylinder.Object, Sphere.Object, Cone.Object};
	if (Basic.Succeeded()) BaseMaterial = Basic.Object;
}

UWorldSimSubsystem* AWSCityActor::Sim() const
{
	const UGameInstance* GI = GetGameInstance();
	return GI ? GI->GetSubsystem<UWorldSimSubsystem>() : nullptr;
}

void AWSCityActor::BeginPlay()
{
	Super::BeginPlay();
	if (UWorldSimSubsystem* S = Sim()) S->OnStateChanged.AddDynamic(this, &AWSCityActor::Rebuild);
	Rebuild();
}

void AWSCityActor::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	// Baufortschritt und Arbeitszeiten ändern sich laufend: einmal pro Sekunde neu zeichnen.
	RefreshTimer += DeltaSeconds;
	if (RefreshTimer >= 1.f) Rebuild();
}

FVector AWSCityActor::FLocalFrame::World(const FVector& LocalM) const
{
	const FVector L = FRotator(0, Yaw, 0).RotateVector(LocalM * 100.0);
	return FVector(Center.X + L.X, Center.Y + L.Y, L.Z);
}

UInstancedStaticMeshComponent* AWSCityActor::Ism(EShape Shape, const FLinearColor& Color)
{
	const FColor C = Color.ToFColor(true);
	const uint32 Key = ((uint32)Shape << 24) | ((C.R >> 2) << 12) | ((C.G >> 2) << 6) | (C.B >> 2);
	if (TObjectPtr<UInstancedStaticMeshComponent>* Found = Components.Find(Key)) return *Found;
	UInstancedStaticMeshComponent* Comp = NewObject<UInstancedStaticMeshComponent>(this);
	Comp->SetStaticMesh(Meshes[(int32)Shape]);
	Comp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Comp->SetupAttachment(RootComponent);
	Comp->RegisterComponent();
	UMaterialInstanceDynamic* M = UMaterialInstanceDynamic::Create(BaseMaterial, this);
	M->SetVectorParameterValue(TEXT("Color"), Color);
	Comp->SetMaterial(0, M);
	Components.Add(Key, Comp);
	return Comp;
}

void AWSCityActor::Add(EShape Shape, const FLocalFrame& F, const FVector& CenterM, const FVector& SizeM, const FLinearColor& Color, const FRotator& LocalRot)
{
	const FColor C = Color.ToFColor(true);
	const uint32 Key = ((uint32)Shape << 24) | ((C.R >> 2) << 12) | ((C.G >> 2) << 6) | (C.B >> 2);
	Ism(Shape, Color); // sicherstellen, dass es die Komponente gibt
	const FQuat Q = FRotator(0, F.Yaw, 0).Quaternion() * LocalRot.Quaternion();
	Pending.FindOrAdd(Key).Add(FTransform(Q, F.World(CenterM), SizeM)); // Grundformen sind 1 m groß
}

void AWSCityActor::GableRoof(const FLocalFrame& F, float W, float D, float Z, float Pitch, const FLinearColor& Color)
{
	// Zwei geneigte Platten, First quer zur Straße (entlang Y).
	const float Half = D / 2;
	const float Slab = Half / FMath::Cos(FMath::DegreesToRadians(Pitch)) + 0.3f;
	const float Rise = Half * FMath::Tan(FMath::DegreesToRadians(Pitch));
	Box(F, FVector(Half / 2, 0, Z + Rise / 2), FVector(Slab, W + 0.6f, 0.25f), Color, FRotator(-Pitch, 0, 0));
	Box(F, FVector(-Half / 2, 0, Z + Rise / 2), FVector(Slab, W + 0.6f, 0.25f), Color, FRotator(Pitch, 0, 0));
	// Giebelfüllung: um 45° gedrehter Würfel, nur bei steilen Dächern sichtbar
	if (Pitch >= 40) Box(F, FVector(0, 0, Z), FVector(D / FMath::Sqrt(2.f), W * 0.98f, D / FMath::Sqrt(2.f)), Color, FRotator(45, 0, 0));
}

void AWSCityActor::WindowBands(const FLocalFrame& F, float W, float D, int32 Floors, float FloorH, const FLinearColor& Color)
{
	for (int32 I = 0; I < Floors; ++I) Box(F, FVector(0, 0, I * FloorH + FloorH * 0.55f), FVector(D + 0.12f, W + 0.12f, FloorH * 0.38f), Color);
}

void AWSCityActor::DrawPlotGround(const FWSPlot& P)
{
	const FLocalFrame F{P.Center, 0};
	const FVector2D S = P.Size / 100.0;
	FLinearColor Ground = P.Zone == EWSZone::Industrial ? Hex(0x9c978c) : P.Zone == EWSZone::Commercial ? Hex(0xb8ad97) : P.Zone == EWSZone::Park ? Hex(0x4f7d3a) : Hex(0x6e9150);
	if (P.ProjectId >= 0) Ground = Hex(0x8a6a48); // aufgegrabene Erde
	Box(F, FVector(0, 0, 0.05f), FVector(S.X - 1, S.Y - 1, 0.1f), Ground);

	if (P.Zone == EWSZone::Park)
		for (int32 I = 0; I < 6; ++I)
		{
			const FVector At((Hash01(P.Index, I) - 0.5f) * (S.X - 6), (Hash01(P.Index, I + 9) - 0.5f) * (S.Y - 6), 0);
			Add(EShape::Cylinder, F, At + FVector(0, 0, 1.5f), FVector(0.4f, 0.4f, 3), Hex(0x5b4128));
			Add(EShape::Sphere, F, At + FVector(0, 0, 4.2f), FVector(3.6f), Hex(0x2f6b2a));
		}

	// Eigenes Grundstück: gelber Rahmen. Ausgewählt: weißer Rahmen.
	auto Frame = [&](const FLinearColor& C, float Z) {
		Box(F, FVector(0, -S.Y / 2 + 0.3f, Z), FVector(S.X, 0.6f, 0.15f), C);
		Box(F, FVector(0, S.Y / 2 - 0.3f, Z), FVector(S.X, 0.6f, 0.15f), C);
		Box(F, FVector(-S.X / 2 + 0.3f, 0, Z), FVector(0.6f, S.Y, 0.15f), C);
		Box(F, FVector(S.X / 2 - 0.3f, 0, Z), FVector(0.6f, S.Y, 0.15f), C);
	};
	if (P.bMine) Frame(Hex(0xffd23f), 0.15f);
	if (P.Id == Selected) Frame(FLinearColor::White, 0.3f);

	// "Zu verkaufen"/"Zu vermieten"-Tafel an der Straßenseite
	if ((P.bForSale || P.bForRent) && !P.bMine)
	{
		const FLocalFrame Facing{P.Center, P.Yaw};
		const float Front = (FMath::IsNearlyZero(FMath::Fmod(FMath::Abs(P.Yaw), 180.f)) ? S.X : S.Y) / 2 - 1.5f;
		Box(Facing, FVector(Front, 0, 1.2f), FVector(0.12f, 0.12f, 2.4f), Hex(0x6b5a45));
		Box(Facing, FVector(Front + 0.1f, 0, 2.3f), FVector(0.08f, 1.8f, 1.0f), P.bForSale ? Hex(0xd23b2f) : Hex(0x2f7bd2));
	}
}

void AWSCityActor::DrawRoad(const FWSRoad& R)
{
	const FVector2D Mid = (R.From + R.To) / 2;
	const FVector2D D = R.To - R.From;
	const FLocalFrame F{Mid, (float)FMath::RadiansToDegrees(FMath::Atan2(D.Y, D.X))};
	const float Len = D.Size() / 100.f, W = R.Width / 100.f;
	Box(F, FVector(0, 0, 0.04f), FVector(Len + W, W, 0.08f), R.bHighway ? Hex(0x55595f) : Asphalt);
	// Mittellinie, Autobahn mit Mittelstreifen
	if (R.bHighway) Box(F, FVector(0, 0, 0.1f), FVector(Len, 1.2f, 0.4f), Concrete);
	else if (W > 6) Box(F, FVector(0, 0, 0.09f), FVector(Len, 0.15f, 0.02f), Hex(0xe8e4d8));
}

void AWSCityActor::DrawBuilding(const FWSPlot& P, EWSVisual Visual, FVector2D SizeM, float Height, float Grow)
{
	const FLocalFrame F{P.Center, P.Yaw};
	// Nach dem Drehen: X = Tiefe (zur Straße), Y = Breite
	const bool bSideways = !FMath::IsNearlyZero(FMath::Fmod(FMath::Abs(P.Yaw), 180.f));
	float D = bSideways ? SizeM.Y : SizeM.X;
	float W = bSideways ? SizeM.X : SizeM.Y;
	const float Hh = FMath::Max(0.3f, Height * Grow); // im Bau: Wände wachsen
	const bool bDone = Grow >= 1.f;
	const FLinearColor Tint = Hsv(P.Hue, 0.25f, 0.85f);

	switch (Visual)
	{
	case EWSVisual::Container:
		Box(F, FVector(0, 0, 1.3f), FVector(6.06f, 2.44f, 2.59f), Hsv(P.Hue, 0.7f, 0.65f));
		for (int32 I = -2; I <= 2; ++I) Box(F, FVector(I * 1.2f, 0, 1.3f), FVector(0.12f, 2.5f, 2.5f), Hsv(P.Hue, 0.7f, 0.5f));
		Box(F, FVector(3.05f, 0, 1.3f), FVector(0.06f, 2.3f, 2.4f), Dark);
		break;

	case EWSVisual::TinyHouse:
		Box(F, FVector(0, 0, Hh / 2 + 0.6f), FVector(D, W, Hh), Hex(0xa8794f));
		Box(F, FVector(0, 0, 0.3f), FVector(D * 0.9f, W * 0.8f, 0.6f), Dark); // Anhänger
		if (bDone)
		{
			Box(F, FVector(0, 0, Hh + 0.85f), FVector(D + 0.6f, W + 0.6f, 0.2f), Hex(0x4a4a4a), FRotator(-8, 0, 0));
			Box(F, FVector(D / 2, W * 0.2f, 1.6f), FVector(0.06f, 0.9f, 1.9f), Hex(0x5a3a22));
			Box(F, FVector(D / 2, -W * 0.25f, 2.2f), FVector(0.06f, 1.0f, 0.8f), Glass);
		}
		break;

	case EWSVisual::House:
	{
		D = FMath::Min(D * 0.55f, 11.f);
		W = FMath::Min(W * 0.55f, 12.f);
		const float H = 3.f * FMath::Max(1, P.Floors) * Grow;
		Box(F, FVector(0, 0, H / 2), FVector(D, W, FMath::Max(0.3f, H)), Hsv(P.Hue, 0.12f, 0.95f));
		if (bDone)
		{
			GableRoof(F, W, D, H, 45, RoofRed);
			Box(F, FVector(D / 2, 0, 1.1f), FVector(0.08f, 1.1f, 2.2f), Hex(0x5a3a22)); // Tür
			for (int32 Fl = 0; Fl < FMath::Max(1, P.Floors); ++Fl)
				for (int32 Side : {-1, 1}) Box(F, FVector(D / 2, Side * W * 0.3f, Fl * 3 + 1.7f), FVector(0.08f, 1.3f, 1.2f), Glass);
			Box(F, FVector(-D * 0.2f, W * 0.3f, H + D * 0.45f), FVector(0.7f, 0.7f, 2.f), Hex(0x7a4636)); // Kamin
			Box(F, FVector(D / 2 + 3, 0, 0.06f), FVector(6, 2.5f, 0.05f), Hex(0x9a9a9a)); // Einfahrt
		}
		break;
	}

	case EWSVisual::Workshop:
	{
		Box(F, FVector(0, 0, Hh / 2), FVector(D, W, Hh), Hex(0xc7ccd1));
		if (bDone)
		{
			GableRoof(F, W, D, Height, 12, Hex(0x5f6b73));
			Box(F, FVector(D / 2, -W * 0.15f, 2.1f), FVector(0.1f, 4.f, 4.2f), Hex(0x8b949b));  // Rolltor
			for (int32 I = 0; I < 8; ++I) Box(F, FVector(D / 2 + 0.02f, -W * 0.15f, 0.4f + I * 0.5f), FVector(0.1f, 4.f, 0.05f), Hex(0x6f777d));
			Box(F, FVector(D / 2, W * 0.3f, 1.1f), FVector(0.1f, 1.f, 2.2f), Hex(0x2c4a6b));  // Tür
			Box(F, FVector(D / 2 + 0.05f, W * 0.3f, Height - 0.8f), FVector(0.1f, W * 0.3f, 0.8f), Hsv(P.Hue, 0.8f, 0.8f)); // Firmenschild
			Box(F, FVector(D / 2 + 4, 0, 0.06f), FVector(8, W, 0.05f), Asphalt); // Hof
		}
		break;
	}

	case EWSVisual::Warehouse:
	{
		Box(F, FVector(0, 0, Hh / 2), FVector(D, W, Hh), Hex(0xd9d4c7));
		if (bDone)
		{
			Box(F, FVector(0, 0, Height + 0.2f), FVector(D + 0.3f, W + 0.3f, 0.4f), Hex(0x7d8a92));
			const int32 Docks = FMath::Clamp((int32)(W / 5), 2, 8);
			for (int32 I = 0; I < Docks; ++I)
			{
				const float Y = -W / 2 + (I + 0.5f) * W / Docks;
				Box(F, FVector(D / 2, Y, 2.f), FVector(0.1f, 3.f, 3.2f), Hex(0x4e5a63));
				Box(F, FVector(D / 2 + 0.6f, Y, 0.6f), FVector(1.2f, 3.4f, 1.2f), Concrete); // Rampe
			}
		}
		break;
	}

	case EWSVisual::Factory:
	{
		Box(F, FVector(0, 0, Hh / 2), FVector(D, W, Hh), Hex(0xb6bcc2));
		if (bDone)
		{
			// Sheddach: Reihe schräger Glasflächen
			const int32 Teeth = FMath::Clamp((int32)(D / 5), 2, 12);
			const float Step = D / Teeth;
			for (int32 I = 0; I < Teeth; ++I)
			{
				const float X = -D / 2 + (I + 0.5f) * Step;
				Box(F, FVector(X, 0, Height + Step * 0.3f), FVector(Step * 1.05f, W, 0.25f), Hex(0x6d7880), FRotator(-30, 0, 0));
				Box(F, FVector(X + Step * 0.45f, 0, Height + Step * 0.3f), FVector(0.15f, W, Step * 0.55f), Glass);
			}
			Add(EShape::Cylinder, F, FVector(-D * 0.35f, W * 0.4f, Height + 6), FVector(1.4f, 1.4f, 12), Hex(0x8a5a44)); // Schornstein
			for (int32 Side : {-1, 1}) Box(F, FVector(D / 2, Side * W * 0.25f, 2.6f), FVector(0.1f, 5.f, 5.2f), Hex(0x6f7f8c));
			Box(F, FVector(D / 2 + 0.05f, 0, Height - 1), FVector(0.1f, W * 0.35f, 1.2f), Hsv(P.Hue, 0.8f, 0.8f));
			Box(F, FVector(D / 2 + 6, 0, 0.06f), FVector(12, W, 0.05f), Asphalt);
		}
		break;
	}

	case EWSVisual::Shop:
	{
		const float H = 4.5f * FMath::Max(1, P.Floors);
		D *= 0.7f;
		W *= 0.8f;
		Box(F, FVector(0, 0, H / 2), FVector(D, W, H), Hsv(P.Hue, 0.15f, 0.92f));
		Box(F, FVector(D / 2 + 0.05f, 0, 1.6f), FVector(0.1f, W * 0.85f, 2.6f), Glass);             // Schaufenster
		Box(F, FVector(D / 2 + 0.9f, 0, 3.2f), FVector(1.8f, W * 0.9f, 0.15f), Hsv(P.Hue, 0.8f, 0.75f), FRotator(-12, 0, 0)); // Markise
		Box(F, FVector(D / 2 + 0.1f, 0, H - 0.6f), FVector(0.15f, W * 0.6f, 0.9f), Hsv(P.Hue + 0.5f, 0.8f, 0.8f)); // Schild
		Box(F, FVector(D / 2 + 5, 0, 0.06f), FVector(8, W, 0.05f), Asphalt); // Parkplatz
		break;
	}

	case EWSVisual::Casino:
	{
		const float H = 12;
		Box(F, FVector(0, 0, H / 2), FVector(D * 0.7f, W * 0.8f, H), Hex(0xf0e6d0));
		Add(EShape::Sphere, F, FVector(0, 0, H), FVector(W * 0.35f), Hex(0xd4af37)); // Kuppel
		for (int32 I = -2; I <= 2; ++I) Add(EShape::Cylinder, F, FVector(D * 0.35f + 0.8f, I * W * 0.15f, 4), FVector(0.8f, 0.8f, 8), FLinearColor::White);
		Box(F, FVector(D * 0.35f + 0.9f, 0, 8.6f), FVector(1.8f, W * 0.7f, 1.2f), Hex(0xb3121e)); // Leuchtschrift
		break;
	}

	case EWSVisual::Apartment:
	case EWSVisual::Office:
	case EWSVisual::Tower:
	{
		const bool bTower = Visual == EWSVisual::Tower;
		const int32 Floors = FMath::Max(2, P.Floors);
		const float FloorH = Visual == EWSVisual::Apartment ? 3.f : 3.6f;
		const float H = Floors * FloorH;
		D *= bTower ? 0.5f : 0.7f;
		W *= bTower ? 0.5f : 0.75f;
		const FLinearColor Wall = Visual == EWSVisual::Apartment ? Hsv(P.Hue, 0.18f, 0.9f) : Hsv(0.58f, 0.1f, 0.75f);
		Box(F, FVector(0, 0, H / 2), FVector(D, W, H), Wall);
		WindowBands(F, W, D, Floors, FloorH, Visual == EWSVisual::Apartment ? Hex(0x41566b) : Glass);
		Box(F, FVector(0, 0, H + 1), FVector(D * 0.3f, W * 0.3f, 2), Concrete); // Technikaufbau
		if (bTower) Add(EShape::Cylinder, F, FVector(0, 0, H + 8), FVector(0.4f, 0.4f, 12), Metal);
		if (Visual == EWSVisual::Apartment)
			for (int32 Fl = 1; Fl < Floors; ++Fl) Box(F, FVector(D / 2 + 0.7f, 0, Fl * FloorH), FVector(1.4f, W * 0.5f, 0.2f), Concrete); // Balkone
		break;
	}

	default:
		break;
	}
}

void AWSCityActor::DrawSite(const FWSPlot& P)
{
	const FLocalFrame F{P.Center, P.Yaw};
	const bool bSideways = !FMath::IsNearlyZero(FMath::Fmod(FMath::Abs(P.Yaw), 180.f));
	const FVector2D Plot = P.Size / 100.0;
	const float PD = bSideways ? Plot.Y : Plot.X, PW = bSideways ? Plot.X : Plot.Y;
	const FVector2D B = P.BuildingSize / 100.0;
	const float D = FMath::Min(bSideways ? B.Y : B.X, PD - 4), W = FMath::Min(bSideways ? B.X : B.Y, PW - 4);
	const float H = P.BuildingHeight / 100.f;

	// Bauzaun (weiß/orange)
	for (int32 Side : {-1, 1})
	{
		Box(F, FVector(Side * (PD / 2 - 1), 0, 1), FVector(0.1f, PW - 2, 2), Side > 0 ? Orange : FLinearColor::White);
		Box(F, FVector(0, Side * (PW / 2 - 1), 1), FVector(PD - 2, 0.1f, 2), FLinearColor::White);
	}
	// Bautafel
	Box(F, FVector(PD / 2 - 0.8f, PW * 0.3f, 2.2f), FVector(0.1f, 3, 1.6f), Hex(0x1f4e8c));

	if (P.bPermitPending) return; // Baubewilligung: Grundstück abgesteckt, sonst nichts

	// Gebäude wächst mit dem Fortschritt; Fundament-Phase zeigt nur die Bodenplatte
	const float Grow = FMath::Clamp(P.Progress, 0.f, 1.f);
	if (P.Phase == 0) Box(F, FVector(0, 0, -0.4f + 0.5f * P.PhaseProgress), FVector(D, W, 0.8f), Concrete);
	else
	{
		DrawBuilding(P, P.TargetVisual, FVector2D(bSideways ? W : D, bSideways ? D : W), H, Grow);
		// Gerüst an der Front
		if (Grow < 0.95f)
			for (int32 I = 0; I <= 4; ++I) Box(F, FVector(D / 2 + 0.8f, -W / 2 + I * W / 4, H * Grow / 2 + 0.5f), FVector(0.12f, 0.12f, H * Grow + 1), Metal);
	}

	// Maschinen der aktuellen Phase
	const float Yard = D / 2 + FMath::Max(2.5f, (PD - D) / 4);
	if (Has(P.Machines, TEXT("Bagger")))
	{
		const FVector At(Yard, -W * 0.25f, 0);
		Box(F, At + FVector(0, 0, 0.5f), FVector(4, 2.5f, 0.8f), Dark);            // Kette
		Box(F, At + FVector(0, 0, 1.6f), FVector(3, 2.4f, 1.4f), Yellow);          // Oberwagen
		Box(F, At + FVector(-0.6f, 0.6f, 2.8f), FVector(1.2f, 1.1f, 1.2f), Glass); // Kabine
		Box(F, At + FVector(2.4f, -0.4f, 2.6f), FVector(3.5f, 0.4f, 0.4f), Yellow, FRotator(25, 0, 0)); // Ausleger
	}
	if (Has(P.Machines, TEXT("kran")))
	{
		const FVector At(-D / 2 - 2, W / 2 + 1.5f, 0);
		const float Mast = H + 10;
		Box(F, At + FVector(0, 0, Mast / 2), FVector(1.4f, 1.4f, Mast), Yellow);
		Box(F, At + FVector(D * 0.4f, 0, Mast), FVector(D + 8, 1, 1), Yellow);     // Ausleger
		Box(F, At + FVector(-5, 0, Mast - 0.6f), FVector(3, 2, 2), Concrete);       // Gegengewicht
		Box(F, At + FVector(D * 0.6f, 0, Mast / 2 + H / 2), FVector(0.05f, 0.05f, Mast - H), Dark); // Seil
	}
	if (Has(P.Machines, TEXT("Beton")))
	{
		const FVector At(Yard + 2, W * 0.25f, 0);
		Box(F, At + FVector(1.5f, 0, 1.5f), FVector(2, 2.4f, 2.2f), FLinearColor::White);  // Fahrerhaus
		Box(F, At + FVector(-2, 0, 0.6f), FVector(6, 2.4f, 0.6f), Dark);
		Add(EShape::Cylinder, F, At + FVector(-2, 0, 2.2f), FVector(2.2f, 2.2f, 4.5f), Orange, FRotator(-75, 0, 0)); // Trommel
	}
	if (Has(P.Machines, TEXT("LKW")) || Has(P.Machines, TEXT("Lkw")))
	{
		const FVector At(Yard + 1, 0, 0);
		Box(F, At + FVector(2.5f, 0, 1.6f), FVector(2, 2.5f, 2.6f), Hex(0xc8102e));
		Box(F, At + FVector(-1.5f, 0, 1.4f), FVector(6, 2.5f, 1.4f), Hex(0x6d6d6d));
	}
	if (Has(P.Machines, TEXT("Stapler")) || Has(P.Machines, TEXT("Hebebühne")))
	{
		const FVector At(Yard - 1, W * 0.35f, 0);
		Box(F, At + FVector(0, 0, 1), FVector(2.2f, 1.2f, 1.6f), Orange);
		Box(F, At + FVector(1.3f, 0, 1.6f), FVector(0.15f, 1, 3), Dark);
	}

	// Arbeiter nur während der Arbeitszeit (Mo–Fr 7–16 Uhr Ortszeit)
	if (LocalHour >= 7 && LocalHour < 16)
	{
		const int32 Shown = FMath::Min(P.Crew, 24);
		const int32 Tick = (int32)(LocalHour * 4); // alle 15 Spielminuten neue Positionen
		for (int32 I = 0; I < Shown; ++I)
		{
			const FVector At((Hash01(P.Index * 31 + I, Tick) - 0.5f) * (PD - 4), (Hash01(P.Index * 17 + I, Tick + 7) - 0.5f) * (PW - 4), 0);
			Add(EShape::Cylinder, F, At + FVector(0, 0, 0.85f), FVector(0.45f, 0.45f, 1.7f), Orange);
			Add(EShape::Sphere, F, At + FVector(0, 0, 1.85f), FVector(0.3f), Yellow);
		}
	}
}

void AWSCityActor::Rebuild()
{
	RefreshTimer = 0;
	UWorldSimSubsystem* S = Sim();
	if (!S || !S->HasGame()) return;
	CityId = S->GetPlayerCityId();
	LocalHour = S->GetLocalHour();
	Plots = S->GetPlots(CityId);

	for (AActor* A : Spawned)
		if (IsValid(A)) A->Destroy();
	Spawned.Reset();
	Pending.Reset();

	// Boden unter der ganzen Stadt
	FBox2D Bounds(ForceInit);
	for (const FWSPlot& P : Plots) Bounds += FBox2D(P.Center - P.Size / 2, P.Center + P.Size / 2);
	if (Bounds.bIsValid)
	{
		const FVector2D Ext = Bounds.GetSize() / 100.0 + FVector2D(400, 400);
		Box(FLocalFrame{Bounds.GetCenter(), 0}, FVector(0, 0, -0.05f), FVector(Ext.X, Ext.Y, 0.1f), Hex(0x5f7d45));
	}

	for (const FWSRoad& R : S->GetRoads(CityId)) DrawRoad(R);
	for (const FWSPlot& P : Plots)
	{
		DrawPlotGround(P);
		if (P.ProjectId >= 0)
		{
			DrawSite(P);
			continue;
		}
		if (P.Visual == EWSVisual::None) continue;
		if (const TSubclassOf<AActor>* Cls = VisualOverrides.Find(P.Visual); Cls && *Cls)
		{
			FActorSpawnParameters Params;
			Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
			if (AActor* A = GetWorld()->SpawnActor<AActor>(*Cls, FVector(P.Center, 0), FRotator(0, P.Yaw, 0), Params)) Spawned.Add(A);
			continue;
		}
		const float Height = P.Visual == EWSVisual::Factory ? 10.f : P.Visual == EWSVisual::Warehouse ? 8.f : P.Visual == EWSVisual::Workshop ? 5.f : 2.8f;
		const FVector2D Foot = P.Size / 100.0 * (P.Visual == EWSVisual::Workshop || P.Visual == EWSVisual::Factory || P.Visual == EWSVisual::Warehouse ? 0.6f : 1.f);
		DrawBuilding(P, P.Visual, P.Visual == EWSVisual::TinyHouse ? FVector2D(9, 3) : Foot, Height, 1.f);
	}

	for (auto& Pair : Components)
	{
		Pair.Value->ClearInstances();
		if (TArray<FTransform>* T = Pending.Find(Pair.Key)) Pair.Value->AddInstances(*T, false, false);
	}
	Pending.Reset();
}

FString AWSCityActor::PlotAt(FVector WorldLocation) const
{
	const FVector2D P(WorldLocation.X, WorldLocation.Y);
	for (const FWSPlot& Plot : Plots)
		if (FMath::Abs(P.X - Plot.Center.X) <= Plot.Size.X / 2 && FMath::Abs(P.Y - Plot.Center.Y) <= Plot.Size.Y / 2) return Plot.Id;
	return FString();
}

FVector AWSCityActor::PlotCenter(const FString& PlotId) const
{
	for (const FWSPlot& Plot : Plots)
		if (Plot.Id == PlotId) return FVector(Plot.Center, 0);
	return FVector::ZeroVector;
}

void AWSCityActor::SetSelectedPlot(const FString& PlotId)
{
	Selected = PlotId;
	Rebuild();
}
