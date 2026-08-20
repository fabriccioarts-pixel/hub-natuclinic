const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

const regex = /onChange:\s*function\(selectedDates,\s*dateStr,\s*instance\)\s*\{[\s\S]*?\}\s*\}\)/;
const replacement = `onChange: function(selectedDates, dateStr, instance) {
                // Seta o valor visualmente / no DOM
                instance.element.value = dateStr;
                
                // Puxa o onchange original (que deve ser jumpToDate(this.value))
                const onChangeAttr = instance.element.getAttribute('onchange');
                if (onChangeAttr) {
                    // Substitui o this.value pela data em string
                    const executableStr = onChangeAttr.replace(/this\.value/g, "'" + dateStr + "'");
                    try {
                        eval(executableStr);
                    } catch(e) {
                        console.error('Error executing flatpickr onchange:', e);
                    }
                } else {
                    instance.element.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        })`;

code = code.replace(regex, replacement);
fs.writeFileSync('app.js', code);
console.log('Fixed Flatpickr onChange properly!');
