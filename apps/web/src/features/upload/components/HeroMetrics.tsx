import { languages, type Language, type UploadCopy } from "../i18n";
import { formatBytes } from "../utils";

type HeroMetricsProps = {
  compressionRatio: number;
  copy: UploadCopy;
  frameCount: number;
  language: Language;
  previewBytes: number;
  setLanguage: (language: Language) => void;
};

export function HeroMetrics({
  compressionRatio,
  copy,
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
        <p className="hero-text">{copy.hero.description}</p>
      </div>
      <div className="hero-side">
        <div className="language-switcher" aria-label={copy.languageToggleLabel}>
          {languages.map((option) => (
            <button
              type="button"
              className={`language-option${language === option ? " language-option-active" : ""}`}
              key={option}
              onClick={() => setLanguage(option)}
            >
              {uploadLanguageName(option)}
            </button>
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
