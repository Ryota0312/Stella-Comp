import type { UploadCopy } from "../i18n";
import type { QueueItem } from "../types";
import { formatBytes } from "../utils";

type PreviewPanelProps = {
  activeItem?: QueueItem;
  copy: UploadCopy;
};

export function PreviewPanel({ activeItem, copy }: PreviewPanelProps) {
  return (
    <section className="panel panel-preview">
      <header className="panel-header">
        <div>
          <p className="panel-kicker">{copy.preview.kicker}</p>
          <h2>{copy.preview.title}</h2>
        </div>
      </header>
      <div className="preview-stage">
        {activeItem?.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="preview-image" src={activeItem.previewUrl} alt={activeItem.name} />
        ) : (
          <div className="preview-placeholder">
            <span>{copy.preview.selectFrames}</span>
          </div>
        )}
      </div>
      <div className="preview-legend">
        <span>{activeItem?.name ?? copy.preview.noFrame}</span>
        <span>
          {activeItem?.width && activeItem.height
            ? `${activeItem.width}${copy.preview.dimensionSeparator}${activeItem.height}`
            : copy.preview.noDimensions}
        </span>
        <span>
          {activeItem?.previewSize ? formatBytes(activeItem.previewSize) : copy.preview.noPreviewJpeg}
        </span>
      </div>
    </section>
  );
}
