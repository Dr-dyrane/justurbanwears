# JustUrbanWears Experience System

**Status:** Approved  
**Effective:** 15 August 2026  
**Scope:** Brand Site, Shop, and Studio  
**Authority:** This document governs visual hierarchy, typography, colour, motion, spatial interaction, product presentation, mobile patterns, loading, and shared experience primitives across JustUrbanWears.

Surface-specific specifications may extend these rules, but must not contradict them. A conflicting implementation must be corrected or explicitly superseded through an ADR.

---

## Product position

> **JustUrbanWears is calm until intent appears.**

The canvas remains quiet.  
The garment carries the emotion.  
Coral appears only when a choice matters.  
Movement follows spatial meaning.  
Detail waits until the user asks for it.  
Every action responds, but not everything moves.

The three surfaces share one system and operate at different tempos:

> **The Site invites.**  
> **The Shop focuses.**  
> **The Studio resolves.**

One final law governs all three:

> **Premium must never become cryptic.**

Invitation-only should feel authored, selective, and deliberate. It must never make navigation, price, availability, fit, payment, or the next action difficult to understand.

---

## 1. Focus law

Every viewport-sized composition has a strict focus budget:

- one focal idea;
- one dominant image;
- one primary action;
- one accent cluster;
- one orchestrated motion moment.

A view may contain more information, but it may not contain more than one visual argument.

| View | Visual argument |
| --- | --- |
| Landing hero | This garment deserves another first impression. |
| Product view | This is the exact physical piece. |
| Bag and checkout | Secure this one piece. |
| Studio review | Approve or reject this evidence. |
| Studio operations | Resolve the next truthful state. |

When a composition feels crowded, do not first reduce font size. Remove competing arguments.

### Accepted landing-hero contract

The current landing hero is the canonical example of the focus law. Above the fold it may contain only:

- the JustUrbanWears wordmark;
- the issue/location label;
- the campaign headline;
- one quiet entry action;
- one garment image;
- the garment name and price.

Do not reintroduce duplicate mastheads, cover-line clusters, supporting paragraphs, a second call to action, decorative numbering, editorial plate annotations, scroll instructions, or technical proof into the first screen. Those ideas belong below the fold.

---

## 2. Same system, different tempo

Consistency means shared laws, primitives, and state behaviour. It does **not** mean equal visual intensity.

| Surface | Primary purpose | Motion amplitude | Density | Accent use |
| --- | --- | ---: | ---: | --- |
| Site | Brand desire and authorship | High, rare | Low | Signature moments |
| Shop | Discovery and purchase | Medium | Medium | Decisions and selection |
| Studio | Operational certainty | Low | Higher | Current task and exceptions |

### Site

The Site may pause, create anticipation, and use cinematic transitions. Silence and negative space are part of the content.

### Shop

The Shop may be seductive, but it must remain immediate. Product transitions can be cinematic; search, filters, bag, availability, and checkout cannot become theatre.

### Studio

Studio should feel like an atelier desk, not a magazine spread. It inherits the type, materials, controls, and state grammar with:

- shorter motion distances;
- faster transitions;
- less perspective;
- more persistent context;
- stronger state visibility;
- clear reversibility;
- no decorative delay.

Studio’s luxury comes from precision.

---

## 3. Colour and material

### Core material language

Think in materials:

> **Ink. Paper. Skin. Coral.**

Do not treat the system as raw black, white, and accent colours. The dominant blacks and whites should normally remain slightly warm so the experience feels editorial and human rather than technological.

### Compositional polarity

Light-on-dark and dark-on-light sections may coexist within the same page. Polarity is punctuation, not a theme gimmick.

A section may flip when:

- the narrative chapter changes;
- a light section provides relief after a dense dark passage;
- a dark section intensifies a garment or commitment moment;
- the content’s role genuinely changes.

Do not alternate polarity merely to create variety.

No design decision should depend on a global light/dark switch. A user or system preference may tune default canvas values where necessary, but it must not flatten authored section choreography.

### Nude is material

Nude may support:

- paper warmth;
- image matting;
- quiet selected surfaces;
- fabric-like transitions;
- soft focus layers;
- human warmth.

Nude may occupy meaningful surface area without becoming a call to action.

### Coral is intent

Coral is reserved for:

- the single primary action;
- the active selection;
- current progress;
- a deliberate editorial mark;
- a rare signature moment.

