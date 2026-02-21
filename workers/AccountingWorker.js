import AccountingService from "./services/accountingService.js";
import db from "../db.js";

class AccountingWorker {

  static async postAccrual(context) {
    const { invoice_id, organization_id } = context;

    // Prevent double booking
    const alreadyBooked = await AccountingService.journalExists(
      organization_id,
      invoice_id,
      "ACCRUAL"
    );

    if (alreadyBooked) {
      return;
    }

    // Fetch invoice details
    const invoiceRes = await db.query(
      `
      SELECT total_amount, expense_category
      FROM invoices
      WHERE invoice_id = $1
        AND organization_id = $2
      `,
      [invoice_id, organization_id]
    );

    if (invoiceRes.rows.length === 0) {
      throw new Error("Invoice not found for accounting");
    }

    const { total_amount, expense_category } = invoiceRes.rows[0];

    // Get account mapping
    const { expense_account_id, ap_account_id } =
      await AccountingService.getAccountMapping(
        organization_id,
        expense_category
      );

    // Create journal entry
    const journal_id = await AccountingService.createJournalEntry({
      organization_id,
      invoice_id,
      entry_type: "ACCRUAL"
    });

    // Debit Expense
    await AccountingService.createJournalLine({
      journal_id,
      account_id: expense_account_id,
      debit_amount: total_amount,
      credit_amount: 0
    });

    // Credit Accounts Payable
    await AccountingService.createJournalLine({
      journal_id,
      account_id: ap_account_id,
      debit_amount: 0,
      credit_amount: total_amount
    });
  }
}

export default AccountingWorker;