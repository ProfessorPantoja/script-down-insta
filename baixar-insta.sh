#!/bin/bash
# ============================================================
#  📸 Instagram Link Collector & Downloader
#  
#  USO:
#    1. Copie o texto da conversa do WhatsApp (Ctrl+C)
#    2. Execute:  bash baixar-insta.sh
#    3. Confira os links e confirme o download
#
#  Os arquivos serão salvos na pasta ./downloads/
# ============================================================

set -euo pipefail

# Cores
VERDE='\033[0;32m'
AMARELO='\033[1;33m'
AZUL='\033[0;34m'
VERMELHO='\033[0;31m'
CIANO='\033[0;36m'
NEGRITO='\033[1m'
RESET='\033[0m'

PASTA_DOWNLOADS="./downloads"
ARQUIVO_LINKS="./links.txt"

clear
echo ""
echo -e "${CIANO}${NEGRITO}╔═══════════════════════════════════════════════════╗${RESET}"
echo -e "${CIANO}${NEGRITO}║     📸  Instagram Downloader - Link Collector    ║${RESET}"
echo -e "${CIANO}${NEGRITO}╚═══════════════════════════════════════════════════╝${RESET}"
echo ""

# ── ETAPA 1: Garantir dependências locais ─────────────────────
echo -e "${AZUL}▸ Preparando ambiente de download...${RESET}"

export PATH="$HOME/.local/bin:$PATH"

if ! command -v xclip &> /dev/null; then
    echo -e "${VERMELHO}✖ Dependência 'xclip' ausente. Instalando...${RESET}"
    sudo apt update && sudo apt install -y xclip
fi

if ! command -v pipx &> /dev/null; then
    echo -e "${AMARELO}▸ Instalando 'pipx' (gerenciador de pacotes Python)...${RESET}"
    sudo apt update && sudo apt install -y pipx python3-venv python3-secretstorage python3-jeepney
    pipx ensurepath
fi

if ! command -v gallery-dl &> /dev/null; then
    echo -e "${AMARELO}▸ Configurando motor de download (gallery-dl)...${RESET}"
    pipx install gallery-dl
    pipx inject gallery-dl secretstorage jeepney &>/dev/null || true
fi

echo -e "${VERDE}✔ Ambiente pronto!${RESET}"
echo ""

# ── ETAPA 2: Escolher navegador para cookies ──────────────────
echo -e "${AMARELO}${NEGRITO}🔑 Qual navegador você usa para acessar o Instagram?${RESET}"
echo "    (Precisamos dos cookies para não sermos bloqueados)"
echo ""

NAVEGADORES=()
if command -v google-chrome &> /dev/null || command -v google-chrome-stable &> /dev/null; then
    NAVEGADORES+=("chrome")
    echo -e "  ${CIANO}[1]${RESET} Google Chrome"
fi
if command -v firefox &> /dev/null; then
    NAVEGADORES+=("firefox")
    echo -e "  ${CIANO}[2]${RESET} Firefox"
fi
echo -e "  ${CIANO}[0]${RESET} Tentar sem login (provavelmente vai falhar)"
echo ""

read -r -p "Escolha (1/2/0): " ESCOLHA_NAV

case "$ESCOLHA_NAV" in
    1) NAVEGADOR="chrome" ;;
    2) NAVEGADOR="firefox" ;;
    *) NAVEGADOR="" ;;
esac

if [ -n "$NAVEGADOR" ]; then
    COOKIE_FLAG="--cookies-from-browser $NAVEGADOR"
    echo -e "${VERDE}✔ Usando cookies do ${NEGRITO}$NAVEGADOR${RESET}"
else
    COOKIE_FLAG=""
    echo -e "${AMARELO}⚠ Tentando sem cookies${RESET}"
fi
echo ""

# ── ETAPA 3: Extrair links do clipboard ───────────────────────
echo -e "${AZUL}▸ Lendo clipboard e extraindo links do Instagram...${RESET}"
echo ""

