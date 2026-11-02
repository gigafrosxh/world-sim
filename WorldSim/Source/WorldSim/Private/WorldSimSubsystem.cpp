#include "WorldSimSubsystem.h"

#include "Dom/JsonObject.h"
#include "HAL/PlatformFileManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

#include <sstream>

namespace
{
	FString U(const std::string& S) { return FString(UTF8_TO_TCHAR(S.c_str())); }
	std::string S8(const FString& S) { return std::string(TCHAR_TO_UTF8(*S)); }
	WS::Account Acc(EWSAccount A) { return A == EWSAccount::Wallet ? WS::Account::Wallet : WS::Account::Company; }

	constexpr double CmPerMeter = 100.0;

	FString PlotPriceText(const WS::GameState& G, double V) { return U(WS::Money(G, V)); }
}

void UWorldSimSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	LoadWorldData();
}

void UWorldSimSubsystem::LoadWorldData()
{
	if (bWorldLoaded) return;
	const FString Dir = FPaths::ProjectContentDir() / TEXT("Data");
	FString CitiesJson, MapJson;
	if (!FFileHelper::LoadFileToString(CitiesJson, *(Dir / TEXT("cities.json"))) || !FFileHelper::LoadFileToString(MapJson, *(Dir / TEXT("map_mesh.json"))))
	{
		UE_LOG(LogTemp, Error, TEXT("WorldSim: Content/Data/cities.json oder map_mesh.json fehlt."));
		return;
	}

	std::vector<WS::RawCity> Cities;
	TArray<TSharedPtr<FJsonValue>> CityArray;
	if (FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(CitiesJson), CityArray))
	{
		Cities.reserve(CityArray.Num());
		for (const TSharedPtr<FJsonValue>& V : CityArray)
		{
			const TSharedPtr<FJsonObject> O = V->AsObject();
			Cities.push_back({S8(O->GetStringField(TEXT("n"))), S8(O->GetStringField(TEXT("a3"))), O->GetNumberField(TEXT("lat")),
				O->GetNumberField(TEXT("lon")), O->GetNumberField(TEXT("pop")), O->GetIntegerField(TEXT("cap")) == 1});
		}
	}

	std::vector<WS::CountryInfo> Countries;
	TSharedPtr<FJsonObject> Map;
	if (FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(MapJson), Map) && Map.IsValid())
	{
		for (const TSharedPtr<FJsonValue>& V : Map->GetArrayField(TEXT("countries")))
		{
			const TSharedPtr<FJsonObject> O = V->AsObject();
			Countries.push_back({S8(O->GetStringField(TEXT("a3"))), S8(O->GetStringField(TEXT("name"))), S8(O->GetStringField(TEXT("nameDe"))),
				O->GetNumberField(TEXT("pop")), O->GetNumberField(TEXT("gdp"))});
		}
	}
	WS::World::Get().Register(Cities, Countries);
	bWorldLoaded = true;
	UE_LOG(LogTemp, Log, TEXT("WorldSim: %d Orte, %d Länder geladen."), (int32)WS::World::Get().Locations().size(), (int32)Countries.size());
}

bool UWorldSimSubsystem::Run(TFunctionRef<void()> Action)
{
	if (!bHasGame) return false;
	bool bOk = true;
	try
	{
		Action();
	}
	catch (const WS::GameError& E)
	{
		Game.Notices.push_back({Game.T, E.what(), WS::NoticeKind::Bad});
		bOk = false;
	}
	catch (const std::exception& E)
	{
		UE_LOG(LogTemp, Error, TEXT("WorldSim: %s"), UTF8_TO_TCHAR(E.what()));
		bOk = false;
	}
	FlushNotices();
	OnStateChanged.Broadcast();
	return bOk;
}

void UWorldSimSubsystem::FlushNotices()
{
	for (const WS::Notice& N : Game.Notices)
		OnNotice.Broadcast(U(N.Text), N.Kind == WS::NoticeKind::Good ? EWSNoticeKind::Good : N.Kind == WS::NoticeKind::Bad ? EWSNoticeKind::Bad : EWSNoticeKind::Info);
	Game.Notices.clear();
}

// ---------- Spielstart ----------
TArray<FString> UWorldSimSubsystem::GetPlayableCountries() const
{
	TArray<FString> Out;
	for (const auto& [A3, E] : WS::CountryTable()) Out.Add(U(A3));
	return Out;
}

