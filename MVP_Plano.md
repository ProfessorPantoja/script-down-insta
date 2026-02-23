# 🚀 Projeto MVP: Instagram Batch Downloader (Desktop App)

## 📌 1. Visão do Produto
**O Problema:** Social Medias, Editores de Vídeo e Agências recebem diariamente dezenas de links de referências no WhatsApp/Trello. Baixar esse conteúdo (Reels, Carrosséis, Stories) link por link, pulando anúncios em sites cheios de vírus, custa HORAS por semana e muita energia.

**A Solução (O MVP):** Um aplicativo de Desktop (Windows/Mac) extremamente limpo e rápido. O usuário apenas cola uma lista de links (ou o texto inteiro de uma conversa) e clica em "Sincronizar". O app usa a própria máquina e conexão do usuário para baixar tudo em lote, organizar em pastas por perfil e entregar os arquivos prontos para edição.

### Por que Desktop e não Web (SaaS)?
- **Zero custo de servidor:** O download e processamento ocorrem na máquina do cliente.
- **Anti-bloqueio:** O app usa a conexão de internet e os cookies do navegador (Chrome/Edge) do próprio usuário. O Instagram enxerga o tráfego como um "humano navegando", evitando banimentos de IP e captchas que quebram 99% dos sites de download.
- **Privacidade:** Senhas e cookies nunca saem do computador do cliente.

---

## 🎯 2. Público-Alvo e Monetização
- **Público:** Social Medias, Gestores de Tráfego (baixar anúncios concorrentes), Editores de Vídeo (baixar materiais brutos), Produtores de Conteúdo.
- **Modelo de Negócio Sugerido:** Licença anual "lifetime" de baixo custo (ex: R$ 97 a R$ 147/ano) para justificar a manutenção das atualizações do extrator (visto que o Instagram muda o código do site frequentemente).

---

## 🛠️ 3. Arquitetura Técnica Sugerida

A tecnologia escolhida precisa ser universal, fácil de distribuir e rápida para desenvolver interfaces modernas.

### Stack Tecnológico:
- **Frontend (Interface):** HTML/CSS Moderno Vanilla ou Vue.js (focado em UI responsiva, dark mode, glassmorphism)
- **Backend/Empacotamento:** **Electron.js** ou **Tauri** (Permite usar tecnologias web para gerar um `.exe` para Windows e `.dmg` para Mac)
- **Motor de Download (Core):** `gallery-dl` executado em segundo plano pelo node.js, herdando a inteligência de usar `--cookies-from-browser`.

### Estrutura do App (Telas):
1. **Tela Principal (Dropzone):**
   - Um grande campo de texto para o usuário colar os links (um por linha) ou uma conversa inteira do WhatsApp.
   - Botão "Analisar Links" que conta e valida os links.
2. **Lista Visual (Preview):**
   - Mostra a quantidade de links extraídos.
   - Botão para escolher o navegador base (Chrome, Edge, Brave) para extrair os cookies.
   - Botão CTA poderoso: "⬇️ Baixar [X] Arquivos Agora"
3. **Tela de Progresso:**
   - Barra de progresso visual.
   - Log listando os links com checkmarks (✅/❌) indicando sucesso ou erro.
4. **Configurações:**
   - Escolher a pasta onde os arquivos serão salvos (ex: `📁 Área de Trabalho / Downloads Insta`).
   - Opção de organizar arquivos por "Nome do Perfil" ou "Tudo na mesma pasta".

---

## 📋 4. Plano de Ação (Próximos Passos)

1. **Validação de Negócio:** Validar a dor de mercado e a aceitação deste modelo de cobrança.
2. **Design UI/UX (Mockup):** Se aprovado, desenhar a tela inicial no Figma para ter uma referência visual linda antes de programar.
3. **Prova de Conceito (PoC UI):** Desenvolver a tela em HTML/CSS para sentir a "vibe" do aplicativo.
4. **Integração Real (Electron):** Juntar a interface com a lógica do nosso script atual (que já sabemos que funciona perfeitamente!).
