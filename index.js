// Instale com: npm install puppeteer express cors
const puppeteer = require("puppeteer");
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Healthcheck (para testar se o serviço está vivo)
app.get("/health", (req, res) => res.json({ ok: true }));

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        headless: "new",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-zygote",
        ],
        // NÃO fixe executablePath no Render, geralmente quebra.
        // Deixe o Puppeteer usar o Chromium que ele mesmo baixa.
      })
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

function normalizeMoneyToBR(value) {
  if (value == null) return "0,00";
  const s = String(value)
    .replace(/\s/g, "")
    .replace("R$", "")
    .trim();

  // tenta extrair algo tipo 1.234,56 ou 123,45
  const m = s.match(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})/);
  if (!m) return "0,00";

  // normaliza para pt-BR com vírgula
  const raw = m[1];
  const num =
    raw.includes(",")
      ? Number(raw.replace(/\./g, "").replace(",", "."))
      : Number(raw);

  if (!Number.isFinite(num)) return "0,00";
  return num.toFixed(2).replace(".", ",");
}

app.post("/extrair", async (req, res) => {
  const { url } = req.body || {};
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL não fornecida" });
  }

  let page = null;

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    // Timeouts mais tolerantes (SEFAZ pode ser lenta)
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(60000);

    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForTimeout(1200);

    const dados = await page.evaluate(() => {
      // Função local para limpar textos
      const text = (el) =>
        el && el.textContent ? el.textContent.replace(/\s+/g, " ").trim() : "";

      const produtos = [];

      // Busca itens em possíveis tabelas/linhas
      const linhas = document.querySelectorAll(
        "table#tabResult tr, .item-list tr, .container-itens tr, tr"
      );

      linhas.forEach((linha) => {
        const nome = text(
          linha.querySelector(".txtTit, .nome-produto, .description")
        );
        const preco = text(
          linha.querySelector(".valor, .preco-unitario, .total-item, .txtVl")
        );

        // evita pegar linhas vazias/cabeçalho
        if (nome && nome.length > 2 && preco && preco.match(/\d/)) {
          produtos.push({ nome, preco });
        }
      });

      const fornecedor = text(
        document.querySelector("#u20, .txtTopo, .razao-social, #emitente")
      );

      const total = text(
        document.querySelector(".totalNFe, .v_total, #vTotal, #total, .total")
      );

      const pagamento = text(
        document.querySelector(".txtExtra, .forma-pagamento, #pagamento")
      );

      return {
        fornecedor: fornecedor || "Loja não identificada",
        total: total || "0,00",
        pagamento: pagamento || "Não informado",
        itens: produtos,
      };
    });

    // Normaliza total e preços (garante formato)
    const totalNorm = normalizeMoneyToBR(dados.total);

    const itensNorm = (Array.isArray(dados.itens) ? dados.itens : [])
      .map((it) => ({
        nome: String(it.nome || "").trim(),
        preco: normalizeMoneyToBR(it.preco),
      }))
      .filter((it) => it.nome && it.preco !== "0,00");

    return res.json({
      fornecedor: dados.fornecedor,
      total: totalNorm,
      pagamento: dados.pagamento,
      itens: itensNorm,
    });
  } catch (error) {
    console.error("[EXTRAIR] Erro:", error);
    return res.status(500).json({
      error: "Erro ao extrair dados",
      details: String(error && error.message ? error.message : error),
    });
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

// logs úteis
process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));

// Render define PORT automaticamente
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor rodando na porta", PORT));
