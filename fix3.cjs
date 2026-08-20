const fs = require('fs');

let css = fs.readFileSync('style.css', 'utf8');

// Replace width and add transform to .flatpickr-calendar
css = css.replace(/width: 300px !important;/g, 'width: auto !important;\n    transform: scale(0.9);\n    transform-origin: top center;');

// Remove the explicit dimensions from .flatpickr-day that break the grid
css = css.replace(/max-width: 38px !important;\r?\n\s*height: 38px !important;\r?\n\s*line-height: 38px !important;/g, '');

fs.writeFileSync('style.css', css);
console.log('Fixed Flatpickr CSS sizing');
