const base = "http://127.0.0.1:3001";
async function main(){
  // login
  const loginRes = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "Admin_12345" })
  });
  const loginData = await loginRes.json();
  console.log("Login:", loginRes.status, loginData.user ? loginData.user.username : loginData);
  if(!loginData.token) throw new Error("login failed");
  const token = loginData.token;
  const headers = { Authorization: `Bearer ${token}` };

  const get = async (path) => {
    const r = await fetch(base + path, { headers });
    const j = await r.json();
    return { status: r.status, data: j };
  };

  const tests = [
    ["/api/health", "health"],
    ["/api/dashboard/summary", "dashboard"],
    ["/api/customers?page=1&pageSize=5", "customers"],
    ["/api/suppliers?page=1&pageSize=5", "suppliers"],
    ["/api/materials?page=1&pageSize=10", "materials"],
    ["/api/safes?page=1&pageSize=10", "safes"],
    ["/api/material-receivings?page=1&pageSize=5", "receivings"],
    ["/api/production-batches?page=1&pageSize=5", "batches"],
    ["/api/finished-inventory?page=1&pageSize=10", "finished"],
    ["/api/sales-invoices?page=1&pageSize=5", "invoices"],
    ["/api/customers?page=1&pageSize=1", "one customer for ledger"],
  ];
  for(const [p,label] of tests){
    const r = await get(p);
    console.log(`\n=== ${label} ${p} => ${r.status}`);
    if(r.status===200){
      const preview = JSON.stringify(r.data).slice(0,600);
      console.log(preview);
      if(r.data.meta) console.log("meta:", r.data.meta);
      if(r.data.data && Array.isArray(r.data.data) && r.data.data.length>0) console.log("first row:", r.data.data[0]);
    } else {
      console.log(r.data);
    }
  }

  // Test ledger for علاء
  const custList = await get("/api/customers?search=علاء&page=1&pageSize=5");
  if(custList.data.data && custList.data.data[0]){
    const custId = custList.data.data[0].id;
    console.log("\n=== Customer ledger for علاء", custId);
    const ledger = await get(`/api/customers/${custId}/ledger`);
    console.log("ledger status", ledger.status);
    console.log(JSON.stringify(ledger.data).slice(0,800));
  }

  // Test treasury report
  const tre = await get("/api/treasury/report");
  console.log("\n=== Treasury report", tre.status);
  console.log(JSON.stringify(tre.data).slice(0,800));

  // Test reports
  const raw = await get("/api/reports/raw-material-stock?page=1&pageSize=5");
  console.log("\n=== Raw stock report", raw.status, "summary", raw.data.summary);
  const fin = await get("/api/reports/finished-stock?page=1&pageSize=5");
  console.log("=== Finished stock report", fin.status, "summary", fin.data.summary);
}
main().catch(e=>{ console.error(e); process.exit(1); });
