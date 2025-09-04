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

  const { statement, parameters } = req.body;

  if (!statement) {
    return res
      .status(400)
      .json({ error: '"statement" is required in the request body' });
  }

  // --- НОВЫЙ УМНЫЙ ПАРСЕР ПАРАМЕТРОВ ---
  let parsedParameters = parameters;
  if (typeof parameters === 'string' && parameters.trim() !== '') {
      console.log("Parameters field is a string. Attempting to parse as JSON...");
      try {
          parsedParameters = JSON.parse(parameters);
          console.log("Successfully parsed parameters string into an object.");
      } catch (error) {
          console.error("!!! FAILED to parse parameters string:", error);
          return res.status(400).json({
              error: "Bad Request: The 'parameters' field was a string but could not be parsed as valid JSON.",
              details: error.message,
              receivedString: parameters
           });
      }
  }
  // --- КОНЕЦ ПАРСЕРА ---

  if (!driver) {
     return res.status(500).json({ error: 'Server Error: Neo4j driver is not available.' });
  }
  
  const session = driver.session();
  try {
    console.log("Executing Cypher statement with parameters:", JSON.stringify(parsedParameters, null, 2));
    const result = await session.run(statement, parsedParameters || {});
    console.log("Cypher statement executed successfully.");

    const records = result.records.map((record) => record.toObject());
    res.status(200).json(records);
  } catch (error) {
    console.error("--- ERROR EXECUTING CYPHER ---");
    console.error("Statement:", statement);
    console.error("Parameters used:", JSON.stringify(parsedParameters, null, 2));
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

module.exports = app;