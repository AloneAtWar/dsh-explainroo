// Static, side-effect-free checks and edits. Never imports/evaluates project JS.
import { parse } from 'acorn';
import path from 'node:path';
import fs from 'node:fs';
import { parseScript } from './parser.mjs';
import { assertName } from './names.mjs';

const functionNode = n => n && ['FunctionExpression', 'ArrowFunctionExpression', 'FunctionDeclaration'].includes(n.type);
const keyOf = n => n?.computed ? constant(n.key)?.value : n?.key?.name ?? n?.key?.value;
const children = n => Object.entries(n).filter(([k]) => !['parent', 'module', 'bindings'].includes(k)).flatMap(([, v]) => Array.isArray(v) ? v.filter(x => x?.type) : v?.type ? [v] : []);
function visit(node, callback) { callback(node); for (const child of children(node)) visit(child, callback); }
function binding(node, name) {
  for (let parent = node; parent; parent = parent.parent) if (parent.bindings?.has(name)) return parent.bindings.get(name);
}
function memberValue(node) {
  const object = dereference(node.object);
  const key = node.computed ? constant(node.property)?.value : node.property.name;
  if (object?.type === 'ArrayExpression' && Number.isInteger(Number(key))) return object.elements[Number(key)];
  if (object?.type === 'ObjectExpression') return object.properties.find(p => p.type === 'Property' && keyOf(p) === key)?.value;
  if (object?.type === 'ModuleNamespace') return object.target?.exports.get(key);
  return null;
}
function dereference(node, seen = new Set()) {
  if (!node || seen.has(node)) return null;
  seen.add(node);
  if (node.type === 'Identifier') {
    const value = binding(node, node.name);
    if (value === undefined && node.name === 'undefined') return { type: 'Literal', value: undefined };
    return dereference(value, seen);
  }
  if (node.type === 'ImportBinding') return node.exported === '*' ? {type:'ModuleNamespace',target:node.target} : dereference(node.target?.exports.get(node.exported), seen);
  if (node.type === 'ArgumentBinding') return dereference(node.target, seen);
  if (node.type === 'MemberExpression') { const value = memberValue(node); return value ? dereference(value, seen) : node; }
  return node;
}
function constant(node, seen = new Set()) {
  node = dereference(node, seen); if (!node) return null;
  if (node.type === 'Literal' && ['string', 'number'].includes(typeof node.value)) return { value: node.value, node };
  if (node.type === 'TemplateLiteral' && !node.expressions.length) return { value: node.quasis[0].value.cooked, node };
  return null;
}
function referenceConstant(node) {
  let replacement = node; const seen = new Set();
  while (node && !seen.has(node)) {
    seen.add(node);
    if (node.type === 'Identifier') node = binding(node, node.name);
    else if (node.type === 'ImportBinding') node = node.target?.exports.get(node.exported);
    else if (node.type === 'ArgumentBinding') { replacement = node.target; node = node.target; }
    else if (node.type === 'MemberExpression') { const value = memberValue(node); if (!value) return null; replacement = value; node = value; }
    else { const result = constant(node); return result && { value: result.value, node: replacement }; }
  }
  return null;
}
function numericTime(node, seen = new Set()) {
  node = dereference(node); if (!node || seen.has(node)) return false;
  const next = new Set(seen); next.add(node);
  if (node.type === 'Literal') return typeof node.value === 'number';
  if (node.type === 'UnaryExpression') return ['+', '-', '~'].includes(node.operator);
  if (node.type === 'BinaryExpression') return node.operator !== '+' || numericTime(node.left, next) && numericTime(node.right, next);
  if (node.type === 'ConditionalExpression') return numericTime(node.consequent, next) && numericTime(node.alternate, next);
  if (node.type === 'CallExpression') {
    if (node.callee.type === 'Identifier') return ['Number', 'parseFloat', 'parseInt'].includes(node.callee.name);
    const key = node.callee.computed ? constant(node.callee.property)?.value : node.callee.property?.name;
    return ['time','mark','cue'].includes(key) || node.callee.object?.name === 'Math';
  }
  return node.type === 'MemberExpression' && ['dur','t','T','lead','pace','start','fps','W','H','cx','cy'].includes(node.property?.name);
}
function graph(sources) {
  const modules = new Map();
  for (const [file, source] of Object.entries(sources)) {
    const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
    const module = { file, source, ast, exports: new Map(), imports: [] };
    const attach = (node, parent) => {
      Object.defineProperties(node, { parent: { value: parent }, module: { value: module } });
      if (node.type === 'Program' || node.type === 'BlockStatement' || functionNode(node)) Object.defineProperty(node, 'bindings', { value: new Map() });
      for (const child of children(node)) attach(child, node);
    };
    attach(ast, null); modules.set(file, module);
    const scope = node => { for (let p = node.parent; p; p = p.parent) if (p.bindings) return p; return ast; };
    visit(ast, node => {
      if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') scope(node).bindings.set(node.id.name, node.init);
      if (node.type === 'FunctionDeclaration' && node.id) scope(node).bindings.set(node.id.name, node);
      if (functionNode(node)) for (const param of node.params) if (param.type === 'Identifier') node.bindings.set(param.name, null);
      if (node.type === 'ImportDeclaration') {
        for (const spec of node.specifiers) {
          const imported = { type: 'ImportBinding', exported: spec.type === 'ImportDefaultSpecifier' ? 'default' : spec.type === 'ImportNamespaceSpecifier' ? '*' : spec.imported?.name, source: node.source.value };
          ast.bindings.set(spec.local.name, imported); module.imports.push(imported);
        }
      }
      if (node.type === 'ExportDefaultDeclaration') module.exports.set('default', node.declaration);
      if (node.type === 'ExportNamedDeclaration') {
        if (node.declaration?.id) module.exports.set(node.declaration.id.name, node.declaration);
        for (const item of node.declaration?.declarations ?? []) if (item.id.type === 'Identifier') module.exports.set(item.id.name, item.init);
        for (const spec of node.specifiers) module.exports.set(spec.exported.name ?? spec.exported.value, spec.local);
      }
    });
  }
  for (const module of modules.values()) for (const imported of module.imports) {
    const file = path.posix.normalize(path.posix.join(path.posix.dirname(module.file), imported.source));
    imported.target = modules.get(file);
  }
  return modules;
}
function properties(node, trail = new Set()) {
  node = dereference(node); if (!node || node.type !== 'ObjectExpression' || trail.has(node)) throw new Error('scenes.js 默认导出须为可静态读取的场景对象；计算生成的场景请先改为显式定义。');
  const next = new Set(trail); next.add(node);
  return node.properties.flatMap(prop => prop.type === 'SpreadElement' ? properties(prop.argument, next) : [prop]);
}

