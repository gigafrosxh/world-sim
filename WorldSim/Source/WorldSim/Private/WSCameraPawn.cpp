#include "WSCameraPawn.h"

#include "Camera/CameraComponent.h"
#include "Components/StaticMeshComponent.h"
#include "GameFramework/PlayerController.h"
#include "InputCoreTypes.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

AWSCameraPawn::AWSCameraPawn()
{
	PrimaryActorTick.bCanEverTick = true;
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(RootComponent);
	Camera->SetFieldOfView(50.f);

	// Einfache Blockfigur: Körper + Kopf
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cylinder(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Sphere(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
	Body = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Body"));
	Head = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Head"));
	Body->SetupAttachment(RootComponent);
	Head->SetupAttachment(RootComponent);
	Body->SetStaticMesh(Cylinder.Object);
	Head->SetStaticMesh(Sphere.Object);
	for (UStaticMeshComponent* C : {Body.Get(), Head.Get()})
	{
		C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		C->SetAbsolute(true, true, true);
		C->SetVisibility(false);
	}
	Body->SetWorldScale3D(FVector(0.5f, 0.5f, 1.4f));
	Head->SetWorldScale3D(FVector(0.32f));
}

void AWSCameraPawn::FocusOn(FVector Location, float NewDistance)
{
	Focus = FVector(Location.X, Location.Y, 0);
	Distance = FMath::Clamp(NewDistance, MinDistance, MaxDistance);
	Avatar = Focus;
}

void AWSCameraPawn::TogglePlayerMode()
{
	bPlayerMode = !bPlayerMode;
	if (bPlayerMode)
	{
		Avatar = Focus;
		AvatarYaw = Yaw;
	}
	else Focus = Avatar;
	Body->SetVisibility(bPlayerMode);
	Head->SetVisibility(bPlayerMode);
}

void AWSCameraPawn::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	APlayerController* PC = Cast<APlayerController>(GetController());
	if (!PC) return;
	const float Dt = FMath::Min(DeltaSeconds, 0.1f);
	auto Down = [&](const FKey& K) { return PC->IsInputKeyDown(K); };

	FVector2D Move(0, 0);
	if (Down(EKeys::W) || Down(EKeys::Up)) Move.X += 1;
	if (Down(EKeys::S) || Down(EKeys::Down)) Move.X -= 1;
	if (Down(EKeys::D) || Down(EKeys::Right)) Move.Y += 1;
	if (Down(EKeys::A) || Down(EKeys::Left)) Move.Y -= 1;
	if (Down(EKeys::Q)) Yaw -= 90 * Dt;
	if (Down(EKeys::E)) Yaw += 90 * Dt;

	// Rechte Maustaste halten = drehen
	float MX = 0, MY = 0;
	PC->GetInputMouseDelta(MX, MY);
	if (Down(EKeys::RightMouseButton)) Yaw += MX * 0.3f;

	if (PC->WasInputKeyJustPressed(EKeys::MouseScrollUp)) Distance /= 1.25f;
	if (PC->WasInputKeyJustPressed(EKeys::MouseScrollDown)) Distance *= 1.25f;
	if (Down(EKeys::PageUp)) Distance /= FMath::Pow(3.f, Dt);
	if (Down(EKeys::PageDown)) Distance *= FMath::Pow(3.f, Dt);
	Distance = FMath::Clamp(Distance, MinDistance, MaxDistance);

	const FRotator Heading(0, Yaw, 0);
	const FVector Fwd = Heading.Vector(), Right = FRotationMatrix(Heading).GetUnitAxis(EAxis::Y);
	if (!Move.IsNearlyZero()) Move.Normalize();

	if (bPlayerMode)
	{
		const float Speed = WalkSpeed * (Down(EKeys::LeftShift) ? 3.f : 1.f);
		Avatar += (Fwd * Move.X + Right * Move.Y) * Speed * Dt;
		if (!Move.IsNearlyZero()) AvatarYaw = (Fwd * Move.X + Right * Move.Y).Rotation().Yaw;
		Body->SetWorldLocation(Avatar + FVector(0, 0, 70));
		Head->SetWorldLocation(Avatar + FVector(0, 0, 160));
		// Schulterkamera hinter der Figur
		const FRotator View(-12, Yaw, 0);
		SetActorLocation(Avatar + FVector(0, 0, 170) - View.Vector() * 450.f);
		Camera->SetWorldRotation(View);
		return;
	}

	Focus += (Fwd * Move.X + Right * Move.Y) * Distance * 0.9f * Dt;

	// Nah: schräg wie in einem Städtebauspiel; weit weg: Draufsicht wie auf einer Strategiekarte
	const float T = FMath::Clamp((FMath::Loge(Distance) - FMath::Loge(20000.f)) / (FMath::Loge(5000000.f) - FMath::Loge(20000.f)), 0.f, 1.f);
	const float Pitch = FMath::Lerp(-38.f, -89.f, T);
	const FRotator View(Pitch, Yaw, 0);
	SetActorLocation(Focus - View.Vector() * Distance);
	Camera->SetWorldRotation(View);
}