TArray<FWSCity> UWorldSimSubsystem::GetCities(const FString& CountryA3) const
{
	TArray<FWSCity> Out;
	const std::string A3 = S8(CountryA3);
	for (const WS::Location& L : WS::World::Get().Locations())
	{
		if (!A3.empty() && L.A3 != A3) continue;
		FWSCity C;
		C.Id = U(L.Id);
		C.Name = U(L.Name);
		C.Country = U(L.A3);
		C.Lat = L.Lat;
		C.Lon = L.Lon;
		C.Population = (int64)L.Pop;
		C.bCapital = L.Capital;
		Out.Add(C);
	}
	Out.Sort([](const FWSCity& A, const FWSCity& B) { return A.Population > B.Population; });
	return Out;
}

FString UWorldSimSubsystem::GetCountryName(const FString& CountryA3) const { return U(WS::World::Get().CountryName(S8(CountryA3))); }

void UWorldSimSubsystem::NewGame(const FString& Name, const FString& CountryA3, const FString& CityId, int32 Difficulty)
{
	LoadWorldData();
	Game = WS::NewGame(S8(Name), S8(CountryA3), S8(CityId), "#e0b030", Difficulty);
	bHasGame = true;
	FlushNotices();
	OnStateChanged.Broadcast();
}

// ---------- Zeit ----------
void UWorldSimSubsystem::Tick(float DeltaTime)
{
	const float Dt = FMath::Min(DeltaTime, 0.1f);
	try
	{
		if (SkipUntil > 0)
		{
			const double End = FMath::Min(SkipUntil, Game.T + 3 * WS::Day);
			while (Game.T < End && Game.Notices.empty()) WS::Advance(Game, 600);
			if (!Game.Notices.empty() || Game.T >= SkipUntil)
			{
				SkipUntil = 0;
				Game.Paused = true;
			}
		}
		else if (!Game.Paused)
			WS::Advance(Game, Dt * Game.Speed);
	}
	catch (const std::exception& E)
	{
		UE_LOG(LogTemp, Error, TEXT("WorldSim Tick: %s"), UTF8_TO_TCHAR(E.what()));
		Game.Paused = true;
	}
	if (!Game.Notices.empty())
	{
		FlushNotices();
		OnStateChanged.Broadcast();
	}
	AutosaveTimer += DeltaTime;
	if (AutosaveTimer > 30)
	{
		AutosaveTimer = 0;
		SaveGame();
	}
}

void UWorldSimSubsystem::SetSpeed(float Speed)
{
	Game.Speed = Speed;
	Game.Paused = false;
	SkipUntil = 0;
}

void UWorldSimSubsystem::TogglePause()
{
	SkipUntil = 0;
	Game.Paused = !Game.Paused;
}

void UWorldSimSubsystem::SkipToNextEvent() { SkipUntil = SkipUntil > 0 ? 0 : Game.T + 90 * WS::Day; }

TArray<float> UWorldSimSubsystem::GetSpeeds() const
{
	TArray<float> Out;
	for (double S : WS::Speeds) Out.Add((float)S);
	return Out;
}

float UWorldSimSubsystem::GetLocalHour() const
{
	if (!bHasGame) return 12;
	const WS::CivilDate D = WS::ToCivil(WS::LocalTime(Game));
	return D.Hour + D.Minute / 60.f;
}

