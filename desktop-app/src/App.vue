<script setup lang="ts">
import { computed, ref } from 'vue'

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
  status: 'pending' | 'success' | 'error'
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

const analyzing = ref(false)
const auditing = ref(false)
const currentStep = ref(1)

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

const allPlatforms: Platform[] = ['instagram', 'tiktok', 'twitter', 'kwai']

const isElectron = () => Boolean((window as any).electronAPI)

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

const copyAuditStatus = ref('')

const copyAuditList = async () => {
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

  try {
    await navigator.clipboard.writeText(lines.join('\n'))
    copyAuditStatus.value = 'Lista copiada para a área de transferência.'
  } catch {
    copyAuditStatus.value = 'Não foi possível copiar automaticamente.'
  }

  setTimeout(() => {
    copyAuditStatus.value = ''
  }, 3000)
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

    currentStep.value = links.value.length > 0 ? 2 : 1

    if (links.value.length > 0) {
      await auditAllLinks()
    }
  } finally {
    analyzing.value = false
  }
}

const startDownload = async () => {
  const targets = selectedLinks.value
  if (targets.length === 0) return

  isDownloading.value = true
  downloadProgress.value = 0
  downloadStatuses.value = targets.map((item) => ({
    url: item.url,
    platform: item.platform,
    mediaType: item.mediaType,
    status: 'pending'
  }))

  for (const [index, item] of targets.entries()) {
    const statusEntry = downloadStatuses.value[index]
    if (!statusEntry) continue

    if (isElectron() && (window as any).electronAPI.startDownload) {
      try {
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
      await new Promise((resolve) => setTimeout(resolve, 450))
      statusEntry.status = Math.random() > 0.2 ? 'success' : 'error'
    }

    downloadProgress.value = ((index + 1) / targets.length) * 100
  }

  isDownloading.value = false
}

const reset = () => {
  inputText.value = ''
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
  currentStep.value = 1
}
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
          <label class="block text-sm font-medium text-slate-300">Cole mensagens ou links (Instagram, TikTok, X/Twitter, Kwai):</label>
          <textarea
            v-model="inputText"
            rows="8"
            class="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-slate-300 placeholder-slate-600 focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all"
            placeholder="Exemplo:&#10;https://www.instagram.com/p/...&#10;https://www.tiktok.com/@user/video/...&#10;https://x.com/user/status/...&#10;https://kwai-video.com/p/..."
          ></textarea>

          <button
            @click="analyzeLinks"
            :disabled="!inputText.trim() || analyzing"
            class="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-pink-600 to-orange-500 hover:from-pink-500 hover:to-orange-400 text-white shadow-lg shadow-pink-500/25 transition-all transform hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
          >
            <span v-if="analyzing" class="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
            {{ analyzing ? 'Analisando links...' : '🔍 Extrair e Auditar' }}
          </button>
        </div>

        <div v-else key="step2" class="space-y-6">
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
              >
                {{ auditing ? 'Auditando...' : 'Reauditar' }}
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
              <button
                @click="copyAuditList"
                class="text-xs px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600"
              >
                Copiar lista
              </button>
            </div>
            <div v-if="copyAuditStatus" class="text-xs text-emerald-300 mb-2">{{ copyAuditStatus }}</div>
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
              :disabled="selectedCount === 0 || auditing"
              class="w-full py-4 rounded-xl font-bold text-lg bg-green-500 hover:bg-green-400 text-white shadow-lg shadow-green-500/25 transition-all transform hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ⬇️ Baixar {{ selectedCount }} link(s) selecionado(s)
            </button>
            <div class="flex justify-between text-xs text-slate-500">
              <span>⚠️ Feche {{ selectedBrowser }} antes de iniciar.</span>
              <button @click="reset" class="text-slate-400 hover:text-white">Nova busca</button>
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

            <div class="mt-4 bg-slate-950 rounded-lg p-3 max-h-56 overflow-y-auto font-mono text-xs space-y-2 border border-slate-800">
              <div v-for="(log, idx) in downloadStatuses" :key="idx" class="space-y-1 border-b border-slate-900 pb-2">
                <div class="flex items-center gap-2 truncate">
                  <span v-if="log.status === 'pending'" class="text-slate-500">⏳ [Aguardando]</span>
                  <span v-else-if="log.status === 'success'" class="text-green-500">✅ [Sucesso]</span>
                  <span v-else class="text-red-500">❌ [Erro]</span>
                  <span class="text-cyan-400">[{{ platformLabel(log.platform) }}]</span>
                  <span class="text-amber-300">[{{ mediaLabel(log.mediaType) }}]</span>
                </div>
                <div class="truncate text-slate-300">{{ log.url }}</div>
                <div v-if="log.error" class="text-red-400 truncate">{{ log.error }}</div>
              </div>
            </div>

            <button
              v-if="downloadProgress === 100 && !isDownloading"
              @click="reset"
              class="w-full py-3 mt-4 rounded-xl font-bold text-sm bg-slate-700 hover:bg-slate-600 text-white transition-colors"
            >
              Concluir e Voltar
            </button>
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
