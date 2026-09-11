param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string] $Executable,

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $ChildArguments
)

& $Executable @ChildArguments
exit $LASTEXITCODE
