const express = require("express");
const { program } = require("commander");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
require('dotenv').config();
const { Pool } = require('pg');

// Підключення до PostgreSQL 
const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});
program
    .option("-h, --host <host>", "server host")
    .option("-p, --port <port>", "server port")
    .option("-c, --cache <dir>", "cache directory");

program.parse();
const opts = program.opts();

if (!opts.host) {
    console.error('Please, input host parameter');
    process.exit(1);
}

if (!opts.port) {
    console.error('Please, input port parameter');
    process.exit(1);
}

if (!opts.cache) {
    console.error('Please, input directory parameter');
    process.exit(1);
}

const cacheDir = path.resolve(opts.cache);
if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
} else {
    console.log(`Cache directory ${cacheDir} already exists`);
}

const app = express();

const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Inventory API",
      version: "1.0.0",
      description: "API сервіс для управління інвентаризацією пристроїв"
    },
    servers: [
      { url: `http://${opts.host}:${opts.port}` }
    ]
  },
  apis: [__filename], 
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("./"));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, cacheDir),
    filename: (req, file, cb) => {
        const filename = `${Date.now()}-${file.originalname}`;
        cb(null, filename);
    }
});
const upload = multer({ storage });


app.post("/register", upload.single("photo"), async (req, res) => {
    const name = req.body.inventory_name;
    if (!name) {
        return res.status(400).send("inventory_name is required");
    }
    try {
     const photo = req.file ? req.file.filename : null;
     const result = await pool.query(
      'INSERT INTO inventory (inventory_name, description, photo) VALUES ($1,$2,$3) RETURNING *',
      [name, req.body.description || '', photo]
     );
     res.status(201).json(result.rows[0]);
  } catch (err) {
     console.error(err);
     res.status(500).send('DB error');
  }
});

app.get("/inventory", async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM inventory ORDER BY id');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).send('DB error');
    }
});

app.get("/inventory/:id", async (req, res) => {
    const id = Number(req.params.id);
    try {
        const result = await pool.query('SELECT * FROM inventory WHERE id=$1', [id]);
        if (result.rows.length === 0) return res.status(404).send("Not found");
        const item = result.rows[0];
        res.json({ ...item, photo_url: item.photo ? `/inventory/${id}/photo` : null });
    } catch (err) { 
        console.error(err); 
        res.status(500).send('DB error'); 
    }
});


app.put("/inventory/:id", async(req, res) => {
    const id = Number(req.params.id);
    const { inventory_name, description } = req.body;
    try { 
        const result = await pool.query(
            'update inventory SET invenroty_name = $1, description = $2 where id = $3 returning *',
            [inventory_name, description, id]
        );
        if (result.rows.lenght === 0) return res.status(404).send("Not found");
        res.json(result.rows[0]);
    } catch (err) { console.error(err); res.status(500).send('DB error'); }
});

app.get("/inventory/:id/photo", async (req, res) => {
    const id = Number(req.params.id);
    try {
        const result = await pool.query('select photo FROM inventory WHERE id=$1', [id]);
        if (!result.rows.length || !result.rows[0].photo) return res.status(404).send("Photo not found");
        const imgPath = path.join(cacheDir, result.rows[0].photo);
        if (!fs.existsSync(imgPath)) return res.status(404).send("Photo file missing");
        res.setHeader("Content-Type", "image/jpeg");
        res.sendFile(imgPath);
    } catch (err) { console.error(err); res.status(500).send('DB error'); }
});


app.put("/inventory/:id/photo", upload.single("photo"), async (req, res) => {
    const id = Number(req.params.id);
    if (!req.file) return res.status(400).send("Missing photo");
    try {
        const result = await pool.query(
            'update inventory SET photo=$1 WHERE id=$2 RETURNING *',
            [req.file.filename, id]
        );
        if (!result.rows.length) return res.status(404).send("Not found");
        res.json(result.rows[0]);
    } catch (err) { console.error(err); res.status(500).send('DB error'); }
});

app.delete("/inventory/:id", (req, res) => {
    const id = Number(req.params.id);
    const index = inventory.findIndex(i => i.id === id);

    if (index === -1) return res.status(404).send("Not found");
    inventory.splice(index, 1);
    saveInventory(inventory);

    res.send("Deleted");
});


app.post("/search", (req, res) => {
    const id = Number(req.body.id);
    const addPhoto = req.body.has_photo === "yes";
    const item = inventory.find(i => i.id === id);

    if (!item) return res.status(404).send("Not found");
    const response = { ...item,  photo_url: item.photo ? `/inventory/${id}/photo` : null };
    if (!addPhoto) delete response.photo;
    res.json(response);
});

app.get("/search", (req, res) => {
    const id = Number(req.query.id);
    const addPhoto = req.query.has_photo === "yes";
    const item = inventory.find(i => i.id === id);

    if (!item) return res.status(404).send("Not found");
    const response = { ...item, photo_url: item.photo ? `/inventory/${id}/photo` : null
    };
    if (!addPhoto) delete response.photo;
    res.json(response);
});

app.use((req, res) => {
    res.status(405).send("Method Not Allowed");
});

app.listen(opts.port, () => {
    console.log(`Server running at http://${opts.host}:${opts.port}/`);
});
