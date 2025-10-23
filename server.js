const express = require('express');
const { MongoClient } = require('mongodb');
const { ObjectId } = require('mongodb');
const cors = require('cors');

const app = express();
const port = 3000;

const MONGODB_URI = "mongodb://localhost:27017"; 
const DB_NAME = "blindbox_store";
const PRODUCTS_COLLECTION = 'products';
const BACKPACK_COLLECTION = 'backpack_items';

const initialProducts = [
    { 
        id: 1, 
        name: "SKULLPANDA The Sound Series", 
        price: 999.00, 
        img: "img/product1.jpg",
        items: [
            { id: 'SKP-001', name: 'DJ SKULLPANDA', type: 'secret' },
            { id: 'SKP-002', name: 'ROCKER SKULLPANDA', type: 'rare' },
            { id: 'SKP-003', name: 'SINGER SKULLPANDA', type: 'rare' },
            { id: 'SKP-004', name: 'DRUMMER SKULLPANDA', type: 'common' },
            { id: 'SKP-005', name: 'BASSIST SKULLPANDA', type: 'common' }
        ],
        stocks: { common: 20, rare: 10, secret: 2 } 
    },
    { 
        id: 2, 
        name: "SKULLPANDA You Found Me!! Series", 
        price: 999.00, 
        img: "img/product2.jpg",
        items: [
            { id: 'YFM-001', name: 'GOLDEN ANGEL', type: 'secret' },
            { id: 'YFM-002', name: 'RED DEVIL', type: 'rare' },
            { id: 'YFM-003', name: 'BLUE SPIRIT', type: 'rare' },
            { id: 'YFM-004', name: 'GREEN FAIRY', type: 'common' },
            { id: 'YFM-005', name: 'PURPLE WITCH', type: 'common' }
        ],
        stocks: { common: 20, rare: 10, secret: 2 } 
    },
    { 
        id: 3, 
        name: "SKULLPANDA L'Impressionnisme Series", 
        price: 999.00, 
        img: "img/product3.jpg",
        items: [
            { id: 'IMP-001', name: 'STARRY NIGHT PANDA', type: 'secret' },
            { id: 'IMP-002', name: 'WATER LILY PANDA', type: 'rare' },
            { id: 'IMP-003', name: 'SUNFLOWER PANDA', type: 'rare' },
            { id: 'IMP-004', name: 'CAFE NIGHT PANDA', type: 'common' },
            { id: 'IMP-005', name: 'WHEAT FIELD PANDA', type: 'common' }
        ],
        stocks: { common: 20, rare: 10, secret: 2 } 
    }
];

const defaultProbabilities = { common: 60, rare: 30, secret: 10 };
let client;
let probabilities = { ...defaultProbabilities };
const ORDERS_COLLECTION = 'orders';

app.use(cors());
app.use(express.json());
app.use('/img', express.static('img')); 

async function connectAndSeed() {
    try {
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        console.log('Connected successfully to MongoDB server');

        const db = client.db(DB_NAME);
        const productsCollection = db.collection(PRODUCTS_COLLECTION);
        const configCollection = db.collection('config');
        await productsCollection.deleteMany({});
        await productsCollection.insertMany(initialProducts);
        const config = await configCollection.findOne({ type: 'probabilities' });
        if (config) {
            probabilities = config.value;
        } else {
            await configCollection.insertOne({ type: 'probabilities', value: defaultProbabilities });
        }
        const backpackCollection = db.collection(BACKPACK_COLLECTION);
        const ordersCollection = db.collection(ORDERS_COLLECTION);
        await backpackCollection.deleteMany({});
        await ordersCollection.deleteMany({});
        
    } catch (err) {
        console.error('Failed to connect to MongoDB or start server', err);
        throw err; 
    }
}

function calculateTotalStock(product) {
    return product.stocks ? Object.values(product.stocks).reduce((sum, qty) => sum + qty, 0) : 0;
}


app.get('/api/products', async (req, res) => {
    try {
        const db = client.db(DB_NAME);
        const productsCollection = db.collection(PRODUCTS_COLLECTION);
        const products = await productsCollection.find({}).toArray();
        const productsWithStock = products.map(p => ({
            ...p,
            totalStock: calculateTotalStock(p)
        }));

        res.json({ message: 'success', data: productsWithStock });

    } catch (err) {
        console.error('Products error:', err);
        res.status(500).json({ error: 'Failed to fetch products: ' + err.message });
    }
});

connectAndSeed().then(() => {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}).catch(err => {
    console.error('Server startup failed due to DB error.');
});

