import type { QueueItem } from "../types";

type PreviewSettingsPanelProps = {
  activeItem?: QueueItem;
  items: QueueItem[];
  setActiveId: (id: string) => void;
};

export function PreviewSettingsPanel({
  activeItem,
  items,
  setActiveId,
}: PreviewSettingsPanelProps) {
  return (
    <section className="panel panel-settings">
      <header className="panel-header">
        <div>
          <p className="panel-kicker">Setup</p>
          <h2>Preview Settings</h2>
        </div>
      </header>
      <div className="settings-grid">
        <label className="field">
          <span>Reference frame</span>
          <select value={activeItem?.id ?? ""} onChange={(event) => setActiveId(event.target.value)}>
            <option value="" disabled>
              Select preview
            </option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
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
          <span>JPEG quality</span>
          <select defaultValue="82">
            <option value="72">72</option>
            <option value="82">82</option>
            <option value="90">90</option>
          </select>
        </label>
        <label className="field">
          <span>Upload target</span>
          <select defaultValue="preview">
            <option value="preview">Preview JPEG only</option>
            <option value="source" disabled>
              Full RAW later
            </option>
          </select>
        </label>
      </div>
      <div className="panel-note">
        RAW files stay queued until embedded preview extraction is added.
        Browser-readable files can be compressed and uploaded now.
      </div>
    </section>
  );
}