FWSHudData UWorldSimSubsystem::GetHud() const
{
	FWSHudData H;
	if (!bHasGame) return H;
	static const TCHAR* Days[] = {TEXT("So"), TEXT("Mo"), TEXT("Di"), TEXT("Mi"), TEXT("Do"), TEXT("Fr"), TEXT("Sa")};
	const WS::CivilDate D = WS::ToCivil(WS::LocalTime(Game));
	H.DateTime = FString::Printf(TEXT("%s., %02d.%02d.%04d · %02d:%02d"), Days[D.Weekday], D.Day, D.Month, D.Year, D.Hour, D.Minute);
	const auto& W = WS::World::Get();
	H.Where = Game.Player.Trip ? TEXT("unterwegs nach ") + U(W.Loc(Game.Player.Trip->To).Name) : TEXT("in ") + U(W.Loc(Game.Player.LocId).Name);
	H.Wallet = U(WS::Money(Game, Game.Wallet));
	H.CompanyAccount = Game.Company ? U(WS::Money(Game, Game.CompanyAcct)) : TEXT("–");
	H.NetWorth = U(WS::Money(Game, WS::NetWorth(Game)));
	const WS::Summary30 L = WS::Last30Days(Game);
	H.Last30Days = (L.Net >= 0 ? TEXT("+") : TEXT("")) + U(WS::Money(Game, L.Net));
	H.bLast30Positive = L.Net >= 0;
	H.bPaused = Game.Paused && SkipUntil <= 0;
	H.Speed = (float)Game.Speed;
	if (!Game.Company) H.NextStep = TEXT("Gründe eine Firma, kauf dir privat ein Grundstück oder reise in eine Casino-Stadt.");
	else if (!Game.Company->Active) H.NextStep = TEXT("Die Gründung läuft. Mit „Nächstes Ereignis“ spulst du zum nächsten Schritt vor.");
	else if (WS::WorkshopArea(Game) <= 0) H.NextStep = TEXT("Miete eine Halle (grünes Schild) oder kauf ein Industriegrundstück (rotes Schild) und bau darauf.");
	else if (!Game.Company->Offers.empty()) H.NextStep = TEXT("Du hast Kundenanfragen. Nimm Aufträge an.");
	else H.NextStep = TEXT("Halte das Firmenkonto im Plus und zahl dir ein Gehalt aus.");
	return H;
}

// ---------- Stadt ----------
FString UWorldSimSubsystem::GetPlayerCityId() const { return bHasGame ? U(Game.Player.LocId) : FString(); }

TArray<FWSPlot> UWorldSimSubsystem::GetPlots(const FString& CityId) const
{
	TArray<FWSPlot> Out;
	const WS::CityLayout& L = WS::World::Get().Layout(S8(CityId));
	Out.Reserve((int32)L.Plots.size());
	for (const WS::Plot& P : L.Plots)
	{
		FWSPlot F;
		F.Id = U(P.Id);
		F.Index = P.Idx;
		F.Zone = (EWSZone)P.Zone;
		F.Center = FVector2D(P.X, P.Z) * CmPerMeter;
		F.Size = FVector2D(P.W, P.D) * CmPerMeter;
		// Modelle schauen nach +X; Straßenseite 0 = -Y, 1 = +X, 2 = +Y, 3 = -X
		static const float Yaws[] = {-90.f, 0.f, 90.f, 180.f};
		F.Yaw = Yaws[P.Facing];
		F.Floors = P.Floors;
		F.Hue = (float)P.Hue;
		F.bForSale = P.ForSale;
		F.bForRent = P.ForRent;
		F.ShopName = U(P.ShopName);
		F.ShopKind = P.Shop ? U(WS::ShopLabel(*P.Shop)) : FString();
		F.CasinoName = U(P.CasinoName);
		const WS::PlotView V = bHasGame ? WS::GetPlotView(Game, P) : WS::PlotView{P.Npc, nullptr, std::nullopt, false};
		F.Visual = (EWSVisual)V.Visual;
		F.bMine = V.Mine.has_value();
		F.bCompanyOwned = V.Mine == WS::Account::Company;
		F.bRented = V.Rented;
		if (const WS::Project* Pr = V.Project)
		{
			const WS::BuildingType& B = WS::FindBuildingType(Pr->TypeId);
			F.ProjectId = Pr->Id;
			F.bPermitPending = Pr->State == WS::ProjectState::Permit;
			F.Phase = Pr->Phase;
			F.PhaseCount = (int32)B.Phases.size();
			const WS::Phase& Ph = B.Phases[(size_t)FMath::Min(Pr->Phase, F.PhaseCount - 1)];
			F.PhaseName = U(Ph.Name);
			F.PhaseProgress = (float)FMath::Clamp(Pr->PhaseWork / (Ph.Work * B.WorkHours), 0.0, 1.0);
			F.Progress = (float)WS::ProjectProgress(*Pr);
			F.Crew = Pr->Crew;
			for (WS::Machine M : Ph.Machines) F.Machines.Add(U(WS::MachineData(M).Name));
			F.TargetVisual = (EWSVisual)B.Visual;
			F.BuildingSize = FVector2D(B.W, B.D) * CmPerMeter;
			F.BuildingHeight = (float)(B.H * CmPerMeter);
		}
		Out.Add(F);
	}
	return Out;
}