Coral is not the default colour for prices. Price is information, not action. Use scale, placement, and weight first.

Coral is also not a substitute for semantic status colours. Success, warning, error, destructive, unavailable, and offline states must remain distinguishable and accessible.

### Restraint rule

> If colour can be removed and the hierarchy still reads, remove it.

Accent should feel like a reveal, not a theme. Large coral backgrounds and repeated coral labels weaken its authority.

---

## 4. Typography

Use one characterful display face with restraint and one quiet body face. The pairing should feel selected for JustUrbanWears rather than inherited from a default design stack.

### Canonical roles

The system must define and reuse these roles:

- Display;
- Editorial headline;
- Section title;
- Product title;
- Utility label;
- Body;
- Metadata;
- Price;
- Status.

A font family alone is not a type system. Each role needs an intentional size, weight, line-height, measure, casing, and spacing behaviour.

### Scan-first hierarchy

Visible copy should work in this order:

> **See it. Feel it. Understand it. Enter.**

Headlines carry the campaign idea. Images carry desire. Labels confirm facts. Body copy exists primarily to remove friction.

Rules:

- Do not place explanatory paragraphs in a hero when an image and headline can establish the idea.
- Use short, memorable lines before prose.
- Keep dense operational data out of the display face.
- Use uppercase sparingly for utility labels and true structural metadata.
- Structural devices such as numbering, eyebrows, and dividers must encode real sequence, count, issue, or state. They are not decoration.
- Functional microcopy must remain readable; premium does not justify tiny text.

People will read after attention is earned. The interface must first be scannable.

---

## 5. Spatial and motion language

### Axis semantics

Each axis has one meaning across the product.

| Axis | Meaning | Typical interaction |
| --- | --- | --- |
| Y | Narrative and progress | Moving through an issue or workflow |
| X | Siblings and alternatives | Browsing products, images, tabs, or adjacent records |
| Z | Focus and commitment | Entering a garment, checkout, sheet, or review state |

Horizontal movement must not represent deeper detail. Vertical movement must not randomly represent sibling navigation. Z-depth means the subject has become the current focus.

Use Z subtly through:

- slight scale separation;
- controlled perspective;
- background recession;
- shared-image expansion;
- layered focus and depth.

Do not use spinning cards, exaggerated parallax, or pseudo-3D spectacle.

### Everything responds; not everything moves

Every interaction must acknowledge the user immediately. A response may be:

- 1–2px compression;
- a text-weight change;
- an underline advancing;
- a surface becoming more opaque;
- an icon changing state;
- a tactile highlight;
- a label updating;
- a restrained haptic where supported.

When every element physically moves, the interface becomes nervous. Nothing should feel inert, but most things should remain composed.

### Orchestration over scatter

Use one orchestrated motion moment per view. A hero reveal, a product focus transition, or a sheet entrance lands harder than many unrelated effects.

### Motion timing baseline

| Motion | Duration |
| --- | ---: |
| Press acknowledgement | 70–100ms |
| Hover entrance | 120ms |
| Hover release | 180–220ms |
| Small state change | 180–260ms |
| Sheet transition | 280–360ms |
| Focused product transition | 420–600ms |
| Editorial hero sequence | 700–1200ms, orchestrated |

The longest sequence must never block interaction.

### Signature underlay

The sliding button underlay is a JustUrbanWears signature, not a universal decoration.

Use it for:

- the one primary action in a view;
- entering a garment;
- continuing checkout;
- a major confirmation;
- publishing or approving in Studio.

Secondary actions should use quieter state changes such as an underline reveal, text shift, opacity change, or small icon translation.

### Loading continuity

An action icon may become its own loading state when the original meaning remains legible.

Preferred:

```text
Save
→ compress
→ trace
→ resolve into check
```

Avoid replacing a meaningful icon with an unrelated generic spinner. For route navigation, immediate spatial movement is usually better than an icon loader.

### Reduced motion

Reduced motion is a complete design mode, not a broken fallback.

Replace:

- travel with crossfade;
- perspective with opacity hierarchy;
- parallax with static depth;
- shared movement with immediate state change.

The narrative and task must remain understandable without animation.

### Performance law

“Zero lag” is measured behaviour, not a visual claim.

- A control must acknowledge input immediately, even when work continues.
- Prefer `transform` and `opacity` for motion.
- Avoid animating layout-heavy properties across large regions.
- Precompute geometry where possible.
- Treat shared-element transitions as progressive enhancement.
- Do not delay action while atmosphere finishes settling.

