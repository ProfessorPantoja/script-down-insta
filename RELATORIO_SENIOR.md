# Relatório Técnico (Senior) — Script-Down-Insta / InstaBatch

Data: 2026-02-23  
Escopo: revisão geral do repositório + smoke tests locais (build/dev) do app desktop.

## 1) Resumo Executivo

O repo já tem **duas entregas úteis**:

- `baixar-insta.sh`: PoC funcional (Linux) para extrair links do clipboard e baixar via `gallery-dl` com cookies do navegador.
- `desktop-app/`: um **MVP de desktop** (Vue + Electron) com fluxo bem próximo do documento `MVP_Plano_v2.md`: cola texto → extrai/normaliza → audita mídia → baixa em lote.

Principais gaps para “MVP v2” **pronto para Windows**:

- Dependências de download (`gallery-dl`/`yt-dlp`) **não são bundladas** no app (hoje depende do PATH do usuário).
- Não há **fila com concorrência**, retry, cancelamento, “repetir falhas”, persistência de settings.
- Packaging `electron-builder` está no `package.json`, mas **não há configuração de build/installer**.
- Há divergências de comportamento entre parser local (renderer) e parser do main (Electron), e o `saveMode` é aplicado apenas no caminho Kwai.

## 2) O Que Eu Rodei (Smoke Tests)

### Build (Typecheck + Vite)

Em `desktop-app/`:
- `npm run build` ✅ (TypeScript + build do Vite finalizaram sem erro)

### Dev (Vite + Electron)

Em `desktop-app/`:
- `npm run dev` ✅ sobe Vite e inicializa o Electron (com warnings de ambiente gráfico/DBus desta máquina)

Observações importantes do ambiente:
- A variável `ELECTRON_RUN_AS_NODE` estava setada no ambiente e **quebrava a inicialização do Electron** (o app rodava como Node e `ipcMain` ficava `undefined`).
- Nesta máquina/VM, o Electron emitia crash do processo de GPU (“GPU process isn't usable”). Para estabilizar o dev, forcei flags de desativação de GPU no runner.

## 3) Mudanças Pequenas Que Eu Fiz Para Conseguir Testar Aqui

Arquivos alterados:
- `desktop-app/package.json`: `dev` agora usa um runner Node para iniciar o Electron (evita `ELECTRON_RUN_AS_NODE`).
- `desktop-app/scripts/run-electron.mjs`: cria o processo Electron limpando `ELECTRON_RUN_AS_NODE` e adiciona flags padrão `--disable-gpu` e `--disable-gpu-sandbox`.
- `desktop-app/electron/main.cjs`: falha rápido com mensagem clara se `ELECTRON_RUN_AS_NODE` estiver setado; chama `app.disableHardwareAcceleration()`.

Motivo: tornar `npm run dev` reprodutível (mesmo com `ELECTRON_RUN_AS_NODE` setado) e evitar crash por GPU no ambiente atual.

## 4) Arquitetura Atual (Como Está Hoje)

### Desktop App

- UI: `desktop-app/src/App.vue` (Vue 3 + Tailwind)
  - Extrai links do texto (fallback local)
  - Seleção por plataforma (Instagram/TikTok/X/Kwai)
  - Auditoria de tipo (image/video/mixed/unknown)
  - Download sequencial e status por item
- Electron main: `desktop-app/electron/main.cjs`
  - IPC:
    - `parse-links`: extrai, normaliza, deduplica e **resolve encurtadores** para tentar classificar plataforma
    - `audit-links`: chama `yt-dlp --dump-single-json` para inferir tipo (image/video/mixed)
    - `start-download`: chama `gallery-dl` (ou `yt-dlp` para Kwai) para baixar
    - `export-audit-report`: exporta CSV/TXT via save dialog
- Preload: `desktop-app/electron/preload.cjs` expõe API mínima via `contextBridge`.

### Script Linux (PoC)

- `baixar-insta.sh`: instala dependências via apt/pipx, lê clipboard com `xclip`, baixa via `gallery-dl --cookies-from-browser`.

## 5) Pontos Fortes

- Fluxo do produto está bem alinhado com a visão do MVP (`MVP_Plano.md` / `MVP_Plano_v2.md`).
- Boas práticas básicas do Electron: `contextIsolation: true`, `nodeIntegration: false`, preload dedicado.
- Parser no main é melhor que o fallback do renderer (dedupe + normalização + resolve encurtador).
- Export de auditoria (CSV/TXT) é um diferencial “de agência” (bom para prestação de contas).

## 6) Problemas / Riscos (Prioridade)

### P0 — Funcionalidade principal depende do ambiente do usuário

- `gallery-dl` e `yt-dlp` precisam estar instalados no PATH; se não estiverem, o app falha.
  - No script bash isso é resolvido; no desktop app não.
  - Para Windows, isso precisa ser resolvido via **bundling** (como o `MVP_Plano_v2.md` sugere).

### P0 — UX do download ainda é “sequencial e cego”

- `audit-links` e downloads rodam 1 a 1 (sem concorrência, sem cancelamento, sem retry).
- Sem timeouts por item (se `gallery-dl` travar, UI fica aguardando).

### P1 — Divergência de lógica entre renderer e main

- `src/App.vue` tem `parseLinksLocally()` que não resolve encurtadores e pode classificar diferente do main.
- Recomenda-se **um único parser compartilhado** (ex.: `src/shared/parser.ts`) usado tanto no renderer quanto no main.

### P1 — `saveMode` incompleto

- No main, `saveMode` altera output template apenas para `kwai`.
- Para Instagram/TikTok/X, `saveMode` não muda nada (o usuário escolhe na UI, mas o backend ignora).

### P1 — Packaging ainda não existe de verdade

- Há `electron-builder` como dependência, mas não há:
  - scripts `dist`, `pack`, `release`
  - config `build` no `package.json` (ou `electron-builder.yml`)
  - inclusão de binários (`gallery-dl.exe`, etc) em `resources/`

### P2 — Warnings de segurança do Electron (CSP)

- Ao rodar aqui apareceu warning de “Insecure Content-Security-Policy”.
- Falta definir CSP (ao menos para produção). Em dev, Vite pode precisar de exceções controladas.

## 7) Recomendações (Plano Prático)

### Agora (1–2 dias)

- Consolidar parser em módulo compartilhado e remover duplicação no renderer.
- Implementar preflight no main:
  - detectar se `gallery-dl`/`yt-dlp` existem
  - retornar erro “acionável” (com passos) via IPC para a UI
- Implementar worker de download com:
  - fila + concorrência configurável (ex.: 3)
  - timeout por item
  - retry (ex.: 2 tentativas)
  - cancelamento do lote

### Em seguida (Windows-first)

- Adicionar pipeline de build com `electron-builder`:
  - target NSIS
  - bundling de `gallery-dl.exe` (e dependências) dentro do app
  - estratégia de atualização do binário (manual no MVP)

### Depois (produto)

- Persistência de settings (browser padrão, pasta, concorrência).
- Termos/aviso legal no primeiro uso (o seu `MVP_Plano_v2.md` já prevê).
- Internacionalização (PT/EN/ES etc) quando houver validação de pagamento.

## 8) Como Rodar (Comandos)

Desktop (dev):
- `cd desktop-app`
- `npm run dev`

Build:
- `cd desktop-app`
- `npm run build`

Script Linux (PoC):
- `bash baixar-insta.sh`

