$ErrorActionPreference = 'Stop'
$common = @([System.Management.Automation.Cmdlet]::CommonParameters) + @([System.Management.Automation.Cmdlet]::OptionalCommonParameters)
function Get-DudeType($t) {
  if ($t -eq [string]) { 'string' }
  elseif ($t -eq [bool]) { 'boolean' }
  elseif ($t -eq [System.Management.Automation.SwitchParameter]) { 'switch' }
  elseif ($t -in @([int], [long], [double], [decimal], [single], [int16], [uint16], [uint32], [uint64], [byte])) { 'number' }
  elseif ($t -eq [string[]]) { 'string[]' }
  elseif ($t -in @([int[]], [long[]], [double[]], [uint32[]])) { 'number[]' }
  elseif ($t -eq [hashtable] -or $t -eq [System.Collections.IDictionary]) { 'hashtable' }
  elseif ($t.IsEnum) { 'string' }
  else { 'unknown' }
}
$items = Get-Command -CommandType Cmdlet | ForEach-Object {
  $command = Get-Command -Name $_.Name -CommandType Cmdlet -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $command) { return }
  $sets = @($command.ParameterSets | ForEach-Object {
    $set = $_
    [pscustomobject]@{ name = $set.Name; parameters = @($set.Parameters | Where-Object { $common -notcontains $_.Name } | ForEach-Object {
      $parameter = $_
      $values = @($parameter.Attributes | Where-Object { $_ -is [System.Management.Automation.ValidateSetAttribute] } | ForEach-Object { $_.ValidValues } | Select-Object -First 64)
      if ($values.Count -eq 0 -and $parameter.ParameterType.IsEnum) { $values = @([Enum]::GetNames($parameter.ParameterType)) }
      [pscustomobject]@{ name = $parameter.Name; type = (Get-DudeType $parameter.ParameterType); mandatory = [bool]$parameter.IsMandatory; validateSet = @($values | ForEach-Object { [string]$_ }) }
    }) }
  })
  [pscustomobject]@{ name = $command.Name; parameterSets = $sets }
}
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
ConvertTo-Json -InputObject @($items) -Depth 8 -Compress
