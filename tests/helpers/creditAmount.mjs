import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../../src/components/CreditAmount.js', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { fileName: 'CreditAmount.jsx', compilerOptions: {
  jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
} }).outputText;
const module = { exports: {} };
vm.runInNewContext(code, { module, exports: module.exports, require: name => name.endsWith('.css')
  ? { __esModule: true, default: { amount: 'credit-amount', icon: 'credit-icon', srOnly: 'sr-only' } } : require(name) });
export const creditAmountModule = module.exports;
export const plainText = html => html.replace(/<svg\b[\s\S]*?<\/svg>/g, '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ');
