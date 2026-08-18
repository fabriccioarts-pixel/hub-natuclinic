// === DADOS DO KANBAN (LOCAL) ===
let leads = [];
let loggedUser = JSON.parse(localStorage.getItem('crm_user'));

// Listas de Opções do Amigo App
let apiOptions = { places: [], doctors: [], events: [] };

function initApp() {
    initTheme();
    if (loggedUser) {
        const overlay = document.getElementById('login-overlay');
        if(overlay) overlay.classList.remove('active');
        
        fetchLeadsFromServer(); // Busca na nuvem e renderiza
        fetchApiOptions();
        startNotificationPolling();
        
        if (loggedUser.role === 'admin' || loggedUser.username === 'admin') {
            const btnGestao = document.getElementById('btn-gestao-acessos');
            if (btnGestao) {
                btnGestao.style.display = 'flex';
            }
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// === THEME MANAGER ===
function initTheme() {
    const savedTheme = localStorage.getItem('crm_theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.setAttribute('data-theme', 'light');
        const icon = document.querySelector('#theme-toggle i');
        if (icon) {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        }
    }
}

function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('crm_theme', newTheme);
    
    const icon = document.querySelector('#theme-toggle i');
    if (icon) {
        if (newTheme === 'light') {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        } else {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
        }
    }
}
// === CONEXÃO COM O BANCO DE DADOS ===
async function fetchLeadsFromServer() {
    try {
        const url = loggedUser ? `/api/leads?owner_id=${loggedUser.username}` : '/api/leads';
        const res = await fetch(url);
        const rows = await res.json();
        // Mapear column_id do banco de volta para column do JS local, com fallback seguro para col-novos se for null
        leads = (rows || []).map(r => ({ ...r, column: r.column_id || 'col-novos' }));
        renderBoard();
    } catch (e) {
        console.error('Erro ao buscar leads:', e);
        renderBoard(); // renderiza vazio
    }
}

async function saveLeadToServer(lead) {
    try {
        // Renomear column para column_id e incluir owner_id
        const payload = { ...lead, column_id: lead.column, owner_id: loggedUser ? loggedUser.username : null };
        const res = await fetch('/api/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.error) console.error(json.error);
    } catch (e) {
        console.error('Erro ao salvar lead no servidor', e);
    }
}

async function updateLeadColumnOnServer(id, column) {
    try {
        const res = await fetch(`/api/leads/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ column_id: column })
        });
        const json = await res.json();
        if (json.error) console.error(json.error);
    } catch (e) {
        console.error('Erro ao mover lead no servidor', e);
    }
}

async function fetchApiOptions() {
    try {
        const response = await fetch('/api/options');
        if(response.ok) {
            apiOptions = await response.json();
            populateSelects();
        }
    } catch(e) {
        console.error("Erro ao buscar opções da API", e);
    }
}

function populateSelects() {
    const placeSelect = document.getElementById('ag-place');
    const userSelect = document.getElementById('ag-user');
    
    if(!placeSelect) return;
    
    placeSelect.innerHTML = '<option value="">Selecione...</option>' + 
        apiOptions.places.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        
    userSelect.innerHTML = '<option value="">Selecione...</option>' + 
        apiOptions.doctors.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
        
    // Configurando Dropdown Pesquisável para Procedimentos
    const eventSearch = document.getElementById('ag-event-search');
    const eventDropdown = document.getElementById('ag-event-dropdown');
    const eventHidden = document.getElementById('ag-event');
    
    if (eventSearch && eventDropdown) {
        eventDropdown.innerHTML = apiOptions.events.map(e => 
            `<div class="ag-dropdown-item" data-id="${e.id}" data-name="${e.name}">${e.name}</div>`
        ).join('');
        
        eventSearch.addEventListener('focus', () => {
            eventDropdown.style.display = 'block';
            eventSearch.select();
        });
        
        eventSearch.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            eventDropdown.style.display = 'block';
            eventDropdown.querySelectorAll('.ag-dropdown-item').forEach(item => {
                const name = item.dataset.name.toLowerCase();
                item.style.display = name.includes(term) ? 'block' : 'none';
            });
        });
        
        document.addEventListener('click', (e) => {
            if (!eventSearch.contains(e.target) && !eventDropdown.contains(e.target)) {
                eventDropdown.style.display = 'none';
            }
        });
        
        eventDropdown.addEventListener('click', (e) => {
            if (e.target.classList.contains('ag-dropdown-item')) {
                eventHidden.value = e.target.dataset.id;
                eventSearch.value = e.target.dataset.name;
                eventDropdown.style.display = 'none';
            }
        });
    }
}

// === RENDERIZAÇÃO DO KANBAN ===
function renderBoard() {
    document.querySelectorAll('.card-list').forEach(col => col.innerHTML = '');
    
    leads.forEach(lead => {
        const col = document.getElementById(lead.column);
        if (col) {
            const card = document.createElement('div');
            card.className = 'card';
            card.draggable = true;
            card.id = `card-${lead.id}`;
            card.ondragstart = (e) => drag(e, lead.id);
            card.ondragend = dragEnd;
            
            let extraInfo = '';
            if (lead.agendamento) {
                extraInfo = `<div class="tag" style="background: rgba(16,185,129,0.2); color: #34d399;">
                                <i class="fa-solid fa-calendar"></i> ${lead.agendamento.data} às ${lead.agendamento.hora}
                             </div>`;
            }

            card.innerHTML = `
                <button class="delete-btn" onclick="deleteLead('${lead.id}')"><i class="fa-solid fa-trash"></i></button>
                <button class="notes-btn" onclick="openNotesModal('${lead.id}')" style="position: absolute; right: 35px; top: 10px; background: none; border: none; color: ${lead.notas ? 'var(--accent-warning)' : 'var(--text-muted)'}; cursor: pointer; font-size: 1.1rem; transition: 0.2s;" onmouseover="this.style.color='var(--accent-warning)'" onmouseout="this.style.color='${lead.notas ? 'var(--accent-warning)' : 'var(--text-muted)'}'" title="Anotações do Lead"><i class="fa-solid fa-note-sticky"></i></button>
                <div class="card-title">${lead.nome}</div>
                <div class="card-info"><i class="fa-brands fa-whatsapp"></i> ${lead.telefone}</div>
                <div class="tag"><i class="fa-solid fa-bullhorn"></i> ${lead.origem}</div>
                ${extraInfo}
            `;
            col.appendChild(card);
        }
    });

    // Atualiza contadores
    ['col-leads', 'col-atendimento', 'col-agendado', 'col-perdido'].forEach(id => {
        const count = leads.filter(l => l.column === id).length;
        const el = document.getElementById('count-' + id.replace('col-', ''));
        if (el) el.innerText = count;
    });
}

// === DRAG AND DROP LOGIC ===
let draggedCardId = null;
let sourceColumnId = null;

function drag(ev, id) {
    draggedCardId = id;
    sourceColumnId = leads.find(l => l.id === id).column;
    ev.dataTransfer.setData("text", id);
    setTimeout(() => {
        document.getElementById(`card-${id}`).classList.add('dragging');
    }, 0);
}

function dragEnd(ev) {
    if(draggedCardId) {
        const el = document.getElementById(`card-${draggedCardId}`);
        if(el) el.classList.remove('dragging');
    }
}

function allowDrop(ev) {
    ev.preventDefault();
}

function drop(ev, targetColumnId) {
    ev.preventDefault();
    if (!draggedCardId || targetColumnId === sourceColumnId) return;

    const leadIndex = leads.findIndex(l => l.id === draggedCardId);
    
    // Se moveu para agendado, abre o modal de integração!
    if (targetColumnId === 'col-agendado') {
        openAgendamentoModal(draggedCardId);
    } else {
        leads[leadIndex].column = targetColumnId;
        renderBoard();
        updateLeadColumnOnServer(draggedCardId, targetColumnId);
    }
}

// === AUTOCOMPLETE DE PACIENTES EXISTENTES NO AGENDAMENTO ===
let _buscaTimer = null; // Debounce para não chamar a API a cada letra
window.selectedPatientId = null; // Guardar ID do paciente se for existente

function buscarPacienteExistente(termo) {
    const dropdown = document.getElementById('ag-patient-dropdown');
    if (!dropdown) return;
    
    window.selectedPatientId = null; // Reseta sempre que digitar algo

    if (!termo || termo.length < 2) {
        dropdown.style.display = 'none';
        return;
    }

    // Mostra estado de carregando
    dropdown.innerHTML = `<div style="padding:0.8rem 1rem; color:var(--text-muted); font-size:0.85rem;"><i class="fa-solid fa-spinner fa-spin"></i> Buscando pacientes...</div>`;
    dropdown.style.display = 'block';

    // Debounce: aguarda 500ms após o usuário parar de digitar para chamar a API
    clearTimeout(_buscaTimer);
    _buscaTimer = setTimeout(async () => {
        try {
            const res = await fetch('/api/buscar-paciente?nome=' + encodeURIComponent(termo));
            const data = await res.json();
            const pacientes = data.pacientes || [];

            // Também busca nos leads locais do CRM (instantâneo)
            const termoLower = termo.toLowerCase();
            const doLeads = (leads || [])
                .filter(l => l.nome && l.nome.toLowerCase().includes(termoLower))
                .map(l => ({ nome: l.nome, telefone: l.telefone || '', fonte: 'CRM' }));

            // Junta resultados (Amigo App + CRM local), sem duplicatas
            const vistos = new Set(doLeads.map(l => l.nome.toLowerCase()));
            const doAmigo = pacientes
                .filter(p => !vistos.has(p.nome.toLowerCase()))
                .map(p => ({ id: p.id, nome: p.nome, telefone: p.telefone || '', email: p.email || '', born: p.born || '', fonte: 'Amigo App' }));

            const todos = [...doLeads, ...doAmigo];

            if (todos.length === 0) {
                dropdown.innerHTML = `<div style="padding:0.8rem 1rem; color:var(--text-muted); font-size:0.85rem;"><i class="fa-solid fa-user-slash"></i> Nenhum paciente encontrado. Preencha para cadastrar.</div>`;
                return;
            }

            dropdown.innerHTML = todos.map(r => `
                <div onclick="selecionarPaciente('${r.nome.replace(/'/g, "\\'")}', '${(r.telefone || '').replace(/'/g, "\\'")}', '${r.id || ''}', '${(r.email || '').replace(/'/g, "\\'")}', '${(r.born || '').replace(/'/g, "\\'")}')"
                    style="padding: 0.7rem 1rem; cursor: pointer; border-bottom: 1px solid var(--border-color); transition: background 0.15s;"
                    onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                    <div style="font-weight: 600; color: var(--text-color);">${r.nome}</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">
                        <i class="fa-solid fa-phone" style="font-size:0.7rem;"></i> ${r.telefone || 'Sem telefone'} 
                        &nbsp;<span style="background: ${r.fonte === 'CRM' ? 'rgba(99,102,241,0.2)' : 'rgba(251,146,60,0.2)'}; color: ${r.fonte === 'CRM' ? 'var(--accent-primary)' : '#fb923c'}; font-size:0.7rem; padding: 1px 6px; border-radius: 4px;">${r.fonte}</span>
                    </div>
                </div>
            `).join('');

        } catch(e) {
            dropdown.innerHTML = `<div style="padding:0.8rem 1rem; color:var(--accent-danger); font-size:0.85rem;"><i class="fa-solid fa-triangle-exclamation"></i> Erro ao buscar. Tente novamente.</div>`;
        }
    }, 500);
}

function selecionarPaciente(nome, telefone, id = '', email = '', born = '') {
    const nameInput = document.getElementById('ag-patient-name');
    const phoneInput = document.getElementById('ag-patient-phone');
    const emailInput = document.getElementById('ag-patient-email');
    const bornInput = document.getElementById('ag-patient-born');
    const dropdown = document.getElementById('ag-patient-dropdown');

    if (nameInput) nameInput.value = nome;
    if (phoneInput) phoneInput.value = telefone;
    if (emailInput && email) emailInput.value = email;
    if (bornInput && born) {
        // Formata data caso precise (geralmente YYYY-MM-DD para input date)
        try {
            bornInput.value = born.split('T')[0];
        } catch(e) {
            bornInput.value = born;
        }
    }
    
    if (dropdown) dropdown.style.display = 'none';
    
    window.selectedPatientId = id || null;
}

// Fecha o dropdown ao clicar fora
document.addEventListener('click', (e) => {
    const dd = document.getElementById('ag-patient-dropdown');
    const input = document.getElementById('ag-patient-name');
    if (dd && input && !dd.contains(e.target) && e.target !== input) {
        dd.style.display = 'none';
    }
});

// === MODAIS ===
function openNewLeadModal() {
    document.getElementById('modalNewLead').classList.add('active');
}

function closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    document.getElementById('nl-nome').value = '';
    document.getElementById('nl-telefone').value = '';
    const emailEl = document.getElementById('nl-email');
    if (emailEl) emailEl.value = '';
    const fbcEl = document.getElementById('nl-fb-click-id');
    if (fbcEl) fbcEl.value = '';
    
    document.getElementById('integrationLoader').classList.remove('active');
    document.getElementById('integrationActions').style.display = 'flex';
}

function saveNewLead() {
    const nome = document.getElementById('nl-nome').value;
    const telefone = document.getElementById('nl-telefone').value;
    const origem = document.getElementById('lead-origem').value;
    const born = document.getElementById('lead-born').value;
    const emailEl = document.getElementById('nl-email');
    const fbcEl = document.getElementById('nl-fb-click-id');
    const email = emailEl ? emailEl.value : '';
    const fb_click_id = fbcEl ? fbcEl.value : '';
    
    if(!telefone) {
        alert("O número de WhatsApp é obrigatório para cadastrar o paciente!");
        return;
    }

    const newLead = {
        id: Date.now().toString(),
        nome: nome || 'Lead sem nome',
        telefone,
        origem,
        born,
        email,
        fb_click_id,
        column: 'col-leads'
    };

    leads.push(newLead);
    closeModals();
    renderBoard();
    saveLeadToServer(newLead);
}

function openNotesModal(id) {
    const lead = leads.find(l => l.id === id);
    if (!lead) return;
    document.getElementById('ln-lead-id').value = id;
    document.getElementById('ln-lead-name').innerText = lead.nome;
    document.getElementById('ln-notas').value = lead.notas || '';
    document.getElementById('modalLeadNotes').classList.add('active');
}

async function saveLeadNotes() {
    const id = document.getElementById('ln-lead-id').value;
    const notas = document.getElementById('ln-notas').value;
    
    const lead = leads.find(l => l.id === id);
    if (lead) {
        lead.notas = notas;
        renderBoard(); // atualiza a cor do icone de notas
        
        try {
            await fetch(`/api/leads/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notas })
            });
        } catch (e) {
            console.error('Erro ao salvar notas', e);
        }
    }
    
    document.getElementById('modalLeadNotes').classList.remove('active');
}

