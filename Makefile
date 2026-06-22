# 桌球拍敲擊聲學分析 — 常用指令
# 用法：make <target>，例如 `make install`、`make dev`

# 用 bash 並在出錯時中止
SHELL := /bin/bash
.DEFAULT_GOAL := help

# 連接埠（可覆寫：make dev API_PORT=6000）
API_PORT ?= 5179
WEB_PORT ?= 5180
API_DB   := apps/api/data/ttr.db

.PHONY: help install dev dev-api dev-web build test typecheck check clean db-reset

help: ## 顯示可用指令
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## 安裝所有相依套件（pnpm workspace）
	pnpm install

dev: ## 同時啟動 web 與 api
	pnpm --parallel --filter @ttr/web --filter @ttr/api dev

dev-api: ## 只啟動後端 API（預設 :5179）
	PORT=$(API_PORT) pnpm --filter @ttr/api dev

dev-web: ## 只啟動前端 web（預設 :5180）
	pnpm --filter @ttr/web dev

build: ## 前端正式建置
	pnpm --filter @ttr/web build

test: ## 執行 DSP 單元測試
	pnpm test

typecheck: ## 全工作區型別檢查
	pnpm -r typecheck

check: typecheck test ## 型別檢查 + 測試（CI 用）

db-reset: ## 刪除本機 SQLite 資料庫
	@rm -f $(API_DB) $(API_DB)-journal && echo "已刪除 $(API_DB)"

clean: ## 清除 node_modules、建置產物與資料庫
	@rm -rf node_modules packages/*/node_modules apps/*/node_modules \
		packages/*/dist apps/*/dist apps/web/dist
	@rm -f $(API_DB) $(API_DB)-journal
	@echo "已清除相依套件、建置產物與資料庫"
