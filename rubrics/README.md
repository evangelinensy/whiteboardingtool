# Evaluation Rubrics

Place your rubric files in this folder. The evaluation agent will use these to score user performance during mock whiteboarding interviews.

## Rubric Categories

You can add rubrics for any of these assessment areas:

### Core Design Skills
- **Problem Framing** - How well the user defines the problem, scope, and objectives
- **Design Rigor** - Structured thinking, constraint consideration, edge cases
- **Systems Thinking** - Understanding of user flows, state management, error handling

### Communication
- **Clarity** - How well the user articulates their thoughts
- **Context Setting** - Establishing problem space and assumptions
- **Storytelling** - Walking through scenarios and user journeys

### Visual & Interaction Design
- **Low-Fidelity Wireframing** - Quality of sketches, information hierarchy
- **Component Vocabulary** - Familiarity with UI components (modals, dropdowns, etc.)
- **UX Patterns** - Knowledge of common patterns (progressive disclosure, lazy loading)
- **Interaction Design** - Micro-interactions, feedback mechanisms, affordances

### Product Thinking
- **User Empathy** - Understanding user needs and pain points
- **Prioritization** - Making trade-offs and scoping decisions
- **Metrics & Success** - Defining KPIs and success criteria

## File Format

Add your rubrics as `.md` or `.json` files. The evaluation agent will read these files.

Example structure for a rubric file:

```json
{
  "category": "Problem Framing",
  "weight": 1.5,
  "levels": {
    "1": "Does not clearly define the problem or scope",
    "2": "Partially defines problem but misses key constraints",
    "3": "Defines problem with basic constraints",
    "4": "Well-defined problem with clear constraints and objectives",
    "5": "Exceptional framing with comprehensive constraints, edge cases, and success criteria"
  },
  "keywords": ["goal", "objective", "scope", "constraint", "problem statement"],
  "examples": {
    "good": "The user clearly stated: 'Our goal is to help users with dietary restrictions find safe meals within the existing restaurant partnerships'",
    "poor": "The user jumped into solutions without defining what problem they're solving"
  }
}
```