function deleteLead(id) {
    if(confirm("Tem certeza que deseja deletar este paciente?")) {
        leads = leads.filter(l => l.id !== id);
        renderBoard();
    }
}

// === SUGESTÕES INTELIGENTES DE AGENDAMENTO ===
function renderDayChips() {
    const container = document.getElementById('sugestoes-dias');
    if (!container) return;
    container.innerHTML = '';
    
    const today = new Date();
    for (let i = 0; i < 5; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        // Pula domingos (opcional, mas comum em clínicas)
        if (d.getDay() === 0) {
            today.setDate(today.getDate() + 1);
            d.setDate(d.getDate() + 1);
        }
        
        const dateStr = d.toISOString().split('T')[0];
        let label = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
        if (i === 0) label = "Hoje";
        if (i === 1) label = "Amanhã";
        
        const chip = document.createElement('div');
        chip.className = 'suggestion-chip';
        if (i === 0) chip.classList.add('active');
        chip.innerText = label;
        chip.onclick = () => {
            document.getElementById('ag-data').value = dateStr;
            document.querySelectorAll('#sugestoes-dias .suggestion-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            loadTimeSuggestions();
        };
        container.appendChild(chip);
    }
    
    // Tenta carregar horários para o dia atual automaticamente se houver profissional
    loadTimeSuggestions();
}

async function loadTimeSuggestions() {
    const doctorId = document.getElementById('ag-user').value;
    const dateStr = document.getElementById('ag-data').value;
    const container = document.getElementById('sugestoes-horas');
    const loader = document.getElementById('sugestao-loader');
    
    if (!doctorId || !dateStr || !container) {
        if(container) container.style.display = 'none';
        return;
    }
    
    container.style.display = 'flex';
    container.innerHTML = '';
    loader.style.display = 'block';
    
    try {
        const res = await fetch(`/api/availability?user_id=${doctorId}&date=${dateStr}`);
        const data = await res.json();
        
        loader.style.display = 'none';
        
        if (data.slots && data.slots.length > 0) {
            data.slots.forEach(time => {
                const chip = document.createElement('div');
                chip.className = 'suggestion-chip';
                chip.innerText = time;
                chip.onclick = () => {
                    document.getElementById('ag-hora').value = time;
                    document.querySelectorAll('#sugestoes-horas .suggestion-chip').forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                };
                container.appendChild(chip);
            });
        } else {
            container.innerHTML = '<span style="font-size: 0.8rem; color: var(--accent-danger);">Nenhum horário livre</span>';
        }
    } catch (e) {
        loader.style.display = 'none';
        container.innerHTML = '<span style="font-size: 0.8rem; color: var(--text-muted);">Erro ao carregar</span>';
    }
}

// Escutar mudanças nos selects nativos
document.addEventListener('DOMContentLoaded', () => {
    const agUser = document.getElementById('ag-user');
    const agData = document.getElementById('ag-data');
    if(agUser) agUser.addEventListener('change', loadTimeSuggestions);
    if(agData) agData.addEventListener('change', loadTimeSuggestions);
});

// === INTEGRAÇÃO COM A VERCEL (QUE FALA COM AMIGO APP) ===
function resetAgendamentoForm() {
    window.selectedPatientId = null;
    const idsToClear = [
        'ag-lead-id', 'ag-place', 'ag-user', 'ag-event', 'ag-event-search',
        'ag-patient-name', 'ag-patient-phone', 'ag-patient-email', 'ag-patient-born'
    ];
    idsToClear.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const confirmBtn = document.querySelector('#integrationActions .btn-save');
    if (confirmBtn) confirmBtn.innerText = "Agendar no Sistema";
}

function openAgendamentoModal(cardId) {
    const lead = leads.find(l => l.id === cardId);
    if (!lead) return;
    
    resetAgendamentoForm();
    
    draggedLead = lead; // Configura o lead ativo do Kanban
    
    document.getElementById('ag-lead-id').value = cardId;
    document.getElementById('ag-data').value = new Date().toISOString().split('T')[0]; // Hoje
    
    document.getElementById('directScheduleFields').style.display = 'none';
    
    renderDayChips(); // Iniciar sugestões
    
    document.getElementById('modalAgendamento').classList.add('active');
}

function openGridScheduleModal(doctorId, time) {
    resetAgendamentoForm();
    draggedLead = null; // Não há lead ativo, agendamento direto
    
    // Mostra os campos de nome/telefone
    document.getElementById('directScheduleFields').style.display = 'block';
    
    // Preenche a data, hora e profissional
    document.getElementById('ag-data').value = currentAgendaDate;
    document.getElementById('ag-hora').value = time;
    
    const docSelect = document.getElementById('ag-user');
    if (docSelect) docSelect.value = doctorId;
    
    renderDayChips(); // Iniciar sugestões
    
    document.getElementById('modalAgendamento').classList.add('active');
}

function closeAgendamentoModal() {
    document.getElementById('modalAgendamento').classList.remove('active');
}

function cancelAgendamento() {
    closeAgendamentoModal();
}

window.currentEditingAttendanceId = null;
window.currentEditingAttendance = null;

function openPatientDetailsModal(attId, event) {
    if (event) event.stopPropagation(); // Previne o clique na grid-cell por baixo
    
    if (!window.currentAgendaAttendances) return;
    
    const att = window.currentAgendaAttendances.find(a => String(a.id) === String(attId));
    if (!att) return;
    
    window.currentEditingAttendance = att;
    window.currentEditingAttendanceId = att.id;
    
    document.getElementById('pd-name').innerText = (att.patient && att.patient.name) ? att.patient.name : 'Desconhecido';
    
    let phone = '-';
    let waLink = '#';
    if (att.patient && att.patient.contact_cellphone) {
        phone = att.patient.contact_cellphone;
        // Clean non-digits
        const rawPhone = phone.replace(/\D/g, '');
        waLink = `https://wa.me/55${rawPhone}`;
        
        // Tenta formatar telefone BR se tiver 11 digitos
        if (phone.length === 11) {
            phone = `(${phone.substring(0,2)}) ${phone.substring(2,7)}-${phone.substring(7,11)}`;
        }
    }
    
    const phoneEl = document.getElementById('pd-phone');
    phoneEl.innerText = phone;
    if (phone !== '-') {
        phoneEl.href = waLink;
        phoneEl.target = "_blank";
        phoneEl.style.color = "var(--accent-success)";
        phoneEl.style.textDecoration = "none";
        phoneEl.innerHTML = `<i class="fa-brands fa-whatsapp"></i> ${phone}`;
    } else {
        phoneEl.removeAttribute('href');
        phoneEl.style.color = "inherit";
        phoneEl.innerHTML = phone;
    }
    
    document.getElementById('pd-service').innerText = (att.agenda_event && att.agenda_event.name) ? att.agenda_event.name : '-';
    document.getElementById('pd-doctor').innerText = (att.user && att.user.name) ? att.user.name : '-';
    document.getElementById('pd-obs').innerText = att.observation || 'Sem observações/origem';
    
    document.getElementById('modalPatientDetails').classList.add('active');
}

function closePatientDetailsModal() {
    document.getElementById('modalPatientDetails').classList.remove('active');
}

function openEditAgendamentoModal() {
    if (!window.currentEditingAttendance) return;
    
    closePatientDetailsModal();
    resetAgendamentoForm();
    
    const att = window.currentEditingAttendance;
    
    draggedLead = null;
    document.getElementById('ag-lead-id').value = '';
    document.getElementById('directScheduleFields').style.display = 'block';
    
    if(att.start_date) {
        try {
            const parts = att.start_date.split('T');
            if (parts.length === 2) {
                document.getElementById('ag-data').value = parts[0];
                document.getElementById('ag-hora').value = parts[1].substring(0,5);
            }
        } catch(e) {}
    }
    
    document.getElementById('ag-patient-name').value = (att.patient && att.patient.name) ? att.patient.name.replace(' [MKT]','') : '';
    document.getElementById('ag-patient-phone').value = (att.patient && att.patient.contact_cellphone) ? att.patient.contact_cellphone : '';
    
    const docSelect = document.getElementById('ag-user');
    if (docSelect && att.user) docSelect.value = att.user.id;
    
    const eventHidden = document.getElementById('ag-event');
    if (eventHidden && att.agenda_event) eventHidden.value = att.agenda_event.id;
    
    const eventSearch = document.getElementById('ag-event-search');
    if (eventSearch && att.agenda_event) eventSearch.value = att.agenda_event.name;
    
    const placeSelect = document.getElementById('ag-place');
    if (placeSelect && att.place) placeSelect.value = att.place.id;
    
    const confirmBtn = document.querySelector('#integrationActions .btn-save');
    if (confirmBtn) confirmBtn.innerText = "Atualizar no Amigo App";
    
    document.getElementById('modalAgendamento').classList.add('active');
}

async function confirmAgendamento() {
    const dataAg = document.getElementById('ag-data').value;
    const horaAg = document.getElementById('ag-hora').value;
    const placeId = document.getElementById('ag-place').value;
    const doctorId = document.getElementById('ag-user').value;
    const procedureId = document.getElementById('ag-event').value;
    
    if(!dataAg || !horaAg || !placeId || !doctorId || !procedureId) {
        alert("Preencha todos os campos do agendamento!");
        return;
    }
    
    let leadName = "";
    let leadPhone = "";
    let leadEmail = "";
    let patientBorn = "1990-01-01"; // Default exigido
    
    let fbClickId = '';
    
    if (draggedLead) {
        // Veio do Kanban
        leadName = draggedLead.nome;
        leadPhone = draggedLead.telefone;
        leadEmail = draggedLead.email || '';
        fbClickId = draggedLead.fb_click_id || '';
        if (draggedLead.born) patientBorn = draggedLead.born;
        if (draggedLead.nascimento) patientBorn = draggedLead.nascimento;
    } else {
        // Veio direto da grade
        leadName = document.getElementById('ag-patient-name').value;
        leadPhone = document.getElementById('ag-patient-phone').value;
        leadEmail = (document.getElementById('ag-patient-email') || {}).value || '';
        const bornVal = (document.getElementById('ag-patient-born') || {}).value || '';
        if (bornVal) patientBorn = bornVal;
        if (!leadName) {
            alert("Preencha o nome do paciente!");
            return;
        }
    }
    
    const selPlace = document.getElementById('ag-place');
    const placeName = selPlace.options[selPlace.selectedIndex]?.text || '';
    
    const procedureName = document.getElementById('ag-event-search').value || '';
    const valor1 = document.getElementById('ag-valor1').value || '0.00';
    const valor2 = document.getElementById('ag-valor2').value || '0.00';
    const statusPag = document.getElementById('ag-status-pag').value;
    const origemVal = document.getElementById('ag-origem').value;
    const agendadoPor = (typeof loggedUser !== 'undefined' && loggedUser && loggedUser.username) ? loggedUser.username : 'Desconhecido';

    const payload = {
        appointment_date: dataAg,
        appointment_time: horaAg,
        place_id: placeId,
        place_name: placeName,
        user_id: doctorId,
        event_id: procedureId,
        procedure_name: procedureName,
        patient_name: leadName,
        patient_phone: leadPhone,
        patient_email: leadEmail,
        patient_born: patientBorn,
        fb_click_id: fbClickId,
        valor_primario: valor1,
        valor_secundario: valor2,
        status_pagamento: statusPag,
        origem: origemVal,
        agendado_por: agendadoPor,
        attendance_id: window.currentEditingAttendanceId,
        patient_id: window.selectedPatientId
    };
    
    const loader = document.getElementById('integrationLoader');
    loader.classList.add('active');
    
    try {
        const response = await fetch('/api/agendar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || "Erro desconhecido na API do Amigo App");
        }
        
        alert("Agendamento criado com sucesso no Amigo App!");
        
        if (draggedLead) {
            draggedLead.column = 'col-agendado';
            renderBoard();
        } else {
            // Se foi direto da agenda, atualizar a grade
            renderAgendaGrid();
        }
        closePatientDetailsModal();
        closeAgendamentoModal();
        
        // Reseta o botão de confirmação e id
        const confirmBtn = document.querySelector('#integrationActions .btn-save');
        if (confirmBtn) confirmBtn.innerText = "Agendar no Sistema";
        window.currentEditingAttendanceId = null;
        window.currentEditingAttendance = null;
    } catch (error) {
        console.error("Erro ao agendar/atualizar:", error);
        alert(error.message);
    } finally {
        loader.classList.remove('active');
    }
}

function exportarCSVFinanceiro() {
    window.location.href = '/api/export-csv';
}

// === NAVEGAÇÃO DE ABAS ===
function switchTab(tabId) {
    if (tabId === 'historico') {
        if (!window.location.pathname.includes('historico.html')) {
            window.location.href = 'historico.html';
        }
        return;
    }
    
    if (window.location.pathname.includes('historico.html')) {
        window.location.href = 'index.html'; 
        return;
    }

    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // Ativa o botão da aba atual
    const btn = document.querySelector(`[onclick="switchTab('${tabId}')"]`);
    if(btn) btn.classList.add('active');
    
    // Se for uma sub-aba de relacionamento, manter o dropdown 'pai' ativo também
    if (['posvenda', 'faltantes', 'sumidos', 'aniversariantes'].includes(tabId)) {
        const mainRelBtn = document.getElementById('tab-relacionamento-main');
        if (mainRelBtn) mainRelBtn.classList.add('active');
    }
    
    document.getElementById('view-kanban').style.display = 'none';
    document.getElementById('view-agenda').style.display = 'none';
    
    ['posvenda', 'faltantes', 'sumidos', 'aniversariantes'].forEach(t => {
        const el = document.getElementById(`view-${t}`);
        if(el) el.style.display = 'none';
    });
    
    if(tabId === 'kanban') {
        document.getElementById('view-kanban').style.display = 'flex';
    } else if (tabId === 'agenda') {
        document.getElementById('view-agenda').style.display = 'flex';
        renderAgendaGrid();
    } else if (['posvenda', 'faltantes', 'sumidos', 'aniversariantes'].includes(tabId)) {
        const view = document.getElementById(`view-${tabId}`);
        if (view) {
            view.style.display = 'flex';
            if (tabId === 'aniversariantes') {
                fetchAniversariantesHoje();
                fetchAniversariantesMes();
            } else {
                fetchRelacionamento();
            }
        }
    }
}

// === RELACIONAMENTO (CRM ATIVO) ===
let relacionamentoFetched = false;

async function fetchRelacionamento() {
    if (relacionamentoFetched) return; // Só busca a primeira vez
    
    try {
        const res = await fetch('/api/relacionamento');
        if (!res.ok) throw new Error("Erro ao buscar dados de relacionamento");
        const data = await res.json();
        
        renderRelacionamentoList('posvenda', data.pos_venda, renderPosVendaCard);
        renderRelacionamentoList('faltantes', data.faltantes, renderFaltantesCard);
        renderRelacionamentoList('sumidos', data.sumidos, renderSumidosCard);
        
        relacionamentoFetched = true;
    } catch (e) {
        console.error(e);
        const errHtml = `<div style="color: var(--accent-danger); text-align: center; padding: 2rem;">Falha ao carregar dados.</div>`;
        document.getElementById('list-posvenda').innerHTML = errHtml;
        document.getElementById('list-faltantes').innerHTML = errHtml;
        document.getElementById('list-sumidos').innerHTML = errHtml;
    }
}

function renderRelacionamentoList(idSuffix, list, cardRenderer) {
    const countEl = document.getElementById(`count-${idSuffix}`);
    if (countEl) countEl.innerText = list.length;
    
    const container = document.getElementById(`list-${idSuffix}`);
    
    if (list.length === 0) {
        container.innerHTML = `<div style="color: var(--text-muted); text-align: center; grid-column: 1 / -1; margin-top: 2rem;">Nenhum paciente encontrado.</div>`;
        return;
    }
    
    container.innerHTML = list.map(item => cardRenderer(item)).join('');
}

function getWhatsAppLink(phone, name, type) {
    if (!phone) return '#';
    const raw = phone.replace(/\D/g, '');
    
    let text = "";
    if (name && type) {
        const firstName = name.split(" ")[0];
        if (type === 'pos_venda') {
            text = `Olá ${firstName}, tudo bem? Aqui é da Natuclinic! Vimos que você esteve conosco recentemente...`;
        } else if (type === 'faltantes') {
            text = `Olá ${firstName}! Sentimos sua falta na sua última consulta agendada na Natuclinic...`;
        } else if (type === 'sumidos') {
            text = `Olá ${firstName}, tudo bem? Faz um tempinho que não te vemos aqui na Natuclinic...`;
        } else if (type === 'aniversariante') {
            text = `Parabéns ${firstName}! 🎉 Que seu dia seja cheio de alegrias e muita saúde! Um grande abraço de toda a equipe Natuclinic!`;
        }
    }
    
    const url = `https://wa.me/55${raw}`;
    return text ? `${url}?text=${encodeURIComponent(text)}` : url;
}

function formatPhone(phone) {
    if (!phone) return '-';
    if (phone.length === 11) {
        return `(${phone.substring(0,2)}) ${phone.substring(2,7)}-${phone.substring(7,11)}`;
    }
    return phone;
}

function renderPosVendaCard(item) {
    const p = item.patient;
    const dateStr = item.last_attendance ? new Date(item.last_attendance.start_date).toLocaleDateString('pt-BR') : '-';
    const service = item.last_attendance?.agenda_event?.name || '-';
    
    return `
        <tr>
            <td style="font-weight: 500;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(59, 130, 246, 0.1); display: flex; align-items: center; justify-content: center; color: var(--accent-primary);">
                        <i class="fa-solid fa-user"></i>
                    </div>
                    ${p.name}
                </div>
            </td>
            <td>${formatPhone(p.phone)}</td>
            <td>${dateStr} <br><small style="color: var(--text-muted);">${service}</small></td>
            <td style="text-align: center;">
                ${item.contacted ? 
                    `<button disabled class="btn-secondary" style="width: 100%; justify-content: center; background: rgba(255, 255, 255, 0.05); color: var(--text-muted); cursor: not-allowed; border: none; padding: 0.5rem;">
                        <i class="fa-solid fa-check"></i> Já Contactado
                    </button>` : 
                    `<a href="${getWhatsAppLink(p.phone, p.name, 'pos_venda')}" onclick="registerMessageSent('${p.id}', 'pos_venda', this)" target="_blank" class="btn-secondary" style="width: 100%; justify-content: center; background: rgba(16, 185, 129, 0.15); color: var(--accent-success); border-color: rgba(16, 185, 129, 0.3); text-decoration: none; padding: 0.5rem;">
                        <i class="fa-brands fa-whatsapp"></i> Fazer Pós Venda
                    </a>`
                }
            </td>
        </tr>
    `;
}

function renderFaltantesCard(item) {
    const p = item.patient;
    const dateStr = item.last_attendance ? new Date(item.last_attendance.start_date).toLocaleDateString('pt-BR') : '-';
    const service = item.last_attendance?.agenda_event?.name || '-';
    
    return `
        <tr>
            <td style="font-weight: 500;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(59, 130, 246, 0.1); display: flex; align-items: center; justify-content: center; color: var(--accent-primary);">
                        <i class="fa-solid fa-user"></i>
                    </div>
                    ${p.name}
                </div>
            </td>
            <td>${formatPhone(p.phone)}</td>
            <td><span style="color: var(--accent-danger);"><i class="fa-solid fa-user-xmark"></i> Faltou: ${dateStr}</span> <br><small style="color: var(--text-muted);">${service}</small></td>
            <td style="text-align: center;">
                ${item.contacted ? 
                    `<button disabled class="btn-secondary" style="width: 100%; justify-content: center; background: rgba(255, 255, 255, 0.05); color: var(--text-muted); cursor: not-allowed; border: none; padding: 0.5rem;">
                        <i class="fa-solid fa-check"></i> Já Contactado
                    </button>` : 
                    `<a href="${getWhatsAppLink(p.phone, p.name, 'faltantes')}" onclick="registerMessageSent('${p.id}', 'faltantes', this)" target="_blank" class="btn-secondary" style="width: 100%; justify-content: center; background: rgba(16, 185, 129, 0.15); color: var(--accent-success); border-color: rgba(16, 185, 129, 0.3); text-decoration: none; padding: 0.5rem;">
                        <i class="fa-brands fa-whatsapp"></i> Reagendar Consulta
                    </a>`
                }
            </td>
        </tr>
    `;
}

function renderSumidosCard(item) {
    const p = item.patient;
    const dateStr = item.last_attendance ? new Date(item.last_attendance.start_date).toLocaleDateString('pt-BR') : '-';
    const service = item.last_attendance?.agenda_event?.name || '-';
    
    return `
        <tr>
            <td style="font-weight: 500;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(59, 130, 246, 0.1); display: flex; align-items: center; justify-content: center; color: var(--accent-primary);">
                        <i class="fa-solid fa-user"></i>
                    </div>
                    ${p.name}
                </div>
            </td>
            <td>${formatPhone(p.phone)}</td>
            <td><span style="color: var(--accent-warning);"><i class="fa-solid fa-clock-rotate-left"></i> Sumido há ${item.days_absent || '-'} dias</span> <br><small style="color: var(--text-muted);">Último: ${dateStr}</small></td>
            <td style="text-align: center;">
                ${item.contacted ? 
                    `<button disabled class="btn-secondary" style="width: 100%; justify-content: center; background: rgba(255, 255, 255, 0.05); color: var(--text-muted); cursor: not-allowed; border: none; padding: 0.5rem;">
                        <i class="fa-solid fa-check"></i> Já Contactado
                    </button>` : 
                    `<a href="${getWhatsAppLink(p.phone, p.name, 'sumidos')}" onclick="registerMessageSent('${p.id}', 'sumidos', this)" target="_blank" class="btn-secondary" style="width: 100%; justify-content: center; background: rgba(16, 185, 129, 0.15); color: var(--accent-success); border-color: rgba(16, 185, 129, 0.3); text-decoration: none; padding: 0.5rem;">
                        <i class="fa-brands fa-whatsapp"></i> Tentar Resgate
                    </a>`
                }
            </td>
        </tr>
    `;
}

// === ENVIO DE MENSAGENS (CLOUDFLARE D1) ===
function registerMessageSent(pacienteId, tipo, el) {
    // Muda a UI imediatamente para não enviar duas vezes enquanto a api pensa
    if(el) {
        el.outerHTML = `<button disabled class="btn-secondary" style="width: 100%; justify-content: center; background: rgba(16, 185, 129, 0.15); color: var(--accent-success); border: 1px solid rgba(16, 185, 129, 0.3); opacity: 0.6; cursor: not-allowed; padding: 0.5rem; text-decoration: none;">
                    <i class="fa-solid fa-check"></i> Enviado
                </button>`;
    }
    
    fetch('/api/mensagens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paciente_id: pacienteId, tipo: tipo })
    }).catch(e => console.error("Erro ao registrar envio:", e));
}

