const express = require("express");
const neo4j = require("neo4j-driver");

// --- НАЧАЛО ОТЛАДКИ ---
// Этот лог появится, как только Vercel запустит функцию.
console.log("Proxy function starting up...");

// Получаем учетные данные из переменных окружения.
const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USERNAME = process.env.NEO4J_USERNAME;
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;
const API_KEY = process.env.API_KEY;

// Проверяем, что все переменные окружения загрузились.
// Если какой-то из них нет, мы увидим это в логах.
console.log(`NEO4J_URI loaded: ${!!NEO4J_URI}`);
console.log(`NEO4J_USERNAME loaded: ${!!NEO4J_USERNAME}`);
console.log(`NEO4J_PASSWORD loaded: ${!!NEO4J_PASSWORD}`);
console.log(`API_KEY loaded: ${!!API_KEY}`);
// --- КОНЕЦ ОТЛАДКИ ---

// Инициализируем Express приложение
const app = express();
app.use(express.json());

let driver;
try {
  // Пытаемся создать инстанс драйвера. Если здесь ошибка - мы увидим ее в логах.
  driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD)
  );
  console.log("Neo4j driver created successfully.");
} catch (error) {
  console.error("!!! CRITICAL: Failed to create Neo4j driver instance.", error);
}

// Middleware для проверки нашего секретного ключа
const checkApiKey = (req, res, next) => {
  console.log("Checking API key...");
  const providedApiKey = req.headers["x-api-key"];
  if (!providedApiKey || providedApiKey !== API_KEY) {
    console.warn("API key check failed. Provided key:", providedApiKey);
    return res.status(403).json({ error: "Forbidden: Invalid API Key" });
  }
  console.log("API key check passed.");
  next();
};

// Определяем наш единственный маршрут (endpoint)
app.post("/api/proxy", checkApiKey, async (req, res) => {
  // Этот лог покажет, что мы успешно вошли в обработчик запроса.
  console.log("--- New request received for /api/proxy ---");
  console.log("Request body:", JSON.stringify(req.body, null, 2));

  const { statement, parameters } = req.body;

  if (!statement) {
    console.warn("Request is missing 'statement'.");
    return res
      .status(400)
      .json({ error: '"statement" is required in the request body' });
  }

  // Проверяем, что драйвер был создан успешно.
  if (!driver) {
     return res.status(500).json({ error: 'Server Error: Neo4j driver is not available.' });
  }
  
  const session = driver.session();
  try {
    console.log("Executing Cypher statement...");
    const result = await session.run(statement, parameters || {});
    console.log("Cypher statement executed successfully.");

    const records = result.records.map((record) => record.toObject());
    res.status(200).json(records);
  } catch (error) {
    // --- УЛУЧШЕННЫЙ ЛОГ ОШИБКИ ---
    console.error("--- ERROR EXECUTING CYPHER ---");
    console.error("Statement:", statement);
    console.error("Parameters:", JSON.stringify(parameters, null, 2));
    console.error("Neo4j Error:", error);
    console.error("--- END ERROR DETAILS ---");

    res.status(500).json({
      error: "Failed to execute query",
      details: error.message,
    });
  } finally {
    console.log("Closing Neo4j session.");
    await session.close();
  }
});

// Экспортируем приложение для Vercel
module.exports = app;