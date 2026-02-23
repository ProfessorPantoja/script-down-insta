<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

type Platform = 'instagram' | 'tiktok' | 'twitter' | 'kwai'
type MediaType = 'image' | 'video' | 'mixed' | 'unknown'

interface LinkItem {
  url: string
  platform: Platform
  mediaType: MediaType
  auditError?: string
}

interface DownloadStatus {
  url: string
  platform: Platform
  mediaType: MediaType
  status: 'pending' | 'running' | 'success' | 'error'
  error?: string
}

interface TotalsState {
  extracted: number
  unique: number
  supported: number
  unsupported: number
}

const inputText = ref('')
const selectedBrowser = ref<'chrome' | 'edge' | 'firefox'>('chrome')
const saveMode = ref<'perfil' | 'misturado'>('perfil')
const openFolderOnFinish = ref(true)
const downloadFolderPath = ref('')

const analyzing = ref(false)
const auditing = ref(false)
const currentStep = ref(1)
const analyzeInputStatus = ref('')

const pasteMenuOpen = ref(false)
const pasteMenuPos = ref({ x: 0, y: 0 })
const pasteTarget = ref<HTMLTextAreaElement | null>(null)

const links = ref<LinkItem[]>([])
const unsupportedLinks = ref<string[]>([])
const linkTotals = ref<TotalsState>({
  extracted: 0,
  unique: 0,
  supported: 0,
  unsupported: 0
})

const platformSelection = ref<Record<Platform, boolean>>({
  instagram: true,
  tiktok: true,
  twitter: true,
  kwai: true
})

const isDownloading = ref(false)
const downloadProgress = ref(0)
const downloadStatuses = ref<DownloadStatus[]>([])
const downloadActionStatus = ref('')
const cancellingDownload = ref(false)
const activeBatchId = ref('')

let unsubscribeBatchProgress: null | (() => void) = null
let unsubscribeBatchDone: null | (() => void) = null
let downloadIndexByUrl = new Map<string, number>()

const allPlatforms: Platform[] = ['instagram', 'tiktok', 'twitter', 'kwai']

const isElectron = () => Boolean((window as any).electronAPI)

const canOpenDownloadFolder = computed(() => {
  if (!isElectron()) return false
  return Boolean((window as any).electronAPI?.openDownloadFolder)
})

const openDownloadFolder = () => {
  if (!canOpenDownloadFolder.value) return
  ;(window as any).electronAPI.openDownloadFolder()
}

const openPasteMenu = (event: MouseEvent) => {
  const target = event.target as HTMLElement | null
  if (!target) return
  if (!(target instanceof HTMLTextAreaElement)) return

  pasteTarget.value = target
  pasteMenuPos.value = { x: event.clientX, y: event.clientY }
  pasteMenuOpen.value = true
}

const closePasteMenu = () => {
  pasteMenuOpen.value = false
  pasteTarget.value = null
}

const onDocClick = () => closePasteMenu()
const onKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') closePasteMenu()
}

const readClipboardText = async () => {
  if (isElectron() && (window as any).electronAPI?.readClipboardText) {
    try {
      return String((window as any).electronAPI.readClipboardText() || '')
    } catch {
      // fallback abaixo
    }
  }

  try {
    return await navigator.clipboard.readText()
  } catch {
    return ''
  }
}

const pasteFromContextMenu = async () => {
  const target = pasteTarget.value
  closePasteMenu()
  if (!target) return

  const text = await readClipboardText()
  if (!text) return

  inputText.value = text
  target.focus()
}

const normalizeUrl = (rawUrl: string) => {
  const cleaned = rawUrl.trim().replace(/[)\],.;!?]+$/g, '')
  try {
    const parsed = new URL(cleaned)
    const host = parsed.hostname.toLowerCase()
    parsed.hash = ''
    if (
      host.includes('instagram.com') ||
      host.includes('tiktok.com') ||
      host === 'x.com' ||
      host.endsWith('.x.com') ||
      host.includes('twitter.com') ||
      host.includes('kwai.com') ||
      host.includes('kwai-video.com')
    ) {
      parsed.search = ''
    }
    return parsed.toString()
  } catch {
    return cleaned
  }
}

const detectPlatform = (url: string): Platform | 'unknown' => {
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host.includes('instagram.com')) return 'instagram'
    if (host.includes('tiktok.com')) return 'tiktok'
    if (host === 'x.com' || host.endsWith('.x.com') || host.includes('twitter.com')) return 'twitter'
    if (host.includes('kwai-video.com') || host.includes('kwai.com')) return 'kwai'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

