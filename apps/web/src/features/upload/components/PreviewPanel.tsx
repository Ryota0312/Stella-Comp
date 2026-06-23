import type { QueueItem } from "../types";
import { formatBytes } from "../utils";

type PreviewPanelProps = {
  activeItem?: QueueItem;
  uploadableCount: number;
  uploadPreviews: () => Promise<unknown>;
};

export function PreviewPanel({ activeItem, uploadableCount, uploadPreviews }: PreviewPanelProps) {
  return (
    <section className="panel panel-preview">
      <header className="panel-header">
        <div>
          <p className="panel-kicker">Review</p>
          <h2>Preview Check</h2>
        </div>
        <button
          type="button"
          className="secondary-action"
          disabled={!uploadableCount}
          onClick={uploadPreviews}
        >
          Upload Previews
        </button>
      </header>
      <div className="preview-stage">
        {activeItem?.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="preview-image" src={activeItem.previewUrl} alt={activeItem.name} />
        ) : (
          <div className="preview-placeholder">
            <span>{activeItem ? activeItem.note : "Select frames to preview"}</span>
          </div>
        )}
      </div>
      <div className="preview-legend">
        <span>{activeItem?.name ?? "No frame"}</span>
        <span>
          {activeItem?.width && activeItem.height
            ? `${activeItem.width} x ${activeItem.height}`
            : "No dimensions"}
        </span>
        <span>
          {activeItem?.previewSize ? formatBytes(activeItem.previewSize) : "No preview JPEG"}
        </span>
      </div>
    </section>
  );
}
