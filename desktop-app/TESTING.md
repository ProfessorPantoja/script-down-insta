# Testes (Obrigatório antes de commit)

## Automático

### Rápido (sem empacotar)

Em `desktop-app/`:

- `npm run verify:fast`

Isso executa `vue-tsc` + `vite build`.

### Completo (inclui empacotar)

Em `desktop-app/`:

- `npm run verify`

Isso:

1) Compila o renderer (`npm run build`)
2) Baixa binários Windows (`npm run prepare:win-bins`)
3) Empacota (`npm run pack`)
4) Verifica se `yt-dlp.exe` e `gallery-dl.exe` foram embutidos no app empacotado.

## Manual (Smoke)

Rodar `npm run dev` e validar:

1) Colar links e extrair (sem travar).
2) Baixar 1 link e confirmar status muda para `Baixando → Sucesso/Erro`.
3) Marcar `Abrir pasta ao concluir` e confirmar que abre o destino ao finalizar.
4) Clicar `Cancelar` durante um lote e confirmar finalização limpa.
5) Testar `Repetir falhas` (se houver erros).
6) Confirmar destino: `~/Downloads/InstaBatch/` (Linux).

## Windows (pré-release)

Em um Windows:

1) `npm ci`
2) `npm run dist:win`
3) Instalar o `.exe` (NSIS)
4) Repetir o smoke manual.

### Windows: cookies e autenticação (Instagram)

Durante o smoke no Windows, validar também:

1) Teste com `Chrome` (ou `Edge`) selecionado em **Cookies do Navegador** e usuário logado.
2) Conferir que o app mostra `Cookies selecionados: ...` durante o download.
3) Para conteúdo que exige login, confirmar que não há `HTTP redirect to login page`.
4) Se houver falha com `DPAPI`, confirmar que a mensagem reporta falha de cookies do navegador (não apenas redirect genérico).
5) Repetir com outro navegador (preferência: `Firefox`) para comparar comportamento no mesmo link.

## CI (GitHub Actions)

O workflow roda:

- `verify:fast` no Linux em todo push/PR
- `dist:win` no Windows apenas quando:
  - você dispara manualmente (Actions → CI → Run workflow), ou
  - você cria uma tag `v*` (ex.: `v0.1.0`)

O instalador do Windows fica disponível como *artifact* do job `dist (windows)`.