export function analyzeReferences(source, sources, { language = 'zh', studio, config } = {}) {
  const issues = []; const definitions = new Map(); const references = []; let script; let modules;
  const add = (code, message, node, scene) => issues.push({ code, message, ...(scene ? { scene } : {}), ...(node ? { file: node.module?.file, line: node.loc?.start.line } : {}) });
  try { script = parseScript(source, { language }); } catch (e) { add('script', e.message); return { ok: false, issues, definitions, references, modules: new Map() }; }
  try { modules = graph(sources); } catch (e) { add('javascript', e.message); return { ok: false, issues, script, definitions, references, modules: new Map() }; }
  const root = modules.get('scenes.js');
  try {
    for (const prop of properties(root?.exports.get('default'))) {
      const name = keyOf(prop); const fn = dereference(prop.value);
      if (typeof name !== 'string' || !functionNode(fn)) { add('scene-definition', '场景须使用明确名称及绘图函数。', prop); continue; }
      if (definitions.has(name)) add('duplicate-scene-function', `重复的场景函数：${name}`, prop, name);
      definitions.set(name, { prop, fn });
    }
  } catch (e) { add('scene-definition', e.message); }
  const sceneNames = new Set(script.scenes.map(s => s.id));
  for (const name of definitions.keys()) if (!sceneNames.has(name)) add('extra-scene', `画面函数“${name}”没有对应的旁白场景。`, definitions.get(name).prop, name);
  for (const scene of script.scenes) {
    const entry = definitions.get(scene.id);
    if (!entry) { add('missing-scene', `缺少场景“${scene.id}”的画面函数。`, null, scene.id); continue; }
    const marks = new Set(scene.units.filter(u => u.type === 'mark').map(u => u.name));
    const stack = new Set();
    const reference = (node, bare = false) => {
      if (node?.type === 'ArrayExpression') { for (const item of node.elements) reference(item, bare); return; }
      const resolved = dereference(node);
      if (!bare && resolved?.type === 'Literal' && resolved.value == null) return;
      const result = referenceConstant(node);
      if (!result) { if (bare || !numericTime(node)) add('dynamic-marker', '无法静态确认时序引用，请使用明确名称、常量或数值表达式。', node, scene.id); return; }
      if (typeof result.value !== 'string' || (!bare && !result.value.startsWith('#'))) return;
      const name = bare ? result.value : result.value.slice(1);
      references.push({ scene: scene.id, name, bare, node: result.node });
      if (!marks.has(name)) add('missing-marker', `场景“${scene.id}”引用了不存在的触发点“${name}”。`, result.node, scene.id);
    };
    const inspect = (fn, args) => {
      if (stack.has(fn)) { add('dynamic-helper', '递归绘图函数无法完成静态引用验证。', fn, scene.id); return; }
      stack.add(fn);
      const previousBindings = new Map(fn.bindings);
      const bindPattern = (param, value) => {
        if (param.type === 'Identifier') fn.bindings.set(param.name, value ? { type:'ArgumentBinding',target:value } : {type:'Literal',value:undefined});
        else if (param.type === 'AssignmentPattern') bindPattern(param.left, value ?? param.right);
        else if (param.type === 'ArrayPattern') param.elements.forEach((item,index) => {if(item) bindPattern(item,dereference(value)?.elements?.[index]);});
        else if (param.type === 'ObjectPattern') for (const prop of param.properties) if (prop.type === 'Property') bindPattern(prop.value,dereference(value)?.properties?.find(p=>keyOf(p)===keyOf(prop))?.value);
      };
      if (args) fn.params.forEach((param,index) => bindPattern(param,args[index]));
      const process = node => {
        if (node.type === 'Property' && ['at', 'out', 'highlightAt'].includes(keyOf(node))) {
          reference(node.value);
          const value = dereference(node.value);
          if (!constant(node.value) && ['BinaryExpression', 'TemplateLiteral'].includes(value?.type)) {
            const hashString = n => { if (n.type === 'CallExpression') return false; if (n.type === 'Literal' && typeof n.value === 'string' && n.value.startsWith('#') || n.type === 'TemplateElement' && n.value.raw.startsWith('#')) return true; return children(n).some(hashString); };
            const concatenated = hashString(value);
            if (concatenated) add('dynamic-marker', '触发点使用了动态拼接，验证和重命名需要明确名称。', node.value, scene.id);
          }
        }
        if (node.type !== 'CallExpression') return;
        const callee = node.callee;
        if (callee.type === 'Identifier') { const helper = dereference(callee); if (functionNode(helper)) inspect(helper, node.arguments); }
        if (callee.type !== 'MemberExpression') return;
        const memberHelper = dereference(callee); if (functionNode(memberHelper)) inspect(memberHelper,node.arguments);
        const method = callee.computed ? constant(callee.property)?.value : callee.property.name;
        if (['forEach','map'].includes(method) && functionNode(node.arguments[0])) {
          const values = dereference(callee.object);
          if (values?.type === 'ArrayExpression') values.elements.forEach((value,index) => inspect(node.arguments[0],[value,{type:'Literal',value:index}]));
          else inspect(node.arguments[0]);
        } else for (const arg of node.arguments) if (functionNode(arg)) inspect(arg);
        if (method === 'mark') reference(node.arguments[0], true);
        if (['time', 'p', 'since', 'between'].includes(method)) for (const arg of node.arguments.slice(0, method === 'between' ? 2 : 1)) reference(arg);
      };
      const walk = node => { process(node); for (const child of children(node)) if (!functionNode(child)) walk(child); };
      walk(fn);
      fn.bindings.clear(); for (const [name, value] of previousBindings) fn.bindings.set(name, value);
      stack.delete(fn);
    };
    inspect(entry.fn);
    for (const element of Object.values(studio?.scenes?.[scene.id]?.elements ?? {})) for (const key of ['at', 'out']) {
      const value = element.patch?.[key];
      if (typeof value === 'string' && value.startsWith('#') && !marks.has(value.slice(1))) add('override-marker', `场景“${scene.id}”的手动调整引用了不存在的触发点“${value.slice(1)}”。`, null, scene.id);
    }
  }
  if (typeof config?.cover === 'string' && !['auto'].includes(config.cover) && !/^\d+(\.\d+)?$/.test(config.cover)) {
    const name = config.cover.split('@')[0]; if (!sceneNames.has(name)) add('cover-scene', `封面引用了不存在的场景“${name}”。`);
  }
  return { ok: !issues.length, issues, script, definitions, references, modules };
}