CLIPBOARD=$(xclip -selection clipboard -o 2>/dev/null || true)
if [ -z "$CLIPBOARD" ]; then
    echo -e "${VERMELHO}✖ Clipboard vazio! Copie o texto da conversa primeiro.${RESET}"
    exit 1
fi

LINKS=$(echo "$CLIPBOARD" | grep -oP 'https?://[^\s<>"'\'']*instagram\.com[^\s<>"'\'']*' | sort -u || true)
if [ -z "$LINKS" ]; then
    echo -e "${VERMELHO}✖ Nenhum link do Instagram encontrado no clipboard!${RESET}"
    exit 1
fi

TOTAL=$(echo "$LINKS" | wc -l)
echo "$LINKS" > "$ARQUIVO_LINKS"

echo -e "${VERDE}${NEGRITO}✔ $TOTAL link(s) encontrado(s)!${RESET}"
echo ""

NUM=1
while IFS= read -r link; do
    echo -e "  ${CIANO}${NEGRITO}[$NUM]${RESET} $link"
    NUM=$((NUM + 1))
done <<< "$LINKS"
echo ""

read -r -p "⬇  Baixar todos os $TOTAL arquivos? (s/n): " RESPOSTA
if [[ ! "$RESPOSTA" =~ ^[sS]$ ]]; then
    echo -e "${AZUL}✔ Cancelado.${RESET}"
    exit 0
fi

# ── ETAPA 4: Baixar tudo ──────────────────────────────────────
echo ""
mkdir -p "$PASTA_DOWNLOADS"

if [ -n "$NAVEGADOR" ]; then
    echo -e "${AMARELO}${NEGRITO}⚠  IMPORTANTE: Feche o $NAVEGADOR antes de continuar!${RESET}"
    read -r -p "Navegador fechado? Pressione ENTER para iniciar os downloads..."
    echo ""
fi

echo -e "${AZUL}▸ Iniciando downloads na pasta ${NEGRITO}$PASTA_DOWNLOADS/${RESET}"
echo ""

SUCESSO=0
FALHA=0
NUM=1

while IFS= read -r link; do
    echo -e "${CIANO}[$NUM/$TOTAL]${RESET} Baixando: $link"
    
    # gallery-dl é excelente para instagram, suporta cookies, imagens, vídeos e álbuns
    if gallery-dl $COOKIE_FLAG -d "$PASTA_DOWNLOADS" "$link" > /dev/null 2>&1; then
        echo -e "  ${VERDE}✔ Concluído!${RESET}"
        SUCESSO=$((SUCESSO + 1))
    else
        echo -e "  ${VERMELHO}✖ Falhou!${RESET}"
        FALHA=$((FALHA + 1))
    fi
    
    NUM=$((NUM + 1))
done <<< "$LINKS"

# ── ETAPA 5: Resumo final ─────────────────────────────────────
echo ""
echo -e "${NEGRITO}══════════════════ RESULTADO ══════════════════${RESET}"
echo -e "  ${VERDE}✔ Sucesso: $SUCESSO${RESET}"
if [ "$FALHA" -gt 0 ]; then
    echo -e "  ${VERMELHO}✖ Falhas:  $FALHA${RESET}"
    echo -e "  ${AMARELO}Dica: se muitas falhas ocorrerem, abra o Chrome, acesse o Instagram"
    echo -e "        para renovar os cookies, feche o Chrome e tente novamente.${RESET}"
fi
echo -e "  📁 Pasta:   ${NEGRITO}$(realpath $PASTA_DOWNLOADS)/${RESET}"
echo -e "  📝 Instag:  ${NEGRITO}Arquivos salvos separadamente por perfis na pasta 'instagram/'${RESET}"
echo ""
echo -e "${CIANO}${NEGRITO}✨ Pronto!${RESET}"
echo ""
