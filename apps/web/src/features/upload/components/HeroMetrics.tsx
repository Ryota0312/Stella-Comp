import { languages, type Language, type UploadCopy } from "../i18n";
import type { WorkspaceStep } from "../types";
import { formatBytes } from "../utils";

type HeroMetricsProps = {
  compressionRatio: number;
  copy: UploadCopy;
  currentStep: WorkspaceStep;
  frameCount: number;
  language: Language;
  previewBytes: number;
  setLanguage: (language: Language) => void;
};

const workspaceSteps: WorkspaceStep[] = ["upload", "preview", "source"];

export function HeroMetrics({
  compressionRatio,
  copy,
  currentStep,
  frameCount,
  language,
  previewBytes,
  setLanguage,
}: HeroMetricsProps) {
  return (
    <section className="hero-band">
      <div className="hero-copy">
        <p className="eyebrow">{copy.hero.eyebrow}</p>
        <h1>{copy.hero.title}</h1>
        <p className="hero-description">{copy.hero.description}</p>
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
      <div className="hero-metrics" aria-label={copy.hero.statusLabel}>
        <Metric label={copy.hero.selected} value={copy.hero.frames(frameCount)} />
        <Metric label={copy.hero.previewPayload} value={formatBytes(previewBytes)} />
        <Metric
          label={copy.hero.compression}
          value={compressionRatio > 0 ? `${(compressionRatio * 100).toFixed(1)}%` : copy.hero.waiting}
        />
      </div>
    </section>
  );
}

function uploadLanguageName(language: Language) {
  return language === "ja" ? "日本語" : "English";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
