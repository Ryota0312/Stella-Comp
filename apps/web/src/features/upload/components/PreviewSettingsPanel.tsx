import type { UploadCopy } from "../i18n";
import type { QueueItem } from "../types";

type PreviewSettingsPanelProps = {
  activeItem?: QueueItem;
  copy: UploadCopy;
  items: QueueItem[];
  setActiveId: (id: string) => void;
};

export function PreviewSettingsPanel({
  activeItem,
  copy,
  items,
  setActiveId,
}: PreviewSettingsPanelProps) {
  return (
    <section className="panel panel-settings">
      <header className="panel-header">
        <div>
          <p className="panel-kicker">{copy.settings.kicker}</p>
          <h2>{copy.settings.title}</h2>
        </div>
      </header>
      <div className="settings-grid">
        <label className="field">
          <span>{copy.settings.referenceFrame}</span>
          <select value={activeItem?.id ?? ""} onChange={(event) => setActiveId(event.target.value)}>
            <option value="" disabled>
              {copy.settings.selectPreview}
            </option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{copy.settings.previewSize}</span>
          <select defaultValue="2048">
            <option value="1024">1024 px</option>
            <option value="2048">2048 px</option>
            <option value="3072">3072 px</option>
          </select>
        </label>
        <label className="field">
          <span>{copy.settings.jpegQuality}</span>
          <select defaultValue="82">
            <option value="72">72</option>
            <option value="82">82</option>
            <option value="90">90</option>
          </select>
        </label>
        <label className="field">
          <span>{copy.settings.uploadTarget}</span>
          <select defaultValue="preview">
            <option value="preview">{copy.settings.previewJpegOnly}</option>
            <option value="source" disabled>
              {copy.settings.fullRawLater}
            </option>
          </select>
        </label>
      </div>
      <div className="panel-note">{copy.settings.note}</div>
    </section>
  );
}
