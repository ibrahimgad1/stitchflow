$ErrorActionPreference = "Stop"

$required = @(
  "PROJECT_GENERAL_REFERENCE.md",
  "PROJECT_FULL_IMPLEMENTATION_PLAN.md",
  "docs/source/clothing_factory_business_requirements_final.md",
  "docs/source/clothing_factory_domain_technical_design.md",
  "docs/source/desktop_business_management_technical_plan.md",
  "docs/audits/PERFORMANCE_SECURITY_ARCHITECTURE_AUDIT.md",
  "docs/audits/UI_UX_AUDIT.md",
  "reference_data/excel/B110.xlsx"
)

foreach ($file in $required) {
  if (-not (Test-Path $file)) {
    throw "Missing required file: $file"
  }
}

Write-Output "Documentation and reference files are organized."

