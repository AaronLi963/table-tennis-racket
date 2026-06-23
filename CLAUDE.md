# CLAUDE.md

桌球拍（乒乓球拍）敲擊聲學分析軟體。敲擊球拍面材中心，從聲音分析三項物理指標：
**軟硬度**、**彈性**、**底勁（大力量下的支撐能力）**。

## 架構

pnpm monorepo。核心 DSP 與評分為**純 TypeScript、零 DOM / Web Audio 依賴**，
以便 Phase 2 行動 App 直接重用。

```text
packages/
  shared/   # 共用型別：Racket, Measurement, FeatureVector, Scores, PopulationStats…
  dsp/      # 純 TS 訊號處理 + 自動評分（前端、後端、未來行動端共用）
apps/
  web/      # Vite + React SPA（音訊擷取、跑 DSP、圖表、比較）
  api/      # Node + Express + node:sqlite（CRUD、母體統計）
```

**平台路線**：Phase 1（現在）= 瀏覽器，用 Web Audio API。Phase 2（之後）= 手機 App 直接錄音。
音訊擷取以 `AudioSource` 介面抽象（`apps/web/src/audio/webAudioSource.ts` 為 Web 實作），
DSP 只吃 `Float32Array` + sampleRate，不碰瀏覽器 API。後端 REST 平台中立，Phase 2 直接共用同一組端點。

## 常用指令

用 `make`（見 `make help`）或直接 pnpm：

- `make dev` / `pnpm dev` — 同時起 web (:5180) 與 api (:5179)
- `make dev-api` / `make dev-web` — 單獨啟動
- `make build` — 前端正式建置
- `make check` — typecheck + 測試（CI 用）
- `pnpm --filter @ttr/dsp test` — DSP 單元測試（合成訊號）

## 評分方法（重要）

**沒有 ground-truth 標籤** — 使用者只有球拍、沒有真實分數。
因此採**非監督的相對 z-score 評分**（`packages/dsp/src/autoScore.ts`），
而非監督式回歸。`calibration.ts` 保留但目前未使用。

- 對整批已量測球拍算分布，**50 分 ≈ 收藏平均**，越高代表在收藏中越突出。
- 計算參考 踢猫Boll「我量化了乒乓球底板性能」影片：**質量修正剛度 E ∝ f²·m**。
- 三項指標來源：
  - **軟硬度** ← 一階質量修正剛度 `E1 = f1²·m`（f1 = `modalFreqs[0]`，m = 重量）
  - **彈性** ← 品質因子 `Q`
  - **底勁** ← 高階質量修正剛度 `E4 = f4²·m`（f4 = `modalFreqs[3]`，**估計值**，非直接量測）

`fitPopulation(samples)` 算母體統計，`scoreWithPopulation(stats, features, weight?)` 算分數。
缺重量者以母體中位數（fallback ≈ 85g）代入。

## DSP 管線

`packages/dsp`：onset 偵測 → 加窗 → radix-2 FFT 幅度頻譜 → 取 f0 與 `modalFreqs`（突出模態，
門檻 `MODE_PROMINENCE = 0.15`）→ Hilbert 包絡 → 指數衰減擬合（Q = π·f0·τ）。
特徵向量包含 `modalFreqs: number[]`（依頻率升冪）。

## 資料持久化

Node 內建 `node:sqlite`（`DatabaseSync`），需 `--experimental-sqlite` flag（已在 api 的 dev/start script）。
DB 預設 `apps/api/data/ttr.db`，可用 `TTR_DB` 環境變數覆寫。
node:sqlite 無 `ADD COLUMN IF NOT EXISTS` → 用 `ensureColumn()`（PRAGMA table_info + ALTER TABLE）做欄位遷移。

球拍欄位：name, brand, composition, structure, weight, tags(JSON), notes, knownScores。
`structure`（結構）使用者可自訂，預設 `DEFAULT_STRUCTURES = ['外置', '內置', '純木']`，
前端用 `<input list>` + datalist 合併既有值。

## 測試安全規則（務必遵守）

**絕對不要** `rm apps/api/data/ttr.db`，也不要用預設 port 5179 起測試伺服器 —
使用者常自己跑 `pnpm dev` 並透過 UI 建了真實球拍資料。

API 端到端測試一律隔離：

```bash
TTR_DB=/tmp/ttr-test-$$.db PORT=5181 pnpm --filter @ttr/api start
```

先用 `lsof -nP -i :5179` 確認沒有別人的伺服器在跑。要驗證既有 DB 時先 `cp` 成副本再測。

## 前端頁面

- **量測頁** (`MeasurePage`)：選麥克風 / 上傳檔案 → 擷取 → 顯示頻譜、衰減、特徵、品質提示。
- **自動評分頁** (`CalibrationPage`)：相對分數表，欄位標題可點擊排序（無分數排最後），上方有各數值意義說明。
- **比較頁** (`ComparePage`)：多支球拍 / 依品牌雷達圖比較 + 明細表。

## 慣例

- TS 全程，註解與 UI 文案用繁體中文。
- 套件以 `.js` 副檔名 import（TS ESM），workspace 引用 `@ttr/shared`、`@ttr/dsp`。
- 跑 api 用 `pnpm --filter @ttr/api ...`（cwd 要對，從 repo root 跑 tsx 會出問題）。