// === AGENDA (GRID VIEW) ===
let currentAgendaDateObj = new Date();
let currentAgendaDate = currentAgendaDateObj.toISOString().split('T')[0]; // Hoje

function formatTime(dateObj) {
    const hh = String(dateObj.getHours()).padStart(2, '0');
    const mm = String(dateObj.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

// === GESTÃO DE ACESSOS (ADMIN) ===
async function openUsuariosModal() {
    if (loggedUser.role !== 'admin') return;
    document.getElementById('modalUsuarios').classList.add('active');
    await loadUsers();
}

async function loadUsers() {
    const tbody = document.getElementById('usuarios-tbody');
    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 1rem;"><i class="fa-solid fa-spinner spin"></i> Carregando...</td></tr>';
    
    try {
        const res = await fetch('/api/users');
        const users = await res.json();
        
        tbody.innerHTML = '';
        users.forEach(u => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--border-color)';
            tr.innerHTML = `
                <td style="padding: 0.75rem 1rem; color: var(--text-main); font-weight: 500;">${u.username}</td>
                <td style="padding: 0.75rem 1rem;">
                    <span style="background: ${u.role === 'admin' ? 'var(--accent-warning)' : 'var(--accent-primary)'}; color: ${u.role === 'admin' ? '#000' : '#fff'}; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">
                        ${u.role}
                    </span>
                </td>
                <td style="padding: 0.75rem 1rem; text-align: right;">
                    ${u.username !== 'admin' ? `<button class="btn-cancel" onclick="deleteUser('${u.username}')" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;"><i class="fa-solid fa-trash"></i></button>` : ''}
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: red;">Erro ao carregar usuários</td></tr>`;
    }
}

async function createUser() {
    const username = document.getElementById('nu-user').value.trim();
    const password = document.getElementById('nu-pass').value.trim();
    const role = document.getElementById('nu-role').value;
    
    if (!username || !password) return alert('Preencha usuário e senha!');
    
    try {
        const res = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role })
        });
        
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        document.getElementById('nu-user').value = '';
        document.getElementById('nu-pass').value = '';
        loadUsers();
    } catch (e) {
        alert(e.message);
    }
}

