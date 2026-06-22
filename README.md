# 桌球拍敲擊聲學分析

敲擊桌球拍「面材中心」，用聲音分析球拍的三項物理特性：**軟硬度**、**彈性**、**底勁**。

原理為脈衝激振法（Impulse Excitation Technique）：

- **主共振頻率 f0** → 軟硬度（越硬 f0 越高）
- **衰減 / Q 值** → 彈性（餘音越長越彈）
- **底勁** → 大振幅非線性特性，輕敲無法直接量測，僅以低頻模態 + 剛度 + 餘音做**估計**

## 評分方式：自動相對分數（免標籤）

不需要任何真實實驗數據。系統把每支球拍的特徵，**相對於你整批已量測球拍的分布**自動換算成 0–100 分（標準分數 z-score 映射）：**50 分 ≈ 收藏平均**，越高代表在你的收藏中越硬／彈／有底勁。球拍量得越多，相對分數越穩定（至少需 2 支）。

## 架構（pnpm monorepo）

```text
packages/
  shared/   純 TS 共用型別（零 DOM / Web Audio 依賴）
  dsp/      純 TS 訊號處理：FFT、onset、Hilbert 包絡、指數擬合、特徵萃取、校正回歸
apps/
  web/      Vite + React + TS（瀏覽器端做 DSP；麥克風 + 檔案上傳）
  api/      Node + Express + node:sqlite（球拍 / 量測 / 校正持久化）
```

`dsp`、`shared` 刻意維持平台無關，**Phase 2 行動 App（直接錄音）可直接重用**，只需替換 `apps/web/src/audio` 的 `AudioSource` 實作。

## 開發

需要 Node ≥ 20（建議 24，內建 `node:sqlite`）與 pnpm。

```bash
make install      # 安裝相依套件
make dev          # 同時啟動 web (:5180) 與 api (:5179)
```

開啟 <http://localhost:5180> 。`make help` 可列出所有指令。

| 指令 | 說明 |
| --- | --- |
| `make install` | 安裝所有相依套件 |
| `make dev` | 同時啟動 web 與 api |
| `make dev-api` | 只啟動後端 API |
| `make dev-web` | 只啟動前端 web |
| `make test` | DSP 單元測試（合成訊號驗證 f0 / τ / Q） |
| `make typecheck` | 全工作區型別檢查 |
| `make check` | typecheck + test（CI 用） |
| `make build` | 前端正式建置 |
| `make db-reset` | 刪除本機 SQLite 資料庫 |
| `make clean` | 清除相依套件、建置產物與資料庫 |

> 不用 make 也可直接跑對應的 `pnpm` 指令（如 `pnpm dev`、`pnpm test`、`pnpm -r typecheck`）。

## 使用流程

1. **量測**頁：選/建球拍（可填品牌）→ 錄音或上傳 → 看頻譜、衰減曲線、特徵與品質提示 → 儲存。
2. **自動評分**頁：說明相對分數原理，顯示收藏母體統計與各球拍目前分數（免輸入任何數據）。
3. **比較**頁：可依品牌篩選，勾選多支球拍看雷達圖；支援「逐拍比較」與「依品牌比較（平均）」。

> 量測一致性受敲擊位置、力道、麥克風距離與環境噪音影響，建議在安靜處敲面材中心、連敲 2–3 下。
