# Smart Lib visual system

This document is the visual source of truth for new and revised Smart Lib interfaces. Smart Lib is a closed-registration college library for students, faculty, librarians, and administrators. It should feel like a dependable campus service: calm, clear, welcoming, and practical. Do not design it like a public retail or marketing site.

## Brand

Use the Mary the Queen College identity. The official school seal is the logo; do not replace it with initials, an invented mark, or a generic book icon when representing the school.

| Role | Color | Use |
| --- | --- | --- |
| Royal blue | `#0B2447` | Primary text, navigation, primary actions, and strong headings |
| Forest green | `#1E5128` | Success, selected states, supportive accents, and secondary emphasis |
| Gold | `#FCD900` | Small highlights, selected indicators, and restrained icon accents |
| White | `#FFFFFF` | Main surfaces and text on dark primary actions |
| Soft neutral | `#F4F7F8` | Page canvas and quiet grouped regions |

Use blue and green as the stable foundation. Gold is a highlight, not a large background or body-text color. Avoid relying on color alone to communicate status; include a label or icon. Keep the palette consistent across member and staff workspaces, including dark mode.

## Typography and hierarchy

- Use the project's existing sans-serif UI font for readable interface text.
- Keep page titles concise and prominent; use section headings to make long operational pages scannable.
- Use sentence case for controls and headings. Reserve uppercase, letter-spaced labels for short section eyebrows only.
- Use readable body size and line height. Supporting text must remain legible in both themes; do not use low-contrast muted text for important status, dates, or instructions.
- Format money in Philippine pesos (`₱`) consistently.

## Layout and interaction

- Put the most common role-specific task first. Keep high-frequency actions reachable from the overview when they can be completed safely there.
- Give each piece of information one clear home. Link to its source page instead of duplicating full tables, catalogs, activity feeds, or payment histories on overview pages.
- Prefer a compact, well-labeled table for staff records and a focused list for member activity. On narrow screens, reflow records into readable stacked rows rather than forcing horizontal overflow.
- Use cards to group related information, not as decoration around every control. Avoid nested cards and repeated card grids when a heading, divider, or compact row gives clearer hierarchy.
- Keep forms aligned to a consistent grid, with labels above controls, clear required-field feedback, and no clipped or overflowing inputs.
- Use a modal for a short, focused task or confirmation. Use a dedicated page for long records, complex management, or tasks users need to revisit. Modals must fit the viewport, scroll internally when needed, and retain clear close and cancel actions.
- Make selected tabs, filters, navigation, and duration choices obvious with a visible state, text, and keyboard focus. Gold can reinforce the selection but must not be the only cue.
- Use explicit action names such as “Record payment,” “Return book,” and “View receipt.” Distinguish member requests from staff-confirmed circulation steps.

## Accessibility and dark mode

- Maintain WCAG AA contrast for normal text and controls. Check muted text, disabled fields, badges, placeholders, and text over colored surfaces in both themes.
- Preserve visible keyboard focus, semantic headings, accessible names for icon-only controls, and comfortable touch targets.
- Respect reduced-motion preferences. Motion should explain a state change, never delay a library task.
- Dark mode needs its own surface, border, text, and status colors. Do not invert the light theme mechanically or leave dark text on dark surfaces.

## Avoid

- Public-commerce language, unnecessary onboarding, decorative marketing copy, and redundant overview content.
- Generic initials in place of the school seal, arbitrary gradients, large gold surfaces, and low-contrast pastel status text.
- Repeated or ambiguous actions, browser-native confirmation dialogs, hidden selected states, clipped modal fields, and wide tables that break on mobile.
- Adding animation or component packages to solve a local layout problem. Prefer existing project components and CSS unless a specific user-facing need justifies a new dependency.

## Before changing an interface

1. Identify the user's role and the task they came to complete.
2. Check whether the information or action already exists elsewhere in that dashboard.
3. Follow this document and reuse existing components and tokens.
4. Inspect loading, empty, error, selected, disabled, and dark-mode states, as applicable.
5. Keep existing behavior and data permissions intact when making visual changes.

