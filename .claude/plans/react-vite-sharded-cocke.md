# 桌球拍敲擊聲學分析軟體 — 實作計畫

## Context（為什麼做這個）

目標：打造一套軟體，透過敲擊桌球拍「面材中心」所發出的聲音，分析球拍的物理特性，輸出三項指標：

1. **軟硬度（stiffness/hardness）**
2. **彈性（elasticity / 蓄能回彈）**
3. **底勁（大力量下的支撐能力，low-end support）**

這是一個全新（greenfield）專案，目錄目前為空。核心難點不在 Web 框架，而在**聲學訊號處理（DSP）**：把一次敲擊的脈衝響應轉成可量化的物理特徵，再對應到上述三項指標。

### 物理原理與可行性（重要）

敲擊測試 = **脈衝激振法（Impulse Excitation Technique, IET）**，是量測材料彈性模數與阻尼的成熟方法。對應關係：

- **共振頻率 f0** → 軟硬度。越硬/越剛 → f0 越高（f ∝ √(E/ρ)）。**可直接量測**。
- **阻尼 / 衰減（damping / sustain）** → 彈性。損耗越小、餘音越長 → 蓄能回彈越好。**可直接量測**（Q 值 / 衰減時間）。
- **底勁** → 屬於**大振幅、非線性**的力學特性。輕敲是小振幅線性激振，**無法直接量測**。只能：(a) 用低頻模態強度 + 剛度 + 餘音做**啟發式估計**，並 (b) 用已知球拍做**回歸校正**提升可靠度。本計畫據此設計，且 UI 會標示底勁為「校正估計值」。

使用者已確認**手上有多支已知特性的球拍** → 採「特徵萃取（物理）＋ 回歸校正（資料驅動）」雙層架構，輸出可趨近絕對數值。

### 平台路線圖（重要）

- **Phase 1（現在）**：瀏覽器 Web App，用 Web Audio API 擷取麥克風與檔案上傳。
- **Phase 2（之後）**：**手機 App 直接錄音**分析。

這項規劃直接影響架構決策：**核心 DSP 與校正邏輯必須與平台無關**，才能在 Phase 2 直接重用、避免重寫。因此：

1. `packages/dsp` 與 `packages/shared` 維持**純 TypeScript，零 DOM / 零 Web Audio 依賴**（只吃 `Float32Array` + 取樣率，不碰瀏覽器 API）。
2. **音訊擷取抽象成介面**（如 `AudioSource` → 回傳 `{ pcm: Float32Array, sampleRate }`）。Phase 1 提供 Web 實作（Web Audio / `decodeAudioData`）；Phase 2 提供行動端實作（原生錄音，如 React Native + expo-av / 原生模組），DSP 與 API 不需更動。
3. 後端 REST API 保持平台中立，Phase 2 手機 App 直接打同一組端點。
4. Phase 2 行動端建議優先評估 **React Native / Expo**（可直接共用 `dsp`、`shared` 與 TypeScript 生態），維持單一程式語言與共用套件。

---

## 架構總覽

採 **pnpm monorepo**，前端純瀏覽器端做 DSP（低延遲、不需上傳原始音訊），後端只存特徵/結果/校正資料。

```text
table-tennis-racket/
  pnpm-workspace.yaml
  packages/
    shared/        # 共用 TypeScript 型別（Racket, Measurement, FeatureVector, Scores…）
    dsp/           # 純 TS 訊號處理：FFT、onset、包絡、特徵萃取、回歸校正（前後端共用）
  apps/
    web/           # Vite + React + TS 前端（音訊擷取、DSP、圖表、報告、比較）
    api/           # Node + Express + TS + Prisma + SQLite（CRUD、校正模型存取）
```

- `dsp` 與 `shared` 為**純 TS、零 DOM/Web Audio 依賴**，同時被 `web`（瀏覽器執行）、`api`（重新擬合校正模型）引用，並為 **Phase 2 行動 App 預留重用**。
- 音訊擷取以 `AudioSource` 介面抽象；`apps/web` 提供 Web Audio 實作，Phase 2 由行動端提供原生錄音實作。
- 資料庫用 **SQLite + Prisma**（檔案式、零外部依賴，適合本機/桌面使用）。

---

## DSP 管線（核心，置於 `packages/dsp`）

輸入：一段含敲擊的音訊 buffer（`Float32Array` PCM，44.1/48 kHz）。

1. **擷取**（經 `AudioSource` 介面 → `{ pcm: Float32Array, sampleRate }`，平台無關）
   - 即時（Web）：`getUserMedia` → `AudioContext` + `AudioWorklet`（或 `MediaRecorder` 後 `decodeAudioData`）取原始 PCM。
   - 檔案（Web）：`File` → `arrayBuffer` → `AudioContext.decodeAudioData` → `Float32Array`。
   - Phase 2（行動）：原生錄音模組提供同樣的 `{ pcm, sampleRate }`，後續管線完全共用。
2. **斷點偵測 / 切段（onset detection）**：以能量門檻 + 峰值找出敲擊瞬態，從 onset 取窗（約 200–500 ms）。支援偵測多次敲擊。
3. **前處理**：去 DC、正規化；頻譜估計時加窗（Hann）。
4. **頻譜分析（FFT）**：用 `fft.js`（offline FFT，解析度優於 `AnalyserNode`）算幅度頻譜。
   - 主峰 → **基頻 f0**；次要模態峰、**頻譜質心**、頻譜擴散、低/高頻能量比。
