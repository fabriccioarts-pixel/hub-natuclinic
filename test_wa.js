// Substitua pelo número que você cadastrou como testador no painel da Meta
// Formato: DDI + DDD + Número (ex: 5511999999999)
const DESTINATION_NUMBER = "5561996351852"; // NÃO coloque o símbolo de "+"

const data = {
  to: DESTINATION_NUMBER,
  isTemplate: true, // A primeira mensagem DEVE ser um template aprovado pela Meta
  templateName: "hello_world"
};

console.log(`Enviando requisição de teste para o servidor local (destino: ${DESTINATION_NUMBER})...`);

try {
  const response = await fetch('http://localhost:3000/api/whatsapp/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });

  const json = await response.json();
  console.log(`\nStatus da Resposta: ${response.status}`);
  console.log('Resultado:', JSON.stringify(json, null, 2));
  
  if(json.success) {
      console.log('\n✅ SUCESSO! A requisição foi aceita pela Meta.');
      console.log('Verifique o celular de destino, a mensagem "hello_world" deve chegar em instantes.');
  } else {
      console.log('\n❌ FALHA! A Meta retornou um erro.');
  }
} catch (error) {
  console.error('\n❌ Erro ao conectar com o servidor local:', error.message);
  console.log('Dica: O api-server.js está rodando (node api-server.js)?');
}
