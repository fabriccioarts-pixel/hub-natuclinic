const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

const getSection = (startMarker, endMarker) => {
    const startIndex = html.indexOf(startMarker);
    const endIndex = html.indexOf(endMarker, startIndex) + endMarker.length;
    return html.substring(startIndex, endIndex);
};

// 1. Extract base parts
const doctypeToHeaderStart = html.substring(0, html.indexOf("<div class=\"tabs-container\">"));

const tabsContainer = `<div class="tabs-container">
            <button class="tab-btn" onclick="window.location.href='index.html'" id="tab-kanban">
                <i class="fa-solid fa-table-columns"></i> CRM Vendas
            </button>
            <button class="tab-btn" onclick="window.location.href='agenda.html'" id="tab-agenda">
                <i class="fa-regular fa-calendar-days"></i> Agenda Completa
            </button>
            <button class="tab-btn" onclick="window.location.href='dashboard.html'" id="tab-dashboard" style="background: rgba(99, 102, 241, 0.1); color: var(--accent-primary); border-color: rgba(99, 102, 241, 0.3);">
                <i class="fa-solid fa-chart-pie"></i> Dashboard VIP
            </button>
            
            <div class="dropdown">
                <button class="tab-btn" id="tab-relacionamento-main">
                    <i class="fa-solid fa-heart" style="color: var(--accent-success)"></i> Relacionamento <i class="fa-solid fa-chevron-down" style="font-size: 0.75rem; margin-left: 0.3rem; opacity: 0.7;"></i>
                </button>
                <div class="dropdown-content">
                    <button class="tab-btn" onclick="window.location.href='posvenda.html'" id="tab-posvenda">
                        <i class="fa-solid fa-star" style="color: var(--accent-warning)"></i> Pós-Venda
                    </button>
                    <button class="tab-btn" onclick="window.location.href='faltantes.html'" id="tab-faltantes">
                        <i class="fa-solid fa-user-xmark" style="color: var(--accent-danger)"></i> Faltantes
                    </button>
                    <button class="tab-btn" onclick="window.location.href='sumidos.html'" id="tab-sumidos">
                        <i class="fa-solid fa-user-clock" style="color: var(--accent-danger)"></i> Sumidos
                    </button>
                    <button class="tab-btn" onclick="window.location.href='aniversariantes.html'" id="tab-aniversariantes">
                        <i class="fa-solid fa-cake-candles" style="color: var(--accent-primary)"></i> Aniversariantes
                    </button>
                </div>
            </div>
        </div>`;

const headerEnd = html.substring(html.indexOf("<div class=\"actions\"", html.indexOf("<div class=\"tabs-container\">")), html.indexOf("</header>") + 9);

const headerPart = doctypeToHeaderStart + tabsContainer + "\n\n        " + headerEnd;

// Modals
const modalNewLead = getSection("<!-- Modal Novo Lead -->", "</div>\r\n    </div>");
const modalAgendamento = getSection("<!-- Modal Agendamento (Integração) -->", "</div>\r\n    </div>");
const modalPatientDetails = getSection("<!-- Modal Detalhes do Paciente -->", "</div>\r\n    </div>");

const footerPart = "\n\n    " + modalNewLead + "\n\n    " + modalAgendamento + "\n\n    " + modalPatientDetails + "\n\n    <script src=\"app.js\"></script>\n</body>\n</html>";

// 2. Extract specific views, and remove "display: none" from them since they are their own pages now
const dashboardView = getSection("<!-- ABA: DASHBOARD -->", "</main>").replace("display: none;", "display: flex;");
const kanbanView = getSection("<!-- ABA 1: KANBAN -->", "<!-- Modal Novo Lead -->").replace("<!-- Modal Novo Lead -->", "").trim();
const agendaView = getSection("<!-- ABA 2: AGENDA GRADE COMPLETA -->", "<!-- Modal Detalhes do Paciente -->").replace("display: none;", "display: block;").replace("<!-- Modal Detalhes do Paciente -->", "").trim();
const posvendaView = getSection("<!-- ABA: PÓS-VENDA -->", "</main>").replace("display: none;", "display: flex;");
const faltantesView = getSection("<!-- ABA: FALTANTES -->", "</main>").replace("display: none;", "display: flex;");
const sumidosView = getSection("<!-- ABA: SUMIDOS -->", "</main>").replace("display: none;", "display: flex;");
const aniversariantesView = getSection("<!-- ABA: ANIVERSARIANTES -->", "</main>").replace("display: none;", "display: flex;");

// 3. Write files
fs.writeFileSync(path.join(__dirname, "../index.html"), headerPart + "\n\n    " + kanbanView + footerPart);
fs.writeFileSync(path.join(__dirname, "../dashboard.html"), headerPart + "\n\n    " + dashboardView + footerPart);
fs.writeFileSync(path.join(__dirname, "../agenda.html"), headerPart + "\n\n    " + agendaView + footerPart);
fs.writeFileSync(path.join(__dirname, "../posvenda.html"), headerPart + "\n\n    " + posvendaView + footerPart);
fs.writeFileSync(path.join(__dirname, "../faltantes.html"), headerPart + "\n\n    " + faltantesView + footerPart);
fs.writeFileSync(path.join(__dirname, "../sumidos.html"), headerPart + "\n\n    " + sumidosView + footerPart);
fs.writeFileSync(path.join(__dirname, "../aniversariantes.html"), headerPart + "\n\n    " + aniversariantesView + footerPart);

console.log("Files generated successfully!");

