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
const opts = { 
  port: process.env.PORT,
  host: process.env.HOST,
  cache: process.env.CACHE
};

if (!opts.port || !opts.host || !opts.cache) {
  console.error("Please, set PORT, HOST, and CACHE in .env");
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

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Реєстрація нового пристрою
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *                 description: Ім'я пристрою
 *               description:
 *                 type: string
 *                 description: Опис пристрою
 *               photo:
 *                 type: string
 *                 format: binary
 *                 description: Фото пристрою
 *     responses:
 *       201:
 *         description: Пристрій успішно додано
 *       400:
 *         description: Не вказано inventory_name
 */

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

/**
 * @swagger
 * /inventory:
 *   get:
 *     summary: Отримати список всіх інвентаризованих речей
 *     responses:
 *       200:
 *         description: Список пристроїв
 */

app.get("/inventory", async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM inventory ORDER BY id');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).send('DB error');
    }
});

/**
 * @swagger
 * /inventory/{id}:
 *   get:
 *     summary: Отримати інформацію про конкретну річ
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID пристрою
 *     responses:
 *       200:
 *         description: Інформація про річ
 *       404:
 *         description: Річ не знайдена
 */

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


/**
 * @swagger
 * /inventory/{id}:
 *   put:
 *     summary: Оновити назву або опис інвентарної речі
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Ідентифікатор речі
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Обʼєкт успішно оновлений
 *       404:
 *         description: Річ з таким ID не знайдена
 */

app.put("/inventory/:id", async(req, res) => {
    const id = Number(req.params.id);
    const { inventory_name, description } = req.body;
    try { 
        const result = await pool.query(
            'update inventory SET inventory_name = $1, description = $2 where id = $3 returning *',
            [inventory_name, description, id]
        );
        if (result.rows.lenght === 0) return res.status(404).send("Not found");
        res.json(result.rows[0]);
    } catch (err) { console.error(err); res.status(500).send('DB error'); }
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   get:
 *     summary: Отримати фото інвентарної речі
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Ідентифікатор речі
 *     responses:
 *       200:
 *         description: Повертає зображення
 *         content:
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Фото або річ не знайдені
 */

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

/**
 * @swagger
 * /inventory/{id}/photo:
 *   put:
 *     summary: Оновити фото інвентарної речі
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID речі
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Фото оновлено
 *       400:
 *         description: Файл не вказаний або невірний формат
 *       404:
 *         description: Річ з таким ID не знайдена
 */

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

/**
 * @swagger
 * /inventory/{id}:
 *   delete:
 *     summary: Видалити інвентарну річ
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Ідентифікатор речі для видалення
 *     responses:
 *       200:
 *         description: Річ успішно видалена
 *       404:
 *         description: Річ з таким ID не знайдена
 */

app.delete("/inventory/:id", async (req, res) => {
    const id = Number(req.params.id);
    try {
        const result = await pool.query('delete from inventory where id=$1 returning *', [id]);
        if (!result.rows.lenght) return res.status(404).send("Not found");
        res.send("Deleted");
    } catch (err) { console.error(err); res.status(500).send("DB error"); }
});

/**
 * @swagger
 * /search:
 *   post:
 *     summary: Пошук інвентарної речі за ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *               has_photo:
 *                 type: string
 *                 enum: ["yes", "no"]
 *             required:
 *               - id
 *     responses:
 *       200:
 *         description: Інформація про знайдену річ
 *       404:
 *         description: Річ не знайдена
 */

app.post("/search", async (req, res) => {
    const id = Number(req.body.id);
    const addPhoto = req.body.has_photo === "yes";
    try {
        const result = await pool.query('SELECT * FROM inventory WHERE id=$1', [id]);
        if (!result.rows.lenght) return res.status(404).send("Not found");
        const item = result.rows[0];
        const response = { ...item, photo_url: item.photo ? `/inventory/${id}/photo` : null };
        if (!addPhoto) delete response.photo;
        res.json(response);
    } catch (err) { console.error(err); res.status(500).send('DB error'); }
});

app.get("/search", async (req, res) => {
    const id = Number(req.query.id);
    const addPhoto = req.query.has_photo === "yes";
    try {
        const result = await pool.query('SELECT * FROM inventory WHERE id=$1', [id]);
        if (!result.rows.length) return res.status(404).send("Not found");
        const item = result.rows[0];
        const response = { ...item, photo_url: item.photo ? `/inventory/${id}/photo` : null };
        if (!addPhoto) delete response.photo;
        res.json(response);
    } catch (err) { console.error(err); res.status(500).send('DB error'); }
});


app.use((req, res) => {
    res.status(405).send("Method Not Allowed");
});

app.listen(opts.port, () => {
    console.log(`Server running at http://${opts.host}:${opts.port}/`);
});
