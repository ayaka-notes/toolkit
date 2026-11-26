import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { Script } from 'node:vm'

const read = file => readFileSync(file, 'utf8')
function replaceOnce(text, before, after) {
  if (text.split(before).length !== 2) throw new Error(`Unexpected 6.3.4 source: ${before}`)
  return text.replace(before, () => after)
}
const server = 'modules/workbench/app/src/'
function edit(file, before, after) {
  writeFileSync(file, replaceOnce(read(file), before, after))
}
edit(server + 'WorkbenchAiClient.mjs', 'let _provider = null', 'export { _getProxyFetch as getGatewayFetch }\nlet _provider = null')
edit(server + 'WorkbenchRouter.mjs', 'export default {', `import { listModels } from './LocalModelCatalog.mjs'
export default {`)
edit(server + 'WorkbenchRouter.mjs', "    webRouter.post(", `    webRouter.get('/workbench/models', AuthenticationController.requireLogin(), PermissionsMiddleware.requireAiAccess, expressify(listModels))
    webRouter.post(`)
edit(server + 'WorkbenchController.mjs', 'async function chat(req, res) {', `import { catalog } from './LocalModelCatalog.mjs'
async function chat(req, res) {`)
edit(server + 'WorkbenchController.mjs', '  const toolCallLimit =', `  let chosenModel
  if (req.body?.modelSelection) {
    chosenModel = (await catalog()).find(entry => entry.key === req.body.modelSelection)
    if (!chosenModel) return res.status(400).json({ error: 'ai_model_unavailable' })
  }
  const effort = req.body?.reasoningEffort ?? chosenModel?.defaultLevel
  if (effort !== undefined && !chosenModel?.levels.includes(effort)) {
    return res.status(400).json({ error: 'unsupported_reasoning_effort' })
  }
  const toolCallLimit =`)
edit(server + 'WorkbenchController.mjs', 'getProvider()(resolvedModel)', 'chosenModel ? chosenModel.provider(chosenModel.id) : getProvider()(resolvedModel)')
edit(server + 'WorkbenchController.mjs', '    const result = streamText({', `    const languageModel = chosenModel ? chosenModel.provider(chosenModel.id) : getProvider()(resolvedModel)
    const result = streamText({
      providerOptions: effort ? { [languageModel.provider.split('.')[0]]: { reasoningEffort: effort } } : undefined,`)
edit(server + 'WorkbenchController.mjs', 'model: chosenModel ? chosenModel.provider(chosenModel.id) : getProvider()(resolvedModel)', 'model: languageModel')

const original = 'ide-48473ebb1ad7e3b5dc2b.js'
let bundle = read('public/js/pages/' + original)
const location = bundle.indexOf('id:"assistant-attach"')
if (location < 0) throw new Error('Missing attachment button')
const insertion = bundle.indexOf('(0,I.jsx)("span",{className:"flex-grow-1"})', location)
if (insertion < location || insertion - location > 500) throw new Error('Unknown composer layout')
bundle = bundle.slice(0, insertion) + '(0,I.jsx)(WorkbenchModelPicker,{disabled:n}),' + bundle.slice(insertion)
const componentStart = bundle.lastIndexOf('const ', bundle.indexOf('new Mt.rL({api:"/workbench/chat"'))
// Both components must share the editor module's React and JSX runtime bindings.
const anchor = 'var Sn=n(86574),En=n.n(Sn);'
if (componentStart < insertion) throw new Error('Unexpected module layout')
bundle = replaceOnce(bundle, anchor, read('/tmp/aya-picker/picker.js') + '\n' + anchor)
bundle = replaceOnce(bundle, 'messageId:s,messages:n.slice(o)', 'messageId:s,modelSelection:workbenchSelection||undefined,reasoningEffort:workbenchEfforts.get(workbenchSelection)||undefined,messages:n.slice(o)')
new Script(bundle)
const name = `ide-${createHash('sha256').update(bundle).digest('hex').slice(0, 20)}.js`
writeFileSync('public/js/pages/' + name, bundle)
const manifest = 'public/manifest.json'
if (!read(manifest).includes(original)) throw new Error('Missing editor manifest entry')
writeFileSync(manifest, read(manifest).replaceAll(original, name))
