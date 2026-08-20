const fs = require('fs');
let css = fs.readFileSync('style.css', 'utf8');

const replacement = `
.flatpickr-calendar {
    font-size: 0.75rem !important;
    width: 240px !important;
}
.flatpickr-day {
    max-width: 30px !important;
    height: 30px !important;
    line-height: 30px !important;
}
.flatpickr-weekdays, .flatpickr-weekday, .flatpickr-weekdaycontainer, span.flatpickr-weekday, .flatpickr-innerContainer, .flatpickr-months {
    background: transparent !important;
}
`;

css = css.replace(/\.flatpickr-calendar\s*\{[\s\S]*$/, replacement);
fs.writeFileSync('style.css', css);
console.log('Fixed CSS');
