# MVP v2 - Instagram Batch Downloader (Desktop, Windows-first)

## 1) Resumo Executivo

- Objetivo: transformar o conceito em um plano tecnico executavel, sem ambiguidades.
- Plataforma inicial: Windows primeiro.
- Stack fechada: Electron + Node.js + TypeScript + Vue 3.
- Motor de download: `gallery-dl` empacotado com o app.
- Resultado esperado: instalador `.exe` funcional para lote de links com progresso e tratamento de falhas.

## 2) Objetivo e Criterios de Sucesso

### Objetivo do MVP
- Permitir que o usuario cole texto livre (WhatsApp/Trello), extraia links do Instagram e baixe em lote com visibilidade de status.

### Criterios de sucesso (aceitacao)
- Iniciar downloads em ate 3 segundos apos clique em "Baixar".
- Processar lote de 50 links validos com pelo menos 90% de sucesso (cookies validos).
- UI nao pode travar durante execucao.
- Logs por item com status e motivo de erro.

## 3) Escopo do MVP

### In scope
- Extração de links Instagram em texto livre:
  - `instagram.com/p/...`
  - `instagram.com/reel/...`
  - `instagram.com/tv/...`
  - `instagram.com/stories/...` (quando suportado pelo `gallery-dl`)
- Validacao basica, normalizacao e deduplicacao de links.
- Escolha de navegador para cookies (`chrome`, `edge`, `firefox`).
- Download em lote com progresso por item e progresso total.
- Cancelamento de lote.
- Repetir apenas itens com falha.
- Escolha de pasta de destino.
- Organizacao por perfil ou pasta unica.

### Out of scope (v1.1+)
- macOS.
- Login embutido no app.
- Captcha solving, bypass, proxy rotation.
- Infra cloud e analytics.
- Auto-update de binarios.

## 4) Decisoes Tecnicas Fechadas

- Runtime Desktop: Electron.
- Linguagem: TypeScript.
- Frontend: Vue 3 + Vite + Pinia.
- Packaging: `electron-builder` com target `nsis` (Windows).
- Distribuicao do motor:
  - `resources/bin/win/gallery-dl.exe`
- Baseline de versao:
  - `gallery-dl 1.31.6` (fixada no MVP)
- Concurrency padrao:
  - `3` downloads simultaneos (range configuravel `1..5`)
- Persistencia de configuracao:
  - `%APPDATA%/InstaBatchDownloader/settings.json`

## 5) Compliance e Seguranca

### Politica aplicada no MVP
- Modo estrito por padrao.
- Uso para conteudo proprio, autorizado ou publico conforme termos aplicaveis.
- Sem features de evasao/bypass.
- Aviso legal com aceite no primeiro uso.

### Regras tecnicas de seguranca
- Cookies nao saem da maquina do usuario.
- Nao persistir cookies/tokens em arquivo proprio.
- Usar somente `--cookies-from-browser`.
- Sanitizar nomes de arquivo/pasta para evitar path traversal.
- Logs sem dados sensiveis.

## 6) Arquitetura de Alto Nivel

### Modulos
- `main` (Electron):
  - vida da aplicacao, janelas, IPC, spawn do worker
- `preload`:
  - API segura exposta ao renderer
- `renderer`:
  - telas e estado da UI
- `core/parser`:
  - extração, normalizacao e deduplicacao
- `core/downloader`:
  - fila, retry, timeout, cancelamento e eventos de progresso
- `core/settings`:
  - leitura/escrita de configuracao e validacao de schema

### Hardening baseline
- `contextIsolation: true`
- `nodeIntegration: false`
- whitelist de canais IPC

## 7) Interfaces e Contratos (IPC)

### Chamadas do renderer para main
- `parseLinks(inputText: string) -> ParseResult`
- `getBrowsers() -> BrowserOption[]`
- `startBatch(request: StartBatchRequest) -> BatchStarted`
- `cancelBatch(batchId: string) -> { cancelled: boolean }`
- `retryFailures(batchId: string) -> { retried: number }`
- `getSettings() -> AppSettings`
- `saveSettings(settings: AppSettings) -> { ok: true }`

### Eventos do main para renderer
- `batchProgress`
- `batchItem`
- `batchFinished`

### Tipos principais
- `BrowserOption = 'chrome' | 'edge' | 'firefox'`
- `BatchItemStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled'`
- `BatchFailureReason = 'auth' | 'not_found' | 'rate_limit' | 'network' | 'unsupported' | 'unknown'`

## 8) Regras do Downloader

### Comando base por item
`gallery-dl.exe --cookies-from-browser <browser> -d <outputDir> <url>`

### Politicas de execucao
- Timeout por item: `120s`
- Retry padrao: `2`
- Backoff: `2s` e `5s`
- Cancelamento: encerra fila e processos ativos de forma controlada
- Falhas de autenticacao/cookies:
  - instruir usuario a fechar navegador, renovar sessao e repetir falhas

## 9) UX e Fluxo de Telas

1. Tela Inicial
   - textarea para colar texto
   - botao "Analisar Links"
   - counters: validos, invalidos, duplicados removidos
2. Tela Pre-download
   - preview de links
   - navegador de cookies
   - pasta de saida
   - toggle organizar por perfil
   - CTA "Baixar X arquivos"
3. Tela de Progresso
   - barra global
   - status por item
   - acoes: "Cancelar", "Repetir Falhas", "Abrir Pasta"
4. Configuracoes
   - pasta padrao
   - navegador padrao
   - concorrencia
   - retries
5. Primeiro uso
   - modal de aviso legal + aceite obrigatorio

## 10) Plano de Implementacao (ordem exata)

1. Bootstrap do projeto Electron + Vue + TypeScript com IPC tipado.
2. Implementar parser de links com normalizacao e deduplicacao.
3. Implementar worker de download (fila, retry, timeout, cancelamento).
4. Conectar UI com eventos de progresso e estados de lote.
5. Implementar persistencia de settings com `schemaVersion: 1`.
6. Empacotar para Windows com `electron-builder` e incluir `gallery-dl.exe`.
7. Checklist final de hardening, QA e release.

## 11) Testes e Criterios de Aceite

### Unitarios
- Parser:
  - extração com ruido de texto
  - remocao de query tracking (ex.: `igsh`)
  - deduplicacao correta
- Settings:
  - defaults quando arquivo nao existe
  - recuperacao de arquivo corrompido

### Integracao
- Worker:
  - sucesso direto
  - falha + retry + sucesso
  - timeout
  - cancelamento no meio da fila

### E2E
- Fluxo completo: colar -> analisar -> baixar -> finalizar.
- Lote misto (sucesso/falha) + repetir falhas.
- Estrutura final em pasta correta (por perfil / unica).

### Aceite manual minimo
- Lote real com 20 links em ambiente Windows.
- Confirmar nao travamento da UI.
- Confirmar logs e mensagens de erro acionaveis.

## 12) Entregaveis

- Documento tecnico do MVP v2 (este arquivo).
- Aplicativo desktop funcional para Windows.
- Instalador `.exe` gerado por pipeline local.
- Runbook curto de suporte (erros comuns e acao recomendada).

## 13) Assumptions e Defaults

- Windows-first para reduzir risco e tempo de entrega.
- Stack Electron para acelerar integracao com `gallery-dl`.
- `gallery-dl` fixado na versao baseline do MVP; upgrades por release.
- Compliance estrito por sustentabilidade tecnica e juridica.
- Monetizacao/comercial ficam fora do escopo tecnico deste sprint.
