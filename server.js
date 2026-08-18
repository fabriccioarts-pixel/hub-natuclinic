import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';
import crypto from 'crypto';

// Configura o dotenv para ler o arquivo .env
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Serve a pasta atual como arquivos estáticos (Frontend)
app.use(express.static(__dirname));

// Espelho da Rota Serverless para Listar Agenda (Local)
app.get('/api/agenda', async (req, res) => {
    const AMIGO_API_TOKEN = process.env.AMIGO_API_TOKEN;
    if (!AMIGO_API_TOKEN) return res.status(500).json({ error: 'Token não configurado' });

    // Pegar as datas da query ou usar a data de hoje como fallback
    const today = new Date().toISOString().split('T')[0];
    const startDate = req.query.start_date || today;
    const endDate = req.query.end_date || startDate;

    const url = `https://amigobot-api.amigoapp.com.br/attendances?start_date=${startDate}&end_date=${endDate}&status=ALL`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${AMIGO_API_TOKEN}` }
        });
        
        let realData = [];
        try { realData = await response.json(); } catch(e) {}
        
        if (!response.ok) {
            throw new Error(realData.message || 'Erro ao consultar Amigo App');
        }
        
        res.status(200).json({ data: realData.data || realData });
    } catch (error) {
        res.status(500).json({ error: 'Erro interno', details: error.message });
    }
});

// ==========================================
// BANCO DE DADOS (CLOUDFLARE D1)
// ==========================================

async function queryD1(sql, params = []) {
    const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_D1_DATABASE_ID } = process.env;
    
    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN || !CLOUDFLARE_D1_DATABASE_ID) {
        throw new Error("Chaves da Cloudflare não configuradas no .env");
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database/${CLOUDFLARE_D1_DATABASE_ID}/query`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sql, params })
    });

    const data = await response.json();
    if (!data.success) {
        throw new Error(data.errors?.[0]?.message || 'Erro na Cloudflare D1');
    }
    
    return data.result[0].results || [];
}

// ==========================================
// BUSCA DE PACIENTES POR NOME (Ao Vivo)
// ==========================================