app.get('/api/config', async (req, res) => {
    try {
        const db = client.db(DB_NAME);
        const configCollection = db.collection('config');
        const config = await configCollection.findOne({ type: 'probabilities' });
        res.json({ message: 'success', data: config ? config.value : probabilities });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/config', async (req, res) => {
    try {
        const { common, rare, secret } = req.body;
        const sum = (common||0) + (rare||0) + (secret||0);
        if (sum !== 100) return res.status(400).json({ error: 'Total must be 100' });

        const db = client.db(DB_NAME);
        const configCollection = db.collection('config');
        await configCollection.updateOne({ type: 'probabilities' }, { $set: { value: { common, rare, secret } } }, { upsert: true });
        probabilities = { common, rare, secret };
        res.json({ message: 'success' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/inventory/:id/stock', async (req, res) => {
    try {
        const { id } = req.params;
        const { rarity, amount } = req.body;
        const amt = parseInt(amount, 10) || 0;
        if (!['common','rare','secret'].includes(rarity)) return res.status(400).json({ error: 'Invalid rarity' });

        const db = client.db(DB_NAME);
        const productsCollection = db.collection(PRODUCTS_COLLECTION);
        const product = await productsCollection.findOne({ id: parseInt(id,10) });
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const newStocks = Object.assign({}, product.stocks || { common:0, rare:0, secret:0 });
        newStocks[rarity] = (newStocks[rarity] || 0) + amt;
        if (newStocks[rarity] < 0) newStocks[rarity] = 0;

        await productsCollection.updateOne({ id: parseInt(id,10) }, { $set: { stocks: newStocks } });
        res.json({ message: 'success' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/checkout/direct', async (req, res) => {
    try {
        const { items } = req.body; 
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'No items provided' });
        }

        const db = client.db(DB_NAME);
        const productsCollection = db.collection(PRODUCTS_COLLECTION);
        const backpackCollection = db.collection(BACKPACK_COLLECTION);

        const backpackItems = [];
        for (const item of items) {
            const product = await productsCollection.findOne({ id: parseInt(item.id, 10) });
            if (!product) {
                return res.status(400).json({ error: `Product not found: ${item.id}` });
            }

            for (let i = 0; i < (parseInt(item.quantity, 10) || 1); i++) {
                const rnd = Math.random() * 100;
                const p = probabilities;
                let chosenType = 'common';
                if (rnd <= p.secret) chosenType = 'secret';
                else if (rnd <= p.secret + p.rare) chosenType = 'rare';

                const availableItems = product.items.filter(it => it.type === chosenType);
                const chosenItem = availableItems[Math.floor(Math.random() * availableItems.length)];

                backpackItems.push({
                    productId: product.id,
                    productName: product.name,
                    status: 'unopened',
                    itemId: chosenItem.id,
                    itemName: chosenItem.name,
                    rarity: chosenType,
                    createdAt: new Date()
                });
            }
        }

        if (backpackItems.length > 0) {
            await backpackCollection.insertMany(backpackItems);
        }

        res.json({ 
            message: 'success',
            data: { itemsAdded: backpackItems.length }
        });
    } catch (err) {
        console.error('Checkout error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/backpack', async (req, res) => {
    try {
        const db = client.db(DB_NAME);
        const backpackCollection = db.collection(BACKPACK_COLLECTION);
        const items = await backpackCollection.find({}).toArray();
        res.json({ message: 'success', data: { items } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/backpack/items/:id/open', async (req, res) => {
    try {
        const { id } = req.params;
        const db = client.db(DB_NAME);
        const backpackCollection = db.collection(BACKPACK_COLLECTION);
        const productsCollection = db.collection(PRODUCTS_COLLECTION);
        const item = await backpackCollection.findOne({ _id: new ObjectId(id) });
        if (!item) return res.status(404).json({ error: 'Backpack item not found' });
        if (item.status === 'opened') return res.status(400).json({ error: 'Item already opened' });
        const rnd = Math.random() * 100;
        const p = probabilities;
        let rarity = 'common';
        if (rnd <= p.secret) rarity = 'secret';
        else if (rnd <= p.secret + p.rare) rarity = 'rare';
        else rarity = 'common';
        const prod = await productsCollection.findOne({ id: item.productId });
        if (!prod) return res.status(404).json({ error: 'Product not found for item' });
        const stocks = Object.assign({}, prod.stocks || { common:0, rare:0, secret:0 });
        const rarities = ['secret','rare','common'];
        let chosen = rarity;
        if ((stocks[chosen]||0) <= 0) {
            for (const r of rarities) {
                if ((stocks[r]||0) > 0) { chosen = r; break; }
            }
        }
        if ((stocks[chosen]||0) > 0) {
            stocks[chosen] = stocks[chosen] - 1;
            await productsCollection.updateOne({ id: prod.id }, { $set: { stocks } });
        } else {
            chosen = 'common';
        }
        await backpackCollection.updateOne({ _id: new ObjectId(id) }, { 
            $set: { 
                status: 'opened',
                openedAt: new Date()
            }
        });
        res.json({ message: 'success', rarity: chosen });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});