TArray<FWSRoad> UWorldSimSubsystem::GetRoads(const FString& CityId) const
{
	TArray<FWSRoad> Out;
	for (const WS::Road& R : WS::World::Get().Layout(S8(CityId)).Roads)
	{
		FWSRoad F;
		F.From = FVector2D(R.X1, R.Z1) * CmPerMeter;
		F.To = FVector2D(R.X2, R.Z2) * CmPerMeter;
		F.Width = (float)(R.W * CmPerMeter);
		F.bHighway = R.Highway;
		Out.Add(F);
	}
	return Out;
}

TArray<FWSEntry> UWorldSimSubsystem::DescribePlot(const FString& PlotIdF) const
{
	TArray<FWSEntry> Out;
	if (!bHasGame) return Out;
	const std::string PlotId = S8(PlotIdF);
	const WS::Plot& P = WS::World::Get().PlotById(PlotId);
	auto Add = [&](const FString& Title, const FString& Value) {
		FWSEntry E;
		E.Title = Title;
		E.Price = Value;
		Out.Add(E);
	};
	Add(TEXT("Fläche"), FString::Printf(TEXT("%.0f m²"), P.W * P.D));
	auto It = Game.Plots.find(PlotId);
	if (It == Game.Plots.end())
	{
		if (P.ForSale)
		{
			const WS::PlotPrice Pr = WS::GetPlotPrice(Game, PlotId);
			Add(TEXT("Grund"), PlotPriceText(Game, Pr.Land));
			if (Pr.Building > 0) Add(TEXT("Bestehendes Haus"), PlotPriceText(Game, Pr.Building));
			Add(TEXT("Nebenkosten"), PlotPriceText(Game, Pr.Fees));
			Add(TEXT("Gesamt"), PlotPriceText(Game, Pr.Total));
		}
		if (P.ForRent)
		{
			Add(TEXT("Hallenfläche"), FString::Printf(TEXT("%.0f m²"), WS::RentedArea(P)));
			Add(TEXT("Miete / Monat"), PlotPriceText(Game, WS::MonthlyRent(Game, PlotId)));
		}
		if (!P.ForSale && !P.ForRent && !P.Shop && P.CasinoName.empty()) Add(TEXT("Status"), TEXT("Privatbesitz"));
	}
	else
	{
		const WS::Ownership& O = It->second;
		Add(TEXT("Besitz"), FString(O.Rented ? TEXT("gemietet") : TEXT("Eigentum")) + (O.Owner == WS::Account::Company ? TEXT(" · Firma") : TEXT(" · privat")));
		Add(TEXT("Nutzbar ab"), Game.T < O.UsableAt ? U(WS::FormatDate(O.UsableAt)) : FString(TEXT("jetzt")));
		if (!O.Rented) Add(TEXT("Geschätzter Wert"), PlotPriceText(Game, WS::AssetValue(Game, PlotId)));
	}
	return Out;
}

TArray<FWSEntry> UWorldSimSubsystem::GetBuildOptions(const FString& PlotIdF) const
{
	TArray<FWSEntry> Out;
	if (!bHasGame) return Out;
	const std::string PlotId = S8(PlotIdF);
	const WS::CountryEconomy E = WS::Econ(Game);
	for (const WS::BuildingType& B : WS::BuildingTypes())
	{
		const auto Err = WS::CanBuild(Game, PlotId, B.Id);
		if (Err && Err->rfind("Falsche", 0) == 0) continue;
		FWSEntry F;
		F.Id = U(B.Id);
		F.Title = U(B.Name);
		const double Months = WS::EstimateWorkDays(B, B.DefaultCrew) * 7 / 5 / 30.4;
		F.Detail = Err ? U(*Err) : FString::Printf(TEXT("%s Genehmigung %d Tage, Bauzeit ≈ %.1f Monate."), *U(B.Description), WS::PermitDays(E, B), Months);
		F.Price = U(WS::Money(Game, WS::BuildCost(E, B)));
		F.bEnabled = !Err.has_value();
		Out.Add(F);
	}
	return Out;
}