const fallbackMediaType = (url: string, platform: Platform): MediaType => {
  const normalized = url.toLowerCase()
  if (platform === 'kwai') return 'video'
  if (platform === 'tiktok') return normalized.includes('/photo/') ? 'image' : 'video'
  if (platform === 'instagram' && (normalized.includes('/reel/') || normalized.includes('/tv/'))) return 'video'
  if (platform === 'instagram' && (normalized.includes('/p/') || normalized.includes('/stories/'))) return 'mixed'
  return 'unknown'
}

const platformLabel = (platform: Platform) => {
  if (platform === 'instagram') return 'Instagram'
  if (platform === 'tiktok') return 'TikTok'
  if (platform === 'twitter') return 'X/Twitter'
  return 'Kwai'
}

const mediaLabel = (mediaType: MediaType) => {
  if (mediaType === 'image') return 'Imagem'
  if (mediaType === 'video') return 'Vídeo'
  if (mediaType === 'mixed') return 'Misto'
  return 'Não identificado'
}

const mediaTotals = computed(() => {
  return links.value.reduce(
    (acc, item) => {
      acc[item.mediaType] += 1
      return acc
    },
    { image: 0, video: 0, mixed: 0, unknown: 0 }
  )
})

const selectedLinks = computed(() =>
  links.value.filter((item) => platformSelection.value[item.platform])
)

const selectedMediaTotals = computed(() => {
  return selectedLinks.value.reduce(
    (acc, item) => {
      acc[item.mediaType] += 1
      return acc
    },
    { image: 0, video: 0, mixed: 0, unknown: 0 }
  )
})

const selectedCount = computed(() => selectedLinks.value.length)
const failedCount = computed(() => downloadStatuses.value.filter((item) => item.status === 'error').length)

const platformRows = computed(() => {
  return allPlatforms
    .map((platform) => {
      const items = links.value.filter((item) => item.platform === platform)
      if (items.length === 0) return null

      const breakdown = items.reduce(
        (acc, item) => {
          acc[item.mediaType] += 1
          return acc
        },
        { image: 0, video: 0, mixed: 0, unknown: 0 }
      )

      return {
        platform,
        total: items.length,
        image: breakdown.image,
        video: breakdown.video,
        mixed: breakdown.mixed,
        unknown: breakdown.unknown
      }
    })
    .filter(Boolean) as Array<{
      platform: Platform
      total: number
      image: number
      video: number
      mixed: number
      unknown: number
    }>
})

const auditableLinks = computed(() => {
  return links.value.map((item, index) => ({
    index: index + 1,
    url: item.url,
    platform: item.platform,
    mediaType: item.mediaType,
    selected: platformSelection.value[item.platform]
  }))
})

const auditActionStatus = ref('')
const exportingAudit = ref(false)

const buildAuditTextLines = () => {
  const lines: string[] = []
  lines.push(`Total links suportados: ${links.value.length}`)
  lines.push(`Total links não suportados: ${unsupportedLinks.value.length}`)
  lines.push('')
  lines.push('=== LINKS SUPORTADOS ===')

  for (const row of auditableLinks.value) {
    lines.push(
      `${row.index}. [${platformLabel(row.platform)}] [${mediaLabel(row.mediaType)}] [${row.selected ? 'Selecionado' : 'Fora da seleção'}] ${row.url}`
    )
  }

  if (unsupportedLinks.value.length > 0) {
    lines.push('')
    lines.push('=== LINKS NÃO SUPORTADOS ===')
    for (const [index, link] of unsupportedLinks.value.entries()) {
      lines.push(`${index + 1}. ${link}`)
    }
  }

  return lines
}

const setAuditActionStatus = (message: string) => {
  auditActionStatus.value = message
  setTimeout(() => {
    if (auditActionStatus.value === message) {
      auditActionStatus.value = ''
    }
  }, 3200)
}

const copyAuditList = async () => {
  try {
    await navigator.clipboard.writeText(buildAuditTextLines().join('\n'))
    setAuditActionStatus('Lista copiada para a área de transferência.')
  } catch {
    setAuditActionStatus('Não foi possível copiar automaticamente.')
  }
}