export function renameReferences(source, sources, request, options = {}) {
  const { sceneId, kind, from, to } = request;
  assertName(to, { marker: kind === 'marker' });
  const analysis = analyzeReferences(source, sources, options);
  if (!analysis.ok) throw new Error(analysis.issues.map(x => x.message).slice(0, 3).join('\n'));
  const scene = analysis.script.scenes.find(s => s.id === sceneId);
  if (!scene) throw new Error('场景不存在。');
  const changes = new Map();
  const edit = (node, text) => { const file = node.module.file; const list = changes.get(file) ?? []; if (node.parent?.type === 'Property' && node.parent.shorthand && node.parent.value === node) text = node.name + ': ' + text; if (!list.some(x => x.start === node.start && x.end === node.end)) list.push({ start: node.start, end: node.end, text }); changes.set(file, list); };
  if (kind === 'scene') {
    if (analysis.definitions.has(to) && to !== sceneId) throw new Error('场景名称已存在。');
    const prop = analysis.definitions.get(sceneId).prop;
    edit(prop.key, JSON.stringify(to) + (prop.shorthand ? ': ' + prop.key.name : ''));
    const object = dereference(analysis.modules.get('scenes.js').exports.get('default'));
    for (const module of analysis.modules.values()) visit(module.ast, node => {
      if (node.type !== 'MemberExpression' || dereference(node.object) !== object) return;
      const name = node.computed ? constant(node.property)?.value : node.property.name;
      if (name === sceneId) {
        if (node.computed) edit(node.property, JSON.stringify(to));
        else { const tail = { ...node.property, start: node.object.end, module }; edit(tail, `[${JSON.stringify(to)}]`); }
      }
    });
    const lines = source.split(/(?<=\n)/); const index = scene.line - 1;
    lines[index] = lines[index].replace(/^(\s*##\s+)[^\s{]+/u, (_, prefix) => prefix + to); source = lines.join('');
  } else {
    const names = scene.units.filter(u => u.type === 'mark').map(u => u.name);
    if (!names.includes(from)) throw new Error('触发点不存在。');
    if (names.includes(to) && to !== from) throw new Error('触发点名称已存在。');
    for (const ref of analysis.references.filter(r => r.scene === sceneId && r.name === from)) {
      if (analysis.references.some(r => r.scene !== sceneId && r.node === ref.node)) throw new Error('触发点由多个场景共享常量或绘图函数，请先在场景内分别定义后改名。');
      edit(ref.node, JSON.stringify((ref.bare ? '' : '#') + to));
    }
    const lines = source.split(/(?<=\n)/); let active = false;
    source = lines.map((line, index) => { if (index === scene.line - 1) active = true; else if (/^\s*##\s/.test(line)) active = false; return active ? line.split(`[#${from}]`).join(`[#${to}]`) : line; }).join('');
  }
  const next = { ...sources };
  for (const [file, edits] of changes) for (const change of edits.sort((a, b) => b.start - a.start)) next[file] = next[file].slice(0, change.start) + change.text + next[file].slice(change.end);
  return { script: source, sources: next };
}

export function readProjectModules(folder) {
  const root = fs.realpathSync(folder); const sources = {}; const pending = ['scenes.js'];
  while (pending.length) {
    const name = pending.pop(); if (Object.hasOwn(sources, name)) continue;
    const file = path.resolve(root, name); const real = fs.realpathSync(file); const rel = path.relative(root, real);
    if (rel.startsWith('..') || path.isAbsolute(rel) || !/\.m?js$/i.test(real) || name.split('/').some(p => p.startsWith('.'))) throw new Error('画面模块必须位于项目内，不能是隐藏文件或外部链接。');
    const source = fs.readFileSync(real, 'utf8'); sources[name] = source;
    const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
    visit(ast, node => { if (node.type === 'ImportExpression') throw new Error('动态导入模块无法完成静态引用验证，请使用明确的相对模块导入。'); });
    for (const item of ast.body) if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(item.type) && item.source) {
      const spec = item.source.value;
      if (!spec.startsWith('./') && !spec.startsWith('../')) throw new Error(`画面验证仅支持项目内相对模块：${spec}`);
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(name), spec));
      if (target.startsWith('../') || path.posix.isAbsolute(target)) throw new Error('画面模块引用超出项目目录。');
      pending.push(target);
    }
  }
  return sources;
}

// One global, deterministic marker mapping lets imported helpers keep sharing
// constants. Only proven syntax references are rewritten, never displayed text.
export function compatibleSources(source, sources, identities, options = {}) {
  const analysis = analyzeReferences(source, sources, options);
  if (!analysis.ok) throw new Error(analysis.issues.map(issue => issue.message).slice(0, 3).join('\n'));
  const scenes = new Map(Object.entries(identities.scenes).map(([ascii, original]) => [original, ascii]));
  const markers = new Map(Object.entries(identities.markers).map(([ascii, original]) => [original, ascii]));
  const changes = new Map();
  const edit = (node, text) => {
    const file = node.module.file;
    if (node.parent?.type === 'Property' && node.parent.shorthand && node.parent.value === node) text = node.name + ': ' + text;
    const list = changes.get(file) ?? [];
    const previous = list.find(item => item.start === node.start && item.end === node.end);
    if (previous && previous.text !== text) throw new Error('共享引用无法安全转换，请分别定义。');
    if (!previous) list.push({ start: node.start, end: node.end, text });
    changes.set(file, list);
  };
  for (const [name, entry] of analysis.definitions) {
    const ascii = scenes.get(name);
    if (ascii !== name) edit(entry.prop.key, JSON.stringify(ascii) + (entry.prop.shorthand ? ': ' + entry.prop.key.name : ''));
  }
  for (const ref of analysis.references) {
    const ascii = markers.get(ref.name);
    if (ascii !== ref.name) edit(ref.node, JSON.stringify((ref.bare ? '' : '#') + ascii));
  }
  const root = dereference(analysis.modules.get('scenes.js').exports.get('default'));
  for (const module of analysis.modules.values()) visit(module.ast, node => {
    if (node.type !== 'MemberExpression' || dereference(node.object) !== root) return;
    const name = node.computed ? constant(node.property)?.value : node.property.name;
    const ascii = scenes.get(name);
    if (ascii && ascii !== name) {
      if (node.computed) edit(node.property, JSON.stringify(ascii));
      else edit({ ...node.property, start: node.object.end, module }, `[${JSON.stringify(ascii)}]`);
    }
  });
  const next = { ...sources };
  for (const [file, edits] of changes) {
    let end = Infinity;
    for (const change of edits.sort((a, b) => b.start - a.start)) {
      if (change.end > end) throw new Error('嵌套引用无法安全转换，请简化定义。');
      next[file] = next[file].slice(0, change.start) + change.text + next[file].slice(change.end);
      end = change.start;
    }
  }
  return next;
}

// Browsers cache ES modules by URL even with Cache-Control: no-store. Version
// every relative module edge so edits to imported helpers reach live previews.
export function versionImports(source, version) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const edits = ast.body.filter(node => node.source && ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && /^\.\.?\//.test(node.source.value)).map(node => ({ start: node.source.start, end: node.source.end, text: JSON.stringify(node.source.value + (node.source.value.includes('?') ? '&' : '?') + 'dsh=' + encodeURIComponent(version)) }));
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}

export function validateProjectReferences(folder) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(folder, 'video.json'), 'utf8'));
    const source = fs.readFileSync(path.join(folder, 'script.md'), 'utf8');
    const studioFile = path.join(folder, '.explainroo/studio.json');
    const studio = fs.existsSync(studioFile) ? JSON.parse(fs.readFileSync(studioFile, 'utf8')) : undefined;
    const result = analyzeReferences(source, readProjectModules(folder), { language: config.language ?? 'en', config, studio });
    return { ok: result.ok, scenes: result.script?.scenes.length ?? 0, references: result.references.length, issues: result.issues };
  } catch (error) { return { ok: false, scenes: 0, references: 0, issues: [{ code: 'project', message: error.message }] }; }
}
