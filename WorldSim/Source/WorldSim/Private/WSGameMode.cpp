#include "WSGameMode.h"

#include "Components/DirectionalLightComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/SkyLightComponent.h"
#include "Engine/DirectionalLight.h"
#include "Engine/SkyLight.h"
#include "EngineUtils.h"
#include "WSCameraPawn.h"
#include "WSCityActor.h"
#include "WSHUD.h"
#include "WSWorldMapActor.h"
#include "WorldSimSubsystem.h"

// ---------- GameMode ----------

AWSGameMode::AWSGameMode()
{
	PrimaryActorTick.bCanEverTick = true;
	DefaultPawnClass = AWSCameraPawn::StaticClass();
	PlayerControllerClass = AWSPlayerController::StaticClass();
	HUDClass = AWSHUD::StaticClass();
}

UWorldSimSubsystem* AWSGameMode::Sim() const
{
	const UGameInstance* GI = GetGameInstance();
	return GI ? GI->GetSubsystem<UWorldSimSubsystem>() : nullptr;
}

void AWSGameMode::BeginPlay()
{
	Super::BeginPlay();
	UWorldSimSubsystem* S = Sim();
	if (!S) return;
	if (!S->HasGame())
	{
		if (!(S->HasSaveGame() && S->LoadGame()))
		{
			// Neues Spiel in der Hauptstadt des Startlandes
			const TArray<FWSCity> Cities = S->GetCities(StartCountry);
			FString CityId = Cities.Num() ? Cities[0].Id : FString();
			for (const FWSCity& C : Cities)
				if (C.bCapital)
				{
					CityId = C.Id;
					break;
				}
			S->NewGame(PlayerName, StartCountry, CityId, 1);
		}
	}
	EnsureLighting();
	FActorSpawnParameters P;
	P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	Map = GetWorld()->SpawnActor<AWSWorldMapActor>(FVector::ZeroVector, FRotator::ZeroRotator, P);
	City = GetWorld()->SpawnActor<AWSCityActor>(FVector::ZeroVector, FRotator::ZeroRotator, P);
	OnCityChanged();
}

void AWSGameMode::OnCityChanged()
{
	UWorldSimSubsystem* S = Sim();
	if (!S || !S->HasGame() || !Map) return;
	ShownCity = S->GetPlayerCityId();
	for (const FWSCity& C : S->GetCities(FString()))
		if (C.Id == ShownCity)
		{
			Map->Build(C.Lat, C.Lon, S->State().Player.A3.empty() ? FString() : FString(UTF8_TO_TCHAR(S->State().Player.A3.c_str())));
			break;
		}
	if (City) City->Rebuild();
	if (APlayerController* PC = GetWorld()->GetFirstPlayerController())
		if (AWSCameraPawn* Pawn = Cast<AWSCameraPawn>(PC->GetPawn())) Pawn->FocusOn(FVector::ZeroVector, 80000.f);
}

void AWSGameMode::EnsureLighting()
{
	// Hat das Level eigenes Licht, wird es verwendet. Sonst Sonne, Himmel und Umgebungslicht anlegen.
	for (TActorIterator<ADirectionalLight> It(GetWorld()); It; ++It)
	{
		Sun = *It;
		return;
	}
	FActorSpawnParameters P;
	Sun = GetWorld()->SpawnActor<ADirectionalLight>(FVector(0, 0, 100000), FRotator(-45, 0, 0), P);
	if (Sun)
	{
		Sun->GetRootComponent()->SetMobility(EComponentMobility::Movable);
		if (UDirectionalLightComponent* L = Cast<UDirectionalLightComponent>(Sun->GetLightComponent())) L->SetAtmosphereSunLight(true);
	}
	if (ASkyAtmosphere* Sky = GetWorld()->SpawnActor<ASkyAtmosphere>(FVector::ZeroVector, FRotator::ZeroRotator, P))
		if (USkyAtmosphereComponent* C = Sky->GetComponent()) C->SetAerialPespectiveViewDistanceScale(0.05f);
	if (ASkyLight* Ambient = GetWorld()->SpawnActor<ASkyLight>(FVector::ZeroVector, FRotator::ZeroRotator, P))
	{
		USkyLightComponent* C = Ambient->GetLightComponent();
		C->SetMobility(EComponentMobility::Movable);
		C->bRealTimeCapture = true;
		C->SetIntensity(1.f);
		C->RecaptureSky();
	}
}

