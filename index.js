// Instale com: npm install puppeteer express cors
const puppeteer = require('puppeteer');
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

app.post('/extrair', async (req, res) => {
    const { url } = req.body;
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome-stable',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--single-process',
            '--no-zygote'
        ],
        headless: "new"
    });
    const page = await browser.newPage();

    try {
        await page.goto(url, { waitUntil: 'networkidle2' });

       const dados = await page.evaluate(() => {
    const produtos = [];
    // Busca os itens em tabelas ou listas (padrão 2026)
    const linhas = document.querySelectorAll('table#tabResult tr, .item-list tr, .container-itens tr');

    linhas.forEach(linha => {
        const nome = linha.querySelector('.txtTit, .nome-produto, .description')?.innerText.trim();
        const preco = linha.querySelector('.valor, .preco-unitario, .total-item')?.innerText.trim();
        if (nome && preco) produtos.push({ nome, preco });
    });

    return {
        // Seletores atualizados para o topo da nota do RJ
        fornecedor: document.querySelector('#u20, .txtTopo, .razao-social')?.innerText.trim() || "Loja não identificada",
        total: document.querySelector('.totalNFe, .v_total, #vTotal')?.innerText.trim() || "0,00",
        pagamento: document.querySelector('.txtExtra, .forma-pagamento')?.innerText.trim() || "Não informado",
        itens: produtos
    };
});

        res.json(dados);
    } catch (error) {
        res.status(500).json({ error: "Erro ao extrair dados" });
    } finally {
        await browser.close();
    }
});

app.listen(3000, () => console.log('Servidor rodando na porta 3000'));
