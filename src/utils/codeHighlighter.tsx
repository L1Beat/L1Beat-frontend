// The light Prism build with only the languages ACPs use. The package root
// bundles every highlight.js and Prism grammar (about 1.6 MB minified).
import type { ComponentProps } from 'react';
import PrismLight from 'react-syntax-highlighter/dist/esm/prism-light';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff';
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import protobuf from 'react-syntax-highlighter/dist/esm/languages/prism/protobuf';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import solidity from 'react-syntax-highlighter/dist/esm/languages/prism/solidity';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import vscDarkPlus from 'react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus';
import oneLight from 'react-syntax-highlighter/dist/esm/styles/prism/one-light';

const grammars = { bash, diff, go, javascript, json, protobuf, python, rust, solidity, typescript, yaml };
for (const [name, grammar] of Object.entries(grammars)) {
  PrismLight.registerLanguage(name, grammar);
}

// The light build registers grammars under their own names and aliases only,
// so map the fence names ACP authors use (```golang) onto them.
const ALIASES: Record<string, string> = { golang: 'go', sh: 'bash', shell: 'bash', py: 'python', proto: 'protobuf', sol: 'solidity', ts: 'typescript', js: 'javascript', yml: 'yaml' };

function SyntaxHighlighter({ language, ...props }: ComponentProps<typeof PrismLight>) {
  const lang = language?.toLowerCase();
  return <PrismLight language={lang ? ALIASES[lang] ?? lang : lang} {...props} />;
}

export { SyntaxHighlighter, vscDarkPlus, oneLight };
