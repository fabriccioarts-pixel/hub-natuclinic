export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    
    // Essa é a Rota que o WhatsApp (Amigo Bot) vai chamar quando alguém disser "Oi"
    const leadData = req.body;
    
    console.log("🔥 NOVO LEAD RECEBIDO VIA WEBHOOK:", leadData);
    
    // Aqui no futuro implementaremos o banco de dados (ex: Vercel Postgres ou Supabase)
    // para salvar esse lead, e o Frontend puxará ele de lá!
    
    // Retornamos 200 OK para o WhatsApp/Amigo Bot saber que recebemos com sucesso
    res.status(200).json({ received: true, message: 'Webhook processado pela Vercel!' });
}
