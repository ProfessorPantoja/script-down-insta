<script setup lang="ts">
import { ref, computed } from 'vue'

const inputText = ref('')
const selectedBrowser = ref('chrome')
const saveMode = ref('perfil')

// Mock state
const analyzing = ref(false)
const links = ref<string[]>([])
const currentStep = ref(1) // 1: Input, 2: Preview
const isDownloading = ref(false)
const downloadProgress = ref(0)
const downloadStatuses = ref<{url: string, status: 'pending'|'success'|'error'}[]>([])

const analyzeLinks = () => {
  analyzing.value = true
  setTimeout(() => {
    // Simular regex do instagram
    const rawLinks = inputText.value.match(/https?:\/\/[^\s<>"'\\]*instagram\.com[^\s<>"'\\]*/g) || []
    links.value = [...new Set(rawLinks)]
    analyzing.value = false
    if(links.value.length > 0) {
      currentStep.value = 2
    }
  }, 600)
}

const startDownload = async () => {
  isDownloading.value = true
  
  // Initialize statuses
  downloadStatuses.value = links.value.map(url => ({url, status: 'pending'}))
  downloadProgress.value = 0
  
  // Real download loop using Electron IPC (gallery-dl)
  let successCount = 0;
  for (let i = 0; i < links.value.length; i++) {
    const url = links.value[i]
    
    // Check if running in Electron environment
    if ((window as any).electronAPI) {
      try {
        const result = await (window as any).electronAPI.startDownload(url, selectedBrowser.value)
        downloadStatuses.value[i].status = result.success ? 'success' : 'error'
        if (result.success) successCount++
      } catch (e) {
        console.error("Download fail:", e)
        downloadStatuses.value[i].status = 'error'
      }
    } else {
      // Fallback for browser testing (mock)
      await new Promise(r => setTimeout(r, 600))
      downloadStatuses.value[i].status = Math.random() > 0.3 ? 'success' : 'error'
    }

    downloadProgress.value = ((i + 1) / links.value.length) * 100
  }
  
  // Download cycle finished
  setTimeout(() => {
    isDownloading.value = false
    downloadProgress.value = 100 // keep at 100 to show 'Concluir' button
  }, 500)
}

const reset = () => {
  currentStep.value = 1
  inputText.value = ''
  links.value = []
  downloadProgress.value = 0
  downloadStatuses.value = []
}
</script>

<template>
  <div class="h-full flex flex-col items-center py-10 px-4 bg-app-bg text-slate-200">
    
    <!-- Header -->
    <header class="text-center mb-8">
      <h1 class="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-orange-400 drop-shadow-lg">
        InstaBatch <span class="text-white text-3xl">📥</span>
      </h1>
      <p class="text-slate-400 mt-2 text-sm">Seu automatizador local de mídia</p>
    </header>

    <!-- Main Card -->
    <main class="w-full max-w-2xl bg-app-surface/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-2xl">
      
      <!-- STEP 1: DROPZONE -->
      <transition name="fade" mode="out-in">
        <div v-if="currentStep === 1" key="step1" class="space-y-4">
          <label class="block text-sm font-medium text-slate-300">Cole as mensagens ou links abaixos:</label>
          <textarea 
            v-model="inputText"
            rows="8"
            class="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-slate-300 placeholder-slate-600 focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all"
            placeholder="Exemplo:&#10;Olha esse reel aqui: https://www.instagram.com/reel/123...&#10;E essa foto top: https://www.instagram.com/p/456..."
          ></textarea>
          
          <button 
            @click="analyzeLinks"
            :disabled="!inputText.trim() || analyzing"
            class="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-pink-600 to-orange-500 hover:from-pink-500 hover:to-orange-400 text-white shadow-lg shadow-pink-500/25 transition-all transform hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
          >
            <span v-if="analyzing" class="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
            {{ analyzing ? 'Analisando textos...' : '🔍 Extrair Links' }}
          </button>
        </div>

        <!-- STEP 2: PREVIEW E DOWNLOAD -->
        <div v-else-if="currentStep === 2" key="step2" class="space-y-6">
          
          <!-- Top Bar -->
          <div class="flex justify-between items-center bg-slate-900/50 p-4 rounded-xl border border-slate-800">
            <div>
              <span class="text-3xl font-black text-white">{{ links.length }}</span>
              <span class="text-slate-400 ml-2">Links enconrados</span>
            </div>
            <button @click="reset" v-if="!isDownloading" class="text-sm text-slate-400 hover:text-white transition-colors">
              Nova Busca
            </button>
          </div>

          <!-- Settings -->
          <div class="grid grid-cols-2 gap-4" v-if="!isDownloading && downloadProgress === 0">
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

          <!-- Download Action -->
          <div v-if="!isDownloading && downloadProgress === 0">
            <button 
              @click="startDownload"
              class="w-full py-4 mt-2 rounded-xl font-bold text-lg bg-green-500 hover:bg-green-400 text-white shadow-lg shadow-green-500/25 transition-all transform hover:scale-[1.01] active:scale-95 flex justify-center items-center gap-2"
            >
              ⬇️ Iniciar Download em Lote
            </button>
            <p class="text-xs text-center text-slate-500 mt-3 flex items-center justify-center gap-1">
              ⚠️ Lembrete: feche seu {{ selectedBrowser }} antes de iniciar.
            </p>
          </div>

          <!-- Progress State -->
          <div v-else class="space-y-4">
            <div class="flex justify-between items-end mb-1">
              <span class="text-sm font-medium text-slate-300">Baixando arquivos...</span>
              <span class="text-sm font-bold text-pink-400">{{ Math.round(downloadProgress) }}%</span>
            </div>
            <div class="w-full bg-slate-800 rounded-full h-3">
              <div class="bg-gradient-to-r from-pink-500 to-orange-400 h-3 rounded-full transition-all duration-300" :style="{ width: downloadProgress + '%' }"></div>
            </div>

            <!-- Fake/Real Logs -->
            <div class="mt-4 bg-slate-950 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs space-y-2 border border-slate-800">
               <div v-for="(log, idx) in downloadStatuses" :key="idx" class="flex items-center gap-2 truncate">
                 <span v-if="log.status === 'pending'" class="text-slate-500">⏳ [Aguardando]</span>
                 <span v-else-if="log.status === 'success'" class="text-green-500">✅ [Sucesso]</span>
                 <span v-else class="text-red-500" title="Verifique se os cookies estao expirados">❌ [Erro]</span>
                 <span :class="{'opacity-50': log.status === 'pending'}" class="truncate">{{ log.url }}</span>
               </div>
            </div>

            <!-- Done Action -->
            <button v-if="downloadProgress === 100 && !isDownloading" @click="reset" class="w-full py-3 mt-4 rounded-xl font-bold text-sm bg-slate-700 hover:bg-slate-600 text-white transition-colors">
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