Performance budgets remain governed by [`../performance/BUDGETS.md`](../performance/BUDGETS.md).

---

## 6. Mobile-native interaction

### Bottom island system

The bottom island is the shared contextual container. The action pill is one state inside it, not a separate competing floating pattern.

The island may carry:

- one primary action;
- a compact product summary;
- bag state;
- progress;
- confirmation;
- contextual navigation.

Visibility is contextual:

- **Site:** keep the landing hero free of persistent bottom chrome; allow the island to emerge after the hero or when meaningful state exists.
- **Shop:** the island may persist because bag, filter, and product actions are ongoing.
- **Studio:** show it only when a current task, selection, or unresolved action exists.

A floating control with no current purpose is visual noise.

### Sheets and push stacks

On mobile, prefer:

- bottom sheets for contextual tasks;
- push-stack pages for deeper focus;
- full routes for shareable or durable states.

A desktop modal must not automatically become a smaller centred modal on mobile.

### Native behaviour first

Sheets and stacks must cooperate with:

- browser history;
- device back behaviour;
- native edge-swipe navigation;
- Escape;
- a visible close or back control;
- safe-area insets.

Drag-to-dismiss and swipe gestures are enhancements, never the only exit. Do not intercept gestures expected by the browser or operating system.

---

## 7. Product presentation

### Show, do not sell with copy

Near products, copy exists to remove friction:

- product name;
- price;
- tagged size or one fit cue;
- availability;
- one clarifying line when necessary.

The imagery and transition carry the pitch.

### Photography hierarchy

Every garment can use three distinct image roles.

#### Editorial frame — desire

- directed lighting;
- movement;
- environment;
- mood;
- Lulu or model context;
- cinematic cropping.

#### Garment truth — confidence

- neutral front;
- neutral back;
- material detail;
- construction detail;
- condition evidence;
- accurate colour.

#### Fit context — interpretation

- garment on Lulu;
- scale cues;
- measurements;
- movement or drape;
- clear AI disclosure where applicable.

> **Emotion opens the product. Evidence earns the purchase.**

Do not make every image cinematic. The editorial frame creates desire; evidence frames close the trust gap.

### Discovery to focus

Grids should expose minimal signal. Entering a garment should feel spatially continuous, but the focused item must remain a real route with:

- its own URL;
- browser history;
- direct linking;
- search visibility;
- shareable state;
- accessible page structure;
- restored grid position when navigating back.

Preferred model:

```text
Product card
→ shared-image transition
→ real product route
→ restored grid position on back
```

Do not replace product architecture with a giant modal pretending to be a page.

### Sold pieces

A sold garment may remain as part of the brand archive. Remove purchasing actions, preserve its truthful dossier, and offer a clear path back to available pieces.

---

## 8. Progressive disclosure and loading

### Disclosure

Show only the signal required for the current decision. More detail appears when the user moves deeper in Z.

- Grid: image, name, price, concise availability.
- Product focus: fit, condition, measurements, evidence, delivery, return context.
- Checkout: exact item, amount, fulfilment, payment action.
- Studio list: current state and next truthful action.
- Studio focus: evidence, history, controls, and consequences.

Every drill-down should feel like entering a subject, not opening a data dump.

### Skeleton policy

Do not introduce artificial loading to manufacture atmosphere.

- No skeleton when content can be server-rendered.
- Delay skeleton appearance enough to avoid flashes during fast requests.
- Match major geometry rather than every text line.
- Prefer calm tonal placeholders over constant shimmer.
- Preserve final image ratios exactly.
- Keep previous valid state visible during refresh where possible.
- Use optimistic updates when the action can be represented truthfully.

The best loading experience often appears not to load.

---

## 9. Atmosphere

The desired quality is **magnetic**, not addictive.

> Magnetic enough to continue.  
> Calm enough to leave.  
> Memorable enough to return.

Atmosphere comes from contrast between calm and reveal:

- a quiet canvas;
- one vivid garment moment;
- rare accent;
- meaningful motion;
- immediate feedback;
- deliberate transitions.

Do not use endless motion, artificial urgency, gamified feedback, persistent prompts, or attention-hacking loops.

Sound and haptics, when introduced, must be optional, user-initiated, restrained, and never required to understand state.

---

## 10. Shared primitives

The Site, Shop, and Studio must share these primitives rather than re-deciding them per surface.

