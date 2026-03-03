const express = require('express');
const puppeteer = require('puppeteer-core');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());
app.get("/", (req, res) => {
  res.status(200).send("OK - meu-leitor-fiscal online");
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});
app.post('/extrair', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: "URL não fornecida" });
  }

  let browser;

  try {
    browser = await puppeteer.launch({
      executablePath: '/usr/bin/google-chrome-stable',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    const dados = await page.evaluate(() => {
      const itens = [];

      document.querySelectorAll('table#tabResult tr').forEach(linha => {
        const nome = linha.querySelector('.txtTit')?.innerText.trim();
        const preco = linha.querySelector('.valor')?.innerText.trim();
        if (nome && preco) {
          itens.push({ nome, preco });
        }
      });

      return {
        fornecedor: document.querySelector('#u20, .txtTopo')?.innerText.trim() || "Loja não identificada",
        total: document.querySelector('.totalNFe, #vTotal')?.innerText.trim() || "0,00",
        pagamento: document.querySelector('.txtExtra')?.innerText.trim() || "Não informado",
        itens
      };
    });

    await browser.close();

    res.json(dados);

  } catch (error) {
    if (browser) await browser.close();
    res.status(500).json({
      error: "Erro ao extrair dados",
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
