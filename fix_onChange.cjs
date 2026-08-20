const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

const oldInit = `const initFlatpickr = () => {
    if (typeof flatpickr !== "undefined") {
        flatpickr("input[type=date]", {
            locale: "pt",
            dateFormat: "Y-m-d"
        });
    }
};`;

const newInit = `const initFlatpickr = () => {
    if (typeof flatpickr !== "undefined") {
        flatpickr("input[type=date]", {
            locale: "pt",
            dateFormat: "Y-m-d",
            onChange: function(selectedDates, dateStr, instance) {
                // Garante que o calendário da agenda dispare a busca de agendamentos
                if (instance.element.id === 'hidden-date-picker' && typeof jumpToDate === 'function') {
                    jumpToDate(dateStr);
                } else {
                    // Para os outros campos, tenta disparar o evento original
                    const event = new Event('change', { bubbles: true });
                    instance.element.dispatchEvent(event);
                }
            }
        });
    }
};`;

if (code.includes(oldInit)) {
    code = code.replace(oldInit, newInit);
    fs.writeFileSync('app.js', code);
    console.log('Fixed Flatpickr onChange');
} else {
    // maybe it was slightly modified or not present, fallback:
    code = code.replace(/flatpickr\("input\[type=date\]",\s*\{\s*locale:\s*"pt",\s*dateFormat:\s*"Y-m-d"\s*\}\);/, 
        `flatpickr("input[type=date]", {
            locale: "pt",
            dateFormat: "Y-m-d",
            onChange: function(selectedDates, dateStr, instance) {
                if (instance.element.id === 'hidden-date-picker' && typeof jumpToDate === 'function') {
                    jumpToDate(dateStr);
                } else {
                    const event = new Event('change', { bubbles: true });
                    instance.element.dispatchEvent(event);
                }
            }
        });`);
    fs.writeFileSync('app.js', code);
    console.log('Fixed Flatpickr onChange via regex fallback');
}