app.get('/api/buscar-paciente', async (req, res) => {
    const { nome } = req.query;
    if (!nome || nome.trim().length < 2) {
        return res.json({ pacientes: [] });
    }

    const AMIGO_API_TOKEN = process.env.AMIGO_API_TOKEN;
    if (!AMIGO_API_TOKEN) return res.status(500).json({ error: 'Token não configurado' });

    const headers = { 'Authorization': `Bearer ${AMIGO_API_TOKEN}` };
    const nomeLower = nome.trim().toLowerCase();

    // Monta as janelas de busca: últimos 6 meses em blocos de 30 dias (em paralelo)
    const hoje = new Date();
    const janelas = [];
    for (let i = 0; i < 6; i++) {
        const fim = new Date(hoje);
        fim.setMonth(hoje.getMonth() - i);
        const inicio = new Date(fim);
        inicio.setDate(1);
        janelas.push({
            start: inicio.toISOString().split('T')[0],
            end: fim.toISOString().split('T')[0]
        });
    }

    try {
        // Busca todos os meses em paralelo para ser rápido
        const respostas = await Promise.all(
            janelas.map(j =>
                fetch(`https://amigobot-api.amigoapp.com.br/attendances?start_date=${j.start}&end_date=${j.end}&status=ALL`, { headers })
                    .then(r => r.json())
                    .catch(() => ({ data: [] }))
            )
        );

        // Extrai e filtra pacientes pelo nome pesquisado
        const vistos = new Set();
        const pacientes = [];

        for (const resp of respostas) {
            for (const att of (resp.data || [])) {
                if (!att.patient || !att.patient.name) continue;
                const id = att.patient.id;
                if (vistos.has(id)) continue;
                if (!att.patient.name.toLowerCase().includes(nomeLower)) continue;
                vistos.add(id);
                pacientes.push({
                    id: att.patient.id,
                    nome: att.patient.name,
                    telefone: att.patient.cellphone || att.patient.contact_cellphone || '',
                    email: att.patient.email || '',
                    born: att.patient.born || att.patient.birthdate || ''
                });
            }
        }

        res.json({ pacientes });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Inicializar Tabelas
app.post('/api/init-db', async (req, res) => {
    try {
        await queryD1(`
            CREATE TABLE IF NOT EXISTS mensagens_enviadas (
                id TEXT PRIMARY KEY,
                paciente_id TEXT NOT NULL,
                tipo TEXT,
                data_envio DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Removed DROP TABLE IF EXISTS leads to prevent data loss
        
        await queryD1(`
            CREATE TABLE IF NOT EXISTS leads (
                id TEXT PRIMARY KEY,
                nome TEXT NOT NULL,
                telefone TEXT,
                origem TEXT,
                born TEXT,
                owner_id TEXT,
                column_id TEXT DEFAULT 'col-novos',
                fb_click_id TEXT,
                email TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Tentativa de adicionar as colunas caso a tabela já exista (ignora o erro se já existirem)
        try { await queryD1('ALTER TABLE leads ADD COLUMN fb_click_id TEXT'); } catch(e) {}
        try { await queryD1('ALTER TABLE leads ADD COLUMN email TEXT'); } catch(e) {}
        
        await queryD1(`
            CREATE TABLE IF NOT EXISTS crm_users (
                username TEXT PRIMARY KEY,
                password TEXT NOT NULL,
                role TEXT DEFAULT 'user'
            )
        `);
        
        await queryD1(`INSERT OR IGNORE INTO crm_users (username, password, role) VALUES ('admin', 'admin123', 'admin'), ('carol', 'carol123', 'user')`);
        
        await queryD1(`
            CREATE TABLE IF NOT EXISTS agendamentos_financeiro (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                data_agendamento TEXT,
                nome_paciente TEXT,
                procedimento TEXT,
                unidade TEXT,
                origem TEXT,
                valor_primario TEXT,
                valor_secundario TEXT,
                status_pagamento TEXT,
                agendado_por TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await queryD1(`
            CREATE TABLE IF NOT EXISTS crm_notifications (
                id TEXT PRIMARY KEY,
                message TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        res.json({ success: true, message: "Tabelas inicializadas com sucesso no D1" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Registrar que uma mensagem foi enviada
app.post('/api/mensagens', async (req, res) => {
    const { paciente_id, tipo } = req.body;
    const id = Date.now().toString();
    try {
        await queryD1(
            'INSERT INTO mensagens_enviadas (id, paciente_id, tipo) VALUES (?, ?, ?)', 
            [id, String(paciente_id), tipo]
        );
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// ==== ROTAS DE LOGIN ====
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const rows = await queryD1('SELECT * FROM crm_users WHERE username = ? AND password = ?', [username, password]);
        if (rows && rows.length > 0) {
            res.json({ success: true, user: { username: rows[0].username, role: rows[0].role } });
        } else {
            res.status(401).json({ error: 'Usuário ou senha inválidos' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==== ROTAS DE GESTÃO DE USUÁRIOS (ADMIN) ====
app.get('/api/users', async (req, res) => {
    try {
        const rows = await queryD1('SELECT username, role FROM crm_users ORDER BY username ASC');
        res.json(rows || []);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/users', async (req, res) => {
    const { username, password, role } = req.body;
    try {
        // Verifica se já existe
        const existing = await queryD1('SELECT username FROM crm_users WHERE username = ?', [username]);
        if (existing && existing.length > 0) {
            return res.status(400).json({ error: 'Usuário já existe' });
        }
        await queryD1('INSERT INTO crm_users (username, password, role) VALUES (?, ?, ?)', [username, password, role]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/users/:username', async (req, res) => {
    const { username } = req.params;
    if (username === 'admin') {
        return res.status(400).json({ error: 'Não é possível excluir o administrador principal' });
    }
    try {
        await queryD1('DELETE FROM crm_users WHERE username = ?', [username]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==== ROTAS DE NOTIFICAÇÕES ====
app.get('/api/notifications', async (req, res) => {
    try {
        const rows = await queryD1('SELECT * FROM crm_notifications ORDER BY created_at DESC LIMIT 50');
        res.json(rows || []);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/clear-notif', async (req, res) => {
    try {
        await queryD1('DELETE FROM crm_notifications');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==== ROTAS DO KANBAN (LEADS) ====

// Buscar todos os leads
app.get('/api/leads', async (req, res) => {
    const { owner_id } = req.query;
    try {
        let rows;
        if (owner_id && owner_id !== 'admin') {
            rows = await queryD1('SELECT * FROM leads WHERE owner_id = ? ORDER BY created_at ASC', [owner_id]);
        } else {
            rows = await queryD1('SELECT * FROM leads ORDER BY created_at ASC');
        }
        res.json(rows || []);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// FUNÇÃO DE ENVIO PARA META CAPI
// ==========================================
async function sendMetaCapiEvent(eventName, userData) {
    const { META_PIXEL_ID, META_ACCESS_TOKEN } = process.env;
    if (!META_PIXEL_ID || !META_ACCESS_TOKEN) return;

    try {
        const hashData = (data) => {
            if (!data) return undefined;
            const clean = data.trim().toLowerCase();
            return crypto.createHash('sha256').update(clean).digest('hex');
        };

        const phoneHash = hashData(userData.telefone ? userData.telefone.replace(/\D/g, '') : '');
        const emailHash = hashData(userData.email);

        const payload = {
            data: [{
                event_name: eventName,
                event_time: Math.floor(Date.now() / 1000),
                action_source: 'system_generated',
                user_data: {
                    ph: phoneHash ? [phoneHash] : undefined,
                    em: emailHash ? [emailHash] : undefined,
                    fbc: userData.fb_click_id ? `fb.1.${Date.now()}.${userData.fb_click_id}` : undefined,
                    client_user_agent: 'Sistema_Clinica_CRM/1.0'
                }
            }]
        };

        const url = `https://graph.facebook.com/v19.0/${META_PIXEL_ID}/events?access_token=${META_ACCESS_TOKEN}`;
        
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await res.json();
        if (!res.ok) {
            console.error(`Erro ao enviar evento ${eventName} para a Meta:`, result);
        } else {
            console.log(`Evento ${eventName} enviado para a Meta com sucesso!`);
        }
    } catch (err) {
        console.error("Exceção ao disparar Meta CAPI:", err);
    }
}

// Criar um novo lead
app.post('/api/leads', async (req, res) => {
    const { id, nome, telefone, origem, born, owner_id, column_id, fb_click_id, email } = req.body;
    try {
        await queryD1(
            'INSERT INTO leads (id, nome, telefone, origem, born, owner_id, column_id, fb_click_id, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, nome, telefone || '', origem || '', born || '', owner_id || null, column_id || 'col-novos', fb_click_id || '', email || '']
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Atualizar a coluna de um lead (arrastar e soltar)
app.put('/api/leads/:id', async (req, res) => {
    const { id } = req.params;
    const { column_id } = req.body;
    try {
        const leadRows = await queryD1('SELECT * FROM leads WHERE id = ?', [id]);
        const lead = leadRows && leadRows.length > 0 ? leadRows[0] : null;

        await queryD1(
            'UPDATE leads SET column_id = ? WHERE id = ?',
            [column_id, id]
        );

        if (column_id === 'col-atendimento' && lead) {
            sendMetaCapiEvent('Lead', lead);
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Nova Rota Local para buscar Opções Dinâmicas (Serviços, Médicos, Locais)
app.get('/api/options', async (req, res) => {
    const AMIGO_API_TOKEN = process.env.AMIGO_API_TOKEN;
    if (!AMIGO_API_TOKEN) return res.status(500).json({ error: 'Token ausente' });
    
    const headers = { 'Authorization': `Bearer ${AMIGO_API_TOKEN}` };
    
    try {
        // Fallback inteligente: Vamos buscar os agendamentos dos ultimos 30 dias até 30 dias pra frente
        // Para extrair os procedimentos que já foram usados, já que a API /events as vezes oculta.
        const today = new Date();
        const past = new Date(today); past.setDate(today.getDate() - 90);
        const future = new Date(today); future.setDate(today.getDate() + 90);
        
        const startPast = past.toISOString().split('T')[0];
        const endPast = today.toISOString().split('T')[0];
        
        const startFuture = today.toISOString().split('T')[0];
        const endFuture = future.toISOString().split('T')[0];
        
        const [placesRes, eventsRes, docsRes, attPastRes, attFutureRes, localProceduresRes] = await Promise.all([
            fetch('https://amigobot-api.amigoapp.com.br/places', { headers }),
            fetch('https://amigobot-api.amigoapp.com.br/events', { headers }),
            fetch('https://amigobot-api.amigoapp.com.br/doctors', { headers }),
            fetch(`https://amigobot-api.amigoapp.com.br/attendances?start_date=${startPast}&end_date=${endPast}&status=ALL`, { headers }),
            fetch(`https://amigobot-api.amigoapp.com.br/attendances?start_date=${startFuture}&end_date=${endFuture}&status=ALL`, { headers }),
            queryD1('SELECT DISTINCT procedimento FROM agendamentos_financeiro WHERE procedimento IS NOT NULL AND procedimento != ""')
        ]);
        
        const places = await placesRes.json();
        const eventsAPI = await eventsRes.json();
        const docs = await docsRes.json();
        const attPast = await attPastRes.json();
        const attFuture = await attFutureRes.json();
        
        const attendances = { data: [...(attPast.data || []), ...(attFuture.data || [])] };
        
        // Extraindo eventos da agenda
        const eventsMap = new Map();
        (eventsAPI.data || []).forEach(e => eventsMap.set(e.id, { id: e.id, name: e.name }));
        
        // Inserir os procedimentos registrados localmente no banco de dados
        (localProceduresRes || []).forEach(row => {
            if (row.procedimento) {
                // Usando o nome como chave para evitar duplicatas. O ID pode ser um timestamp fake pois não temos o ID real.
                const nameUpper = row.procedimento.trim().toUpperCase();
                let found = false;
                for (const [key, val] of eventsMap.entries()) {
                    if (val.name.trim().toUpperCase() === nameUpper) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    const fakeId = 9000000 + Math.floor(Math.random() * 100000);
                    eventsMap.set(fakeId, { id: fakeId, name: row.procedimento.trim() });
                }
            }
        });
        
        // Extraindo profissionais da agenda (para garantir que todos apareçam)
        const doctorsMap = new Map();
        (docs.data || []).forEach(d => doctorsMap.set(d.id, { id: d.id, name: d.name }));

        (attendances.data || []).forEach(att => {
            if (att.agenda_event && att.agenda_event.id) {
                if (!eventsMap.has(att.agenda_event.id)) {
                    eventsMap.set(att.agenda_event.id, { id: att.agenda_event.id, name: att.agenda_event.name });
                }
            }
            if (att.user && att.user.id) {
                if (!doctorsMap.has(att.user.id)) {
                    doctorsMap.set(att.user.id, { id: att.user.id, name: att.user.name });
                }
            }
        });
        
        res.status(200).json({
            places: places.data || [],
            events: Array.from(eventsMap.values()),
            doctors: Array.from(doctorsMap.values())
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro interno', details: error.message });
    }
});

// Rota para calcular horários livres
app.get('/api/availability', async (req, res) => {
    try {
        const { user_id, date } = req.query;
        if (!user_id || !date) return res.status(400).json({ error: "Faltam parâmetros" });
        
        const url = `https://amigobot-api.amigoapp.com.br/attendances?start_date=${date}&end_date=${date}&status=ALL&limit=100`;
        const response = await fetch(url, { headers: { 'Authorization': 'Bearer ' + process.env.AMIGO_API_TOKEN } });
        if (!response.ok) throw new Error("Erro na API Amigo");
        
        const j = await response.json();
        const allAttendances = j.data || [];
        // Filtramos pelo médico manualmente caso a query user_id da api falhe
        const attendances = allAttendances.filter(a => String(a.user?.id) === String(user_id));
        // Identificar se é sábado
        const dayOfWeek = new Date(date + 'T12:00:00Z').getUTCDay();
        const endHour = (dayOfWeek === 6) ? 12 : 18; // Sábado até 12h, dias normais até 18h
        
        const freeSlots = [];
        for (let h=8; h<endHour; h++) {
            for (let m=0; m<60; m+=30) {
                const hourStr = h.toString().padStart(2, '0');
                const minStr = m.toString().padStart(2, '0');
                const timeStr = `${hourStr}:${minStr}`;
                
                const slotTime = h * 60 + m;
                let isFree = true;
                
                for (let att of attendances) {
                    if (att.status === 'canceled' || att.status === 'rescheduled') continue;
                    
                    const dStart = new Date(att.start_date);
                    const dEnd = att.end_date ? new Date(att.end_date) : new Date(dStart.getTime() + 60*60*1000);
                    
                    const attStart = dStart.getUTCHours() * 60 + dStart.getUTCMinutes();
                    const attEnd = dEnd.getUTCHours() * 60 + dEnd.getUTCMinutes();
                    
                    if (slotTime >= attStart && slotTime < attEnd) {
                        isFree = false;
                        break;
                    }
                }
                if (isFree) freeSlots.push(timeStr);
            }
        }
        res.status(200).json({ slots: freeSlots });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// Espelho da Rota Serverless da Vercel para uso Local
app.post('/api/agendar', async (req, res) => {
    const AMIGO_API_TOKEN = process.env.AMIGO_API_TOKEN;
    
    if (!AMIGO_API_TOKEN) {
        return res.status(500).json({ error: 'Token não configurado no arquivo .env local.' });
    }
    
    const payload = req.body;
    
    // Convertendo os dados do CRM para o formato estrito do Amigo App
        const rawPhone = payload.patient_phone || payload.phone || '';
        
        let nameParts = (payload.patient_name || '').trim().split(' ');
        let firstName = nameParts[0] || 'Desconhecido';
        
        // Se já existe (patient_id presente), não adiciona a tag [MKT] para não sujar o cadastro
        let lastName = '';
        if (payload.patient_id) {
            lastName = nameParts.slice(1).join(' ');
        } else {
            lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') + ' [MKT]' : '[MKT]';
        }

        const amigoPayload = {
            start_date: `${payload.appointment_date} ${payload.appointment_time}`,
            place_id: parseInt(payload.place_id) || 32337,
            event_id: parseInt(payload.event_id) || 176910,
            user_id: parseInt(payload.user_id) || 102962,
            observation: "Origem: CRM de Vendas/Marketing",
            patient: {
                name: firstName,
                last_name: lastName,
                cellphone: rawPhone.replace(/\D/g, ''),
                contact_cellphone: rawPhone.replace(/\D/g, ''),
                phone: rawPhone.replace(/\D/g, ''),
                born: payload.patient_born || "1990-01-01",
                email: payload.patient_email || ''
            }
        };
        
        if (payload.patient_id) {
            amigoPayload.patient.id = parseInt(payload.patient_id);
        }
    
    try {
        const endpoint = payload.attendance_id 
            ? `https://amigobot-api.amigoapp.com.br/attendances/${payload.attendance_id}`
            : 'https://amigobot-api.amigoapp.com.br/attendances';
        const method = payload.attendance_id ? 'PUT' : 'POST';

        const response = await fetch(endpoint, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AMIGO_API_TOKEN}`
            },
            body: JSON.stringify(amigoPayload)
        });
        
        let data = {};
        try { data = await response.json(); } catch(e) {}
        
        if (!response.ok) {
            console.error("Erro da API do Amigo:", data);
            if (method === 'PUT' && data.message && data.message.includes("Status deve ser")) {
                throw new Error('O Amigo App bloqueia o reagendamento por ferramentas externas. Para mudar o horário ou dados, altere diretamente no site do Amigo App, ou cancele este agendamento e crie um novo.');
            }
            throw new Error(data?.message?.message || data.message || 'Erro ao agendar/atualizar no Amigo App');
        }
        
        // --- SALVANDO DADOS FINANCEIROS NO D1 ---
        try {
            await queryD1(`
                INSERT INTO agendamentos_financeiro (
                    data_agendamento, nome_paciente, procedimento, unidade, 
                    origem, valor_primario, valor_secundario, status_pagamento, agendado_por
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                amigoPayload.start_date,
                payload.patient_name,
                payload.procedure_name || payload.event_id,
                payload.place_name || payload.place_id,
                payload.origem || 'Orgânico',
                payload.valor_primario || '',
                payload.valor_secundario || '',
                payload.status_pagamento || 'Pendente',
                payload.agendado_por || 'Sistema'
            ]);
        } catch (e) {
            console.error("Erro ao salvar histórico financeiro no D1:", e);
        }
        // ----------------------------------------
        
        // --- ENVIO META CAPI (AGENDAMENTO) ---
        // Apenas disparar evento se não for um reagendamento (ou se quiser pode disparar sempre, mas usualmente é no novo)
        if (!payload.attendance_id) {
            sendMetaCapiEvent('Schedule', {
                telefone: payload.patient_phone,
                email: payload.patient_email,
                fb_click_id: payload.fb_click_id
            });
        }
        // ----------------------------------------

        res.status(200).json({ 
            success: true, 
            message: payload.attendance_id ? 'Agendamento atualizado com sucesso!' : 'Agendamento criado via API Real do Amigo App!' 
        });
    } catch (error) {
        res.status(400).json({ error: error.message, details: error.message });
    }
});

// ==== ROTA PARA HISTÓRICO FINANCEIRO (JSON) ====
app.get('/api/historico-financeiro', async (req, res) => {
    try {
        const rows = await queryD1('SELECT * FROM agendamentos_financeiro ORDER BY created_at DESC');
        res.json(rows || []);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==== ROTA PARA EXPORTAR PLANILHA CSV ====
app.get('/api/export-csv', async (req, res) => {
    try {
        const rows = await queryD1('SELECT * FROM agendamentos_financeiro ORDER BY created_at DESC');
        
        // Cabeçalho da planilha (Separado por Ponto e Vírgula para Excel PT-BR)
        let csvContent = 'DATA;Nome;Procedimento;Unidade;Origem;Valor primário;Valor secundário;Status;Agendado por:\n';
        
        if (rows && rows.length > 0) {
            rows.forEach(row => {
                const rowData = [
                    row.data_agendamento,
                    row.nome_paciente,
                    row.procedimento,
                    row.unidade,
                    row.origem,
                    row.valor_primario,
                    row.valor_secundario,
                    row.status_pagamento,
                    row.agendado_por
                ].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`); // Escapa aspas duplas
                
                csvContent += rowData.join(';') + '\n';
            });
        }
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="historico_financeiro.csv"');
        res.send('\uFEFF' + csvContent); // \uFEFF adiciona BOM para Excel reconhecer acentos UTF-8
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============================================
// NOVA ROTA: RELACIONAMENTO (CRM ATIVO)
// ============================================
app.get('/api/relacionamento', async (req, res) => {
    try {
        const AMIGO_API_TOKEN = process.env.AMIGO_API_TOKEN;
        const headers = { 'Authorization': `Bearer ${AMIGO_API_TOKEN}` };
        const today = new Date();
        
        // Pega string formato YYYY-MM-DD local
        const getStr = (d) => {
            const offset = d.getTimezoneOffset() * 60000;
            return (new Date(d - offset)).toISOString().split('T')[0];
        };

        // Janela 1: Hoje até 60 dias atrás
        const d1End = new Date(today);
        const d1Start = new Date(today); d1Start.setDate(d1Start.getDate() - 60);
        
        // Janela 2: 60 dias atrás até 120 dias atrás
        const d2End = new Date(d1Start); d2End.setDate(d2End.getDate() - 1);
        const d2Start = new Date(d2End); d2Start.setDate(d2Start.getDate() - 60);
        
        // Janela 3: Hoje até 30 dias no futuro (para saber se já estão agendados)
        const d3Start = new Date(today);
        const d3End = new Date(today); d3End.setDate(d3End.getDate() + 30);

        const promises = [
            fetch(`https://amigobot-api.amigoapp.com.br/attendances?start_date=${getStr(d1Start)}&end_date=${getStr(d1End)}&status=ALL`, { headers }),
            fetch(`https://amigobot-api.amigoapp.com.br/attendances?start_date=${getStr(d2Start)}&end_date=${getStr(d2End)}&status=ALL`, { headers }),
            fetch(`https://amigobot-api.amigoapp.com.br/attendances?start_date=${getStr(d3Start)}&end_date=${getStr(d3End)}&status=ALL`, { headers })
        ];

        const responses = await Promise.all(promises);
        let allAttendances = [];
        for (let r of responses) {
            if (r.ok) {
                const j = await r.json();
                if (j.data) allAttendances = allAttendances.concat(j.data);
            }
        }

        // Processar Pacientes
        const patientsMap = new Map();
        const currentMonth = today.getMonth() + 1;
        
        allAttendances.forEach(att => {
            if (!att.patient || !att.patient.id) return;
            const pid = att.patient.id;
            
            if (!patientsMap.has(pid)) {
                patientsMap.set(pid, {
                    id: pid,
                    name: att.patient.name,
                    phone: att.patient.contact_cellphone || '',
                    attendances: []
                });
            }
            patientsMap.get(pid).attendances.push(att);
        });

        const result = {
            pos_venda: [],
            faltantes: [],
            sumidos: []
        };
        
        // ===============================================
        // BUSCAR MENSAGENS ENVIADAS DO CLOUDFLARE D1
        // ===============================================
        let contactedMap = {};
        try {
            // Busca mensagens dos ultimos 30 dias
            const rows = await queryD1('SELECT paciente_id, tipo FROM mensagens_enviadas WHERE data_envio > datetime("now", "-30 days")');
            rows.forEach(r => {
                if (!contactedMap[r.paciente_id]) contactedMap[r.paciente_id] = {};
                contactedMap[r.paciente_id][r.tipo] = true;
            });
        } catch(e) {
            console.error("D1: Não foi possível carregar o histórico de mensagens", e.message);
        }

        const nowMs = today.getTime();

        Array.from(patientsMap.values()).forEach(p => {
            // Ordenar atendimentos do mais recente para o mais antigo
            p.attendances.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
            
            let hasFuture = false;
            let lastPastAtt = null;
            let lastMissedOrCanceled = null;
            
            p.attendances.forEach(att => {
                const attDate = new Date(att.start_date);
                if (attDate > today) {
                    hasFuture = true;
                } else {
                    if (att.status === 'canceled' || att.status === 'missed') {
                        if (!lastMissedOrCanceled || attDate > new Date(lastMissedOrCanceled.start_date)) {
                            lastMissedOrCanceled = att;
                        }
                    } else if (att.status === 'done' || att.status === 'arrived') {
                        if (!lastPastAtt || attDate > new Date(lastPastAtt.start_date)) {
                            lastPastAtt = att;
                        }
                    }
                }
            });

            // 1. Faltantes (Cancelados ou Missed nos últimos 15 dias)
            if (lastMissedOrCanceled) {
                const diffMissed = (nowMs - new Date(lastMissedOrCanceled.start_date).getTime()) / (1000 * 60 * 60 * 24);
                if (diffMissed <= 15) {
                    result.faltantes.push({
                        patient: p,
                        last_attendance: lastMissedOrCanceled,
                        contacted: !!(contactedMap[String(p.id)] && contactedMap[String(p.id)]['faltantes'])
                    });
                }
            }

            if (!lastPastAtt) return; // Se não tem histórico passado de sucesso, ignora pro resto

            const diffDays = (nowMs - new Date(lastPastAtt.start_date).getTime()) / (1000 * 60 * 60 * 24);

            // 2. Pós Venda (Últimos 7 a 15 dias)
            if (diffDays >= 7 && diffDays <= 15) {
                result.pos_venda.push({
                    patient: p,
                    last_attendance: lastPastAtt,
                    contacted: !!(contactedMap[String(p.id)] && contactedMap[String(p.id)]['pos_venda'])
                });
            }

            // 3. Sumidos (45 a 120 dias atrás) E não tem agendamento futuro
            if (!hasFuture && diffDays >= 45 && diffDays <= 120) {
                result.sumidos.push({
                    patient: p,
                    last_attendance: lastPastAtt,
                    days_absent: Math.floor(diffDays),
                    contacted: !!(contactedMap[String(p.id)] && contactedMap[String(p.id)]['sumidos'])
                });
            }
        });

        // Removemos o limitador antigo de 50 itens para enviar todos os pacientes encontrados


        res.status(200).json(result);
    } catch (error) {
        console.error("Erro Relacionamento:", error);
        res.status(500).json({ error: 'Erro interno', details: error.message });
    }
});

// --- ROTAS DE ANIVERSARIANTES ---
app.get('/api/aniversariantes', async (req, res) => {
    try {
        const today = new Date();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const dateStr = `${mm}-${dd}`;

        const amigoToken = process.env.AMIGO_API_TOKEN;
        if (!amigoToken) throw new Error("AMIGO_API_TOKEN não configurado no .env");

        const response = await fetch(`https://amigobot-api.amigoapp.com.br/patients/birthday?date=${dateStr}`, {
            headers: {
                'Authorization': `Bearer ${amigoToken}`
            }
        });

        if (!response.ok) {
            throw new Error(`Erro na API do Amigo App: ${response.statusText}`);
        }

        const data = await response.json();
        
        let found = [];
        if (data && data.data && Array.isArray(data.data)) {
            // Transformar os dados para o padrão que o front-end espera
            found = data.data.map(p => {
                return {
                    name: p.name,
                    phone: p.contact_cellphone ? (p.contact_cellphone_dial_code || '55') + p.contact_cellphone : '',
                    age: p.age,
                    isToday: true // Como filtramos para hoje, todos são hoje
                };
            });
        }

        res.status(200).json({ aniversariantes: found });
    } catch (error) {
        console.error("Erro Aniversariantes API:", error);
        res.status(500).json({ error: 'Erro ao buscar aniversariantes na API' });
    }
});

// Leitura da Planilha para o mês todo
app.get('/api/aniversariantes/month', (req, res) => {
    try {
        const csvPath = process.env.VERCEL ? '/tmp/aniversariantes.csv' : path.join(__dirname, 'aniversariantes.csv');
        if (!fs.existsSync(csvPath)) {
            return res.json({ aniversariantes: [] });
        }

        const csvText = fs.readFileSync(csvPath, 'latin1');
        const lines = csvText.split('\n');
        
        const currentMonth = new Date().getMonth() + 1;
        const currentDay = new Date().getDate();
        let found = [];

        for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split(';');
            if (row.length < 8) continue;

            const nome = row[1]?.trim();
            const dataNascStr = row[3]?.trim();
            const celular = row[7]?.trim();

            if (!nome || !dataNascStr) continue;

            const dateParts = dataNascStr.split('/');
            if (dateParts.length === 3) {
                const bDay = parseInt(dateParts[0], 10);
                const bMonth = parseInt(dateParts[1], 10);

                if (bMonth === currentMonth) {
                    found.push({
                        name: nome,
                        phone: celular,
                        birthDate: dataNascStr,
                        day: bDay,
                        isToday: (bDay === currentDay)
                    });
                }
            }
        }

        found.sort((a, b) => a.day - b.day);
        res.status(200).json({ aniversariantes: found });
    } catch (error) {
        console.error("Erro Aniversariantes Mês:", error);
        res.status(500).json({ error: 'Erro ao processar CSV' });
    }
});

// Upload via memória para evitar qualquer problema de disco na Vercel
const upload = multer({ storage: multer.memoryStorage() });

app.post('/api/aniversariantes/upload', upload.single('csvFile'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        }
        
        const targetPath = process.env.VERCEL ? '/tmp/aniversariantes.csv' : path.join(__dirname, 'aniversariantes.csv');
        fs.writeFileSync(targetPath, req.file.buffer);
        
        res.status(200).json({ success: true, message: 'Planilha atualizada com sucesso!' });
    } catch (error) {
        console.error("Erro no upload:", error);
        res.status(500).json({ error: 'Falha ao salvar a planilha.' });
    }
});

// ==== RADAR DE NOTIFICAÇÕES (POLLING) ====
const notifiedAttendances = new Set();
setInterval(async () => {
    try {
        const AMIGO_API_TOKEN = process.env.AMIGO_API_TOKEN;
        if (!AMIGO_API_TOKEN) return;
        
        const d = new Date().toISOString().split('T')[0];
        const res = await fetch(`https://amigobot-api.amigoapp.com.br/attendances?start_date=${d}&end_date=${d}&status=ALL`, {
            headers: { 'Authorization': `Bearer ${AMIGO_API_TOKEN}` }
        });
        const json = await res.json();
        const attendances = json.data || [];
        
        for (let att of attendances) {
            if (att.status === 'done' && !notifiedAttendances.has(att.id)) {
                notifiedAttendances.add(att.id);
                const pName = att.patient?.name || 'Um paciente';
                const msg = `✅ O atendimento de ${pName} foi finalizado com sucesso!`;
                
                await queryD1(
                    'INSERT INTO crm_notifications (id, message, created_at) VALUES (?, ?, ?)',
                    [Date.now().toString() + Math.random(), msg, att.start_date || new Date().toISOString()]
                );
            }
        }
    } catch (e) {
        console.error("Erro no radar de notificações:", e.message);
    }
}, 5 * 60 * 1000); 

// ==========================================
// RELATÓRIO DE MARKETING DO AMIGO APP (MÊS ATUAL)
// ==========================================
app.get('/api/relatorio-mkt', async (req, res) => {
    try {
        const AMIGO_API_TOKEN = process.env.AMIGO_API_TOKEN;
        if (!AMIGO_API_TOKEN) return res.status(500).json({ error: 'Token não configurado' });

        const dataAtual = new Date();
        const primeiroDia = new Date(dataAtual.getFullYear(), dataAtual.getMonth(), 1).toISOString().split('T')[0];
        const ultimoDia = new Date(dataAtual.getFullYear(), dataAtual.getMonth() + 1, 0).toISOString().split('T')[0];

        const headers = { 'Authorization': `Bearer ${AMIGO_API_TOKEN}` };
        const response = await fetch(`https://amigobot-api.amigoapp.com.br/attendances?start_date=${primeiroDia}&end_date=${ultimoDia}&status=ALL`, { headers });
        const json = await response.json();
        const attendances = json.data || [];

        // Filtra por [MKT] no nome do paciente ou observação do CRM
        const agendamentosMkt = attendances.filter(att => {
            const pName = att.patient?.name || '';
            const obs = att.observation || '';
            return pName.includes('[MKT]') || obs.includes('Origem: CRM');
        });

        const reportData = agendamentosMkt.map(att => ({
            id: att.id,
            start_date: att.start_date,
            patient_name: att.patient?.name || 'Desconhecido',
            patient_phone: att.patient?.contact_cellphone || att.patient?.cellphone || 'N/A',
            procedure: att.agenda_event?.name || 'Sem procedimento'
        }));
        
        // Ordena por data (mais recentes primeiro)
        reportData.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));

        res.json({ success: true, count: reportData.length, data: reportData });
    } catch (e) {
        console.error("Erro no relatorio mkt:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Iniciar Servidor (Sempre roda localmente, exceto na Vercel)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`✅ Servidor Local de Desenvolvimento Rodando!`);
        console.log(`👉 Acesse no seu navegador: http://localhost:${PORT}\n`);
    });
}

// Necessário para a Vercel interpretar o Express Serverless
export default app;
