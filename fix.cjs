const fs = require('fs');

function fixHTML(filename) {
    let html = fs.readFileSync(filename, 'utf8');
    
    // Replace old flatpickr tags
    const searchString = `    <!-- Flatpickr (Calendrio Customizado) -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/dark.css">
    <script src="https://cdn.jsdelivr.net/npm/flatpickr"></script>
    <script src="https://npmcdn.com/flatpickr/dist/l10n/pt.js"></script>`;
    
    html = html.replace(searchString, '');
    html = html.replace(/<!-- Flatpickr.*-->\r?\n?/g, '');
    
    const newTags = `
    <!-- Flatpickr -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/dark.css">
    <script src="https://cdn.jsdelivr.net/npm/flatpickr"></script>
    <script src="https://npmcdn.com/flatpickr/dist/l10n/pt.js"></script>
    `;
    
    html = html.replace('<link rel="stylesheet" href="style.css', newTags + '<link rel="stylesheet" href="style.css');
    
    fs.writeFileSync(filename, html);
}

fixHTML('index.html');
fixHTML('agenda.html');
console.log('Fixed HTML');
