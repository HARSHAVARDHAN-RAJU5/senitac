import express from "express";
import pool from "../db.js";
import redis from "../redisClient.js";

const router = express.Router();

router.post("/:invoice_id/decision", async (req, res) => {

  const { invoice_id } = req.params;
  const { decision, comment } = req.body;

  if (!["APPROVE", "BLOCK"].includes(decision)) {
    return res.status(400).json({ error: "Invalid decision" });
  }

  const stateRes = await pool.query(
    `SELECT current_state 
     FROM invoice_state_machine 
     WHERE invoice_id = $1`,
    [invoice_id]
  );

  if (!stateRes.rows.length) {
    return res.status(404).json({ error: "Invoice not found" });
  }

  if (stateRes.rows[0].current_state !== "EXCEPTION_REVIEW") {
    return res.status(400).json({
      error: "Invoice not in EXCEPTION_REVIEW state"
    });
  }


  await pool.query(
    `INSERT INTO exception_review_decisions
     (invoice_id, decision, comment, decided_at, processed)
     VALUES ($1,$2,$3,NOW(),false)
     ON CONFLICT (invoice_id)
     DO UPDATE SET
       decision = EXCLUDED.decision,
       comment = EXCLUDED.comment,
       decided_at = NOW(),
       processed = false`,
    [invoice_id, decision, comment || null]
  );


  await pool.query(
    `INSERT INTO audit_event_log
     (invoice_id, event_type, description)
     VALUES ($1, $2, $3)`,
    [
      invoice_id,
      "EXCEPTION_REVIEW_DECISION_RECORDED",
      `Internal decision recorded: ${decision}`
    ]
  );


  await redis.xAdd("invoice_events", "*", { invoice_id });

  return res.json({
    message: "Internal review decision recorded successfully"
  });
});

export default router;
