export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    
    const AMIGO_API_TOKEN = process.env.AMIGO_API_TOKEN;
    if (!AMIGO_API_TOKEN) {
        return res.status(500).json({ error: 'Token não configurado' });
    }
    
    // Pegar as datas da query ou usar a data de hoje como fallback
    const today = new Date().toISOString().split('T')[0];
    const startDate = req.query.start_date || today;
    const endDate = req.query.end_date || startDate;

    const url = `https://amigobot-api.amigoapp.com.br/attendances?start_date=${startDate}&end_date=${endDate}`;
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${AMIGO_API_TOKEN}` }
        });
        
        let realData = [];
        try { realData = await response.json(); } catch(e) {}
        
        if (!response.ok) {
            return res.status(500).json({ error: realData.message || 'Erro ao buscar agenda' });
        }
        
        res.status(200).json({ data: realData.data || realData });
    } catch (error) {
        res.status(500).json({ error: 'Erro interno na Vercel', details: error.message });
    }
}
