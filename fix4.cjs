const fs = require('fs');
let css = fs.readFileSync('style.css', 'utf8');

const firstIndex = css.indexOf('.flatpickr-calendar {');
if (firstIndex !== -1) {
    css = css.substring(0, firstIndex);
}

const newFlatpickrCss = `
/* ============================================ */
/* FLATPICKR CUSTOMIZATION (CALENDÁRIO) */
/* ============================================ */

.flatpickr-calendar {
    background: var(--bg-card) !important;
    border: 1px solid var(--border-color) !important;
    box-shadow: 0 8px 30px rgba(0,0,0,0.5) !important;
    border-radius: 10px !important;
    padding: 10px !important;
    font-family: inherit !important;
    width: auto !important;
    transform: scale(0.9);
    transform-origin: top center;
}

.flatpickr-calendar.arrowTop:before,
.flatpickr-calendar.arrowTop:after,
.flatpickr-calendar.arrowBottom:before,
.flatpickr-calendar.arrowBottom:after {
    border-bottom-color: var(--bg-card) !important;
    border-top-color: var(--bg-card) !important;
}

.flatpickr-months .flatpickr-month,
.flatpickr-current-month .flatpickr-monthDropdown-months,
.flatpickr-current-month .flatpickr-monthDropdown-months .flatpickr-monthDropdown-month {
    background: transparent !important;
    color: var(--text-color) !important;
}

.flatpickr-current-month input.cur-year {
    color: var(--text-color) !important;
}

.flatpickr-weekdays .flatpickr-weekday {
    color: var(--text-color) !important;
    opacity: 0.7;
    background: transparent !important;
}

.flatpickr-day {
    color: var(--text-color) !important;
    background: transparent !important;
    border-color: transparent !important;
    border-radius: 8px !important;
}

.flatpickr-day:hover,
.flatpickr-day:focus {
    background: var(--bg-hover) !important;
    border-color: var(--bg-hover) !important;
}

.flatpickr-day.selected, 
.flatpickr-day.startRange, 
.flatpickr-day.endRange,
.flatpickr-day.selected:focus, 
.flatpickr-day.selected:hover {
    background: var(--primary-color) !important;
    border-color: var(--primary-color) !important;
    color: #fff !important;
}

.flatpickr-day.today {
    border-color: var(--primary-color) !important;
}

.flatpickr-day.flatpickr-disabled,
.flatpickr-day.prevMonthDay,
.flatpickr-day.nextMonthDay {
    color: var(--text-color) !important;
    opacity: 0.3 !important;
}

.flatpickr-time {
    border-top: 1px solid var(--border-color) !important;
}

.flatpickr-time input, .flatpickr-time .flatpickr-am-pm {
    color: var(--text-color) !important;
}

.flatpickr-time input:hover, .flatpickr-time .flatpickr-am-pm:hover {
    background: var(--bg-hover) !important;
}

.flatpickr-innerContainer, .flatpickr-weekwrapper, .flatpickr-weekdaycontainer, .flatpickr-months {
    background: transparent !important;
}

.flatpickr-prev-month svg, .flatpickr-next-month svg {
    fill: var(--text-color) !important;
}
.flatpickr-prev-month:hover svg, .flatpickr-next-month:hover svg {
    fill: var(--primary-color) !important;
}
`;

fs.writeFileSync('style.css', css + newFlatpickrCss);
console.log('Fixed CSS once and for all');
