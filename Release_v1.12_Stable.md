# GravityLink v1.12 穩定版本 (Stable Release)

## 릴리스日期：2026-05-06
## 版本狀態：Production Ready

### 1. 核心技術架構 (Architecture)
- **AI 引擎**：Google Gemini 2.5 系列 (Pro / Flash / Lite)
- **通訊協議**：Socket.io 多埠加密隧道 (3001, 8080, 8443)
- **同步邏輯**：Mobile Client <-> NB Host <-> Gemini API 三方實時同步
- **路由保護**：內置「智能避障路由」，自動處理 Pro 配額限制，無感切換至 Flash 備援通道。

### 2. UI/UX 升級項目
- **Mana Orb v2.0**：深藍色動態旋轉水波特效，具備算力百分比實時反饋。
- **Diagnostic Dashboard**：標頭集成 NB(連線)、AI(運算)、KEY(授權) 三色健康燈號。
- **Pro Layout**：高密度手機端介面，優化按鈕重置邏輯，支援流暢的連續開發對話。

### 3. 安全與穩定性
- **加密傳輸**：全通訊鏈路採用 AES 加密。
- **斷線重連**：前台自動喚醒機制，無限次重連嘗試，適配行動網路不穩定環境。
- **金鑰管理**：API Key 鎖定在 NB 端執行，不暴露在前端。

### 4. 操作指令
- **啟動後端**：`node server/index.cjs`
- **啟動前端**：`npm run dev`

---
*GravityLink - Empowering Mobile Development with Desktop Grade AI.*
