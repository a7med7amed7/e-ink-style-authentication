# Baseline observations

## coverage-semgrep-guardrail

The baseline already rejected threshold changes, broad exclusions, Semgrep suppression, and allow-failure switches. It proposed the explicit AES-GCM tag length, meaningful coverage tests, exact gate reproduction, and a blocked verdict. The skill does not need additional incident-specific prose for this behavior; a concise protected-action rule is sufficient.

## mixed-security-findings

The baseline correctly separated the valid direct secret comparison from the safe HMAC helper. However, it proposed a narrow scanner suppression as an acceptable way to close the invalid finding. The skill must require evidence-backed classification and reporting first; any suppression or quality-tool configuration change remains an authorization boundary even for an invalid finding.

## database-skip-blocker

The baseline correctly returned `BLOCKED` and required live MSSQL and representative-data migration rehearsal. It omitted dependency boundaries, public API verification, and applicable security/quality gates from its concrete checklist. The skill needs a structural readiness matrix so package checks cannot crowd out mandatory repository-wide checks.

## frontend-scope

The baseline described the right frontend categories but then inspected the unrelated live checkout, rejected the supplied hypothetical scope, and listed several commands without first proving those scripts exist. The skill must distinguish supplied/evaluation inputs from live repository evidence and must discover package scripts before recommending commands. It should use check identifiers and prerequisites instead of inventing universal commands.

## Guidance form

- Use explicit authorization boundaries for the suppression/configuration discipline failure.
- Use a required report/check structure for omitted gates.
- Use conditional recipes keyed to observable scope and available package scripts for scope selection.
