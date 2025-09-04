const express = require("express");
const neo4j = require("neo4j-driver");

// Инициализируем Express приложение
const app = express();
app.use(express.json());

// Получаем учетные данные из переменных окружения (это безопасно)
const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USERNAME = process.env.NEO4J_USERNAME;
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;
// Наш секретный ключ для доступа к прокси
const API_KEY = process.env.API_KEY;

// Создаем инстанс драйвера Neo4j
const driver = neo4j.driver(
  NEO4J_URI,
  neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD)
);

// Middleware для проверки нашего секретного ключа
const checkApiKey = (req, res, next) => {
  const providedApiKey = req.headers["x-api-key"];
  if (!providedApiKey || providedApiKey !== API_KEY) {
    return res.status(403).json({ error: "Forbidden: Invalid API Key" });
  }
  next();
};

// Определяем наш единственный маршрут (endpoint)
app.post("*", checkApiKey, async (req, res) => {
  const { statement, parameters } = req.body;

  if (!statement) {
    return res
      .status(400)
      .json({ error: '"statement" is required in the request body' });
  }

  const session = driver.session();
  try {
    const result = await session.run(statement, parameters || {});
    // Преобразуем результат в удобный для n8n формат JSON
    const records = result.records.map((record) => record.toObject());
    res.status(200).json(records);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Failed to execute query",
      details: error.message,
    });
  } finally {
    await session.close();
  }
});

// Экспортируем приложение для Vercel
module.exports = app;
