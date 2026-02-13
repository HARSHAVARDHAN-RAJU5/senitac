import pool from "../db.js";
import { runPaymentScheduling } from "../step7-payment/services/paymentService.js";

class PaymentWorker {

    async execute(invoice_id) {

        const stateCheck = await pool.query(
            `
            SELECT current_state
            FROM invoice_state_machine
            WHERE invoice_id = $1
            `,
            [invoice_id]
        );

        if (!stateCheck.rows.length) {
            throw new Error("State record not found");
        }

        const currentState = stateCheck.rows[0].current_state;

        if (currentState !== "APPROVED") {
            throw new Error("Invalid state for PaymentWorker");
        }

        const paymentResult = await runPaymentScheduling(invoice_id);

        if (!paymentResult.success) {
            return { next_state: "BLOCKED" };
        }

        return {
            next_state: "COMPLETED"
        };
    }
}

export default new PaymentWorker();
