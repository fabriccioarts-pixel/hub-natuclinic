import fetch from 'node-fetch';

async function testLocalAgenda() {
    const today = new Date().toISOString().split('T')[0];
    const url = `http://localhost:3000/api/agenda?start_date=${today}`;
    console.log("Fetching", url);
    const response = await fetch(url);
    const data = await response.json();
    console.log("STATUS:", response.status);
    console.log("TOTAL ATTENDANCES:", data.data ? data.data.length : 0);
    if(data.data && data.data.length > 0) {
        console.log("FIRST ATTENDANCE:", data.data[0].patient.name, "at", data.data[0].start_date);
    }
}

testLocalAgenda();
