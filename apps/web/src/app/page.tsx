const queueRows = [
  {
    name: "M42_0001.CR3",
    size: "43.2 MB",
    status: "Ready",
    note: "Preview pending",
  },
  {
    name: "M42_0002.CR3",
    size: "43.2 MB",
    status: "Queued",
    note: "Preview pending",
  },
  {
    name: "M42_0003.CR3",
    size: "43.1 MB",
    status: "Queued",
    note: "Preview pending",
  },
];

const jobTimeline = [
  { label: "Upload session", value: "Idle", tone: "muted" },
  { label: "Preview generation", value: "Waiting", tone: "muted" },
  { label: "Rust worker", value: "Not started", tone: "muted" },
  { label: "Composite export", value: "Not started", tone: "muted" },
];

const resultRows = [
  { label: "Aligned preview", value: "Not generated" },
  { label: "Composite TIFF", value: "Not generated" },
  { label: "Warnings", value: "0" },
];

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">Stella Comp</p>
          <h1>Star Alignment Workspace</h1>
          <p className="hero-text">
            RAW upload, preview generation, alignment review, and stacking will
            live in a single work surface. This shell fixes the screen
            structure before the upload flow is implemented.
          </p>
        </div>
        <div className="hero-metrics" aria-label="Project status">
          <div>
            <span className="metric-label">Pipeline</span>
            <strong>Browser preview + server composite</strong>
          </div>
          <div>
            <span className="metric-label">Processing</span>
            <strong>Go API / Rust worker</strong>
          </div>
          <div>
            <span className="metric-label">Target scale</span>
            <strong>Hundreds of frames</strong>
          </div>
        </div>
      </section>

      <section className="workspace-grid">
        <section className="panel panel-upload">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Ingest</p>
              <h2>Upload Queue</h2>
            </div>
            <button type="button" className="primary-action">
              Select Frames
            </button>
          </header>
          <div className="dropzone" role="presentation">
            <p>Drop RAW, JPEG, or TIFF frames here</p>
            <span>Preview images will be generated in the browser later.</span>
          </div>
          <div className="table-list" role="table" aria-label="Queued images">
            {queueRows.map((row) => (
              <div className="table-row" role="row" key={row.name}>
                <div>
                  <p className="row-title">{row.name}</p>
                  <span className="row-meta">{row.size}</span>
                </div>
                <div className="row-state">
                  <span className="pill">{row.status}</span>
                  <span className="row-meta">{row.note}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel panel-settings">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Setup</p>
              <h2>Processing Settings</h2>
            </div>
          </header>
          <div className="settings-grid">
            <label className="field">
              <span>Reference frame</span>
              <select defaultValue="first">
                <option value="first">First frame</option>
                <option value="manual">Manual selection</option>
                <option value="sharpest">Sharpest preview</option>
              </select>
            </label>
            <label className="field">
              <span>Preview size</span>
              <select defaultValue="2048">
                <option value="1024">1024 px</option>
                <option value="2048">2048 px</option>
                <option value="3072">3072 px</option>
              </select>
            </label>
            <label className="field">
              <span>Output format</span>
              <select defaultValue="tiff">
                <option value="tiff">TIFF</option>
                <option value="fits">FITS</option>
              </select>
            </label>
            <label className="field">
              <span>Worker profile</span>
              <select defaultValue="balanced">
                <option value="balanced">Balanced</option>
                <option value="quality">High quality</option>
                <option value="fast">Fast preview</option>
              </select>
            </label>
          </div>
          <div className="panel-note">
            Alignment is estimated from lightweight previews. Full resolution
            transforms and compositing remain server-side.
          </div>
        </section>

        <section className="panel panel-preview">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Review</p>
              <h2>Alignment Preview</h2>
            </div>
            <button type="button" className="secondary-action">
              Refresh Preview
            </button>
          </header>
          <div className="preview-stage">
            <div className="preview-frame preview-base">
              <span>Base Frame</span>
            </div>
            <div className="preview-frame preview-overlay">
              <span>Aligned Overlay</span>
            </div>
          </div>
          <div className="preview-legend">
            <span>Base</span>
            <span>Overlay</span>
            <span>Residuals</span>
          </div>
        </section>

        <section className="panel panel-jobs">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Execution</p>
              <h2>Job Status</h2>
            </div>
            <button type="button" className="primary-action">
              Start Job
            </button>
          </header>
          <div className="timeline">
            {jobTimeline.map((item) => (
              <div className="timeline-row" key={item.label}>
                <span>{item.label}</span>
                <span className={`timeline-state timeline-${item.tone}`}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
          <div className="progress-block">
            <div className="progress-header">
              <span>Estimated upload load</span>
              <strong>0 / 128 GB</strong>
            </div>
            <div className="progress-bar" aria-hidden="true">
              <div className="progress-value" />
            </div>
          </div>
        </section>

        <section className="panel panel-results">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Output</p>
              <h2>Result Bundle</h2>
            </div>
          </header>
          <div className="result-stack">
            {resultRows.map((row) => (
              <div className="result-row" key={row.label}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            ))}
          </div>
          <div className="result-actions">
            <button type="button" className="secondary-action">
              Open Preview
            </button>
            <button type="button" className="primary-action">
              Download Output
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}

