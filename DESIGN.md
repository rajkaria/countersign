# Countersign interface

Countersign helps a team understand an obligation before deciding what happens next. The interface should feel like a clear finance workspace: warm white surfaces, deep green text, legible amounts and useful evidence.

## Visual language

Use semantic tokens in `src/app/globals.css`: paper, surface, surface-soft, ink, muted, line, green, accent and warning. Manrope supplies display type; DM Sans supplies reading and controls. Use tabular numbers for balances. Keep navigation at 13px or above on desktop and reading text at 15–16px. Mobile text inputs must remain at least 16px to avoid Safari focus zoom.

Borders separate working areas. Shadows belong to overlays, not every block. Radius distinguishes controls from larger panels. Diagrams show actual relationships: approved terms, acceptance, history, deterministic checks, authority and reconciliation. Label every illustrative or synthetic example.

## Navigation and content

Use `/review` for the first guided demo, `/workspace` for the full sample workspace, `/login` for private sign-in and `/docs` for the handbook. Each page needs one clear main action. Documentation should lead with what a reader can do, explain the reason, then give the technical detail and limits.

Register public guides in `src/lib/content/guides.ts`. HTML, raw Markdown, search, sitemap and LLM exports derive from those sources. Keep private originals, credentials and internal planning outside this repository.

## Interaction and accessibility

Support keyboard operation, visible focus, semantic landmarks and persistent status text. Do not encode decisions in color alone. Mobile navigation keeps topic groups; long tables and code scroll within their own bounds. Respect reduced motion. Test desktop, tablet and narrow phones, including open menus, search results and expanded examples.

## Meaning must survive styling

Model proposals cannot grant spending authority. PAY in Observe or Prepare remains analysis or a proposal. A transaction hash is not destination settlement. A timeout retains the original operation identity and capacity. Separate recorded evidence from current interactive examples and preserve each exact asset, amount and version.
