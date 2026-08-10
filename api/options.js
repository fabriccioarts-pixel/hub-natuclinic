export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    
    const AMIGO_API_TOKEN = process.env.AMIGO_API_TOKEN;
    if (!AMIGO_API_TOKEN) {
        return res.status(500).json({ error: 'Token não configurado' });
    }
    
    const headers = { 'Authorization': `Bearer ${AMIGO_API_TOKEN}` };
    
    try {
        // Fallback inteligente: Vamos buscar os agendamentos dos ultimos 30 dias até 30 dias pra frente
        // Para extrair os procedimentos que já foram usados, já que a API /events as vezes oculta.
        const today = new Date();
        const past = new Date(today); past.setDate(today.getDate() - 30);
        const future = new Date(today); future.setDate(today.getDate() + 30);
        const startStr = past.toISOString().split('T')[0];
        const endStr = future.toISOString().split('T')[0];
        
        const [placesRes, eventsRes, docsRes, attRes] = await Promise.all([
            fetch('https://amigobot-api.amigoapp.com.br/places', { headers }),
            fetch('https://amigobot-api.amigoapp.com.br/events', { headers }),
            fetch('https://amigobot-api.amigoapp.com.br/doctors', { headers }),
            fetch(`https://amigobot-api.amigoapp.com.br/attendances?start_date=${startStr}&end_date=${endStr}`, { headers })
        ]);
        
        const places = await placesRes.json();
        const eventsAPI = await eventsRes.json();
        const docs = await docsRes.json();
        const attendances = await attRes.json();
        
        // Extraindo eventos da agenda
        const eventsMap = new Map();
        (eventsAPI.data || []).forEach(e => eventsMap.set(e.id, { id: e.id, name: e.name }));
        
        (attendances.data || []).forEach(att => {
            if (att.agenda_event && att.agenda_event.id) {
                if (!eventsMap.has(att.agenda_event.id)) {
                    eventsMap.set(att.agenda_event.id, { id: att.agenda_event.id, name: att.agenda_event.name });
                }
            }
        });
        
        res.status(200).json({
            places: places.data || [],
            events: Array.from(eventsMap.values()),
            doctors: docs.data || []
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro interno na Vercel', details: error.message });
    }
}