async function deleteUser(username) {
    if (!confirm(`Tem certeza que deseja excluir o acesso de ${username}?`)) return;
    try {
        const res = await fetch(`/api/users/${username}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        loadUsers();
    } catch (e) {
        alert(e.message);
    }
}

function updateAgendaDateDisplay() {
    const weekdays = ['Domingo', 'Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'Sábado'];
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    const w = weekdays[currentAgendaDateObj.getDay()];
    const d = currentAgendaDateObj.getDate().toString().padStart(2, '0');
    const m = months[currentAgendaDateObj.getMonth()];
    const y = currentAgendaDateObj.getFullYear();
    
    const text = `${w}, ${d} ${m} ${y}`;
    const displayEl = document.getElementById('agenda-date-display');
    if(displayEl) displayEl.innerText = text;
}

function pesquisarPacienteDropdown(term) {
    const dropdown = document.getElementById('agenda-search-dropdown');
    const termLower = term.toLowerCase().trim();
    
    // Limpa destaque antigo
    document.querySelectorAll('.agenda-block').forEach(block => {
        block.style.opacity = '1';
        block.style.boxShadow = '';
        block.style.zIndex = '1';
    });

    if (termLower === "") {
        dropdown.style.display = 'none';
        return;
    }
    
    if (!window.currentAgendaAttendances || window.currentAgendaAttendances.length === 0) {
        dropdown.innerHTML = `<div style="padding: 0.8rem; color: var(--text-muted); font-size: 0.9rem; text-align: center;">Nenhum agendamento carregado.</div>`;
        dropdown.style.display = 'block';
        return;
    }

    // 1. Filtra agendamentos atuais pelo nome do paciente
    let resultados = (window.currentAgendaAttendances || []).filter(att => {
        if (!att.patient || !att.patient.name) return false;
        return att.patient.name.toLowerCase().includes(termLower);
    });

    // 2. Filtra também nos pacientes do Kanban (Leads)
    const leadsFiltrados = (window.leads || []).filter(lead => {
        if (!lead.nome) return false;
        return lead.nome.toLowerCase().includes(termLower);
    });

    // Remove duplicatas usando o nome como chave para unificar agenda e leads
    const unicos = [];
    const mapNomes = new Set();
    
    // Processa Agenda
    for (const res of resultados) {
        const nome = res.patient.name.trim().toLowerCase();
        if (!mapNomes.has(nome)) {
            mapNomes.add(nome);
            unicos.push({
                id: res.id,
                name: res.patient.name,
                phone: res.patient.phone || res.patient.cellphone || '',
                source: 'agenda'
            });
        }
    }
    
    // Processa Leads (Kanban)
    for (const lead of leadsFiltrados) {
        const nome = lead.nome.trim().toLowerCase();
        if (!mapNomes.has(nome)) {
            mapNomes.add(nome);
            unicos.push({
                id: lead.id,
                name: lead.nome,
                phone: lead.telefone || '',
                source: 'kanban'
            });
        }
    }

    if (unicos.length === 0) {
        dropdown.innerHTML = `<div style="padding: 0.8rem; color: var(--text-muted); font-size: 0.9rem; text-align: center;">Nenhum paciente encontrado.</div>`;
    } else {
        dropdown.innerHTML = unicos.map(item => {
            const badge = item.source === 'kanban' 
                ? '<span style="font-size: 0.7rem; background: var(--accent-warning); color: #000; padding: 0.1rem 0.3rem; border-radius: 4px; margin-left: 5px;">CRM</span>'
                : '<span style="font-size: 0.7rem; background: var(--accent-success); color: #fff; padding: 0.1rem 0.3rem; border-radius: 4px; margin-left: 5px;">Agenda</span>';
                
            return `
            <div class="ag-dropdown-item" style="display: flex; align-items: center; justify-content: space-between; padding: 0.8rem 1rem;" onclick="selecionarPacienteBusca('${item.id}', '${item.name}', '${item.source}')">
                <div>
                    <span style="font-weight: 500; color: var(--text-main);">${item.name}</span>
                    ${badge}
                </div>
                <span style="font-size: 0.75rem; background: rgba(255,255,255,0.1); padding: 0.2rem 0.4rem; border-radius: 4px; color: var(--text-muted);">${item.phone || '-'}</span>
            </div>
            `;
        }).join('');
    }
    dropdown.style.display = 'block';
}

function selecionarPacienteBusca(attId, patientName) {
    const input = document.getElementById('agenda-search-input');
    const dropdown = document.getElementById('agenda-search-dropdown');
    input.value = patientName;
    dropdown.style.display = 'none';
    
    // Agora destaca no calendário todos os agendamentos desse paciente
    const termLower = patientName.toLowerCase().trim();
    document.querySelectorAll('.agenda-block').forEach(block => {
        const text = block.innerText.toLowerCase();
        if (text.includes(termLower)) {
            block.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.8)'; // verde destaque
            block.style.zIndex = '10';
            block.style.opacity = '1';
        } else {
            block.style.opacity = '0.2';
            block.style.boxShadow = '';
            block.style.zIndex = '1';
        }
    });
}

// Fechar dropdown da agenda ao clicar fora
document.addEventListener('click', (e) => {
    const drop = document.getElementById('agenda-search-dropdown');
    const input = document.getElementById('agenda-search-input');
    if (drop && input && !input.contains(e.target) && !drop.contains(e.target)) {
        drop.style.display = 'none';
    }
});

function resetAgendaDate() {
    currentAgendaDateObj = new Date();
    // Ajuste fuso horário
    const offset = currentAgendaDateObj.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(currentAgendaDateObj - offset)).toISOString().slice(0, -1);
    currentAgendaDate = localISOTime.split('T')[0];
    
    updateAgendaDateDisplay();
    renderAgendaGrid();
}

function changeAgendaDate(days) {
    currentAgendaDateObj.setDate(currentAgendaDateObj.getDate() + days);
    // Para evitar problemas de fuso, criamos a string YYYY-MM-DD ajustada pelo fuso local
    const offset = currentAgendaDateObj.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(currentAgendaDateObj - offset)).toISOString().slice(0, -1);
    currentAgendaDate = localISOTime.split('T')[0];
    
    updateAgendaDateDisplay();
    renderAgendaGrid();
}

function jumpToDate(dateString) {
    if (!dateString) return;
    const [year, month, day] = dateString.split('-');
    // Month in Date is 0-indexed
    currentAgendaDateObj = new Date(year, month - 1, day);
    
    const offset = currentAgendaDateObj.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(currentAgendaDateObj - offset)).toISOString().slice(0, -1);
    currentAgendaDate = localISOTime.split('T')[0];
    
    updateAgendaDateDisplay();
    renderAgendaGrid();
}

async function renderAgendaGrid() {
    const gridLayout = document.getElementById('agenda-grid-layout');
    const gridBody = document.getElementById('agenda-grid-body');
    const loader = document.querySelector('.agenda-loader');
    
    if (loader) loader.style.display = 'flex';
    gridBody.innerHTML = '';
    
    // Remover cabeçalhos antigos (se houver), mantendo apenas o grid-body
    Array.from(gridLayout.children).forEach(child => {
        if (child.id !== 'agenda-grid-body') child.remove();
    });
    
    try {
        const response = await fetch(`/api/agenda?start_date=${currentAgendaDate}`);
        const result = await response.json();
        
        if (!response.ok) throw new Error(result.error || "Erro ao buscar API");
        
        const attendances = result.data || [];
        window.currentAgendaAttendances = attendances; // Store globally for the modal
        
        // 1. Processar Profissionais (Colunas)
        let doctorsMap = new Map();
        if (apiOptions.doctors && apiOptions.doctors.length > 0) {
            apiOptions.doctors.forEach(doc => doctorsMap.set(doc.id, { id: doc.id, name: doc.name }));
        }

        // Adicionar qualquer profissional que esteja nos agendamentos mas não veio na lista de doctors
        attendances.forEach(att => {
            if (att.user && att.user.id && !doctorsMap.has(att.user.id)) {
                doctorsMap.set(att.user.id, { id: att.user.id, name: att.user.name });
            }
        });

        let doctors = Array.from(doctorsMap.values());
        
        // Ordenar alfabeticamente para manter a ordem das colunas consistente
        doctors.sort((a, b) => a.name.localeCompare(b.name));

        if (doctors.length === 0) {
            doctors = [{ id: 0, name: 'Carregando / Sem Profissionais' }];
        }
        
        // 2. Ajustar CSS Grid Dinâmico
        gridLayout.style.setProperty('--col-count', doctors.length);
        
        // 3. Renderizar Cabeçalhos das Colunas
        gridLayout.insertAdjacentHTML('afterbegin', `<div class="grid-col-header time-col-header">Horário</div>`);
        doctors.forEach(doc => {
            gridLayout.insertAdjacentHTML('beforeend', `<div class="grid-col-header">${doc.name}</div>`);
        });
        
        // O Grid Body precisa ficar DEPOIS dos headers
        gridLayout.appendChild(gridBody);
        
        // 4. Gerar Grade Base (08:00 até 18:00, a cada 20 min)
        const times = [];
        for(let h=8; h<=18; h++) {
            for(let m=0; m<60; m+=20) {
                if (h === 18 && m > 0) continue;
                times.push(`${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`);
            }
        }
        
        times.forEach((time, index) => {
            const row = index + 2; 
            gridBody.insertAdjacentHTML('beforeend', `<div class="time-slot" style="grid-column: 1; grid-row: ${row};">${time}</div>`);
            
            for(let c=2; c<=doctors.length+1; c++) {
                const docId = doctors[c-2].id;
                gridBody.insertAdjacentHTML('beforeend', `<div class="grid-cell clickable-cell" onclick="openGridScheduleModal('${docId}', '${time}')" style="grid-column: ${c}; grid-row: ${row};"></div>`);
            }
        });
        
        // 5. Agrupar Agendamentos por Doutor para tratar colisões (overlap)
        const attendancesByDoc = {};
        doctors.forEach(d => attendancesByDoc[d.id] = []);
        
        attendances.forEach(att => {
            if (!att.start_date) return;
            if (att.user && att.user.id && attendancesByDoc[att.user.id] !== undefined) {
                attendancesByDoc[att.user.id].push(att);
            }
        });
        
        // Processar os blocos de cada doutor
        for (const docId of Object.keys(attendancesByDoc)) {
            const docAtts = attendancesByDoc[docId];
            
            // Ordenar por hora de início. Se houver empate, o de MAIOR duração vem primeiro.
            docAtts.sort((a, b) => {
                const startDiff = new Date(a.start_date) - new Date(b.start_date);
                if (startDiff !== 0) return startDiff;
                
                const endA = a.end_date ? new Date(a.end_date).getTime() : new Date(a.start_date).getTime() + 60*60*1000;
                const endB = b.end_date ? new Date(b.end_date).getTime() : new Date(b.start_date).getTime() + 60*60*1000;
                const durA = endA - new Date(a.start_date).getTime();
                const durB = endB - new Date(b.start_date).getTime();
                
                return durB - durA; // Duração decrescente
            });
            
            // Identificar grupos de colisões
            let currentGroup = [];
            let maxEndInGroup = 0;
            const groups = [];
            
            docAtts.forEach(att => {
                const start = new Date(att.start_date).getTime();
                const end = att.end_date ? new Date(att.end_date).getTime() : start + 60*60*1000;
                
                if (currentGroup.length === 0) {
                    currentGroup.push(att);
                    maxEndInGroup = end;
                } else {
                    // Se o inicio deste evento for menor que o maior fim do grupo, colide!
                    if (start < maxEndInGroup) {
                        currentGroup.push(att);
                        if (end > maxEndInGroup) maxEndInGroup = end;
                    } else {
                        groups.push(currentGroup);
                        currentGroup = [att];
                        maxEndInGroup = end;
                    }
                }
            });
            if (currentGroup.length > 0) groups.push(currentGroup);
            
            // Renderizar cada grupo calculando o width e margin-left
            groups.forEach(group => {
                const totalSimultaneous = group.length;
                
                group.forEach((att, index) => {
                    const startDate = new Date(att.start_date);
                    const endDate = att.end_date ? new Date(att.end_date) : new Date(startDate.getTime() + 60*60*1000);
                    
                    const startHour = startDate.getUTCHours();
                    const startMin = startDate.getUTCMinutes();
                    const endHour = endDate.getUTCHours();
                    const endMin = endDate.getUTCMinutes();
                    
                    let rowStart = Math.floor((startHour - 8) * 3 + (startMin / 20) + 2);
                    let rowEnd = Math.floor((endHour - 8) * 3 + (endMin / 20) + 2);
                    
                    if (rowStart < 2) rowStart = 2;
                    if (rowEnd <= rowStart) rowEnd = rowStart + 1;
                    
                    const col = doctors.findIndex(d => String(d.id) === String(docId)) + 2;
                    
                    let blockClass = 'block-enfermagem';
                    if (att.user?.name?.toLowerCase().includes('estética')) blockClass = 'block-estetica';
                    if (att.agenda_event?.name?.toLowerCase().includes('bloqueio')) blockClass = 'block-bloqueado';
                    
                    const title = att.agenda_event ? att.agenda_event.name : 'Procedimento';
                    const subtitle = att.patient ? att.patient.name : 'Sem nome';
                    const startTimeStr = `${startHour.toString().padStart(2,'0')}:${startMin.toString().padStart(2,'0')}`;
                    const endTimeStr = `${endHour.toString().padStart(2,'0')}:${endMin.toString().padStart(2,'0')}`;
                    const timeText = `${startTimeStr} - ${endTimeStr}`;
                    
                    let statusIcon = '<i class="fa-regular fa-clock" title="Agendado"></i>';
                    let extraStyles = '';
                    
                    if (att.canceled || att.status === 'canceled') {
                        statusIcon = '<i class="fa-solid fa-ban" style="color: #ef4444;" title="Cancelado"></i>';
                        extraStyles = 'opacity: 0.5; text-decoration: line-through; border: 1px solid #ef4444;';
                    } else if (att.missed) {
                        statusIcon = '<i class="fa-solid fa-user-xmark" style="color: #f97316;" title="Faltou"></i>';
                        extraStyles = 'opacity: 0.6;';
                    } else if (att.done || att.status === 'done') {
                        statusIcon = '<i class="fa-solid fa-check-double" style="color: #10b981;" title="Finalizado"></i>';
                    } else if (att.arrived || att.in_attendance || att.status === 'arrived' || att.status === 'in_attendance') {
                        statusIcon = '<i class="fa-solid fa-user-clock" style="color: #3b82f6;" title="Na Clínica"></i>';
                    } else if (att.confirmed_at || att.status === 'confirmed') {
                        statusIcon = '<i class="fa-solid fa-check" style="color: #10b981;" title="Confirmado"></i>';
                    }
                    
                    // Lógica de colisão estilo Amigo App (Zigue-Zague)
                    let leftPct = 2;
                    let widthPct = 96;
                    
                    if (totalSimultaneous > 1) {
                        const isEven = index % 2 === 0;
                        leftPct = isEven ? 2 : 20; // Alterna margem
                        widthPct = 78; // Reduz a largura para caber no zigue-zague
                    }
                    
                    const zIndex = 10 + index;
                    
                    const inlineStyle = `grid-column: ${col}; grid-row: ${rowStart} / ${rowEnd}; width: calc(${widthPct}% - 4px); margin-left: ${leftPct}%; z-index: ${zIndex}; box-shadow: 1px 2px 6px rgba(0,0,0,0.15); ${extraStyles}`;
                    
                    const html = `
                        <div class="agenda-block ${blockClass}" style="${inlineStyle}" title="${title} - ${subtitle}" onclick="openPatientDetailsModal('${att.id}', event)">
                            <strong>${statusIcon} ${timeText} | ${title}</strong>
                            ${subtitle}
                        </div>
                    `;
                    gridBody.insertAdjacentHTML('beforeend', html);
                });
            });
        }
        
        // Reaplicar filtro caso haja texto na busca
        const searchInput = document.getElementById('agenda-search-input');
        if (searchInput && searchInput.value) {
            filterAgenda(searchInput.value);
        }

        // 6. Linha do Tempo Atual (se for o dia de hoje)
        const todayForLine = new Date();
        if (currentAgendaDateObj.toDateString() === todayForLine.toDateString()) {
            const h = todayForLine.getHours();
            const m = todayForLine.getMinutes();
            if (h >= 8 && h < 18) {
                const totalMinutes = (h - 8) * 60 + m;
                const rowStart = Math.floor((h - 8) * 3 + (m / 20) + 2);
                const remainderMin = totalMinutes % 20;
                const topPct = (remainderMin / 20) * 100;
                
                const lineHtml = `
                    <div id="timeline-indicator" style="grid-row: ${rowStart}; grid-column: 1 / -1; position: relative; pointer-events: none; z-index: 50;">
                        <div style="position: absolute; top: ${topPct}%; left: 0; right: 0; border-top: 1.5px solid #ef4444; box-shadow: 0 0 4px rgba(239, 68, 68, 0.4);"></div>
                        <div style="position: absolute; top: ${topPct}%; left: 0; transform: translateY(-50%); width: 0; height: 0; border-top: 5px solid transparent; border-bottom: 5px solid transparent; border-left: 6px solid #ef4444;"></div>
                    </div>
                `;
                gridBody.insertAdjacentHTML('beforeend', lineHtml);
            }
        }
        
    } catch (e) {
        console.error("Erro na Grade:", e);
        alert("Erro ao buscar a agenda: " + e.message);
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

// === AUTO REFRESH DA AGENDA ===
setInterval(() => {
    // Só atualiza se a aba da agenda estiver visível
    const agendaView = document.getElementById('view-agenda');
    if (agendaView && agendaView.style.display !== 'none') {
        renderAgendaGrid();
    }
}, 60000); // A cada 60 segundos

// Init
renderBoard();

// ============================================
// LÓGICA DE ANIVERSARIANTES (DUPLA: API + CSV)
// ============================================
let aniversariantesHojeData = [];
let aniversariantesMesData = [];
let aniversariantesHojeFetched = false;
let aniversariantesMesFetched = false;

async function fetchAniversariantesHoje() {
    if (aniversariantesHojeFetched) return;
    try {
        const res = await fetch('/api/aniversariantes');
        if (!res.ok) throw new Error("Erro API Oficial");
        const data = await res.json();
        
        aniversariantesHojeData = data.aniversariantes || [];
        renderAniversariantesHoje();
        aniversariantesHojeFetched = true;
    } catch (e) {
        console.error(e);
        document.getElementById('list-aniversariantes-hoje').innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 2rem; color: var(--accent-danger);">Não foi possível carregar os dados da API oficial.</td></tr>`;
    }
}

async function fetchAniversariantesMes() {
    if (aniversariantesMesFetched) return;
    try {
        const res = await fetch('/api/aniversariantes/month');
        if (!res.ok) throw new Error("Erro CSV Local");
        const data = await res.json();
        
        aniversariantesMesData = data.aniversariantes || [];
        renderAniversariantesMes();
        aniversariantesMesFetched = true;
    } catch (e) {
        console.error(e);
        document.getElementById('list-aniversariantes-mes').innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 2rem; color: var(--accent-danger);">Não foi possível carregar a planilha local.</td></tr>`;
    }
}

function renderAniversariantesHoje() {
    const list = document.getElementById('list-aniversariantes-hoje');
    if (!list) return;

    if (aniversariantesHojeData.length === 0) {
        list.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: var(--text-muted);">Nenhum aniversariante encontrado hoje pela API.</td></tr>';
        document.getElementById('count-aniversariantes-hoje').innerText = '0';
        return;
    }
    
    document.getElementById('count-aniversariantes-hoje').innerText = aniversariantesHojeData.length;

    list.innerHTML = aniversariantesHojeData.map(p => {
        return `
            <tr style="background: rgba(245, 158, 11, 0.1); border-left: 3px solid var(--accent-warning);">
                <td style="font-weight: 500;">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(245, 158, 11, 0.1); display: flex; align-items: center; justify-content: center; color: var(--accent-warning);">
                            <i class="fa-solid fa-gift"></i>
                        </div>
                        ${p.name}
                    </div>
                </td>
                <td>${formatPhone(p.phone)}</td>
                <td><span style="font-weight: 500;">${p.age} anos</span></td>
                <td style="text-align: center;">
                    <a href="${getWhatsAppLink(p.phone, p.name, 'aniversariante')}" target="_blank" class="btn-secondary" style="width: 100%; justify-content: center; background: rgba(16, 185, 129, 0.15); color: var(--accent-success); border-color: rgba(16, 185, 129, 0.3); text-decoration: none; padding: 0.5rem;">
                        <i class="fa-brands fa-whatsapp"></i> Parabéns
                    </a>
                </td>
            </tr>
        `;
    }).join('');
}

function renderAniversariantesMes() {
    const list = document.getElementById('list-aniversariantes-mes');
    if (!list) return;

    if (aniversariantesMesData.length === 0) {
        list.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: var(--text-muted);">Planilha vazia ou não importada.</td></tr>';
        document.getElementById('count-aniversariantes-mes').innerText = '0';
        return;
    }
    
    document.getElementById('count-aniversariantes-mes').innerText = aniversariantesMesData.length;

    list.innerHTML = aniversariantesMesData.map(p => {
        const isTodayStyle = p.isToday ? 'background: rgba(16, 185, 129, 0.1); border-left: 3px solid var(--accent-success);' : '';
        const todayBadge = p.isToday ? '<span style="background: var(--accent-success); color: white; padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.7rem; margin-left: 0.5rem; font-weight: bold;">HOJE</span>' : '';
        
        return `
            <tr style="${isTodayStyle}">
                <td style="font-weight: 500;">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(245, 158, 11, 0.1); display: flex; align-items: center; justify-content: center; color: var(--accent-warning);">
                            <i class="fa-solid fa-gift"></i>
                        </div>
                        ${p.name}
                    </div>
                </td>
                <td>${formatPhone(p.phone)}</td>
                <td>${p.birthDate} ${todayBadge}</td>
                <td style="text-align: center;">
                    <a href="${getWhatsAppLink(p.phone, p.name, 'aniversariante')}" target="_blank" class="btn-secondary" style="width: 100%; justify-content: center; background: rgba(16, 185, 129, 0.15); color: var(--accent-success); border-color: rgba(16, 185, 129, 0.3); text-decoration: none; padding: 0.5rem;">
                        <i class="fa-brands fa-whatsapp"></i> Parabéns
                    </a>
                </td>
            </tr>
        `;
    }).join('');
}

async function uploadNovaPlanilha(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('csvFile', file);

    const btnLabel = event.target.previousElementSibling;
    const oldText = btnLabel.innerHTML;
    btnLabel.innerHTML = '<i class="fa-solid fa-circle-notch spin"></i> Salvando...';

    try {
        const res = await fetch('/api/aniversariantes/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await res.json();
        if (res.ok) {
            alert("Planilha atualizada com sucesso!");
            aniversariantesMesFetched = false;
            fetchAniversariantesMes();
        } else {
            alert("Erro ao salvar: " + (data.error || 'Desconhecido'));
        }
    } catch (e) {
        console.error(e);
        alert("Erro na comunicação com o servidor.");
    } finally {
        btnLabel.innerHTML = oldText;
        event.target.value = '';
    }
}


// === LOGIN E NOTIFICAÇÕES ===
async function performLogin() {
    const u = document.getElementById('login-username').value;
    const p = document.getElementById('login-password').value;
    const badge = document.getElementById('login-error-badge');
    const badgeText = document.getElementById('login-error-text');
    
    if (badge) badge.style.display = 'none';

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username: u, password: p})
        });
        
        let data = {};
        try { data = await res.json(); } catch(e) {}
        
        if (res.ok && data.success) {
            loggedUser = data.user;
            localStorage.setItem('crm_user', JSON.stringify(loggedUser));
            document.getElementById('login-overlay').classList.remove('active');
            
            if (loggedUser.role === 'admin' || loggedUser.username === 'admin') {
                document.getElementById('btn-gestao-acessos').style.display = 'flex';
            } else {
                document.getElementById('btn-gestao-acessos').style.display = 'none';
            }
            
            fetchLeadsFromServer();
            fetchApiOptions();
            startNotificationPolling();
        } else {
            if (badge) {
                badge.style.display = 'flex';
                badgeText.innerText = data.error || 'Erro interno de servidor. Tente novamente.';
            }
        }
    } catch(e) {
        if (badge) {
            badge.style.display = 'flex';
            badgeText.innerText = 'Falha de conexão com o servidor.';
        }
    }
}

