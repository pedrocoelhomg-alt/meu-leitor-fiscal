const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer"); // <-- TROCA AQUI (não é puppeteer-core)

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.status(200).send("OK - meu-leitor-fiscal online");
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/extrair", async (req, res) => {
  const { url } = req.body || {};

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL não fornecida" });
  }

  let browser;
  let page;

  try {
    browser = await puppeteer.launch({
      headless: "new",
      // NÃO use executablePath no Railway
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
      ],
    });

    page = await browser.newPage();
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(60000);

    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForTimeout(1200);

    const dados = await page.evaluate(() => {
      const txt = (el) =>
        el && el.textContent ? el.textContent.replace(/\s+/g, " ").trim() : "";

      const itens = [];
      // Mantém seu seletor, mas adiciona alguns fallbacks
      document.querySelectorAll("table#tabResult tr, tr").forEach((linha) => {
        const nome = txt(linha.querySelector(".txtTit, .description, a"));
        const preco = txt(linha.querySelector(".valor, .txtVl, .total-item"));
        if (nome && nome.length > 2 && preco && /\d/.test(preco)) {
          itens.push({ nome, preco });
        }
      });

      const fornecedor =
        txt(document.querySelector("#u20, .txtTopo, .razao-social, #emitente")) ||
        "Loja não identificada";

      const total =
        txt(document.querySelector(".totalNFe, #vTotal, #total, .total")) || "0,00";

      const pagamento =
        txt(document.querySelector(".txtExtra, .forma-pagamento, #pagamento")) ||
        "Não informado";

      return { fornecedor, total, pagamento, itens };
    });

    return res.json(dados);
  } catch (error) {
    console.error("[EXTRAIR] erro:", error);
    return res.status(500).json({
      error: "Erro ao extrair dados",
      details: String(error?.message || error),
    });
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
