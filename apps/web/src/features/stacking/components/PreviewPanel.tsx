import type { UploadCopy } from "../model/i18n";
import type { QueueItem } from "../model/types";
import { classNames, formatBytes } from "../model/utils";
import workspaceStyles from "../StackingWorkspace.module.css";
import sharedStyles from "./shared.module.css";
import styles from "./PreviewPanel.module.css";

type PreviewPanelProps = {
  activeItem?: QueueItem;
  copy: UploadCopy;
};

export function PreviewPanel({ activeItem, copy }: PreviewPanelProps) {
  return (
    <section className={classNames(sharedStyles.panel, workspaceStyles["panel-preview"], styles["panel-preview"])}>
      <header className={sharedStyles["panel-header"]}>
        <div>
          <p className={sharedStyles["panel-kicker"]}>{copy.preview.kicker}</p>
          <h2>{copy.preview.title}</h2>
        </div>
      </header>
      <div className={styles["preview-stage"]}>
        {activeItem?.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles["preview-image"]} src={activeItem.previewUrl} alt={activeItem.name} />
        ) : (
          <div className={styles["preview-placeholder"]}>
            <span>{copy.preview.selectFrames}</span>
          </div>
        )}
      </div>
      <div className={styles["preview-legend"]}>
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