void AWSGameMode::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	UWorldSimSubsystem* S = Sim();
	if (!S || !S->HasGame()) return;
	if (S->GetPlayerCityId() != ShownCity) OnCityChanged();

	// Sonnenstand aus der Ortszeit: Aufgang ~6 Uhr, höchster Stand ~12 Uhr, Untergang ~18 Uhr
	if (Sun)
	{
		const float Hour = S->GetLocalHour();
		const float Elevation = 55.f * FMath::Sin((Hour - 6.f) / 12.f * UE_PI);
		Sun->SetActorRotation(FRotator(-FMath::Max(Elevation, -8.f), Hour * 15.f - 90.f, 0));
		if (ULightComponent* L = Sun->GetLightComponent()) L->SetIntensity(Elevation > 0 ? 8.f : 0.4f);
	}
}

// ---------- PlayerController ----------

AWSPlayerController::AWSPlayerController()
{
	bShowMouseCursor = true;
	bEnableClickEvents = true;
}

UWorldSimSubsystem* AWSPlayerController::Sim() const
{
	const UGameInstance* GI = GetGameInstance();
	return GI ? GI->GetSubsystem<UWorldSimSubsystem>() : nullptr;
}

void AWSPlayerController::SelectUnderCursor()
{
	const AWSGameMode* GM = GetWorld()->GetAuthGameMode<AWSGameMode>();
	if (!GM || !GM->GetCity()) return;
	FVector Origin, Dir;
	if (!DeprojectMousePositionToWorld(Origin, Dir) || Dir.Z >= -1e-4) return;
	const FVector Hit = Origin + Dir * (-Origin.Z / Dir.Z); // Schnitt mit dem Boden (Z = 0)
	GM->GetCity()->SetSelectedPlot(GM->GetCity()->PlotAt(Hit));
}

void AWSPlayerController::PlayerTick(float DeltaTime)
{
	Super::PlayerTick(DeltaTime);
	UWorldSimSubsystem* S = Sim();
	if (!S || !S->HasGame()) return;
	const AWSGameMode* GM = GetWorld()->GetAuthGameMode<AWSGameMode>();
	AWSCityActor* City = GM ? GM->GetCity() : nullptr;
	const FString Plot = City ? City->GetSelectedPlot() : FString();
	auto Pressed = [&](const FKey& K) { return WasInputKeyJustPressed(K); };

	if (Pressed(EKeys::LeftMouseButton)) SelectUnderCursor();

	// Zeit
	if (Pressed(EKeys::SpaceBar)) S->TogglePause();
	if (Pressed(EKeys::N)) S->SkipToNextEvent();
	const FKey Numbers[] = {EKeys::One, EKeys::Two, EKeys::Three, EKeys::Four, EKeys::Five, EKeys::Six, EKeys::Seven};
	const TArray<float> Speeds = S->GetSpeeds();
	for (int32 I = 0; I < Speeds.Num() && I < (int32)UE_ARRAY_COUNT(Numbers); ++I)
		if (Pressed(Numbers[I])) S->SetSpeed(Speeds[I]);

	// Firma und Grundstücke
	if (Pressed(EKeys::G)) S->FoundCompany(S->State().Player.Name.empty() ? FString(TEXT("Schlosserei")) : FString(UTF8_TO_TCHAR((S->State().Player.Name + " Metallbau").c_str())), TEXT("schlosserei"), true);
	if (!Plot.IsEmpty())
	{
		const bool bCompany = IsInputKeyDown(EKeys::LeftShift);
		if (Pressed(EKeys::B)) S->BuyPlot(Plot, bCompany ? EWSAccount::Company : EWSAccount::Wallet);
		if (Pressed(EKeys::R)) S->RentPlot(Plot);
		if (Pressed(EKeys::V)) S->SellPlot(Plot);
		if (Pressed(EKeys::M)) S->MoveIn(Plot);
		if (Pressed(EKeys::H))
		{
			// Erste mögliche Bauoption mit 6 Arbeitern starten. Geht keine, nennt die erste den Grund.
			const TArray<FWSEntry> Options = S->GetBuildOptions(Plot);
			const FWSEntry* Pick = Options.FindByPredicate([](const FWSEntry& E) { return E.bEnabled; });
			if (!Pick && Options.Num()) Pick = &Options[0];
			if (Pick) S->StartProject(Plot, Pick->Id, 6);
		}
	}

	if (Pressed(EKeys::F))
		if (AWSCameraPawn* P = Cast<AWSCameraPawn>(GetPawn())) P->TogglePlayerMode();
	if (Pressed(EKeys::F5)) S->SaveGame();
	if (Pressed(EKeys::F9)) S->LoadGame();
}
