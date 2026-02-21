import db from "../../db.js";

class AccountingService {

  static async getAccountMapping(organization_id, expense_category) {
    const result = await db.query(
      `
      SELECT expense_account_id, ap_account_id
      FROM account_mapping
      WHERE organization_id = $1
        AND expense_category = $2
      `,
      [organization_id, expense_category]
    );

    if (result.rows.length === 0) {
      throw new Error("Account mapping not found");
    }

    return result.rows[0];
  }

  static async createJournalEntry({ organization_id, invoice_id, entry_type }) {
    const result = await db.query(
      `
      INSERT INTO journal_entries (
        organization_id,
        invoice_id,
        entry_type,
        status,
        created_at
      )
      VALUES ($1, $2, $3, 'POSTED', NOW())
      RETURNING journal_id
      `,
      [organization_id, invoice_id, entry_type]
    );

    return result.rows[0].journal_id;
  }

  static async createJournalLine({
    journal_id,
    account_id,
    debit_amount,
    credit_amount
  }) {
    await db.query(
      `
      INSERT INTO journal_lines (
        journal_id,
        account_id,
        debit_amount,
        credit_amount
      )
      VALUES ($1, $2, $3, $4)
      `,
      [journal_id, account_id, debit_amount, credit_amount]
    );
  }

  static async journalExists(organization_id, invoice_id, entry_type) {
    const result = await db.query(
      `
      SELECT 1
      FROM journal_entries
      WHERE organization_id = $1
        AND invoice_id = $2
        AND entry_type = $3
      `,
      [organization_id, invoice_id, entry_type]
    );

    return result.rows.length > 0;
  }
}

export default AccountingService;