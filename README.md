# Stella Comp

星景写真の合成・レタッチを行う Web アプリケーションです。

## セットアップ

このリポジトリではツールバージョンを mise で管理します。

```sh
mise install
mise exec -- pnpm install
```

## Web アプリの起動

開発サーバーはユーザー側で起動してください。Codex は原則として dev server を起動しません。

```sh
mise exec -- pnpm web:dev
```

標準では Next.js が `http://localhost:3000` を使います。

ポートを指定する場合:

```sh
mise exec -- pnpm --filter @stella-comp/web dev --hostname 127.0.0.1 --port 3001
```

## 動作確認

Web アプリの型チェック:

```sh
mise exec -- pnpm web:typecheck
```

Web アプリのビルド:

```sh
mise exec -- pnpm web:build
```

## 開発メモ

- `apps/web` は TypeScript + Next.js のフロントエンドです。
- RAW/CR3 ファイルはブラウザに D&D できます。
- CR3 は Web Worker で埋め込み JPEG 候補を抽出し、プレビュー JPEG 生成に使います。
- CR2 など未対応 RAW は現時点では `RAW pending` として扱います。
- 最終的な RAW 現像・位置合わせ・合成はサーバーサイド Rust worker で実装する方針です。

## ポート競合時

`3000` が使用中の場合は、起動中の Next.js プロセスを確認してください。

```sh
ps -ef | grep 'next dev' | grep -v grep
```

別ポートで起動する場合は、上記の `--port` 指定を使ってください。

