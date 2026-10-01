# DUDE — Product Requirements

The authoritative master PRD is now **[docs/DUDE_PRD.md](docs/DUDE_PRD.md)**. Start there for product direction, invariants, delivered-versus-planned status and the immediate delivery sequence.

Detailed requirements are split by domain; the master lists the supporting specifications and their authority order. Phase and milestone identifiers are unchanged. Completed inventories and implementation evidence live in [Delivery History](docs/history/DELIVERY_HISTORY.md); historical decisions and the full source reconciliation live in [Decision Log](docs/history/DECISION_LOG.md).

## Legacy Section Index

This compatibility index preserves the root entry point and former section bookmarks used in older notes and source comments. New references should link to the owning document and descriptive heading. Some mixed sections have more than one owner; follow the detailed links from the section’s new home.

| Former section | New home |
|---|---|
| <a id="section-1"></a>1 | [Product Summary](docs/DUDE_PRD.md#product-summary) |
| <a id="section-2"></a>2 | [Core Product Goal](docs/DUDE_PRD.md#core-product-goal) |
| <a id="section-3"></a>3 | [Historical V1 Success Criteria and Continuing Principles](docs/history/DELIVERY_HISTORY.md#historical-v1-success-criteria-and-continuing-principles) |
| <a id="section-4"></a>4 | [Product Principles](docs/DUDE_PRD.md#product-principles) |
| <a id="section-5"></a>5 | [Scope Evolution and Deferred Capabilities](docs/product/PRODUCT_SPEC.md#scope-evolution-and-deferred-capabilities) |
| <a id="section-6"></a>6 | [Target User](docs/DUDE_PRD.md#target-user) |
| <a id="section-7"></a>7 | [Product Surfaces](docs/product/PRODUCT_SPEC.md#product-surfaces) |
| <a id="section-8"></a>8 | [Appearance System](docs/product/UX_SPEC.md#appearance-system) |
| <a id="section-9"></a>9 | [Navigation and Information Architecture](docs/product/UX_SPEC.md#navigation-and-information-architecture) |
| <a id="section-10"></a>10 | [Standalone Web Delivery and Routing](docs/architecture/SYSTEM_ARCHITECTURE.md#standalone-web-delivery-and-routing) |
| <a id="section-11"></a>11 | [Offline Behaviour](docs/product/PRODUCT_SPEC.md#offline-behaviour) |
| <a id="section-12"></a>12 | [Tool Architecture](docs/architecture/SYSTEM_ARCHITECTURE.md#tool-architecture) |
| <a id="section-13"></a>13 | [Shared Tool Shell](docs/product/UX_SPEC.md#shared-tool-shell) |
| <a id="section-14"></a>14 | [Persistence Policy](docs/architecture/DATA_SYNC_ARCHITECTURE.md#persistence-policy) |
| <a id="section-15"></a>15 | [Worker Execution Layer](docs/architecture/SYSTEM_ARCHITECTURE.md#worker-execution-layer) |
| <a id="section-16"></a>16 | [Error and Failure Isolation](docs/architecture/SYSTEM_ARCHITECTURE.md#error-and-failure-isolation) |
| <a id="section-17"></a>17 | [Dependency Philosophy](docs/architecture/SYSTEM_ARCHITECTURE.md#dependency-philosophy) |
| <a id="section-18"></a>18 | [Testing Strategy](docs/delivery/QUALITY_AND_RELEASE.md#testing-strategy) |
| <a id="section-19"></a>19 | [Accessibility](docs/product/UX_SPEC.md#accessibility) |
| <a id="section-20"></a>20 | [Initial Showcase Tool Set](docs/history/DELIVERY_HISTORY.md#initial-showcase-tool-set) |
| <a id="section-21"></a>21 | [Roadmap Direction](docs/delivery/ROADMAP.md#roadmap-direction) |
| <a id="section-22"></a>22 | [API Integration Architecture](docs/architecture/SYSTEM_ARCHITECTURE.md#api-integration-architecture) |
| <a id="section-23"></a>23 | [Delivered Repository Architecture](docs/architecture/SYSTEM_ARCHITECTURE.md#delivered-repository-architecture) |
| <a id="section-24"></a>24 | [Suggested Tool Definition Pattern](docs/architecture/SYSTEM_ARCHITECTURE.md#suggested-tool-definition-pattern) |
| <a id="section-25"></a>25 | [Shared Services](docs/architecture/SYSTEM_ARCHITECTURE.md#shared-services) |
| <a id="section-26"></a>26 | [Command Palette Requirements](docs/product/UX_SPEC.md#command-palette-requirements) |
| <a id="section-27"></a>27 | [Home and Deck Requirements](docs/product/UX_SPEC.md#home-and-deck-requirements) |
| <a id="section-28"></a>28 | [Tool UX Conventions](docs/product/UX_SPEC.md#tool-ux-conventions) |
| <a id="section-29"></a>29 | [Large Inputs](docs/product/PRODUCT_SPEC.md#large-inputs) |
| <a id="section-30"></a>30 | [Sensitive Inputs](docs/architecture/SECURITY_ARCHITECTURE.md#sensitive-inputs) |
| <a id="section-31"></a>31 | [Security Boundaries](docs/architecture/SECURITY_ARCHITECTURE.md#security-boundaries) |
| <a id="section-32"></a>32 | [Performance Strategy](docs/architecture/SYSTEM_ARCHITECTURE.md#performance-strategy) |
| <a id="section-33"></a>33 | [Build and Deployment](docs/delivery/QUALITY_AND_RELEASE.md#build-and-deployment) |
| <a id="section-34"></a>34 | [Documentation Deliverables](docs/delivery/QUALITY_AND_RELEASE.md#documentation-deliverables) |
| <a id="section-35"></a>35 | [Historical V1 Definition of Done](docs/history/DELIVERY_HISTORY.md#historical-v1-definition-of-done) |
| <a id="section-36"></a>36 | [Deferred Definition](docs/product/PRODUCT_SPEC.md#deferred-definition) |

<a id="distributed-roadmap"></a>

- [Next delivery sequence and strict phase progression](docs/delivery/ROADMAP.md#near-term-roadmap)

<a id="appendices"></a>
<a id="reconciliation"></a>

- [Historical appendices and decision provenance](docs/history/DECISION_LOG.md)
- [Source reconciliation and traceability](docs/history/DECISION_LOG.md#reconciliation-decisions-and-requirement-traceability)
