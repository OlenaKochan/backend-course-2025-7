const express = require("express");
const { program } = require("commander");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

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

const inventoryFile = path.join(cacheDir, "inventory.json");
if (!fs.existsSync(inventoryFile)) {
    fs.writeFileSync(inventoryFile, JSON.stringify([]));
}

function loadInventory() {
    return JSON.parse(fs.readFileSync(inventoryFile, "utf8"));
}

function saveInventory(data) {
    fs.writeFileSync(inventoryFile, JSON.stringify(data, null, 2));
}

let inventory = loadInventory();
let nextID = inventory.length > 0 ? Math.max(...inventory.map(i => i.id)) + 1 : 1;

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

app.post("/register", upload.single("photo"), (req, res) => {
    const name = req.body.inventory_name;
    if (!name) {
        return res.status(400).send("inventory_name is required");
    }
    const item = {
        id: nextID++,
        inventory_name: name,
        description: req.body.description || "",
        photo: req.file ? req.file.filename : null
    };

    inventory.push(item);
    saveInventory(inventory);
    res.status(201).json(item);
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

app.get("/inventory", (req, res) => {
    
    res.json(inventory);
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

app.get("/inventory/:id", (req, res) => {
    const id = Number(req.params.id);
    const item = inventory.find(i => i.id === id);

    if (!item) return res.status(404).send("Not found");
    const result = {
        ...item,
        photo_url: item.photo ? `/inventory/${id}/photo` : null
    };
    res.json(result);
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

app.put("/inventory/:id", (req, res) => {
    const id = Number(req.params.id);
    const item = inventory.find(i => i.id === id);

    if (!item) return res.status(404).send("Not found");
    if (req.body.inventory_name) item.inventory_name = req.body.inventory_name;
    if (req.body.description) item.description = req.body.description;

    saveInventory(inventory);
    res.json(item);
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

app.get("/inventory/:id/photo", (req, res) => {
    const id = Number(req.params.id);
    const item = inventory.find(i => i.id === id);

    if (!item || !item.photo) {
        return res.status(404).send("Photo not found");
    }
    const imgPath = path.join(cacheDir, item.photo);

    if (!fs.existsSync(imgPath)) {
        return res.status(404).send("Photo file missing");
    }
    res.setHeader("Content-Type", "image/jpeg");
    res.sendFile(imgPath);
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

app.put("/inventory/:id/photo", upload.single("photo"), (req, res) => {
    const id = Number(req.params.id);
    const item = inventory.find(i => i.id === id);

    if (!item) return res.status(404).send("Not found");
    if (!req.file) return res.status(400).send("Missing photo");

    item.photo = req.file.filename;
    saveInventory(inventory);
    res.json(item);
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

app.delete("/inventory/:id", (req, res) => {
    const id = Number(req.params.id);
    const index = inventory.findIndex(i => i.id === id);

    if (index === -1) return res.status(404).send("Not found");
    inventory.splice(index, 1);
    saveInventory(inventory);

    res.send("Deleted");
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
