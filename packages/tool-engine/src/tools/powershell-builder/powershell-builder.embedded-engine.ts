import {
  analyzePowerShellScript, buildPowerShellScript, type PowerShellCmdletDefinition, type PowerShellOutputFormat, type PowerShellParameterDefinition,
} from "@dude/contracts/shared/system/powershell-builder";
export function PowerShellBuilderTool_parameterDefinition(command: PowerShellCmdletDefinition, name: string): PowerShellParameterDefinition | undefined {
    for (const set of command.parameterSets) {
        const found = set.parameters.find((parameter) => parameter.name.toLowerCase() === name.toLowerCase());
        if (found)
            return found;
    }
    return undefined;
}
export function PowerShellBuilderTool_messageFor(caught: unknown): string { return caught instanceof Error ? caught.message : String(caught); }
