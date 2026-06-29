import { languages, type Language, type UploadCopy } from "../model/i18n";
import type { WorkspaceStep } from "../model/types";
import { classNames } from "../model/utils";
import styles from "./HeroMetrics.module.css";

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
    <section className={styles["hero-band"]}>
      <div className={styles["hero-copy"]}>
        <p className={styles.eyebrow}>{copy.hero.eyebrow}</p>
        <h1>{copy.hero.title}</h1>
        <p className={styles["hero-description"]}>{copy.hero.description}</p>
      </div>
      <div className={styles.stepper} aria-label={copy.steps.current}>
        {workspaceSteps.map((step, index) => (
          <div
            className={classNames(
              styles["stepper-item"],
              currentStep === step && styles["stepper-item-active"],
            )}
            key={step}
          >
            <span>{index + 1}</span>
            <strong>{copy.steps[step]}</strong>
          </div>
        ))}
      </div>
      <div className={styles["hero-side"]}>
        <label className={styles["language-switcher"]}>
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
