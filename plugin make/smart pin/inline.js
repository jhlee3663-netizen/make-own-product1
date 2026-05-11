const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
const htmlPath = path.join(distDir, 'ui.html');
const jsPath = path.join(distDir, 'ui.js');

let html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');

const safeJs = js.replace(/<\/script>/gi, '<\\/script>');
html = html.replace(/<script[^>]*src="ui\.js"[^>]*><\/script>/g, () => `<script>${safeJs}</script>`);

fs.writeFileSync(htmlPath, html);
fs.unlinkSync(jsPath);

const licensePath = jsPath + '.LICENSE.txt';
if (fs.existsSync(licensePath)) fs.unlinkSync(licensePath);

console.log('ui.js inlined into ui.html');
