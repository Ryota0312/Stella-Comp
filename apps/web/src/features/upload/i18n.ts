import type { ClientCompositeStatus, QueueNote, QueueStatus } from "./types";
import type { JobSummary } from "./uploadApi";

export const languages = ["ja", "en"] as const;

export type Language = (typeof languages)[number];

export const defaultLanguage: Language = "ja";

export const uploadCopy = {
  ja: {
    languageName: "日本語",
    languageToggleLabel: "表示言語",
    hero: {
      eyebrow: "Stella Comp",
      title: "プレビュー取り込みワークスペース",
      description:
        "RAWまたは圧縮済みフレームを追加し、可能な場合はブラウザで軽量プレビューを生成します。フルRAW処理を導入する前に、プレビューJPEGをアップロードできます。",
      statusLabel: "プロジェクトの状態",
      selected: "選択済み",
      frames: (count: number) => `${count} フレーム`,
      previewPayload: "プレビュー容量",
      compression: "圧縮率",
      waiting: "待機中",
    },
    upload: {
      kicker: "取り込み",
      title: "アップロードキュー",
      clear: "クリア",
      selectFrames: "フレームを選択",
      dropTitle: "RAW、JPEG、PNG、WebPフレームをここにドロップ",
      dropDescription: "ブラウザで読み込める画像はプレビューJPEGに変換されます。",
      queuedImagesLabel: "キュー内の画像",
      empty: "フレームが選択されていません",
      sizeArrow: " -> ",
    },
    settings: {
      kicker: "設定",
      title: "プレビュー設定",
      referenceFrame: "基準フレーム",
      selectPreview: "プレビューを選択",
      previewSize: "プレビューサイズ",
      jpegQuality: "JPEG品質",
      uploadTarget: "アップロード対象",
      previewJpegOnly: "プレビューJPEGのみ",
      fullRawLater: "フルRAWは後で対応",
      note:
        "埋め込みプレビュー抽出が追加されるまで、RAWファイルはキューに保持されます。ブラウザで読み込めるファイルは、今すぐ圧縮してアップロードできます。",
    },
    preview: {
      kicker: "確認",
      title: "プレビュー確認",
      uploadPreviews: "プレビューをアップロード",
      selectFrames: "プレビューするフレームを選択",
      noFrame: "フレームなし",
      noDimensions: "サイズ情報なし",
      noPreviewJpeg: "プレビューJPEGなし",
      dimensionSeparator: " x ",
    },
    execution: {
      kicker: "実行",
      title: "プレビュー状態",
      runClientStack: "ブラウザ合成を実行",
      uploadAndStack: "アップロードして合成",
      previewPayload: "プレビュー容量",
      uploadedSummary: (count: number, bytes: string) =>
        `${count} 件のプレビューファイルをアップロードしました（${bytes}）。`,
      warningsLabel: "位置合わせ警告",
    },
    result: {
      kicker: "出力",
      title: "結果",
      compositeAlt: "合成結果",
      openPreview: "プレビューを開く",
      downloadOutput: "結果をダウンロード",
    },
    timeline: {
      selectedFrames: "選択フレーム",
      previewGeneration: "プレビュー生成",
      ready: (count: number) => `${count} 件準備完了`,
      rawExtraction: "RAW抽出",
      pending: (count: number) => `${count} 件保留中`,
      noPendingRaw: "保留中のRAWなし",
      previewUpload: "プレビューアップロード",
      uploaded: (count: number) => `${count} 件アップロード済み`,
      notUploaded: "未アップロード",
      clientStack: "ブラウザ合成",
    },
    resultRows: {
      resultPng: "結果PNG",
      generatedInBrowser: "ブラウザで生成済み",
      notGenerated: "未生成",
      stackStatus: "合成状態",
      warnings: "警告",
    },
    queueNotes: {
      queued: "キューに追加済み",
      extractingEmbeddedJpeg: "埋め込みJPEGを抽出中",
      cr3PreviewExtracted: (bytes: string) => `CR3プレビューを抽出しました（${bytes}）`,
      cr3PreviewUnavailable: (message?: string) =>
        message ? `CR3プレビューを利用できません: ${message}` : "CR3プレビューを利用できません",
      rawExtractionLater: "RAW埋め込みプレビュー抽出は今後対応予定です",
      browserDecodeUnavailable: "ブラウザでプレビューをデコードできません",
      generatingJpegPreview: "JPEGプレビューを生成中",
      previewReady: "プレビュー準備完了",
      previewGenerationFailed: "プレビュー生成に失敗しました",
      uploadingPreviewJpeg: "プレビューJPEGをアップロード中",
      previewUploaded: "プレビューをアップロードしました",
      previewUploadFailed: "プレビューアップロードに失敗しました",
      clientCompositeFailed: "ブラウザ合成に失敗しました",
    },
    statuses: {
      queue: {
        queued: "キュー済み",
        generating: "生成中",
        ready: "準備完了",
        "raw-pending": "RAW保留中",
        unsupported: "非対応",
        uploading: "アップロード中",
        uploaded: "アップロード済み",
        failed: "失敗",
      },
      job: {
        queued: "キュー済み",
        running: "実行中",
        completed: "完了",
        failed: "失敗",
      },
      client: {
        idle: "未開始",
        uploading: "アップロード中",
        estimating: "位置合わせを推定中",
        stacking: "ブラウザで合成中",
        completed: "完了",
        failed: "失敗",
      },
    },
  },
  en: {
    languageName: "English",
    languageToggleLabel: "Display language",
    hero: {
      eyebrow: "Stella Comp",
      title: "Preview Ingest Workspace",
      description:
        "Drop RAW or compressed frames, generate lightweight browser previews where possible, and upload preview JPEGs before the full RAW pipeline is introduced.",
      statusLabel: "Project status",
      selected: "Selected",
      frames: (count: number) => `${count} frames`,
      previewPayload: "Preview payload",
      compression: "Compression",
      waiting: "Waiting",
    },
    upload: {
      kicker: "Ingest",
      title: "Upload Queue",
      clear: "Clear",
      selectFrames: "Select Frames",
      dropTitle: "Drop RAW, JPEG, PNG, or WebP frames here",
      dropDescription: "Browser-readable images are converted to preview JPEGs.",
      queuedImagesLabel: "Queued images",
      empty: "No frames selected",
      sizeArrow: " -> ",
    },
    settings: {
      kicker: "Setup",
      title: "Preview Settings",
      referenceFrame: "Reference frame",
      selectPreview: "Select preview",
      previewSize: "Preview size",
      jpegQuality: "JPEG quality",
      uploadTarget: "Upload target",
      previewJpegOnly: "Preview JPEG only",
      fullRawLater: "Full RAW later",
      note:
        "RAW files stay queued until embedded preview extraction is added. Browser-readable files can be compressed and uploaded now.",
    },
    preview: {
      kicker: "Review",
      title: "Preview Check",
      uploadPreviews: "Upload Previews",
      selectFrames: "Select frames to preview",
      noFrame: "No frame",
      noDimensions: "No dimensions",
      noPreviewJpeg: "No preview JPEG",
      dimensionSeparator: " x ",
    },
    execution: {
      kicker: "Execution",
      title: "Preview Status",
      runClientStack: "Run Client Stack",
      uploadAndStack: "Upload and Stack",
      previewPayload: "Preview payload",
      uploadedSummary: (count: number, bytes: string) =>
        `Uploaded ${count} preview files (${bytes}).`,
      warningsLabel: "Alignment warnings",
    },
    result: {
      kicker: "Output",
      title: "Result Bundle",
      compositeAlt: "Composite result",
      openPreview: "Open Preview",
      downloadOutput: "Download Output",
    },
    timeline: {
      selectedFrames: "Selected frames",
      previewGeneration: "Preview generation",
      ready: (count: number) => `${count} ready`,
      rawExtraction: "RAW extraction",
      pending: (count: number) => `${count} pending`,
      noPendingRaw: "No pending RAW",
      previewUpload: "Preview upload",
      uploaded: (count: number) => `${count} uploaded`,
      notUploaded: "Not uploaded",
      clientStack: "Client stack",
    },
    resultRows: {
      resultPng: "Result PNG",
      generatedInBrowser: "Generated in browser",
      notGenerated: "Not generated",
      stackStatus: "Stack status",
      warnings: "Warnings",
    },
    queueNotes: {
      queued: "Queued",
      extractingEmbeddedJpeg: "Extracting embedded JPEG",
      cr3PreviewExtracted: (bytes: string) => `CR3 preview extracted (${bytes})`,
      cr3PreviewUnavailable: (message?: string) =>
        message ? `CR3 preview unavailable: ${message}` : "CR3 preview unavailable",
      rawExtractionLater: "RAW embedded preview extraction is next",
      browserDecodeUnavailable: "Browser preview decode is unavailable",
      generatingJpegPreview: "Generating JPEG preview",
      previewReady: "Preview ready",
      previewGenerationFailed: "Preview generation failed",
      uploadingPreviewJpeg: "Uploading preview JPEG",
      previewUploaded: "Preview uploaded",
      previewUploadFailed: "Preview upload failed",
      clientCompositeFailed: "Client-side composite failed",
    },
    statuses: {
      queue: {
        queued: "Queued",
        generating: "Generating",
        ready: "Ready",
        "raw-pending": "RAW pending",
        unsupported: "Unsupported",
        uploading: "Uploading",
        uploaded: "Uploaded",
        failed: "Failed",
      },
      job: {
        queued: "Queued",
        running: "Running",
        completed: "Completed",
        failed: "Failed",
      },
      client: {
        idle: "Not started",
        uploading: "Uploading",
        estimating: "Estimating alignment",
        stacking: "Stacking in browser",
        completed: "Completed",
        failed: "Failed",
      },
    },
  },
} as const;