### Typographic roles

```text
Display
Editorial headline
Section title
Product title
Utility label
Body
Metadata
Price
Status
```

### Spatial tokens

```text
Page inset
Section rhythm
Card gap
Sheet inset
Island clearance
Safe-area spacing
Focus expansion
```

### State grammar

Every interactive primitive defines:

```text
Idle
Hover
Pressed
Selected
Loading
Success
Error
Disabled
Offline
```

States must remain distinguishable without relying on colour alone.

### Focus treatment

Keyboard focus must be obvious on both light and dark compositions. Do not depend on coral alone and do not suppress native focus without supplying a stronger replacement.

### Media treatment

Shared rules must govern:

- aspect ratios;
- object positioning;
- image transitions;
- editorial versus evidence photography;
- generated-media disclosure;
- sold-piece archives.

### Layer grammar

Use one cross-surface depth hierarchy:

```text
Canvas
Content
Elevated content
Island
Sheet
Critical confirmation
```

Do not invent new elevation values or z-index systems per feature.

---

## 11. Trust and accessibility

Design expression never outranks truth, accessibility, or task completion.

- Price, availability, condition, fit, payment, and generated-media status must be explicit.
- Focused product views must remain semantic routes.
- Keyboard, touch, screen-reader, browser-back, and reduced-motion paths are first-class.
- No action may rely on gesture alone.
- Status must not rely on colour alone.
- Motion must not obscure a completed, failed, or pending state.
- Generated media must remain disclosed according to the media-truth state machine.
- One-off scarcity must never become false urgency.

When rules conflict, use this authority order:

```text
Safety and truth
→ Accessibility
→ Task clarity
→ Performance
→ Shared system
→ Surface expression
→ Decorative novelty
```

---

## 12. Surface application

### Site

- One visual argument per section.
- The garment is the boldest visual element.
- The hero remains restrained according to the accepted contract.
- Motion may be cinematic but rare.
- The brand story is shown through sequence, image, and typography before prose.

### Shop

- Discovery remains fast and scannable.
- Product cards expose minimal buying signal.
- Product focus uses a real route and a spatially continuous transition.
- Search, filter, bag, availability, and checkout favour speed over spectacle.
- The bottom island carries current buying intent without obscuring content.

### Studio

- Lists expose state and the next truthful action.
- Focused workspaces retain evidence and consequences.
- Motion amplitude is reduced.
- Loading, saving, approval, publication, payment review, fulfilment, and return states are explicit.
- Decorative delay is prohibited.

---

## 13. Non-goals

The experience system is not:

- a coral theme;
- a black/white section alternator;
- constant animation;
- 3D spectacle;
- faux-native gesture interception;
- a product-modal architecture;
- artificial loading theatre;
- identical density across Site, Shop, and Studio;
- editorial styling applied to operational complexity;
- exclusivity achieved through ambiguity.

---

## 14. Implementation sequence

Implement in this order:

```text
Shared visual, spatial, state, and motion tokens
→ Shop grid-to-route garment transition
→ Contextual bottom island and action-pill states
→ Mobile sheets and browser-native push stacks
→ Studio adoption at reduced motion amplitude
→ Performance, accessibility, and reduced-motion certification
```

Do not build isolated surface effects before the shared primitives exist.

---

## 15. Definition of done

A new or revised view is complete only when:

- its single visual argument can be stated in one sentence;
- its focus budget passes;
- one primary action is identifiable immediately;
- accent use follows the material/intent split;
- motion follows axis semantics;
- every interaction responds without becoming noisy;
- route, history, back, keyboard, touch, and reduced-motion behaviour work;
- functional text remains readable;
- semantic states remain explicit and colour-independent;
- no artificial skeleton replaces server-renderable content;
- generated media, availability, payment, and inventory truth remain intact;
- the view is tested at canonical mobile and desktop widths.

---

## Governance

This document is the current design and interaction authority for JustUrbanWears.

A change that alters any of the following requires an explicit update to this document or a superseding ADR:

- focus budget;
- colour-role separation;
- axis semantics;
- motion timing or signature behaviour;
- bottom-island grammar;
- product route/focus architecture;
- photography hierarchy;
- loading policy;
- Site, Shop, or Studio tempo.

Implementation details may evolve. The product position must remain recognisable:

> **Calm canvas. Vivid garment. Rare accent. Meaningful motion.**
