using UnrealBuildTool;

public class WorldSim : ModuleRules
{
	public WorldSim(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		CppStandard = CppStandardVersion.Cpp20;
		// Der Simulationskern (Source/WorldSim/*/Sim) ist reines C++ und meldet Regelverstöße per Ausnahme.
		bEnableExceptions = true;

		PublicDependencyModuleNames.AddRange(new string[] {
			"Core", "CoreUObject", "Engine", "InputCore", "Json", "JsonUtilities", "ProceduralMeshComponent", "UMG", "Slate", "SlateCore"
		});
	}
}