const exportAuditList = async () => {
  if (exportingAudit.value) return

  const payload = {
    summary: {
      supported: links.value.length,
      unsupported: unsupportedLinks.value.length
    },
    rows: auditableLinks.value.map((row) => ({
      index: row.index,
      platform: platformLabel(row.platform),
      mediaType: mediaLabel(row.mediaType),
      selected: row.selected,
      url: row.url
    })),
    unsupportedLinks: [...unsupportedLinks.value]
  }

  if (isElectron() && (window as any).electronAPI.exportAuditReport) {
    exportingAudit.value = true
    try {
      const result = await (window as any).electronAPI.exportAuditReport(payload)
      if (result?.ok) {
        setAuditActionStatus(`Arquivo exportado: ${result.path}`)
      } else if (!result?.cancelled) {
        setAuditActionStatus(`Falha ao exportar: ${result?.error || 'erro desconhecido'}`)
      }
    } catch (error) {
      setAuditActionStatus(`Falha ao exportar: ${String(error)}`)
    } finally {
      exportingAudit.value = false
    }
    return
  }

  try {
    const blob = new Blob([`${buildAuditTextLines().join('\n')}\n`], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `auditoria_links_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`
    anchor.click()
    URL.revokeObjectURL(url)
    setAuditActionStatus('Arquivo TXT exportado pelo navegador.')
  } catch {
    setAuditActionStatus('Não foi possível exportar no modo navegador.')
  }
}

const parseLinksLocally = (input: string) => {
  const rawUrls = input.match(/https?:\/\/[^\s<>"'\\]+/g) || []
  const deduped = new Map<string, { url: string; platform: Platform | 'unknown' }>()

  for (const rawUrl of rawUrls) {
    const normalized = normalizeUrl(rawUrl)
    if (!deduped.has(normalized)) {
      deduped.set(normalized, { url: normalized, platform: detectPlatform(normalized) })
    }
  }

  const all = Array.from(deduped.values())
  const supported = all.filter((item) => item.platform !== 'unknown') as Array<{ url: string; platform: Platform }>
  const unsupported = all.filter((item) => item.platform === 'unknown').map((item) => item.url)

  return {
    links: supported,
    unsupportedLinks: unsupported,
    totals: {
      extracted: rawUrls.length,
      unique: all.length,
      supported: supported.length,
      unsupported: unsupported.length
    }
  }
}

const auditAllLinks = async () => {
  if (links.value.length === 0) return

  auditing.value = true
  try {
    if (isElectron() && (window as any).electronAPI.auditLinks) {
      const response = await (window as any).electronAPI.auditLinks(
        links.value.map((item) => item.url),
        selectedBrowser.value
      )

      const byUrl = new Map<string, { mediaType: MediaType; error?: string }>()
      for (const item of response?.results || []) {
        byUrl.set(item.url, {
          mediaType: item.mediaType || 'unknown',
          error: item.error
        })
      }

      links.value = links.value.map((item) => {
        const audited = byUrl.get(item.url)
        if (!audited) return item
        return {
          ...item,
          mediaType: audited.mediaType,
          auditError: audited.error
        }
      })
      return
    }

    links.value = links.value.map((item) => ({
      ...item,
      mediaType: fallbackMediaType(item.url, item.platform)
    }))
  } finally {
    auditing.value = false
  }
}

const analyzeLinks = async () => {
  analyzing.value = true
  analyzeInputStatus.value = ''
  try {
    let result
    if (isElectron() && (window as any).electronAPI.parseLinks) {
      result = await (window as any).electronAPI.parseLinks(inputText.value)
    } else {
      result = parseLinksLocally(inputText.value)
    }

    links.value = (result.links || []).map((item: { url: string; platform: Platform }) => ({
      url: item.url,
      platform: item.platform,
      mediaType: fallbackMediaType(item.url, item.platform)
    }))

    unsupportedLinks.value = result.unsupportedLinks || []
    linkTotals.value = result.totals || {
      extracted: 0,
      unique: 0,
      supported: 0,
      unsupported: 0
    }

    if (links.value.length === 0) {
      if ((linkTotals.value.extracted || 0) === 0) {
        analyzeInputStatus.value = 'Nenhum link encontrado no texto. Cole links misturados com texto que eu filtro automaticamente.'
      } else {
        analyzeInputStatus.value = `Encontrei ${linkTotals.value.extracted} link(s), mas nenhum é suportado por enquanto.`
      }
    }

    currentStep.value = links.value.length > 0 ? 2 : 1
  } finally {
    analyzing.value = false
  }
}

const startDownload = async () => {
  const targets = selectedLinks.value
  if (targets.length === 0) return

  downloadActionStatus.value = 'Iniciando...'
  cancellingDownload.value = false
  if (isElectron()) {
    downloadActionStatus.value = downloadFolderPath.value
      ? `Salvando em: ${downloadFolderPath.value}`
      : 'Iniciando...'
  }

  isDownloading.value = true
  downloadProgress.value = 0
  downloadStatuses.value = targets.map((item) => ({
    url: item.url,
    platform: item.platform,
    mediaType: item.mediaType,
    status: 'pending'
  }))

  downloadIndexByUrl = new Map<string, number>()
  for (const [index, item] of downloadStatuses.value.entries()) {
    downloadIndexByUrl.set(normalizeUrl(item.url), index)
  }

  if (isElectron() && (window as any).electronAPI?.toolsStatus) {
    try {
      const tools = await (window as any).electronAPI.toolsStatus()
      const needsGalleryDl = targets.some((item) => item.platform !== 'kwai')
      const needsYtDlp = targets.some((item) => item.platform === 'kwai')

      if (needsGalleryDl && !tools?.galleryDl) {
        downloadActionStatus.value = 'Dependência ausente: gallery-dl não encontrado no sistema.'
        isDownloading.value = false
        return
      }
      if (needsYtDlp && !tools?.ytDlp) {
        downloadActionStatus.value = 'Dependência ausente: yt-dlp não encontrado no sistema.'
        isDownloading.value = false
        return
      }
    } catch {
      // ignore: seguimos e deixamos o backend retornar erro por item
    }
  }

  if (isElectron() && (window as any).electronAPI?.startDownloadBatch) {
    try {
      const result = await (window as any).electronAPI.startDownloadBatch({
        links: targets.map((item) => item.url),
        browser: selectedBrowser.value,
        saveMode: saveMode.value,
        concurrency: 3,
        retries: 1,
        timeoutMs: 180000,
        openFolderOnFinish: openFolderOnFinish.value
      })

      if (!result?.ok) {
        throw new Error(result?.error || 'Falha ao iniciar lote')
      }
      activeBatchId.value = String(result.batchId || '')
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      downloadStatuses.value = downloadStatuses.value.map((entry) => ({
        ...entry,
        status: 'error',
        error: message
      }))
      downloadProgress.value = 100
      isDownloading.value = false
      return
    }
  }

  for (const [index, item] of targets.entries()) {
    const statusEntry = downloadStatuses.value[index]
    if (!statusEntry) continue

    if (isElectron() && (window as any).electronAPI.startDownload) {
      try {
        statusEntry.status = 'running'
        const result = await (window as any).electronAPI.startDownload({
          url: item.url,
          browser: selectedBrowser.value,
          saveMode: saveMode.value
        })
        statusEntry.status = result.success ? 'success' : 'error'
        if (!result.success) {
          statusEntry.error = result.error || 'Falha no download'
        }
      } catch (error) {
        statusEntry.status = 'error'
        statusEntry.error = String(error)
      }
    } else {
      statusEntry.status = 'running'
      await new Promise((resolve) => setTimeout(resolve, 450))
      statusEntry.status = Math.random() > 0.2 ? 'success' : 'error'
    }

    downloadProgress.value = ((index + 1) / targets.length) * 100
  }

  isDownloading.value = false
}

const cancelDownload = async () => {
  if (!activeBatchId.value) return
  if (!isElectron() || !(window as any).electronAPI?.cancelDownloadBatch) return
  if (cancellingDownload.value) return

  cancellingDownload.value = true
  try {
    await (window as any).electronAPI.cancelDownloadBatch(activeBatchId.value)
    downloadActionStatus.value = 'Cancelamento solicitado. Finalizando...'
  } finally {
    // o "done" vem via evento
  }
}

const retryFailed = async () => {
  if (failedCount.value === 0) return

  const failed = downloadStatuses.value.filter((item) => item.status === 'error')
  const failedUrls = failed.map((item) => item.url)
  if (failedUrls.length === 0) return

  for (const entry of downloadStatuses.value) {
    if (entry.status === 'error') {
      entry.status = 'pending'
      entry.error = undefined
    }
  }

  downloadActionStatus.value = ''
  cancellingDownload.value = false
  isDownloading.value = true
  downloadProgress.value = 0

  downloadIndexByUrl = new Map<string, number>()
  for (const [index, entry] of downloadStatuses.value.entries()) {
    downloadIndexByUrl.set(normalizeUrl(entry.url), index)
  }

  if (isElectron() && (window as any).electronAPI?.startDownloadBatch) {
    try {
      const result = await (window as any).electronAPI.startDownloadBatch({
        links: failedUrls,
        browser: selectedBrowser.value,
        saveMode: saveMode.value,
        concurrency: 3,
        retries: 1,
        timeoutMs: 180000,
        openFolderOnFinish: openFolderOnFinish.value
      })

      if (!result?.ok) throw new Error(result?.error || 'Falha ao iniciar retry')
      activeBatchId.value = String(result.batchId || '')
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      for (const entry of downloadStatuses.value) {
        if (entry.status === 'pending') {
          entry.status = 'error'
          entry.error = message
        }
      }
      downloadProgress.value = 100
      isDownloading.value = false
    }
  }
}

const goBackToStart = () => {
  if (isDownloading.value) return
  closePasteMenu()
  analyzeInputStatus.value = ''
  currentStep.value = 1
}

const reset = () => {
  inputText.value = ''
  analyzeInputStatus.value = ''
  links.value = []
  unsupportedLinks.value = []
  linkTotals.value = {
    extracted: 0,
    unique: 0,
    supported: 0,
    unsupported: 0
  }
  downloadStatuses.value = []
  downloadProgress.value = 0
  auditing.value = false
  analyzing.value = false
  isDownloading.value = false
  downloadActionStatus.value = ''
  cancellingDownload.value = false
  activeBatchId.value = ''
  currentStep.value = 1
}

const handleBatchProgress = (payload: any) => {
  const batchId = String(payload?.batchId || '')
  if (!batchId || batchId !== activeBatchId.value) return

  const completed = Number(payload?.completed || 0)
  const total = Number(payload?.total || 0)
  if (total > 0) {
    downloadProgress.value = (completed / total) * 100
  }

  const item = payload?.item || {}
  if (item?.phase === 'started') {
    const url = normalizeUrl(String(item.url || ''))
    const index = downloadIndexByUrl.get(url)
    if (index === undefined) return
    const entry = downloadStatuses.value[index]
    if (!entry) return
    entry.status = 'running'
    entry.error = undefined
    if (downloadActionStatus.value) downloadActionStatus.value = ''
    return
  }

  const url = normalizeUrl(String(item.url || ''))
  const index = downloadIndexByUrl.get(url)
  if (index === undefined) return

  const entry = downloadStatuses.value[index]
  if (!entry) return

  entry.status = item.success ? 'success' : 'error'
  entry.error = item.success ? undefined : String(item.error || 'Falha no download')
  if (downloadActionStatus.value) downloadActionStatus.value = ''
}

const handleBatchDone = (payload: any) => {
  const batchId = String(payload?.batchId || '')
  if (!batchId || batchId !== activeBatchId.value) return
  isDownloading.value = false
  cancellingDownload.value = false
  if (downloadProgress.value < 100) downloadProgress.value = 100
  const outputDir = String(payload?.outputDir || downloadFolderPath.value || '')
  if (outputDir) downloadFolderPath.value = outputDir
  if (payload?.cancelled) {
    downloadActionStatus.value = 'Download cancelado.'
    return
  }
  downloadActionStatus.value = outputDir ? `Finalizado. Salvou em: ${outputDir}` : 'Finalizado.'
  if (payload?.openFolder?.ok === false) {
    downloadActionStatus.value = `Finalizado. Salvou em: ${outputDir || ''} (não consegui abrir a pasta automaticamente)`
  }
}

onMounted(() => {
  if (!isElectron()) return
  const api = (window as any).electronAPI
  if (!api?.onDownloadBatchProgress || !api?.onDownloadBatchDone) return

  unsubscribeBatchProgress = api.onDownloadBatchProgress(handleBatchProgress)
  unsubscribeBatchDone = api.onDownloadBatchDone(handleBatchDone)

  if (api?.getDownloadFolder) {
    api
      .getDownloadFolder()
      .then((result: any) => {
        if (result?.ok && result?.path) downloadFolderPath.value = String(result.path)
      })
      .catch(() => {})
  }
})

onBeforeUnmount(() => {
  unsubscribeBatchProgress?.()
  unsubscribeBatchDone?.()
  unsubscribeBatchProgress = null
  unsubscribeBatchDone = null
})

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div class="h-full flex flex-col items-center py-10 px-4 bg-app-bg text-slate-200">
    <header class="text-center mb-8">
      <h1 class="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-orange-400 drop-shadow-lg">
        InstaBatch <span class="text-white text-3xl">📥</span>
      </h1>
      <p class="text-slate-400 mt-2 text-sm">Auditoria por plataforma + download em lote</p>
    </header>

    <main class="w-full max-w-4xl bg-app-surface/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-2xl">
      <transition name="fade" mode="out-in">
        <div v-if="currentStep === 1" key="step1" class="space-y-4">
          <label class="block text-sm font-medium text-slate-300">Pode colar texto misturado com links. Eu filtro os links automaticamente (Instagram, TikTok, X/Twitter e Kwai).</label>
          <div class="relative">
            <textarea
              v-model="inputText"
              rows="8"
              class="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-slate-300 placeholder-slate-600 focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all"
              placeholder="Exemplo:&#10;https://www.instagram.com/p/...&#10;https://www.tiktok.com/@user/video/...&#10;https://x.com/user/status/...&#10;https://kwai-video.com/p/..."
              @contextmenu.prevent="openPasteMenu"
            ></textarea>

            <div
              v-if="pasteMenuOpen"
              class="fixed z-50 w-44 rounded-lg border border-slate-700 bg-slate-950 shadow-xl text-sm overflow-hidden"
              :style="{ left: pasteMenuPos.x + 'px', top: pasteMenuPos.y + 'px' }"
              @click.stop
            >
              <button
                class="w-full text-left px-3 py-2 hover:bg-slate-800 text-slate-200"
                @click="pasteFromContextMenu"
              >
                Colar
              </button>
            </div>
          </div>

          <button
            @click="analyzeLinks"
            :disabled="!inputText.trim() || analyzing"
            class="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-pink-600 to-orange-500 hover:from-pink-500 hover:to-orange-400 text-white shadow-lg shadow-pink-500/25 transition-all transform hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
          >
            <span v-if="analyzing" class="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
            {{ analyzing ? 'Analisando links...' : '🔍 Extrair links' }}
          </button>
          <div v-if="analyzeInputStatus" class="text-sm rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-200">
            {{ analyzeInputStatus }}
          </div>
        </div>

        <div v-else key="step2" class="space-y-6">
          <div class="flex items-center justify-between">
            <button
              @click="goBackToStart"
              :disabled="isDownloading"
              class="text-xs px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
            >
              ← Voltar
            </button>
            <button
              @click="reset"
              :disabled="isDownloading"
              class="text-xs px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200"
            >
              Nova busca
            </button>
          </div>

          <div class="grid md:grid-cols-2 gap-4">
            <div class="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
              <div class="text-xs uppercase tracking-wider text-slate-400 mb-2">Links</div>
              <div class="text-sm text-slate-300 space-y-1">
                <div>Total extraído: <strong class="text-white">{{ linkTotals.extracted }}</strong></div>
                <div>Únicos: <strong class="text-white">{{ linkTotals.unique }}</strong></div>
                <div>Suportados: <strong class="text-emerald-400">{{ linkTotals.supported }}</strong></div>
                <div>Não suportados: <strong class="text-amber-400">{{ linkTotals.unsupported }}</strong></div>
              </div>
              <details v-if="unsupportedLinks.length" class="mt-3 text-xs text-amber-300">
                <summary class="cursor-pointer">Ver links não suportados</summary>
                <div class="mt-2 max-h-24 overflow-y-auto space-y-1">
                  <div v-for="(link, idx) in unsupportedLinks" :key="idx" class="truncate">{{ link }}</div>
                </div>
              </details>
            </div>

            <div class="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
              <div class="text-xs uppercase tracking-wider text-slate-400 mb-2">Mídia (Geral)</div>
              <div class="grid grid-cols-2 gap-2 text-sm">
                <div class="bg-slate-950/70 rounded-md p-2">Imagens: <strong class="text-white">{{ mediaTotals.image }}</strong></div>
                <div class="bg-slate-950/70 rounded-md p-2">Vídeos: <strong class="text-white">{{ mediaTotals.video }}</strong></div>
                <div class="bg-slate-950/70 rounded-md p-2">Mistos: <strong class="text-white">{{ mediaTotals.mixed }}</strong></div>
                <div class="bg-slate-950/70 rounded-md p-2">Não identificados: <strong class="text-white">{{ mediaTotals.unknown }}</strong></div>
              </div>
              <p class="text-[11px] text-slate-500 mt-2">"Não identificados" = link suportado, mas sem tipo de mídia confirmado no metadata probe.</p>
              <p v-if="auditing" class="text-xs text-pink-300 mt-3">Auditando metadados de mídia...</p>
            </div>
          </div>

          <div class="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
            <div class="flex items-center justify-between mb-3">
              <div class="text-xs uppercase tracking-wider text-slate-400">Seleção por plataforma</div>
              <button
                @click="auditAllLinks"
                :disabled="auditing || isDownloading"
                class="text-xs px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
                title="Opcional: usa yt-dlp para identificar o tipo de mídia e pode demorar."
              >
                {{ auditing ? 'Auditando...' : 'Auditar (opcional)' }}
              </button>
            </div>
            <div class="grid md:grid-cols-4 gap-2 text-sm">
              <label
                v-for="row in platformRows"
                :key="row.platform"
                class="flex items-center gap-2 bg-slate-950/70 rounded-md p-2 border border-slate-800"
              >
                <input
                  v-model="platformSelection[row.platform]"
                  type="checkbox"
                  class="accent-pink-500"
                  :disabled="isDownloading"
                />
                <span>{{ platformLabel(row.platform) }} ({{ row.total }})</span>
              </label>
            </div>
          </div>

          <details class="bg-slate-900/40 p-4 rounded-xl border border-slate-800">
            <summary class="cursor-pointer text-xs uppercase tracking-wider text-slate-400 select-none">
              Auditoria (opcional)
            </summary>
            <div class="mt-4 space-y-4">
              <div class="bg-slate-900/50 p-4 rounded-xl border border-slate-800 overflow-x-auto">
                <div class="text-xs uppercase tracking-wider text-slate-400 mb-3">Auditoria por plataforma</div>
                <table class="w-full text-sm">
                  <thead class="text-slate-400">
                    <tr>
                      <th class="text-left py-1">Plataforma</th>
                      <th class="text-right py-1">Total</th>
                      <th class="text-right py-1">Imagens</th>
                      <th class="text-right py-1">Vídeos</th>
                      <th class="text-right py-1">Mistos</th>
                      <th class="text-right py-1">N/ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in platformRows" :key="row.platform" class="border-t border-slate-800">
                      <td class="py-1.5">{{ platformLabel(row.platform) }}</td>
                      <td class="py-1.5 text-right">{{ row.total }}</td>
                      <td class="py-1.5 text-right">{{ row.image }}</td>
                      <td class="py-1.5 text-right">{{ row.video }}</td>
                      <td class="py-1.5 text-right">{{ row.mixed }}</td>
                      <td class="py-1.5 text-right">{{ row.unknown }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                <div class="flex items-center justify-between mb-3">
                  <div class="text-xs uppercase tracking-wider text-slate-400">Lista auditável de links coletados</div>
                  <div class="flex items-center gap-2">
                    <button
                      @click="copyAuditList"
                      class="text-xs px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600"
                    >
                      Copiar lista
                    </button>
                    <button
                      @click="exportAuditList"
                      :disabled="exportingAudit"
                      class="text-xs px-3 py-1.5 rounded-md bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50"
                    >
                      {{ exportingAudit ? 'Exportando...' : 'Exportar arquivo' }}
                    </button>
                  </div>
                </div>
                <div v-if="auditActionStatus" class="text-xs text-emerald-300 mb-2 break-all">{{ auditActionStatus }}</div>
                <div class="max-h-64 overflow-y-auto border border-slate-800 rounded-lg">
                  <table class="w-full text-xs">
                    <thead class="bg-slate-950 text-slate-400 sticky top-0">
                      <tr>
                        <th class="text-left py-2 px-2">#</th>
                        <th class="text-left py-2 px-2">Plataforma</th>
                        <th class="text-left py-2 px-2">Tipo</th>
                        <th class="text-left py-2 px-2">Seleção</th>
                        <th class="text-left py-2 px-2">URL</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in auditableLinks" :key="row.url" class="border-t border-slate-800">
                        <td class="py-2 px-2 text-slate-400">{{ row.index }}</td>
                        <td class="py-2 px-2">{{ platformLabel(row.platform) }}</td>
                        <td class="py-2 px-2">{{ mediaLabel(row.mediaType) }}</td>
                        <td class="py-2 px-2">
                          <span :class="row.selected ? 'text-emerald-300' : 'text-amber-300'">
                            {{ row.selected ? 'Selecionado' : 'Fora da seleção' }}
                          </span>
                        </td>
                        <td class="py-2 px-2">
                          <a
                            :href="row.url"
                            target="_blank"
                            rel="noreferrer"
                            class="text-cyan-300 hover:text-cyan-200 underline break-all"
                          >
                            {{ row.url }}
                          </a>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </details>

          <div class="grid md:grid-cols-2 gap-4" v-if="!isDownloading && downloadProgress === 0">
            <div>
              <label class="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Cookies do Navegador</label>
              <select v-model="selectedBrowser" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm">
                <option value="chrome">Google Chrome</option>
                <option value="edge">Microsoft Edge</option>
                <option value="firefox">Mozilla Firefox</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Organização</label>
              <select v-model="saveMode" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm">
                <option value="perfil">Pastas por Perfil</option>
                <option value="misturado">Tudo na mesma pasta</option>
              </select>
            </div>
          </div>

          <div v-if="!isDownloading && downloadProgress === 0" class="bg-slate-900/40 p-4 rounded-xl border border-slate-800 space-y-3">
            <div class="flex items-center justify-between gap-3">
              <div class="text-xs uppercase tracking-wider text-slate-400">Destino</div>
              <button
                v-if="canOpenDownloadFolder"
                @click="openDownloadFolder"
                class="text-xs px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600"
              >
                Abrir pasta
              </button>
            </div>
            <div class="text-xs text-slate-300 break-all">
              <span class="text-slate-400">Salvando em:</span>
              <span class="ml-1">{{ downloadFolderPath || '(pasta de Downloads do sistema)/InstaBatch' }}</span>
            </div>
            <label v-if="isElectron()" class="flex items-center gap-2 text-sm text-slate-300">
              <input v-model="openFolderOnFinish" type="checkbox" class="accent-pink-500" />
              <span>Abrir pasta ao concluir</span>
            </label>
          </div>

          <div class="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
            <div class="text-xs uppercase tracking-wider text-slate-400 mb-2">Seleção atual para download</div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div class="bg-slate-950/70 rounded-md p-2">Links: <strong>{{ selectedCount }}</strong></div>
              <div class="bg-slate-950/70 rounded-md p-2">Imagens: <strong>{{ selectedMediaTotals.image }}</strong></div>
              <div class="bg-slate-950/70 rounded-md p-2">Vídeos: <strong>{{ selectedMediaTotals.video }}</strong></div>
              <div class="bg-slate-950/70 rounded-md p-2">Mistos/N-ID: <strong>{{ selectedMediaTotals.mixed + selectedMediaTotals.unknown }}</strong></div>
            </div>
          </div>

          <div v-if="!isDownloading && downloadProgress === 0" class="space-y-3">
            <button
              @click="startDownload"
              :disabled="selectedCount === 0"
              class="w-full py-4 rounded-xl font-bold text-lg bg-green-500 hover:bg-green-400 text-white shadow-lg shadow-green-500/25 transition-all transform hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ⬇️ Baixar {{ selectedCount }} link(s) selecionado(s)
            </button>
            <div v-if="downloadActionStatus" class="text-sm rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-200">
              {{ downloadActionStatus }}
            </div>
            <div class="flex justify-between text-xs text-slate-500">
              <span>⚠️ Feche {{ selectedBrowser }} antes de iniciar.</span>
              <button @click="goBackToStart" class="text-slate-400 hover:text-white">Voltar para editar</button>
            </div>
          </div>

          <div v-else class="space-y-4">
            <div class="flex justify-between items-end mb-1">
              <span class="text-sm font-medium text-slate-300">Baixando arquivos...</span>
              <span class="text-sm font-bold text-pink-400">{{ Math.round(downloadProgress) }}%</span>
            </div>
            <div class="w-full bg-slate-800 rounded-full h-3">
              <div class="bg-gradient-to-r from-pink-500 to-orange-400 h-3 rounded-full transition-all duration-300" :style="{ width: downloadProgress + '%' }"></div>
            </div>
            <div class="flex items-center justify-between text-xs text-slate-400">
              <span v-if="downloadActionStatus" class="text-amber-200">{{ downloadActionStatus }}</span>
              <button
                v-if="isDownloading"
                @click="cancelDownload"
                :disabled="cancellingDownload"
                class="ml-auto px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
              >
                {{ cancellingDownload ? 'Cancelando...' : 'Cancelar' }}
              </button>
            </div>

            <div class="mt-4 bg-slate-950 rounded-lg p-3 max-h-56 overflow-y-auto font-mono text-xs space-y-2 border border-slate-800">
              <div v-for="(log, idx) in downloadStatuses" :key="idx" class="space-y-1 border-b border-slate-900 pb-2">
                <div class="flex items-center gap-2 truncate">
                  <span v-if="log.status === 'pending'" class="text-slate-500">⏳ [Aguardando]</span>
                  <span v-else-if="log.status === 'running'" class="text-cyan-300">⬇️ [Baixando]</span>
                  <span v-else-if="log.status === 'success'" class="text-green-500">✅ [Sucesso]</span>
                  <span v-else class="text-red-500">❌ [Erro]</span>
                  <span class="text-cyan-400">[{{ platformLabel(log.platform) }}]</span>
                  <span class="text-amber-300">[{{ mediaLabel(log.mediaType) }}]</span>
                </div>
                <div class="truncate text-slate-300">{{ log.url }}</div>
                <div v-if="log.error" class="text-red-400 truncate">{{ log.error }}</div>
              </div>
            </div>

            <div v-if="downloadProgress === 100 && !isDownloading" class="grid md:grid-cols-2 gap-3 mt-4">
              <button
                v-if="failedCount > 0"
                @click="retryFailed"
                class="w-full py-3 rounded-xl font-bold text-sm bg-amber-600 hover:bg-amber-500 text-white transition-colors"
              >
                Repetir falhas ({{ failedCount }})
              </button>
              <button
                @click="reset"
                class="w-full py-3 rounded-xl font-bold text-sm bg-slate-700 hover:bg-slate-600 text-white transition-colors"
              >
                Concluir e Voltar
              </button>
            </div>
          </div>
        </div>
      </transition>
    </main>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
