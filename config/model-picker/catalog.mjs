import Settings from '@overleaf/settings'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { getProvider, getGatewayFetch } from './WorkbenchAiClient.mjs'

let snapshot
let pending

function sources() {
  const gateway = Settings.workbenchAi
  return [
    { key: 'gateway', label: 'Configured gateway', url: gateway.baseURL, token: gateway.apiKey, provider: getProvider, request: getGatewayFetch() },
    { key: 'ollama', label: 'Ollama', url: 'http://host.docker.internal:11434/v1' },
    { key: 'lmstudio', label: 'LM Studio', url: 'http://host.docker.internal:1234/v1' },
  ].filter((source, index, entries) =>
    entries.findIndex(other => other.url.replace(/\/+$/, '') === source.url.replace(/\/+$/, '')) === index)
}

async function discover(source) {
  const baseURL = source.url.replace(/\/+$/, '')
  const response = await (source.request || fetch)(`${baseURL}/models`, {
    headers: source.token ? { Authorization: `Bearer ${source.token}` } : {},
    redirect: 'error',
    signal: AbortSignal.timeout(3500),
  })
  if (!response.ok) throw new Error('Model directory unavailable')
  const { data } = await response.json()
  const models = new Map(data.filter(entry => typeof entry?.id === 'string' && entry.id.length)
    .map(entry => [entry.id, entry]))
  const provider = source.provider?.() || createOpenAICompatible({ name: source.key, baseURL })
  return Array.from(models, ([id, entry]) => {
    const label = [entry.magpie_label, entry.label, entry.display_name, entry.displayName, entry.name]
      .find(value => typeof value === 'string' && value.trim()) || id
    const advertised = [entry.reasoning_levels, entry.supported_reasoning_levels]
      .filter(Array.isArray).flat().map(level => typeof level === 'string' ? level : level?.effort)
    const responses = source.key === 'gateway' && Settings.workbenchAi.apiMode === 'responses'
    const levels = [...new Set(advertised.filter(level => typeof level === 'string' && level.trim() &&
      (!responses || ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(level))))]
    const defaultLevel = [entry.default_reasoning_effort, entry.default_reasoning_level,
      entry.supported_reasoning_levels?.find?.(level => level?.default === true)?.effort,
      'medium', levels[0]].find(level => levels.includes(level))
    return { key: `${source.key}:${id}`, source: source.label, id, label, provider, levels, defaultLevel }
  })
}

export async function catalog() {
  if (snapshot && Date.now() < snapshot.expires) return snapshot.entries
  pending ??= Promise.allSettled(sources().map(discover)).then(results => {
    const entries = results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
    snapshot = { entries, expires: Date.now() + (entries.length ? 30000 : 5000) }
    return entries
  }).finally(() => { pending = undefined })
  return pending
}

export async function listModels(req, res) {
  const entries = await catalog()
  res.set('Cache-Control', 'private, no-store').json({
    defaultModel: Settings.workbenchAi.model,
    models: entries.map(({ key, source, id, label, levels, defaultLevel }) => ({ key, source, id, label, levels, defaultLevel })),
  })
}
