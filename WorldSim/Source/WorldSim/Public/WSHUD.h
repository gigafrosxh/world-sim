// Einfaches Bildschirm-Overlay: Datum, Kontostände, nächster Schritt, Infos zum gewählten
// Grundstück, Meldungen und Tastenhilfe. Die schöne UMG-Oberfläche kommt später darauf.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "WorldSimTypes.h"
#include "WSHUD.generated.h"

UCLASS()
class WORLDSIM_API AWSHUD : public AHUD
{
	GENERATED_BODY()

public:
	virtual void BeginPlay() override;
	virtual void DrawHUD() override;

private:
	UFUNCTION() void HandleNotice(const FString& Text, EWSNoticeKind Kind);

	struct FToast { FString Text; EWSNoticeKind Kind; double Until; };
	TArray<FToast> Toasts;

	void Panel(float X, float Y, float W, float H);
	float Line(const FString& Text, float X, float Y, const FLinearColor& Color = FLinearColor::White, float Scale = 1.f);
};
