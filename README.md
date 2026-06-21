# Stella Comp

星景写真の合成・レタッチを行う Web アプリケーションです。

## セットアップ

このリポジトリではツールバージョンを mise で管理します。JavaScript / pnpm 関連の管理ファイルは `apps/web` 配下に寄せています。

```sh
mise install
cd apps/web
mise exec -- pnpm install
```

## Web アプリの起動

開発サーバーはユーザー側で起動してください。Codex は原則として dev server を起動しません。

```sh
cd apps/web
mise exec -- pnpm dev
```

標準では Next.js が `http://localhost:3000` を使います。

ポートを指定する場合:

```sh
cd apps/web
mise exec -- pnpm dev --hostname 127.0.0.1 --port 3001
```

IntelliJ から起動する場合は、共有 Run Configuration の `Web Dev` を使ってください。`apps/web/package.json` の `dev` を、`mise exec -- which pnpm` で確認できる `pnpm` 実体パスで起動する設定にしています。

## 動作確認

Web アプリの型チェック:

```sh
cd apps/web
mise exec -- pnpm typecheck
```

Web アプリのビルド:

```sh
cd apps/web
mise exec -- pnpm build
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
