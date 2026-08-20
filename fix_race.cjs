const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

const regex = /apiOptions\s*=\s*await\s*response\.json\(\);\s*populateSelects\(\);/g;
const replacement = `apiOptions = await response.json();
            populateSelects();
            if (typeof renderAgendaGrid === 'function') {
                renderAgendaGrid();
            }`;

code = code.replace(regex, replacement);
fs.writeFileSync('app.js', code);
console.log('Fixed Agenda race condition!');
