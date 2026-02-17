export function determineApprovalLevel(invoiceTotal) {
    if (invoiceTotal < 50000) {
        return "LEVEL_1_FINANCE_EXEC";
    } else if (invoiceTotal <= 200000) {
        return "LEVEL_2_FINANCE_MANAGER";
    } else {
        return "CFO";
    }
}
