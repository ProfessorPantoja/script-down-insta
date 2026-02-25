# Roteiro de Teste (Windows) — InstaBatch

Tempo estimado: 5–10 minutos  
Objetivo: validar instalação + fluxo principal de download.

## Pré-requisitos

- Windows 10/11
- Chrome ou Edge instalado (preferência: Chrome)
- Logado no Instagram/TikTok/Kwai no navegador escolhido (se for testar conteúdo que exige login)
- Opcional: ter Firefox instalado para teste cruzado de cookies, caso Chrome/Edge falhem no Windows

## 1) Instalação

1. Baixe o artifact `instabatch-windows-installer` (zip) e extraia.
2. Rode o instalador `.exe` (NSIS) e conclua a instalação.
3. Abra o app “InstaBatch”.

## 2) Smoke do app (sem baixar ainda)

1. Cole no campo de texto 2–3 links (1 por linha), por exemplo:
   - 1 link Instagram (reel ou post)
   - 1 link TikTok (vídeo)
   - (opcional) 1 link Kwai
2. Clique **“Extrair links”**.
3. Confirme que aparece a tela com contadores e a lista de links.

## 3) Download (principal)

1. Em **Cookies do Navegador**, selecione `Chrome` ou `Edge` (o que você usa e está logado).
2. Marque **Abrir pasta ao concluir**.
3. Clique no botão verde **“Baixar X links”**.
4. Confirme que o status muda para `⬇️ [Baixando]` e depois `✅ [Sucesso]` (ou `❌ [Erro]`).

## 4) Verificar arquivos salvos

1. O app deve salvar em:
   - `Downloads/InstaBatch/`
2. Confirme que os arquivos apareceram lá.
3. Confirme se a pasta abriu automaticamente ao terminar (se o checkbox estava marcado).

## 5) Cancelamento (opcional, 1 minuto)

1. Comece um download de 2+ links.
2. Clique **Cancelar**.
3. Confirme que o app finaliza e marca itens restantes como `Cancelado`.

## 6) Troubleshooting rápido (Windows)

1. Se aparecer `HTTP redirect to login page`, o app não conseguiu autenticar com cookies naquele navegador/perfil.
2. Se aparecer erro com `DPAPI` ou `Failed to decrypt cookie`, o Windows bloqueou a leitura/decriptação dos cookies desse navegador/perfil.
3. Troque o navegador selecionado no app e teste novamente (preferência: Firefox logado para comparação).
4. Refaça o teste com o mesmo link e verifique se o erro muda.

## 7) Se der erro — o que enviar para suporte

Envie:

- Print da tela do app mostrando o erro (linha vermelha)
- Navegador selecionado (Chrome/Edge/Firefox)
- Mensagem completa do erro (incluindo trecho `DPAPI` ou `redirect to login`, se existir)
- Se o navegador estava logado no momento do teste
- Caminho de destino (se abriu pasta ou não)
