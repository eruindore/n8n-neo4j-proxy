const express = require("express");
const neo4j = require("neo4j-driver");

console.log("Proxy function starting up...");

const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USERNAME = process.env.NEO4J_USERNAME;
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;
const API_KEY = process.env.API_KEY;

console.log(`NEO4J_URI loaded: ${!!NEO4J_URI}`);
console.log(`API_KEY loaded: ${!!API_KEY}`);

const app = express();
app.use(express.json());

let driver;
try {
  driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD)
  );
  console.log("Neo4j driver created successfully.");
} catch (error) {
  console.error("!!! CRITICAL: Failed to create Neo4j driver instance.", error);
}

const checkApiKey = (req, res, next) => {
  const providedApiKey = req.headers["x-api-key"];
  if (!providedApiKey || providedApiKey !== API_KEY) {
    return res.status(403).json({ error: "Forbidden: Invalid API Key" });
  }
  next();
};

app.post("/api/proxy", checkApiKey, async (req, res) => {
  console.log("--- New request received for /api/proxy ---");
  console.log("Request body:", JSON.stringify(req.body, null, 2));

  const { statement, statements, parameters } = req.body;

  let parsedParameters = parameters;
  if (typeof parameters === "string" && parameters.trim() !== "") {
    try {
      parsedParameters = JSON.parse(parameters);
    } catch (error) {
      return res.status(400).json({
        error: "Bad Request: Could not parse 'parameters' string as JSON.",
      });
    }
  }

  if (!driver) {
    return res
      .status(500)
      .json({ error: "Server Error: Neo4j driver is not available." });
  }

  const session = driver.session();
  let currentStatementForErrorHandling =
    statement ||
    (Array.isArray(statements) ? statements.join("; ") : statements);

  try {
    // <<< НАЧАЛО НОВОЙ, УЛУЧШЕННОЙ ЛОГИКИ >>>

    // Сценарий 1: Пришел 'statements' (либо как массив, либо как многострочный текст)
    if (statements) {
      let statementList = [];

      // Если это уже готовый массив, используем его
      if (Array.isArray(statements)) {
        statementList = statements;
      }
      // Если это строка, разбиваем ее на команды
      else if (typeof statements === "string") {
        // Разбиваем по точке с запятой, затем убираем пробелы и пустые строки
        statementList = statements
          .split(";")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      }

      if (statementList.length > 0) {
        console.log(
          `Executing a batch of ${statementList.length} Cypher statements sequentially...`
        );
        for (const stmt of statementList) {
          currentStatementForErrorHandling = stmt;
          console.log(`Executing: ${stmt}`);
          await session.run(stmt);
        }
        console.log("All statements in the batch executed successfully.");
        return res.status(200).json({
          success: true,
          message: `Successfully executed ${statementList.length} statements.`,
        });
      }
    }

    // Сценарий 2: Пришел одиночный 'statement'
    if (statement) {
      console.log(
        "Executing single Cypher statement with parameters:",
        JSON.stringify(parsedParameters, null, 2)
      );
      const result = await session.run(statement, parsedParameters || {});
      console.log("Cypher statement executed successfully.");
      const records = result.records.map((record) => record.toObject());
      return res.status(200).json(records);
    }

    // Если не пришел ни 'statement', ни 'statements'
    return res.status(400).json({
      error: 'Request body must contain either "statement" or "statements"',
    });

    // <<< КОНЕЦ НОВОЙ ЛОГИКИ >>>
  } catch (error) {
    console.error("--- ERROR EXECUTING CYPHER ---");
    console.error("Failed on Statement:", currentStatementForErrorHandling);
    console.error(
      "Parameters used:",
      JSON.stringify(parsedParameters, null, 2)
    );
    console.error("Neo4j Error:", error);
    console.error("--- END ERROR DETAILS ---");

    res.status(500).json({
      error: "Failed to execute query",
      failedStatement: currentStatementForErrorHandling,
      details: error.message,
    });
  } finally {
    console.log("Closing Neo4j session.");
    await session.close();
  }
});

module.exports = app;
