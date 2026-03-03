const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/", (req, res) => res.status(200).send("OK - meu-leitor-fiscal online"));
app.get("/health", (req, res) => res.json({ ok: true }));

// ======= storage simples em memória (serve para MVP) =======
const RECEIPTS = new Map(); // sid -> { data, createdAt }
const TTL_MS = 5 * 60 * 1000; // 5 min

function cleanup() {
  const now = Date.now();
  for (const [sid, v] of RECEIPTS.entries()) {
    if (!v?.createdAt || now - v.createdAt > TTL_MS) RECEIPTS.delete(sid);
  }
}
setInterval(cleanup, 30 * 1000).unref();

// Endpoint para o bookmarklet enviar dados (sem CORS, via sendBeacon também funciona)
app.post("/collect", (req, res) => {
  try {
    const { sid, receipt } = req.body || {};
    if (!sid || typeof sid !== "string") {
      return res.status(400).json({ error: "sid ausente" });
    }
    if (!receipt || typeof receipt !== "object") {
      return res.status(400).json({ error: "receipt ausente" });
    }

    RECEIPTS.set(sid, { data: receipt, createdAt: Date.now() });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "collect failed" });
  }
});

// Seu app consulta aqui para buscar o cupom que chegou do bookmarklet
app.get("/receipt/:sid", (req, res) => {
  const sid = req.params.sid;
  const v = RECEIPTS.get(sid);
  if (!v) return res.status(404).json({ error: "not_found" });
  return res.json(v.data);
});

// (Opcional) mantém seu /extrair via puppeteer para estados que não bloqueiam
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

    const receipt = await page.evaluate(() => {
      const txt = (el) =>
        el && el.textContent ? el.textContent.replace(/\s+/g, " ").trim() : "";

      const itens = [];
      document.querySelectorAll("table#tabResult tr, tr").forEach((linha) => {
        const nome = txt(linha.querySelector(".txtTit, .description, a"));
        const preco = txt(linha.querySelector(".valor, .txtVl, .total-item"));
        if (nome && nome.length > 2 && preco && /\d/.test(preco)) itens.push({ nome, preco });
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

    return res.json(receipt);
  } catch (error) {
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
app.listen(PORT, () => console.log("Servidor rodando na porta", PORT));
