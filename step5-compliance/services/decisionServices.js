export const finalDecision = (taxResult, policyResult) => {

    if (taxResult.status === "FAIL") {
        return "BLOCKED";
    }

    if (policyResult.status === "FAIL") {
        return "BLOCKED";
    }

    if (policyResult.status === "CONDITIONAL") {
        return "CONDITIONAL";
    }

    return "COMPLIANT";
};
