import db from "../db.js";

export default class PolicyEngine {

  static async getApprovalRule(organization_id, amount) {

    const result = await db.query(
      `
      SELECT approver_role
      FROM approval_config
      WHERE organization_id = $1
      AND $2 BETWEEN min_amount AND max_amount
      LIMIT 1
      `,
      [organization_id, amount]
    );

    if (!result.rows.length) {
      throw new Error("No approval rule configured for this amount");
    }

    return result.rows[0].approver_role;
  }


  static async getMatchingTolerance(organization_id) {

    const result = await db.query(
      `
      SELECT *
      FROM matching_tolerance_config
      WHERE organization_id = $1
      `,
      [organization_id]
    );

    if (!result.rows.length) {
      throw new Error("Matching tolerance not configured");
    }

    return result.rows[0];
  }


  static async getTaxConfig(organization_id) {

    const result = await db.query(
      `
      SELECT *
      FROM tax_rules_config
      WHERE organization_id = $1
      `,
      [organization_id]
    );

    if (!result.rows.length) {
      throw new Error("Tax config not configured");
    }

    return result.rows[0];
  }


  static async getPaymentPolicy(organization_id) {

    const result = await db.query(
      `
      SELECT *
      FROM payment_policy_config
      WHERE organization_id = $1
      `,
      [organization_id]
    );

    if (!result.rows.length) {
      throw new Error("Payment policy not configured");
    }

    return result.rows[0];
  }
}