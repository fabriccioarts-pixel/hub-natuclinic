const fetch = require('node-fetch');

async function testPut() {
    try {
        const res = await fetch('http://localhost:3000/api/leads');
        const leads = await res.json();
        if (leads.length === 0) {
            console.log("No leads found to test PUT");
            return;
        }
        
        const lead = leads[0];
        console.log("Testing PUT on lead:", lead.id);
        
        const putRes = await fetch(`http://localhost:3000/api/leads/${lead.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nome: "Nome Editado Teste",
                telefone: "(11) 91234-5678",
                born: "2000-01-01",
                email: "teste@teste.com",
                notas: "Nota editada"
            })
        });
        
        const text = await putRes.text();
        console.log("PUT Response status:", putRes.status);
        console.log("PUT Response body:", text);
    } catch (e) {
        console.error("Error:", e);
    }
}

testPut();
