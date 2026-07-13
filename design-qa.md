# Map Search Result Design QA

## Evidence

- Source visual truth: `C:\Users\patri\AppData\Local\Temp\codex-clipboard-543fee5a-0644-4423-930d-5e30f6cfdd15.png`
- Browser-rendered implementation: `artifacts/design-qa/search-result-card-live-v2.png`
- Focused implementation: `artifacts/design-qa/search-result-card-focused-v2.png`
- Full-view comparison: `artifacts/design-qa/search-result-card-comparison.png`
- Focused comparison: `artifacts/design-qa/search-result-card-focused-comparison.png`
- Viewport: 1440 x 1000; evidence crop normalized to 742 x 493
- State: `/app` in demo mode, aerial map, `10060 Jasper Avenue` selected from live Google Places results

## Findings

- No actionable P0, P1, or P2 findings remain.
- Typography: the 13px semibold title, 11px secondary address, and 12px action retain clear hierarchy without the oversized CTA competing with the location.
- Spacing and layout: the rendered Google InfoWindow measures 232 x 134; the shared content is 220px wide and the action is 92 x 28. The duplicate close action and full-width button are removed.
- Colors and tokens: the popup keeps Google's white surface and native close treatment while using Level CRE's existing slate and blue tokens.
- Image quality: the real aerial Google map rendered sharply with the selected marker visible; no substitute or generated assets were used.
- Copy: `Add to map` preserves the original action meaning while using sentence case and a compact plus icon.
- Affordance and accessibility: there is one close control, the add action remains keyboard focusable, and the focus ring is inset so it cannot be clipped by the InfoWindow boundary.

## Interaction Checks

- Searched an unsaved Edmonton address through live Google Places.
- Selected a Places result and confirmed the compact popup rendered over the correct marker.
- Switched between road and aerial map modes.
- Confirmed one close control and one `Add to map` action.
- Console errors checked: none.
- Automated production map journey: passed.

## Comparison History

1. Initial implementation removed the full-width CTA and duplicate close control, but the browser capture showed the automatically focused action ring clipped at the InfoWindow edge (P2 polish issue).
2. Added an inset focus treatment and disabled requested InfoWindow focus. The post-fix aerial capture shows no clipped edge or duplicate control.

## Follow-up Polish

- No P3 item is required for this request. The same compact result component is used by the main map and the shared prospecting workspace to prevent visual drift.

final result: passed
