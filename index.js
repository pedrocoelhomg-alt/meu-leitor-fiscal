javascript
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
            // Seletores específicos para o layout da NFC-e do RJ
            const produtos = [];
            const linhas = document.querySelectorAll('table#tabResult tr');

            linhas.forEach(linha => {
                const nome = linha.querySelector('.txtTit')?.innerText.trim();
                const preco = linha.querySelector('.valor')?.innerText.trim();
                if (nome) produtos.push({ nome, preco });
            });

            return {
                fornecedor: document.querySelector('#u20')?.innerText.trim() || "Não encontrado",
                total: document.querySelector('.totalNFe')?.innerText.trim() || "0,00",
                pagamento: document.querySelector('.txtExtra')?.innerText.trim() || "Não informado",
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