// ---------- Aktionen ----------
bool UWorldSimSubsystem::FoundCompany(const FString& Name, const FString& IndustryId, bool bLtd)
{
	return Run([&] { WS::FoundCompany(Game, S8(Name), "#2f6fb3", S8(IndustryId), bLtd); });
}
bool UWorldSimSubsystem::Transfer(EWSAccount From, float Amount) { return Run([&] { WS::TransferMoney(Game, Acc(From), Amount); }); }
bool UWorldSimSubsystem::SetEmployees(int32 Count) { return Run([&] { WS::SetEmployees(Game, Count); }); }
bool UWorldSimSubsystem::AcceptOrder(int32 OrderId) { return Run([&] { WS::AcceptOrder(Game, OrderId); }); }
bool UWorldSimSubsystem::DeclineOrder(int32 OrderId) { return Run([&] { WS::DeclineOrder(Game, OrderId); }); }
bool UWorldSimSubsystem::BuyPlot(const FString& PlotId, EWSAccount Buyer) { return Run([&] { WS::BuyPlot(Game, S8(PlotId), Acc(Buyer)); }); }
bool UWorldSimSubsystem::RentPlot(const FString& PlotId) { return Run([&] { WS::RentPlot(Game, S8(PlotId)); }); }
bool UWorldSimSubsystem::SellPlot(const FString& PlotId) { return Run([&] { WS::SellPlot(Game, S8(PlotId)); }); }
bool UWorldSimSubsystem::MoveIn(const FString& PlotId) { return Run([&] { WS::MoveIn(Game, S8(PlotId)); }); }
bool UWorldSimSubsystem::StartProject(const FString& PlotId, const FString& TypeId, int32 Crew) { return Run([&] { WS::StartProject(Game, S8(PlotId), S8(TypeId), Crew); }); }
bool UWorldSimSubsystem::SetCrew(int32 ProjectId, int32 Crew) { return Run([&] { WS::SetCrew(Game, ProjectId, Crew); }); }
bool UWorldSimSubsystem::CancelProject(int32 ProjectId) { return Run([&] { WS::CancelProject(Game, ProjectId); }); }
bool UWorldSimSubsystem::TakeLoan(EWSAccount Holder, float Amount, float Years) { return Run([&] { WS::TakeLoan(Game, Acc(Holder), Amount, Years); }); }
bool UWorldSimSubsystem::TravelTo(const FString& CityId) { return Run([&] { WS::TravelTo(Game, S8(CityId)); }); }

bool UWorldSimSubsystem::BuyItem(const FString& PlotId, int32 ItemIndex, EWSAccount Account)
{
	return Run([&] {
		const WS::Plot& P = WS::World::Get().PlotById(S8(PlotId));
		if (!P.Shop) throw WS::GameError("Hier ist kein Geschäft.");
		const auto& Items = WS::ShopItems(*P.Shop);
		if (ItemIndex < 0 || ItemIndex >= (int32)Items.size()) throw WS::GameError("Artikel nicht gefunden.");
		WS::BuyItem(Game, Items[(size_t)ItemIndex].Name, Items[(size_t)ItemIndex].Price, Acc(Account), P.ShopName);
	});
}

TArray<FWSEntry> UWorldSimSubsystem::GetShopItems(const FString& PlotId) const
{
	TArray<FWSEntry> Out;
	const WS::Plot& P = WS::World::Get().PlotById(S8(PlotId));
	if (!P.Shop || !bHasGame) return Out;
	const double Scale = WS::MatScale(WS::Econ(Game));
	for (const WS::ShopItem& I : WS::ShopItems(*P.Shop))
	{
		FWSEntry E;
		E.Title = U(I.Name);
		E.Detail = I.Private ? TEXT("privat") : TEXT("für die Firma");
		E.Price = U(WS::Money(Game, FMath::RoundToDouble(I.Price * Scale)));
		Out.Add(E);
	}
	return Out;
}

TArray<FWSEntry> UWorldSimSubsystem::GetFoundingSteps() const
{
	TArray<FWSEntry> Out;
	if (!bHasGame || !Game.Company) return Out;
	for (const WS::FoundingStep& St : Game.Company->Steps)
	{
		FWSEntry E;
		E.Id = U(St.Id);
		E.Title = U(St.Label);
		E.Detail = U(St.Info);
		E.Price = U(WS::Money(Game, St.Fee + St.Capital));
		E.Progress = St.DoneAt != 0 ? 1.f : St.StartedAt != 0 ? (float)FMath::Clamp((Game.T - St.StartedAt) / (St.Days * WS::Day), 0.0, 1.0) : 0.f;
		Out.Add(E);
	}
	return Out;
}

