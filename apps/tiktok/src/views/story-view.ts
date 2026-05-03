import { CHARACTER_NOTES, STORY_STEPS } from "../game-content";

export function renderStoryView(): string {
  return `
    <div class="view info-view">
      <section class="story-stack">
        ${STORY_STEPS.map(
          (step) => `
            <article class="story-card">
              <div class="story-card__title">${step.title}</div>
              <p>${step.body}</p>
            </article>
          `,
        ).join("")}
      </section>
      <section class="character-grid">
        ${CHARACTER_NOTES.map(
          (note) => `
            <article class="character-card">
              <div class="character-card__name">${note.name}</div>
              <div class="character-card__role">${note.role}</div>
              <p>${note.line}</p>
            </article>
          `,
        ).join("")}
      </section>
    </div>
  `;
}
