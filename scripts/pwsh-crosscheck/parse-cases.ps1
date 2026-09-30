param([string]$Dir)
$ErrorActionPreference = 'Stop'
$cases = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $Dir 'cases.json') | ConvertFrom-Json -NoEnumerate
$ast = [System.Management.Automation.Language.Ast]
function Get-Val($e) {
  switch ($e) {
    { $_ -is [System.Management.Automation.Language.ExpandableStringExpressionAst] } { throw 'expandable string' }
    { $_ -is [System.Management.Automation.Language.StringConstantExpressionAst] } { return [pscustomobject]@{ t = 's'; v = $_.Value } }
    { $_ -is [System.Management.Automation.Language.ConstantExpressionAst] } { return [pscustomobject]@{ t = 'n'; v = [double]$_.Value } }
    { $_ -is [System.Management.Automation.Language.UnaryExpressionAst] -and $_.TokenKind -eq 'Minus' } { $c = Get-Val $_.Child; return [pscustomobject]@{ t = 'n'; v = -1 * $c.v } }
    { $_ -is [System.Management.Automation.Language.ParenExpressionAst] } { return Get-Val $_.Pipeline.PipelineElements[0].Expression }
    { $_ -is [System.Management.Automation.Language.VariableExpressionAst] } {
      $n = $_.VariablePath.UserPath
      if ($n -eq 'true') { return [pscustomobject]@{ t = 'b'; v = $true } }
      if ($n -eq 'false') { return [pscustomobject]@{ t = 'b'; v = $false } }
      throw "variable $n"
    }
    { $_ -is [System.Management.Automation.Language.ArrayExpressionAst] } {
      $items = @()
      foreach ($st in $_.SubExpression.Statements) {
        $ex = $st.PipelineElements[0].Expression
        if ($ex -is [System.Management.Automation.Language.ArrayLiteralAst]) { foreach ($x in $ex.Elements) { $items += , (Get-Val $x) } } else { $items += , (Get-Val $ex) }
      }
      return [pscustomobject]@{ t = 'a'; v = $items }
    }
    { $_ -is [System.Management.Automation.Language.HashtableAst] } {
      $pairs = @()
      foreach ($kv in $_.KeyValuePairs) { $pairs += , [pscustomobject]@{ k = (Get-Val $kv.Item1).v; v = (Get-Val $kv.Item2.PipelineElements[0].Expression) } }
      return [pscustomobject]@{ t = 'h'; v = $pairs }
    }
    default { throw "unexpected node $($_.GetType().Name)" }
  }
}
$out = New-Object System.Collections.Generic.List[object]
foreach ($case in $cases) {
  $tokens = $null; $errors = $null
  $tree = [System.Management.Automation.Language.Parser]::ParseInput($case.script, [ref]$tokens, [ref]$errors)
  $result = [ordered]@{ errors = @($errors | ForEach-Object { $_.Message }); commands = @() }
  try {
    $commands = @($tree.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] }, $true))
    foreach ($command in $commands) {
      $params = [ordered]@{}
      $els = $command.CommandElements
      $i = 1
      while ($i -lt $els.Count) {
        $el = $els[$i]
        if ($el -is [System.Management.Automation.Language.CommandParameterAst]) {
          if ($el.Argument) { $params[$el.ParameterName] = Get-Val $el.Argument; $i++ }
          elseif ($i + 1 -lt $els.Count -and $els[$i + 1] -isnot [System.Management.Automation.Language.CommandParameterAst]) { $params[$el.ParameterName] = Get-Val $els[$i + 1]; $i += 2 }
          else { $params[$el.ParameterName] = [pscustomobject]@{ t = 'flag'; v = $null }; $i++ }
        } else { throw "positional element $($el.GetType().Name)" }
      }
      $result.commands += , [ordered]@{ name = $els[0].Value; params = $params }
    }
  } catch { $result.errors += "extract: $($_.Exception.Message)" }
  $out.Add($result)
}
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
[IO.File]::WriteAllText((Join-Path $Dir 'parsed.json'), (ConvertTo-Json -InputObject $out -Depth 20 -Compress), [Text.UTF8Encoding]::new($false))
