import { languages, type Language, type UploadCopy } from "../i18n";
import type { WorkspaceStep } from "../types";

type HeroMetricsProps = {
  copy: UploadCopy;
  currentStep: WorkspaceStep;
  language: Language;
  setLanguage: (language: Language) => void;
};

const workspaceSteps: WorkspaceStep[] = ["upload", "preview", "source"];

export function HeroMetrics({
  copy,
  currentStep,
  language,
  setLanguage,
}: HeroMetricsProps) {
  return (
    <section className="hero-band">
      <div className="hero-copy">
        <p className="eyebrow">{copy.hero.eyebrow}</p>
        <h1>{copy.hero.title}</h1>
        <p className="hero-description">{copy.hero.description}</p>
      </div>
      <div className="stepper" aria-label={copy.steps.current}>
        {workspaceSteps.map((step, index) => (
          <div
            className={`stepper-item${currentStep === step ? " stepper-item-active" : ""}`}
            key={step}
          >
            <span>{index + 1}</span>
            <strong>{copy.steps[step]}</strong>
          </div>
        ))}
      </div>
      <div className="hero-side">
        <label className="language-switcher">
          <span className="visually-hidden">{copy.languageToggleLabel}</span>
          <select
            aria-label={copy.languageToggleLabel}
            value={language}
            onChange={(event) => setLanguage(event.target.value as Language)}
          >
            {languages.map((option) => (
              <option key={option} value={option}>
                {uploadLanguageName(option)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

function uploadLanguageName(language: Language) {
  return language === "ja" ? "日本語" : "English";
}
