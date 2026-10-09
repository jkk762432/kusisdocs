// Sidebar.html 을 만듭니다:  node docs-addon/build.js
const fs = require('fs'), path = require('path');
const here = __dirname, src = path.join(here, 'src');
const read = f => fs.readFileSync(path.join(src, f), 'utf8');
// 회칙 데이터 (site/src/shared/rules.js 의 export default 객체)
const rulesJs = fs.readFileSync(path.join(here, '..', 'site/src/shared/rules.js'), 'utf8');
const rules = JSON.parse(rulesJs.slice(rulesJs.indexOf('{'), rulesJs.lastIndexOf('}') + 1));
const cfgJs = fs.readFileSync(path.join(here, '..', 'site/src/shared/firebase-config.js'), 'utf8');
const m = cfgJs.match(/firebaseConfig\s*=\s*(\{[\s\S]*?\});/);
const fbcfg = JSON.parse(m[1]);
const js = ['js1_core.js', 'js2_room.js', 'js3_engine.js', 'js4_run.js', 'js5_write.js', 'js6_set.js'].map(read).join('\n');
const esc = s => s.replace(/<\/(script)/gi, '<\\/$1');
let html = read('sidebar.html');
html = html.replace('/*CSS*/', () => read('sidebar.css')).replace('/*RULES*/', () => esc(JSON.stringify(rules))).replace('/*FBCFG*/', () => esc(JSON.stringify(fbcfg))).replace('/*JS*/', () => esc(js));
fs.writeFileSync(path.join(here, 'Sidebar.html'), html);
console.log('Sidebar.html', (html.length / 1024).toFixed(0) + 'KB');
