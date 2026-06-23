import { formatBytes } from "../utils";

type HeroMetricsProps = {
  compressionRatio: number;
  frameCount: number;
  previewBytes: number;
};

export function HeroMetrics({ compressionRatio, frameCount, previewBytes }: HeroMetricsProps) {
  return (
    <section className="hero-band">
      <div className="hero-copy">
        <p className="eyebrow">Stella Comp</p>
        <h1>Preview Ingest Workspace</h1>
        <p className="hero-text">
          Drop RAW or compressed frames, generate lightweight browser previews
          where possible, and upload preview JPEGs before the full RAW
          pipeline is introduced.
        </p>
      </div>
      <div className="hero-metrics" aria-label="Project status">
        <Metric label="Selected" value={`${frameCount} frames`} />
        <Metric label="Preview payload" value={formatBytes(previewBytes)} />
        <Metric
          label="Compression"
          value={compressionRatio > 0 ? `${(compressionRatio * 100).toFixed(1)}%` : "Waiting"}
        />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
