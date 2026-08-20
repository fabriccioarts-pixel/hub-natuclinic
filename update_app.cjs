const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

// Replace alert and confirm with await customAlert/customConfirm
code = code.replace(/\balert\(/g, 'await customAlert(');
code = code.replace(/\bconfirm\(/g, 'await customConfirm(');

// Fix startNewChat to be async
code = code.replace('function startNewChat() {', 'async function startNewChat() {');

// Fix title to data-tooltip in agenda-block
code = code.replace('<div class="agenda-block" style="${inlineStyle}" title="${title} - ${subtitle}"', '<div class="agenda-block" style="${inlineStyle}" data-tooltip="${title} - ${subtitle}"');

// Append custom modal functions
const modals = `
// ============================================
// MODAIS CUSTOMIZADOS (ALERTS E CONFIRMS)
// ============================================

window.customAlert = function(message, title = 'Aviso') {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'custom-modal-overlay';
        overlay.innerHTML = \`
            <div class="custom-modal-box">
                <div class="custom-modal-title"><i class="fa-solid fa-circle-exclamation" style="color: var(--accent-warning);"></i> \${title}</div>
                <div class="custom-modal-message">\${message}</div>
                <div class="custom-modal-actions">
                    <button class="btn-primary" id="cm-ok-btn">OK</button>
                </div>
            </div>
        \`;
        document.body.appendChild(overlay);
        document.getElementById('cm-ok-btn').addEventListener('click', () => {
            overlay.remove();
            resolve();
        });
    });
};

window.customConfirm = function(message, title = 'Confirmação') {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'custom-modal-overlay';
        overlay.innerHTML = \`
            <div class="custom-modal-box">
                <div class="custom-modal-title"><i class="fa-solid fa-circle-question" style="color: var(--accent-info);"></i> \${title}</div>
                <div class="custom-modal-message">\${message}</div>
                <div class="custom-modal-actions">
                    <button class="btn-secondary" id="cm-cancel-btn">Cancelar</button>
                    <button class="btn-primary" id="cm-confirm-btn" style="background: var(--accent-danger); border-color: var(--accent-danger);">Confirmar</button>
                </div>
            </div>
        \`;
        document.body.appendChild(overlay);
        document.getElementById('cm-confirm-btn').addEventListener('click', () => {
            overlay.remove();
            resolve(true);
        });
        document.getElementById('cm-cancel-btn').addEventListener('click', () => {
            overlay.remove();
            resolve(false);
        });
    });
};
`;

if (!code.includes('window.customAlert')) {
    code += modals;
}

fs.writeFileSync('app.js', code);
console.log("Modificado com sucesso!");
