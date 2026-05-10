$ cat /Users/edson/Downloads/catiaerea-backup/backup.js

const nodemailer = require('nodemailer');
const fs = require('fs');

const SUPABASE_URL = 'https://hancftwkivdefvftmvdi.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_PASS;
const EMAIL_TO = 'erbjunior@gmail.com';

function r2(n) { return Math.round((n || 0) * 100) / 100; }
function moeda(n) { return 'R$ ' + r2(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }

async function sbGet(tabela) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?select=*&limit=10000`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  if (!res.ok) throw new Error(`Erro ao buscar ${tabela}: ${await res.text()}`);
  const rows = await res.json();
  return rows.map(r => r.dados).filter(Boolean);
}

function gerarRelatorioHTML(vendas, consulado, aprov, hoje) {
  // --- Cálculos ---
  const totalVendas = vendas.length;
  const totalConsulado = consulado.length;

  const recebidas = vendas.filter(v => (v.pagto || '').toUpperCase() === 'RECEBIDO');
  const aguardando = vendas.filter(v => (v.pagto || '').toUpperCase() === 'AGUARDANDO');
  const receita = vendas.reduce((s, v) => s + r2(v.vRec || 0), 0);
  const lucro = r2(vendas.reduce((s, v) => s + r2(v.lucro || 0), 0));

  // Por vendedor (campo: emissor)
  const porVendedor = {};
  vendas.forEach(v => {
    const nome = v.emissor || 'N/A';
    if (!porVendedor[nome]) porVendedor[nome] = { qtd: 0, receita: 0, recebido: 0 };
    porVendedor[nome].qtd++;
    porVendedor[nome].receita += r2(v.vRec || 0);
    if ((v.pagto || '').toUpperCase() === 'RECEBIDO') porVendedor[nome].recebido += r2(v.vRec || 0);
  });

  // Por mês
  const porMes = {};
  vendas.forEach(v => {
    const mes = (v.id || '').split('-')[0] || 'outros';
    if (!porMes[mes]) porMes[mes] = { qtd: 0, receita: 0 };
    porMes[mes].qtd++;
    porMes[mes].receita += r2(v.vRec || 0);
  });

  const mesesOrdem = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const mesesOrdenados = Object.keys(porMes).sort((a, b) => mesesOrdem.indexOf(a) - mesesOrdem.indexOf(b));

  // Pendências
  const cobrar = aguardando.length;
  const semNF = vendas.filter(v => (v.pagto || '').toUpperCase() === 'RECEBIDO' && !v.nfNum).length;

  // Consulado por tipo (campo: tipoServico)
  const porTipo = {};
  consulado.forEach(c => {
    const tipo = c.tipoServico || 'N/A';
    if (!porTipo[tipo]) porTipo[tipo] = 0;
    porTipo[tipo]++;
  });

  const rowsVendedor = Object.entries(porVendedor)
    .sort((a, b) => b[1].receita - a[1].receita)
    .map(([nome, d]) => `
      <tr>
        <td>${nome}</td>
        <td style="text-align:center">${d.qtd}</td>
        <td style="text-align:right">${moeda(d.receita)}</td>
        <td style="text-align:right">${moeda(d.recebido)}</td>
      </tr>`).join('');

  const rowsMes = mesesOrdenados.map(mes => `
      <tr>
        <td style="text-transform:uppercase;font-weight:600">${mes}</td>
        <td style="text-align:center">${porMes[mes].qtd}</td>
        <td style="text-align:right">${moeda(porMes[mes].receita)}</td>
      </tr>`).join('');

  const rowsTipo = Object.entries(porTipo)
    .sort((a, b) => b[1] - a[1])
    .map(([tipo, qtd]) => `
      <tr>
        <td>${tipo}</td>
        <td style="text-align:center">${qtd}</td>
      </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; color: #1a1a2e; background: #f5f5f5; margin: 0; padding: 20px; }
  .container { max-width: 800px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,.1); }
  .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #fff; padding: 32px; text-align: center; }
  .header h1 { margin: 0; font-size: 28px; letter-spacing: 1px; }
  .header p { margin: 8px 0 0; opacity: .7; font-size: 14px; }
  .cards { display: flex; flex-wrap: wrap; gap: 16px; padding: 24px; background: #f8f9fa; }
  .card { flex: 1; min-width: 160px; background: #fff; border-radius: 8px; padding: 16px; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  .card .valor { font-size: 24px; font-weight: 700; color: #1a1a2e; margin: 4px 0; }
  .card .label { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: .5px; }
  .card.verde .valor { color: #22c55e; }
  .card.amber .valor { color: #f59e0b; }
  .card.vermelho .valor { color: #ef4444; }
  .section { padding: 24px; border-bottom: 1px solid #f0f0f0; }
  .section h2 { margin: 0 0 16px; font-size: 16px; color: #555; text-transform: uppercase; letter-spacing: .5px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { background: #f8f9fa; padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #888; border-bottom: 2px solid #e5e7eb; }
  td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; }
  tr:last-child td { border-bottom: none; }
  .footer { padding: 20px; text-align: center; font-size: 12px; color: #aaa; }
  .badge-pend { display: inline-block; background: #fef3c7; color: #92400e; border-radius: 4px; padding: 2px 8px; font-size: 12px; font-weight: 600; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>✈ CatiAérea</h1>
    <p>Relatório Semanal — ${hoje}</p>
  </div>

  <div class="cards">
    <div class="card">
      <div class="label">Total Vendas</div>
      <div class="valor">${totalVendas}</div>
    </div>
    <div class="card">
      <div class="label">Recebidas</div>
      <div class="valor verde">${recebidas.length}</div>
    </div>
    <div class="card amber">
      <div class="label">Aguardando</div>
      <div class="valor">${cobrar}</div>
    </div>
    <div class="card">
      <div class="label">Consulado</div>
      <div class="valor">${totalConsulado}</div>
    </div>
    <div class="card">
      <div class="label">Receita Total</div>
      <div class="valor">${moeda(receita)}</div>
    </div>
    <div class="card verde">
      <div class="label">Lucro Bruto</div>
      <div class="valor">${moeda(lucro)}</div>
    </div>
  </div>

  <div class="section">
    <h2>Pendências</h2>
    <table>
      <tr>
        <td>Cobrar (pagamento aguardando)</td>
        <td><span class="badge-pend">${cobrar} vendas</span></td>
      </tr>
      <tr>
        <td>Recebidas sem nota fiscal</td>
        <td><span class="badge-pend">${semNF} vendas</span></td>
      </tr>
      <tr>
        <td>Aprovações pendentes</td>
        <td><span class="badge-pend">${aprov.length} itens</span></td>
      </tr>
    </table>
  </div>

  <div class="section">
    <h2>Vendas por Vendedor</h2>
    <table>
      <thead><tr><th>Vendedor</th><th>Vendas</th><th>Receita</th><th>Recebido</th></tr></thead>
      <tbody>${rowsVendedor}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>Vendas por Mês</h2>
    <table>
      <thead><tr><th>Mês</th><th>Qtd</th><th>Receita</th></tr></thead>
      <tbody>${rowsMes}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>Consulado por Tipo</h2>
    <table>
      <thead><tr><th>Tipo</th><th>Qtd</th></tr></thead>
      <tbody>${rowsTipo}</tbody>
    </table>
  </div>

  <div class="footer">
    Backup gerado automaticamente em ${hoje} · CatiAérea Sistema
  </div>
</div>
</body>
</html>`;
}

async function main() {
  console.log('Buscando dados do Supabase...');
  const vendas = await sbGet('catia_vendas');
  const consulado = await sbGet('catia_consulado');
  const aprov = await sbGet('catia_aprov');

  console.log(`Vendas: ${vendas.length} | Consulado: ${consulado.length} | Aprov: ${aprov.length}`);

  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const dataArquivo = new Date().toISOString().split('T')[0];

  // Arquivo 1: JSON completo
  const jsonBackup = JSON.stringify({ gerado_em: hoje, vendas, consulado, aprov }, null, 2);
  const jsonFile = `backup_${dataArquivo}.json`;
  fs.writeFileSync(jsonFile, jsonBackup);

  // Arquivo 2: Relatório HTML
  const htmlReport = gerarRelatorioHTML(vendas, consulado, aprov, hoje);
  const htmlFile = `relatorio_${dataArquivo}.html`;
  fs.writeFileSync(htmlFile, htmlReport);

  console.log('Enviando email...');
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS }
  });

  await transporter.sendMail({
    from: `"CatiAérea Backup" <${GMAIL_USER}>`,
    to: EMAIL_TO,
    subject: `✈ CatiAérea — Backup Semanal ${hoje}`,
    html: `
      <p>Olá,</p>
      <p>Segue o backup semanal do sistema CatiAérea gerado em <strong>${hoje}</strong>.</p>
      <ul>
        <li><strong>${jsonFile}</strong> — dados completos (vendas, consulado, aprovações)</li>
        <li><strong>${htmlFile}</strong> — relatório formatado com resumo e indicadores</li>
      </ul>
      <p>Acesse o sistema em: <a href="https://catiaerea.netlify.app">catiaerea.netlify.app</a></p>
    `,
    attachments: [
      { filename: jsonFile, path: jsonFile },
      { filename: htmlFile, path: htmlFile }
    ]
  });

  console.log('Email enviado com sucesso!');
}

main().catch(e => { console.error(e); process.exit(1); });