TArray<FWSEntry> UWorldSimSubsystem::GetOffers() const
{
	TArray<FWSEntry> Out;
	if (!bHasGame || !Game.Company) return Out;
	for (const WS::Order& O : Game.Company->Offers)
	{
		FWSEntry E;
		E.Id = FString::FromInt(O.Id);
		E.Title = U(O.Name);
		E.Detail = FString::Printf(TEXT("%.0f Arbeitsstunden · Material %s · Frist %.0f Tage"), O.Hours, *U(WS::Money(Game, O.Material)), O.Deadline);
		E.Price = U(WS::Money(Game, O.Price));
		Out.Add(E);
	}
	return Out;
}

TArray<FWSEntry> UWorldSimSubsystem::GetOrders() const
{
	TArray<FWSEntry> Out;
	if (!bHasGame || !Game.Company) return Out;
	for (const WS::Order& O : Game.Company->Orders)
	{
		FWSEntry E;
		E.Id = FString::FromInt(O.Id);
		E.Title = U(O.Name);
		E.Detail = FString::Printf(TEXT("%.0f / %.0f Stunden · fällig %s"), O.Done, O.Hours, *U(WS::FormatDate(O.Deadline)));
		E.Price = U(WS::Money(Game, O.Price));
		E.Progress = (float)(O.Done / O.Hours);
		Out.Add(E);
	}
	return Out;
}

TArray<FWSEntry> UWorldSimSubsystem::GetLedger(int32 MaxEntries) const
{
	TArray<FWSEntry> Out;
	for (int32 I = (int32)Game.Ledger.size() - 1; I >= 0 && Out.Num() < MaxEntries; --I)
	{
		const WS::LedgerEntry& L = Game.Ledger[(size_t)I];
		FWSEntry E;
		E.Title = U(L.Text);
		E.Detail = U(WS::FormatDate(L.T)) + (L.Acct == WS::Account::Wallet ? TEXT(" · Geldbörserl") : TEXT(" · Firma"));
		E.Price = U(WS::Money(Game, L.Amount));
		E.bEnabled = L.Amount >= 0;
		Out.Add(E);
	}
	return Out;
}

// ---------- Casino ----------
FString UWorldSimSubsystem::GetCasinoHere() const { return bHasGame ? U(WS::CasinoHere(Game)) : FString(); }

int32 UWorldSimSubsystem::SpinRoulette(EWSBet Bet, int32 Number, float Stake, float& OutWin)
{
	int32 Result = -1;
	OutWin = 0;
	Run([&] {
		const WS::SpinResult R = WS::Spin(Game, {(WS::BetKind)Bet, Number}, Stake, FMath::FRand());
		Result = R.Result;
		OutWin = (float)R.Win;
	});
	return Result;
}

// ---------- Speichern ----------
FString UWorldSimSubsystem::SavePath() const { return FPaths::ProjectSavedDir() / TEXT("SaveGames") / TEXT("worldsim.sav"); }

bool UWorldSimSubsystem::SaveGame()
{
	if (!bHasGame) return false;
	std::ostringstream Out;
	WS::Save(Game, Out);
	const std::string Data = Out.str();
	return FFileHelper::SaveStringToFile(UTF8_TO_TCHAR(Data.c_str()), *SavePath(), FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);
}

bool UWorldSimSubsystem::HasSaveGame() const { return FPaths::FileExists(SavePath()); }

bool UWorldSimSubsystem::LoadGame()
{
	FString Text;
	if (!FFileHelper::LoadFileToString(Text, *SavePath())) return false;
	LoadWorldData();
	try
	{
		std::istringstream In(S8(Text));
		Game = WS::Load(In);
		bHasGame = true;
	}
	catch (const std::exception& E)
	{
		UE_LOG(LogTemp, Error, TEXT("WorldSim: Laden fehlgeschlagen: %s"), UTF8_TO_TCHAR(E.what()));
		return false;
	}
	OnStateChanged.Broadcast();
	return true;
}
