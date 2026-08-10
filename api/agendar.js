export default async function handler(req, res) {
    // Permitir apenas requisições POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    
    // O SEU TOKEN AGORA ESTÁ 100% SEGURO!
    // Para funcionar na Vercel, você precisará ir nas configurações do seu projeto na Vercel
    // Settings > Environment Variables, e adicionar a chave: AMIGO_API_TOKEN com o seu token.
    const AMIGO_API_TOKEN = process.env.AMIGO_API_TOKEN;
    
    if (!AMIGO_API_TOKEN) {
        return res.status(500).json({ error: 'Token da API do Amigo não configurado na Vercel.' });
    }
    
    const payload = req.body;
    
    // Convertendo os dados do CRM para o formato estrito do Amigo App
    const amigoPayload = {
        start_date: `${payload.appointment_date} ${payload.appointment_time}`,
        place_id: parseInt(payload.place_id) || 32337,
        event_id: parseInt(payload.event_id) || 176910,
        user_id: parseInt(payload.user_id) || 102962,
        patient: {
            name: payload.patient_name,
            cellphone: payload.phone.replace(/\D/g, ''),
            born: payload.patient_born || "1990-01-01" 
        }
    };
    
    try {
        // === CÓDIGO REAL DA INTEGRAÇÃO COM AMIGO APP ===
        const response = await fetch('https://amigobot-api.amigoapp.com.br/attendances', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AMIGO_API_TOKEN}`
            },
            body: JSON.stringify(amigoPayload)
        });
        
        // Vamos logar internamente se der erro para podermos debugar na Vercel
        let data = {};
        try { data = await response.json(); } catch(e) {}
        
        if (!response.ok) {
            return res.status(500).json({ error: data?.message?.message || data.message || 'Erro ao agendar via Amigo App' });
        }
        
        // Retornamos sucesso para a nossa tela (Frontend)
        res.status(200).json({ 
            success: true, 
            message: 'Agendado com Sucesso via Vercel Serverless!' 
        });
        
    } catch (error) {
        console.error("Erro ao integrar:", error);
        res.status(500).json({ error: 'Erro interno ao processar a integração com o Amigo App.' });
    }
}
