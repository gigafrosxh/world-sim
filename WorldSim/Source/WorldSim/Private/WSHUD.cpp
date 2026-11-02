#include "WSHUD.h"

#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"
#include "WSCameraPawn.h"
#include "WSCityActor.h"
#include "WSGameMode.h"
#include "WorldSimSubsystem.h"

void AWSHUD::BeginPlay()
{
	Super::BeginPlay();
	if (UGameInstance* GI = GetGameInstance())
		if (UWorldSimSubsystem* S = GI->GetSubsystem<UWorldSimSubsystem>()) S->OnNotice.AddDynamic(this, &AWSHUD::HandleNotice);
}

void AWSHUD::HandleNotice(const FString& Text, EWSNoticeKind Kind)
{
	Toasts.Add({Text, Kind, GetWorld()->GetRealTimeSeconds() + 6.0});
	if (Toasts.Num() > 6) Toasts.RemoveAt(0);
}

void AWSHUD::Panel(float X, float Y, float W, float H)
{
	DrawRect(FLinearColor(0.05f, 0.06f, 0.08f, 0.78f), X, Y, W, H);
}

float AWSHUD::Line(const FString& Text, float X, float Y, const FLinearColor& Color, float Scale)
{
	UFont* Font = GEngine->GetMediumFont();
	DrawText(Text, Color, X, Y, Font, Scale);
	return Y + 20.f * Scale;
}

void AWSHUD::DrawHUD()
{
	Super::DrawHUD();
	UWorldSimSubsystem* S = GetGameInstance() ? GetGameInstance()->GetSubsystem<UWorldSimSubsystem>() : nullptr;
	if (!S || !S->HasGame() || !Canvas) return;
	const float W = Canvas->ClipX, H = Canvas->ClipY;
	const FLinearColor Muted(0.7f, 0.74f, 0.8f), Good(0.45f, 0.9f, 0.5f), Bad(1.f, 0.45f, 0.4f), Gold(1.f, 0.82f, 0.25f);

	// Kopfzeile
	const FWSHudData Hud = S->GetHud();
	Panel(0, 0, W, 54);
	Line(Hud.DateTime + TEXT("   ") + Hud.Where, 16, 6, FLinearColor::White, 1.1f);
	Line(Hud.bPaused ? FString(TEXT("PAUSE")) : FString::Printf(TEXT("Läuft  %gx"), Hud.Speed), 16, 30, Hud.bPaused ? Gold : Good);
	Line(TEXT("Geldbörse ") + Hud.Wallet, W * 0.38f, 6);
	Line(TEXT("Firma ") + (Hud.CompanyAccount.IsEmpty() ? FString(TEXT("–")) : Hud.CompanyAccount), W * 0.38f, 30, Muted);
	Line(TEXT("Vermögen ") + Hud.NetWorth, W * 0.62f, 6);
	Line(TEXT("Letzte 30 Tage ") + Hud.Last30Days, W * 0.62f, 30, Hud.bLast30Positive ? Good : Bad);

	// Nächster Schritt
	if (!Hud.NextStep.IsEmpty())
	{
		Panel(0, 54, W, 26);
		Line(TEXT("Nächster Schritt: ") + Hud.NextStep, 16, 58, Gold);
	}

	// Gewähltes Grundstück
	const AWSGameMode* GM = GetWorld()->GetAuthGameMode<AWSGameMode>();
	const FString PlotId = GM && GM->GetCity() ? GM->GetCity()->GetSelectedPlot() : FString();
	if (!PlotId.IsEmpty())
	{
		const TArray<FWSEntry> Info = S->DescribePlot(PlotId);
		TArray<FWSEntry> Build;
		auto Row = [&Build](const FString& Title, const FString& Value) {
			FWSEntry E;
			E.Title = Title;
			E.Price = Value;
			Build.Add(E);
		};
		for (const FWSPlot& P : S->GetPlots(S->GetPlayerCityId()))
			if (P.Id == PlotId && P.ProjectId >= 0)
			{
				Row(P.bPermitPending ? FString(TEXT("Baubewilligung läuft")) : FString::Printf(TEXT("Phase %d/%d: %s"), P.Phase + 1, P.PhaseCount, *P.PhaseName),
					FString::Printf(TEXT("%.0f %%"), P.Progress * 100));
				if (P.Machines.Num()) Row(TEXT("Maschinen"), FString::Join(P.Machines, TEXT(", ")));
				Row(TEXT("Arbeiter"), FString::FromInt(P.Crew));
			}
		const float PH = 40 + 22 * (Info.Num() + Build.Num());
		float Y = H - PH - 110;
		Panel(W - 380, Y, 364, PH);
		Y = Line(TEXT("Grundstück"), W - 366, Y + 8, Gold);
		for (const FWSEntry& E : Info)
		{
			Line(E.Title, W - 366, Y, Muted);
			Y = Line(E.Price.IsEmpty() ? E.Detail : E.Price, W - 190, Y);
		}
		for (const FWSEntry& E : Build)
		{
			Line(E.Title, W - 366, Y, Muted);
			Y = Line(E.Price, W - 190, Y, Good);
		}
	}

	// Meldungen
	const double Now = GetWorld()->GetRealTimeSeconds();
	Toasts.RemoveAll([Now](const FToast& T) { return T.Until < Now; });
	float TY = 96;
	for (const FToast& T : Toasts)
	{
		Panel(16, TY, 520, 26);
		Line(T.Text, 26, TY + 4, T.Kind == EWSNoticeKind::Bad ? Bad : T.Kind == EWSNoticeKind::Good ? Good : FLinearColor::White);
		TY += 30;
	}

	// Tastenhilfe
	const AWSCameraPawn* Pawn = GetOwningPawn() ? Cast<AWSCameraPawn>(GetOwningPawn()) : nullptr;
	Panel(0, H - 96, W, 96);
	Line(TEXT("Kamera: WASD bewegen · Mausrad zoomen · Q/E oder rechte Maustaste drehen · F Spielfigur ")
		+ FString(Pawn && Pawn->IsPlayerMode() ? TEXT("(aktiv, Shift = laufen)") : TEXT("")), 16, H - 88, Muted);
	Line(TEXT("Zeit: Leertaste Pause · 1–7 Geschwindigkeit · N nächstes Ereignis · F5 speichern · F9 laden"), 16, H - 64, Muted);
	Line(TEXT("Klick = Grundstück wählen · B kaufen (Shift+B für die Firma) · R mieten · V verkaufen · M einziehen · H bauen · G Schlosserei gründen"), 16, H - 40, Muted);
}
