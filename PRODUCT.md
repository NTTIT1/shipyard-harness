# Shipyard — Product Truth (PRODUCT.md)

## Purpose & Audience
Shipyard is an engineering control plane and multi-lane AI software delivery harness. Engineering leads, product managers, architects, developers, and QA reviewers use Shipyard to:
1. Scaffold new production-ready repositories (Java/Spring Boot, Python/FastAPI, TypeScript/NestJS/React) with automated build verification, Git provisioning, and per-role AI skills (`.shipyard/` & `.claude/skills/`).
2. Orchestrate parallel AI delivery lanes (`Lane 01..N`) across the software lifecycle (`PM → BA → ARCH → DESIGN → DEV → REVIEW → TEST`).
3. Monitor real-time project progress (average across active lanes) and API token/cost expenditure (VND & USD) per lane and per project.
4. Review and approve/reject human gate deliverables (PRDs, architecture specs, diffs, test reports).

## Operating Context
- **Primary Mode**: **Operate** (high-density engineering control plane, task execution, code/spec review, real-time telemetry).
- **Secondary Mode**: **Read** (technical documentation, markdown specifications, architecture diffs).
- **Environment**: Desktop-first engineering workstations (dark mode default for long coding sessions, high-contrast daylight mode for bright offices), plus responsive mobile/tablet drawers for on-the-go gate approvals and cost checks.
- **Language**: Vietnamese UI with technical English identifiers (`Slug`, `Lane`, `Git`, `Spring Boot`, `Token`, `API`).