5. **阻尼 / 衰減分析**：以 **Hilbert 變換**求解析訊號包絡（或對 f0 帶通後取包絡），對包絡擬合指數衰減 →
   - **衰減時間 τ / RT**、**Q 值** = π·f0·τ、**阻尼比 ζ / 對數衰減率**。
6. **特徵向量輸出**：`{ f0, modes[], spectralCentroid, spectralSpread, lowHighEnergyRatio, Q, tau, zeta, … }`。

> 多次敲擊取平均以增加穩定度；提供**品質檢查**（SNR、削波偵測、敲擊一致性）並提示重敲。

---

## 特徵 → 指標 對應（校正模型，`packages/dsp/calibration`）

- **軟硬度** ← 主要 f0 + 頻譜質心
- **彈性** ← Q / τ / 阻尼比
- **底勁** ← 低頻模態強度 + 剛度 + 餘音（啟發式，並由回歸修正）

校正流程（利用已知球拍）：

1. 對每支已知球拍量測 → 存「特徵向量 + 使用者輸入的真實標籤（硬度/彈性/底勁）」。
2. 以**多元線性最小二乘回歸**（每項指標一組係數）擬合 特徵 → 指標。先用線性回歸（閉式解，可手刻或用 `ml-regression`），無需重型 ML 依賴。
3. 新量測套用係數 → 趨近絕對數值的分數。
4. 以 **leave-one-out** 在已知球拍上驗證誤差。

---

## 後端（`apps/api`）

- **Prisma schema**：`Racket`（名稱、品牌、結構、已知特性標籤）、`Measurement`（featureVector JSON、scores、品質指標、時間戳、racketId）、`CalibrationModel`（各指標係數）。
- **REST 端點**：
  - `POST /rackets`、`GET /rackets`、`GET /rackets/:id`
  - `POST /measurements`（存特徵 + 分數）、`GET /rackets/:id/measurements`
  - `POST /calibration/fit`（用已標記樣本重新擬合並存係數）、`GET /calibration`
  - `GET /compare?ids=...`（多支比較）
- 校正擬合可在 `api` 用 `dsp` 套件執行，係數存回 DB。

---

## 前端（`apps/web`）

- **狀態/資料**：React Query 打 API；Zustand 管本機 UI 狀態。
- **圖表**：Recharts 畫頻譜圖與衰減包絡曲線。
- **主要畫面**：
  1. **量測頁**：選麥克風 / 上傳檔案 → 敲擊擷取 → 即時顯示頻譜、衰減曲線、f0/Q、品質提示（含「敲面材中心」操作指引）。
  2. **報告頁**：單支球拍三項指標分數 + 原始物理量 + 圖表；底勁標示為「校正估計」。
  3. **校正頁**：對已知球拍輸入真實標籤、觸發 `POST /calibration/fit`、顯示驗證誤差。
  4. **比較頁**：多支球拍歷史並排比較（雷達圖 / 長條圖）。

---

## 實作順序（建議分階段）

1. Monorepo 骨架 + 工具鏈（pnpm workspace、TS、ESLint/Prettier、Vitest）。
2. `packages/shared` 型別 + `packages/dsp`（FFT、onset、Hilbert 包絡、指數擬合、特徵萃取）＋**合成訊號單元測試**。
3. `apps/web` 音訊擷取（麥克風 + 檔案）→ 跑 DSP → 顯示頻譜/衰減/原始特徵。
4. `apps/api` Prisma schema + 球拍/量測 CRUD。
5. 校正：已知球拍標記 → 擬合回歸 → 套用映射 特徵→分數；leave-one-out 驗證。
6. 報告頁 + 比較頁。
7. 品質檢查與多次敲擊平均、操作指引精修。

> **Phase 2（行動 App）** 不在本次範圍，但本計畫已透過「純 TS DSP + `AudioSource` 抽象 + 平台中立 API」為其鋪路：屆時新增行動端 App（建議 React Native / Expo），重用 `dsp`/`shared` 與後端，只需實作原生錄音的 `AudioSource`。

---

## 驗證方式（如何測試）

- **DSP 單元測試（Vitest）**：餵入合成訊號（已知 f0 的正弦 × 已知 τ 的指數衰減），斷言量測出的 f0、τ、Q 與輸入相符（容差內）。Hilbert 包絡與指數擬合各自測試。
- **端對端手測**：實際敲一支球拍 → 看到頻譜峰與衰減曲線 → 取得三項分數；換不同硬度球拍應看到 f0/Q 合理變化。
- **校正驗證**：對多支已知球拍跑 leave-one-out，回報每項指標的預測誤差；誤差過大時提示需更多樣本或特徵調整。
- **比較驗證**：兩支已知軟硬度差異明顯的球拍，雷達圖應正確分出高低。

## 已知限制（會在 UI 標示）

- **底勁為校正估計值**，非直接量測；準確度取決於已知球拍樣本數與多樣性。
- 量測一致性受敲擊位置、力道、麥克風距離、環境噪音影響 → 以多次平均 + 品質檢查 + 操作指引緩解。