export type UploadCopy = (typeof uploadCopy)[Language];

export function queueStatusText(status: QueueStatus, language: Language) {
  return uploadCopy[language].statuses.queue[status];
}

export function jobStatusText(status: JobSummary["status"], language: Language) {
  return uploadCopy[language].statuses.job[status];
}

export function clientCompositeStatusText(status: ClientCompositeStatus, language: Language) {
  return uploadCopy[language].statuses.client[status];
}

export function queueNoteText(note: QueueNote, language: Language) {
  const copy = uploadCopy[language].queueNotes;

  switch (note.code) {
    case "queued":
      return copy.queued;
    case "extractingEmbeddedJpeg":
      return copy.extractingEmbeddedJpeg;
    case "cr3PreviewExtracted":
      return copy.cr3PreviewExtracted(note.bytes);
    case "cr3PreviewUnavailable":
      return copy.cr3PreviewUnavailable(note.detail);
    case "rawExtractionLater":
      return copy.rawExtractionLater;
    case "browserDecodeUnavailable":
      return copy.browserDecodeUnavailable;
    case "generatingJpegPreview":
      return copy.generatingJpegPreview;
    case "previewReady":
      return copy.previewReady;
    case "previewGenerationFailed":
      return note.detail ?? copy.previewGenerationFailed;
    case "uploadingPreviewJpeg":
      return copy.uploadingPreviewJpeg;
    case "previewUploaded":
      return copy.previewUploaded;
  }
}