let seenNotifications = new Set();
let unreadNotifications = 0;
let isFirstLoad = true;

function startNotificationPolling() {
    // Busca inicial rápida, depois a cada 10s
    if (isFirstLoad) {
        fetchNotifications(true); 
    } else {
        fetchNotifications(false);
    }
    
    setInterval(() => {
        fetchNotifications(false);
    }, 10000);
}

function logout() {
    localStorage.removeItem('crm_user');
    location.reload();
}

async function fetchNotifications() {
    try {
        const res = await fetch('/api/notifications');
        const data = await res.json();
        const listContainer = document.getElementById('notifications-list');
        
        // Os mais novos vêm primeiro (DESC no backend), vamos reverter pra mostrar em ordem pro user
        data.reverse().forEach(n => {
            if (!seenNotifications.has(n.id)) {
                seenNotifications.add(n.id);
                // Apenas preenchemos a lista (sem popup toast)
                
                // Remove o placeholder se existir
                if (listContainer && listContainer.innerHTML.includes('Nenhuma notificação')) {
                    listContainer.innerHTML = '';
                }
                
                // Adiciona na lista do menu
                if (listContainer) {
                    let timeStr = '';
                    if (n.created_at) {
                        if (n.created_at.includes('T')) timeStr = n.created_at.split('T')[1].slice(0,5);
                        else timeStr = n.created_at.split(' ')[1].slice(0,5);
                    }
                    
                    const item = document.createElement('div');
                    item.style = "padding: 0.75rem; border-radius: 6px; background: var(--bg-card); color: var(--text-main); font-size: 0.85rem; border-left: 4px solid var(--accent-success); margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem; box-shadow: 0 2px 4px rgba(0,0,0,0.05);";
                    item.innerHTML = `<i class="fa-solid fa-check-circle" style="color: var(--accent-success);"></i> <div><strong>${timeStr}</strong> - ${n.message}</div>`;
                    listContainer.prepend(item);
                }
                
                if (!isFirstLoad) {
                    unreadNotifications++;
                    const badge = document.getElementById('nav-notification-badge');
                    if (badge) {
                        badge.innerText = unreadNotifications;
                        badge.style.display = 'flex';
                    }
                }
            }
        });
        isFirstLoad = false;
    } catch(e) {}
}

