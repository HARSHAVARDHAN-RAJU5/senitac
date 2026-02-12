import { createClient } from "redis";
import pool from "./db.js";   

const redis = createClient({
  url: "redis://localhost:6379"
});

redis.on("error", (err) => {
  console.error("Redis Error:", err);
});


async function listen() {
  console.log("Orchestrator connected to Redis & Postgres");

  while (true) {
    try {
      const response = await redis.xReadGroup(
        "orchestrator_group",
        "orchestrator_1",
        {
          key: "invoice_events",
          id: ">"
        },
        {
          COUNT: 1,
          BLOCK: 5000
        }
      );

      if (!response) continue;

      const message = response[0].messages[0];
      const { invoice_id } = message.message;

      console.log("Event received for invoice:", invoice_id);

      const stateResult = await pool.query(
        "SELECT current_state FROM invoice_state_machine WHERE invoice_id = $1",
        [invoice_id]
      );

      if (stateResult.rows.length === 0) {
        console.log("No state found for invoice:", invoice_id);
      } else {
        const currentState = stateResult.rows[0].current_state;
        console.log("Current State:", currentState);
      }

      await redis.xAck(
        "invoice_events",
        "orchestrator_group",
        message.id
      );

    } catch (error) {
      console.error("Listener Error:", error);
    }
  }
}


async function start() {
  await redis.connect();
  await listen();
}

start();