function toggleNotificationsMenu() {
    const menu = document.getElementById('notifications-dropdown');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
}

function clearNotificationsBadge() {
    unreadNotifications = 0;
    const badge = document.getElementById('nav-notification-badge');
    if (badge) {
        badge.innerText = '0';
        badge.style.display = 'none';
    }
}

async function clearAllNotifications() {
    try {
        await fetch('/api/clear-notif', { method: 'POST' });
        const listContainer = document.getElementById('notifications-list');
        if (listContainer) {
            listContainer.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">Nenhuma notificação ainda.</div>';
        }
        seenNotifications.clear();
        clearNotificationsBadge();
    } catch(e) {}
}

// ==========================================
// RELATÓRIO MKT
// ==========================================
async function openMktReportModal() {
    const modal = document.getElementById('modalMktReport');
    const loader = document.getElementById('mkt-report-loader');
    const content = document.getElementById('mkt-report-content');
    const tbody = document.getElementById('mkt-report-tbody');
    const countDisplay = document.getElementById('mkt-total-count');

    if (!modal) return;
    modal.classList.add('active');

    // Reset view
    loader.style.display = 'flex';
    content.style.display = 'none';
    tbody.innerHTML = '';
    countDisplay.innerText = '0';

    try {
        const res = await fetch('/api/relatorio-mkt');
        const json = await res.json();

        if (json.success) {
            countDisplay.innerText = json.count;
            if (json.count === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Nenhum agendamento do MKT encontrado neste mês.</td></tr>';
            } else {
                tbody.innerHTML = json.data.map(item => {
                    let dStr = item.start_date;
                    try {
                        const parts = item.start_date.split('T');
                        const dateP = parts[0].split('-');
                        dStr = `${dateP[2]}/${dateP[1]}/${dateP[0]} ${parts[1].substring(0,5)}`;
                    } catch(e) {}

                    return `
                    <tr>
                        <td>${dStr}</td>
                        <td style="font-weight: 500;">${item.patient_name}</td>
                        <td>${item.patient_phone}</td>
                        <td><span style="background: rgba(99,102,241,0.1); color: var(--accent-primary); padding: 2px 6px; border-radius: 4px; font-size: 0.8rem;">${item.procedure}</span></td>
                    </tr>
                    `;
                }).join('');
            }
        } else {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--accent-danger); padding: 1.5rem;">Erro ao carregar os dados.</td></tr>';
        }
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--accent-danger); padding: 1.5rem;">Falha na conexão com o servidor.</td></tr>';
    } finally {
        loader.style.display = 'none';
        content.style.display = 'block';
    }
}

function closeMktReportModal() {
    const modal = document.getElementById('modalMktReport');
    if (modal) {
        modal.classList.remove('active');
    }
}
